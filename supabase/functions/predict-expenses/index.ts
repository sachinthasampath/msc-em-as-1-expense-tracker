// Deno-specific HTTP handler. Pure logic lives in aggregate.ts/schema.ts (imported here, also
// imported directly by Jest — see 07-ai-prediction.md's toolchain note on why this split exists).
import { createClient } from '@supabase/supabase-js';

import { aggregate, PaymentRow, windowStart } from './aggregate.ts';
import { callOpenRouter } from './openrouter.ts';
import { parseAiExplanation } from './schema.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DAILY_LIMIT = 10;
const CACHE_STALE_MS = 24 * 60 * 60 * 1000;

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function monthStartDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized' }, 401);

  // Anon key + the caller's JWT: this client IS the user, so RLS applies to every query it
  // makes. The service-role client below is reserved strictly for the two tables clients have
  // no insert policy for (07-ai-prediction.md — this is the whole point of the security design,
  // not a style choice).
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const now = new Date();
  const forecastPeriodMonth = monthStartDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));

  // Cache-first is mandatory, not optional — the one thing standing between users and
  // unbounded OpenRouter spend (07-ai-prediction.md).
  const { data: cached } = await serviceClient
    .from('predictions_cache')
    .select('*')
    .eq('user_id', user.id)
    .eq('period_month', forecastPeriodMonth)
    .maybeSingle();

  const staleByAge = cached ? Date.now() - new Date(cached.generated_at).getTime() > CACHE_STALE_MS : true;
  let staleByEdit = true;
  if (cached) {
    const { data: recentEdit } = await userClient
      .from('payments')
      .select('id')
      .gt('updated_at', cached.generated_at)
      .limit(1)
      .maybeSingle();
    staleByEdit = Boolean(recentEdit);
  }

  if (cached && !staleByAge && !staleByEdit) {
    return jsonResponse({
      insufficientData: false,
      forecast: cached.forecast,
      aiExplanation: cached.ai_explanation,
      aiError: cached.ai_error,
      cached: true,
      generatedAt: cached.generated_at,
    });
  }

  // Per-user daily cap, enforced BEFORE doing any work — any authenticated user could otherwise
  // loop this endpoint and run up a real bill against the project owner (the app is free, this
  // endpoint fronts a metered API).
  const today = now.toISOString().slice(0, 10);
  const { data: usageRow } = await serviceClient
    .from('ai_invocation_log')
    .select('invocation_count')
    .eq('user_id', user.id)
    .eq('day', today)
    .maybeSingle();

  if ((usageRow?.invocation_count ?? 0) >= DAILY_LIMIT) {
    return jsonResponse({ error: 'Daily AI limit reached' }, 429);
  }

  const since = windowStart(now).toISOString();
  const { data: paymentRows, error: queryError } = await userClient
    .from('payments')
    .select(
      `id, amount, occurred_at, category_id, card_billing_period_start, card_billing_period_end,
       categories ( name, parent_category_id ),
       payment_methods ( method_type )`,
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: true });

  if (queryError) return jsonResponse({ error: 'Query failed' }, 500);

  const payments: PaymentRow[] = (paymentRows ?? []).map((row: any) => ({
    id: row.id,
    amount: Number(row.amount),
    occurredAt: row.occurred_at,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    parentCategoryId: row.categories?.parent_category_id ?? null,
    cardBillingPeriodStart: row.card_billing_period_start,
    cardBillingPeriodEnd: row.card_billing_period_end,
    methodType: row.payment_methods?.method_type ?? null,
  }));

  const result = aggregate(payments, now);

  if (result.insufficientData) {
    return jsonResponse({ insufficientData: true, monthsOfData: result.monthsOfData });
  }

  // Record the invocation BEFORE calling OpenRouter — a computed call counts against the cap
  // regardless of whether the LLM step succeeds; only cache reads are free.
  await serviceClient
    .from('ai_invocation_log')
    .upsert(
      { user_id: user.id, day: today, invocation_count: (usageRow?.invocation_count ?? 0) + 1 },
      { onConflict: 'user_id,day' },
    );

  const { raw, failureReason } = await callOpenRouter(result.forecast);
  const aiExplanation = failureReason ? null : parseAiExplanation(raw);
  const aiError = aiExplanation === null;

  if (failureReason) {
    console.error('predict-expenses: openrouter failure', failureReason);
  }

  const generatedAt = new Date().toISOString();

  // Never cache a degraded result's AI half — if OpenRouter is down on the first call of the
  // month, caching aiError: true would keep the AI section broken all month even after the
  // provider recovers. Cache the numeric forecast; leave ai_explanation null and retry next call.
  await serviceClient.from('predictions_cache').upsert(
    {
      user_id: user.id,
      period_month: forecastPeriodMonth,
      forecast: result.forecast,
      ai_explanation: aiError ? null : aiExplanation,
      ai_error: aiError,
      generated_at: generatedAt,
    },
    { onConflict: 'user_id,period_month' },
  );

  return jsonResponse({
    insufficientData: false,
    forecast: result.forecast,
    aiExplanation: aiError ? null : aiExplanation,
    aiError,
    cached: false,
    generatedAt,
  });
});
