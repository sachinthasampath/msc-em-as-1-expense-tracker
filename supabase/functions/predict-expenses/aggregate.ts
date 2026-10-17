// Pure, deterministic, unit-tested in isolation — no Deno.* references, no fetch, no ambient
// clock. `now` is always injected so the same input always produces byte-identical output
// (07-ai-prediction.md). This is what lets jest-expo (Node) import this file directly even
// though the rest of this function runs on Deno.

export type PaymentRow = {
  id: string;
  amount: number; // major units (LKR)
  occurredAt: string; // ISO timestamp
  categoryId: string | null;
  categoryName: string | null;
  parentCategoryId: string | null;
  cardBillingPeriodStart: string | null; // 'YYYY-MM-DD', set only for card-linked payments
  cardBillingPeriodEnd: string | null;
  methodType: 'card' | 'cash' | 'other' | null;
};

export type Forecast = {
  forecastMonth: string; // 'YYYY-MM', the upcoming calendar month
  currency: 'LKR';
  predictedTotal: number;
  lowerEstimate: number;
  upperEstimate: number;
  byCategory: { categoryId: string; name: string; predictedAmount: number }[];
  spendingTrend: 'increasing' | 'decreasing' | 'stable';
  monthsOfData: number;
  recurringCategories: string[];
};

export type AggregateResult = { insufficientData: true; monthsOfData: number } | { insufficientData: false; forecast: Forecast };

const MIN_COMPLETE_MONTHS = 3;
const RECURRING_LOOKBACK_MONTHS = 4;
const RECURRING_MIN_HITS = 3;
const RECURRING_AMOUNT_TOLERANCE = 0.1; // ±10%
const WEIGHTS = [3, 2, 1, 1, 1, 1]; // newest-first, truncated to available length

// First day of the month, 6 calendar months back — computed once in TS from an injectable
// clock, never in SQL, so the aggregate is reproducible regardless of when the function runs.
export function windowStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
}

// The calendar month this forecast is FOR — the one after `now`'s current (partial) month.
export function forecastMonth(now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return monthKey(next);
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// A payment's attribution bucket: for card-linked payments, the calendar month its FIXED
// billing period start falls in (not occurred_at) — this is the double-count-avoidance rule,
// mapped onto a calendar month so the series stays comparable with cash/other payments
// (02-schema-notes.md / 07-ai-prediction.md).
function paymentMonthKey(payment: PaymentRow): string {
  const basis =
    payment.methodType === 'card' && payment.cardBillingPeriodStart
      ? payment.cardBillingPeriodStart
      : payment.occurredAt;
  return monthKey(new Date(basis));
}

function weightedMean(valuesNewestFirst: number[]): number {
  const weights = WEIGHTS.slice(0, valuesNewestFirst.length);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) return 0;
  const total = valuesNewestFirst.reduce((sum, v, i) => sum + v * weights[i], 0);
  return total / weightSum;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function aggregate(rawPayments: PaymentRow[], now: Date): AggregateResult {
  const currentMonth = monthKey(now);

  // Resolve each payment's top-level category id/name (roll subcategories up to their parent).
  const categoryById = new Map<string, { name: string; parentId: string | null }>();
  for (const p of rawPayments) {
    if (p.categoryId) categoryById.set(p.categoryId, { name: p.categoryName ?? 'Uncategorized', parentId: p.parentCategoryId });
  }
  function resolveTopLevel(categoryId: string | null): { id: string; name: string } | null {
    if (!categoryId) return null;
    const cat = categoryById.get(categoryId);
    if (!cat) return { id: categoryId, name: 'Uncategorized' };
    if (!cat.parentId) return { id: categoryId, name: cat.name };
    const parent = categoryById.get(cat.parentId);
    return parent ? { id: cat.parentId, name: parent.name } : { id: categoryId, name: cat.name };
  }

  // Bucket every payment into its calendar month, excluding the current (partial) month.
  const monthTotals = new Map<string, number>();
  const monthCategoryTotals = new Map<string, Map<string, number>>(); // month -> categoryId -> total
  const monthPaymentsByCategory = new Map<string, Map<string, number[]>>(); // month -> categoryId -> amounts (for recurring check)
  const categoryNames = new Map<string, string>();

  for (const payment of rawPayments) {
    const month = paymentMonthKey(payment);
    if (month === currentMonth) continue; // excluded: partial month

    monthTotals.set(month, (monthTotals.get(month) ?? 0) + payment.amount);

    const topLevel = resolveTopLevel(payment.categoryId);
    if (topLevel) {
      categoryNames.set(topLevel.id, topLevel.name);
      if (!monthCategoryTotals.has(month)) monthCategoryTotals.set(month, new Map());
      const catTotals = monthCategoryTotals.get(month)!;
      catTotals.set(topLevel.id, (catTotals.get(topLevel.id) ?? 0) + payment.amount);

      if (!monthPaymentsByCategory.has(month)) monthPaymentsByCategory.set(month, new Map());
      const catPayments = monthPaymentsByCategory.get(month)!;
      if (!catPayments.has(topLevel.id)) catPayments.set(topLevel.id, []);
      catPayments.get(topLevel.id)!.push(payment.amount);
    }
  }

  const completeMonths = [...monthTotals.keys()].sort(); // ascending 'YYYY-MM'
  const monthsOfData = completeMonths.length;

  // The actual last 2 calendar months immediately before `now`'s (excluded) current month —
  // not just "whichever months happen to be present in the data" (that would call data
  // clustered in e.g. Nov/Dec/Jan "recent" even when now is June).
  const recentMonthKeys = [1, 2].map((back) => monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))));
  const hasRecentData = recentMonthKeys.some((m) => (monthTotals.get(m) ?? 0) > 0);

  // Insufficient data: fewer than 3 complete months, OR no payment in the last 2 months (stale
  // data is worse than none) — a forecast from either is reported as insufficientData rather
  // than computed, and the OpenRouter call is skipped entirely (enforced by the caller).
  if (monthsOfData < MIN_COMPLETE_MONTHS || !hasRecentData) {
    return { insufficientData: true, monthsOfData };
  }

  const newestFirstMonths = [...completeMonths].reverse();
  const totalsNewestFirst = newestFirstMonths.map((m) => monthTotals.get(m) ?? 0);
  const predictedTotal = weightedMean(totalsNewestFirst);

  // Trend: short moving average (last 2 months) vs the full-window average.
  const fullAverage = totalsNewestFirst.reduce((a, b) => a + b, 0) / totalsNewestFirst.length;
  const shortAverage =
    totalsNewestFirst.slice(0, 2).reduce((a, b) => a + b, 0) / Math.min(2, totalsNewestFirst.length);
  const trendRatio = fullAverage === 0 ? 1 : shortAverage / fullAverage;
  const spendingTrend: Forecast['spendingTrend'] =
    trendRatio > 1.05 ? 'increasing' : trendRatio < 0.95 ? 'decreasing' : 'stable';

  // Range widens with small sample size or high month-to-month variance; floored at a minimum
  // spread so a near-zero-variance series doesn't render as a single exact number.
  const variance = stdDev(totalsNewestFirst);
  const sampleSpreadFactor = monthsOfData < 4 ? 1.5 : 1;
  const spread = Math.max(variance * sampleSpreadFactor, predictedTotal * 0.05);
  const lowerEstimate = Math.max(0, predictedTotal - spread);
  const upperEstimate = predictedTotal + spread;

  // byCategory: same recency-weighted mean per category, then scaled to sum exactly to
  // predictedTotal (07-ai-prediction.md — the breakdown must never visibly contradict the
  // headline number).
  const byCategoryRaw = [...categoryNames.entries()].map(([categoryId, name]) => {
    const amountsNewestFirst = newestFirstMonths.map((m) => monthCategoryTotals.get(m)?.get(categoryId) ?? 0);
    return { categoryId, name, predictedAmount: weightedMean(amountsNewestFirst) };
  });
  const rawSum = byCategoryRaw.reduce((sum, c) => sum + c.predictedAmount, 0);
  const scale = rawSum > 0 ? predictedTotal / rawSum : 0;
  const byCategory = byCategoryRaw.map((c) => ({ ...c, predictedAmount: c.predictedAmount * scale }));

  // Recurring detection needs 4 months to fire at all; with fewer, report none rather than a
  // silently-empty-looking result the user can't distinguish from "checked, found nothing".
  const recurringCategories: string[] = [];
  if (monthsOfData >= RECURRING_LOOKBACK_MONTHS) {
    const lookbackMonths = newestFirstMonths.slice(0, RECURRING_LOOKBACK_MONTHS);
    for (const categoryId of categoryNames.keys()) {
      let hits = 0;
      for (const month of lookbackMonths) {
        const amounts = monthPaymentsByCategory.get(month)?.get(categoryId) ?? [];
        if (amounts.length === 0) continue;
        // "a similar amount" — treat the month as a hit if any payment in it is within ±10% of
        // any payment in another lookback month for the same category.
        const similarAcrossMonths = lookbackMonths.some((otherMonth) => {
          if (otherMonth === month) return false;
          const otherAmounts = monthPaymentsByCategory.get(otherMonth)?.get(categoryId) ?? [];
          return amounts.some((a) =>
            otherAmounts.some((b) => Math.abs(a - b) <= b * RECURRING_AMOUNT_TOLERANCE),
          );
        });
        if (similarAcrossMonths) hits++;
      }
      if (hits >= RECURRING_MIN_HITS) recurringCategories.push(categoryId);
    }
  }

  return {
    insufficientData: false,
    forecast: {
      forecastMonth: forecastMonth(now),
      currency: 'LKR',
      predictedTotal,
      lowerEstimate,
      upperEstimate,
      byCategory,
      spendingTrend,
      monthsOfData,
      recurringCategories,
    },
  };
}
