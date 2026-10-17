import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getDb } from '@/data/local/db';
import * as outbox from '@/data/local/outbox';
import { OutboxOp, OutboxTable } from '@/data/local/outbox';
import * as cardsApi from '@/data/remote/cards-api';
import * as categoriesApi from '@/data/remote/categories-api';
import * as paymentMethodsApi from '@/data/remote/payment-methods-api';
import * as paymentsApi from '@/data/remote/payments-api';
import { toMinorUnits } from '@/data/remote/payments-api';
import { useIsOnline } from '@/services/connectivity';

const EPOCH = '1970-01-01T00:00:00.000Z';

let flushing = false;

// A request that reached the server and was rejected comes back as a structured Postgrest/
// Postgres error (has a `code`); a request that never reached the server (offline, timeout) is a
// raw fetch/TypeError with no such field. The flush loop needs to tell these apart: a network
// error must stop the whole loop (preserve FIFO ordering, retry later); a rejection is this row's
// problem alone (04-offline-sync.md).
function isNetworkError(err: unknown): boolean {
  return !(err && typeof err === 'object' && 'code' in err);
}

function extractDependencyIds(table: OutboxTable, payload: any): string[] {
  if (table === 'payments') return [payload.paymentMethodId].filter(Boolean);
  if (table === 'payment_methods') return [payload.cardId].filter(Boolean);
  return [];
}

async function applyToSupabase(table: OutboxTable, op: OutboxOp, payload: any): Promise<string> {
  if (op === 'delete') {
    if (table === 'cards') return cardsApi.softDeleteCard(payload.id);
    if (table === 'payments') return paymentsApi.softDeletePayment(payload.id);
    await paymentMethodsApi.deletePaymentMethod(payload.id);
    return new Date().toISOString();
  }

  if (table === 'cards') return cardsApi.upsertCard(payload);
  if (table === 'payments') return paymentsApi.upsertPayment(payload);
  await paymentMethodsApi.upsertPaymentMethod(payload);
  return new Date().toISOString();
}

async function markLocalSynced(table: OutboxTable, id: string, serverUpdatedAt: string) {
  const db = await getDb();
  if (table === 'payment_methods') {
    await db.runAsync(`update payment_methods set sync_status = 'synced' where id = ?`, [id]);
    return;
  }
  const column = table === 'cards' ? 'cards' : 'payments';
  await db.runAsync(`update ${column} set sync_status = 'synced', server_updated_at = ? where id = ?`, [
    serverUpdatedAt,
    id,
  ]);
}

export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;

  try {
    const deadRows = await outbox.listDeadLettered();
    const deadEntityIds = new Set(deadRows.map((r) => r.entity_id));

    const rows = await outbox.listPending(Date.now());

    for (const row of rows) {
      const payload = JSON.parse(row.payload);
      const dependency = extractDependencyIds(row.entity_table, payload).find((id) =>
        deadEntityIds.has(id),
      );

      if (dependency) {
        await outbox.parkAsBlocked(row.id, dependency);
        deadEntityIds.add(row.entity_id);
        continue;
      }

      try {
        const serverUpdatedAt = await applyToSupabase(row.entity_table, row.op, payload);
        await outbox.markSynced(row.id);
        await markLocalSynced(row.entity_table, row.entity_id, serverUpdatedAt);
      } catch (err) {
        if (isNetworkError(err)) {
          return; // stop the whole loop; preserves ordering, retries on next trigger
        }
        await outbox.recordFailure(row.id, err instanceof Error ? err.message : String(err));
        deadEntityIds.add(row.entity_id);
      }
    }
  } finally {
    flushing = false;
  }
}

async function pullCards(userId: string) {
  const db = await getDb();
  const state = await db.getFirstAsync<{ last_pulled_at: string }>(
    `select last_pulled_at from sync_state where entity_table = 'cards'`,
  );
  const since = state?.last_pulled_at ?? EPOCH;
  const rows = await cardsApi.pullCardsSince(since);
  let maxUpdatedAt = since;

  for (const row of rows) {
    const local = await db.getFirstAsync<{ sync_status: string; updated_at: string }>(
      'select sync_status, updated_at from cards where id = ?',
      [row.id],
    );
    const localIsNewerUnsyncedEdit = local && local.sync_status !== 'synced' && local.updated_at > row.updated_at;

    if (!localIsNewerUnsyncedEdit) {
      await db.runAsync(
        `insert into cards (id, user_id, nickname, card_type, last4, statement_day, payment_due_day, reminder_lead_days, created_at, updated_at, deleted_at, sync_status, server_updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)
         on conflict(id) do update set
           nickname = excluded.nickname, card_type = excluded.card_type, last4 = excluded.last4,
           statement_day = excluded.statement_day, payment_due_day = excluded.payment_due_day,
           reminder_lead_days = excluded.reminder_lead_days, updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at, sync_status = 'synced', server_updated_at = excluded.server_updated_at`,
        [
          row.id,
          row.user_id,
          row.nickname,
          row.card_type,
          row.last4,
          row.statement_day,
          row.payment_due_day,
          row.reminder_lead_days,
          row.created_at,
          row.updated_at,
          row.deleted_at,
          row.updated_at,
        ],
      );
    }

    if (row.updated_at > maxUpdatedAt) maxUpdatedAt = row.updated_at;
  }

  await db.runAsync(
    `insert into sync_state (entity_table, last_pulled_at) values ('cards', ?)
     on conflict(entity_table) do update set last_pulled_at = excluded.last_pulled_at`,
    [maxUpdatedAt],
  );
}

async function pullPayments(userId: string) {
  const db = await getDb();
  const state = await db.getFirstAsync<{ last_pulled_at: string }>(
    `select last_pulled_at from sync_state where entity_table = 'payments'`,
  );
  const since = state?.last_pulled_at ?? EPOCH;
  const rows = await paymentsApi.pullPaymentsSince(since);
  let maxUpdatedAt = since;

  for (const row of rows) {
    const local = await db.getFirstAsync<{ sync_status: string; updated_at: string }>(
      'select sync_status, updated_at from payments where id = ?',
      [row.id],
    );
    const localIsNewerUnsyncedEdit = local && local.sync_status !== 'synced' && local.updated_at > row.updated_at;

    if (!localIsNewerUnsyncedEdit) {
      await db.runAsync(
        `insert into payments
          (id, user_id, amount_minor, currency, occurred_at, category_id, payment_method_id,
           card_billing_period_start, card_billing_period_end, photo_path, notes, is_recurring_guess,
           created_at, updated_at, deleted_at, sync_status, server_updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)
         on conflict(id) do update set
           amount_minor = excluded.amount_minor, occurred_at = excluded.occurred_at,
           category_id = excluded.category_id, payment_method_id = excluded.payment_method_id,
           card_billing_period_start = excluded.card_billing_period_start,
           card_billing_period_end = excluded.card_billing_period_end, photo_path = excluded.photo_path,
           notes = excluded.notes, is_recurring_guess = excluded.is_recurring_guess,
           updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
           sync_status = 'synced', server_updated_at = excluded.server_updated_at`,
        [
          row.id,
          row.user_id,
          toMinorUnits(row.amount),
          row.currency,
          row.occurred_at,
          row.category_id,
          row.payment_method_id,
          row.card_billing_period_start,
          row.card_billing_period_end,
          row.photo_path,
          row.notes,
          row.is_recurring_guess ? 1 : 0,
          row.created_at,
          row.updated_at,
          row.deleted_at,
          row.updated_at,
        ],
      );
    }

    if (row.updated_at > maxUpdatedAt) maxUpdatedAt = row.updated_at;
  }

  await db.runAsync(
    `insert into sync_state (entity_table, last_pulled_at) values ('payments', ?)
     on conflict(entity_table) do update set last_pulled_at = excluded.last_pulled_at`,
    [maxUpdatedAt],
  );
}

// payment_methods has no updated_at column (02-supabase-schema.sql), so it is pulled in full
// each time rather than incrementally — cheap, since it's one row per card plus a couple of
// static cash/other rows per user.
async function pullPaymentMethods(userId: string) {
  const db = await getDb();
  const rows = await paymentMethodsApi.pullPaymentMethodsSince();

  for (const row of rows) {
    const local = await db.getFirstAsync<{ sync_status: string }>(
      'select sync_status from payment_methods where id = ?',
      [row.id],
    );
    if (local?.sync_status === 'pending_delete') continue;

    await db.runAsync(
      `insert into payment_methods (id, user_id, method_type, card_id, label, created_at, sync_status)
       values (?, ?, ?, ?, ?, ?, 'synced')
       on conflict(id) do update set
         method_type = excluded.method_type, card_id = excluded.card_id, label = excluded.label,
         sync_status = 'synced'`,
      [row.id, row.userId, row.methodType, row.cardId, row.label, row.createdAt],
    );
  }
}

// categories is read-only on the client (no outbox entries — see 00-overview.md's categories
// RLS: clients can only insert their own, never a system default), so this just mirrors
// whatever exists server-side. Pulled in full, same reasoning as payment_methods.
async function pullCategories() {
  const db = await getDb();
  const rows = await categoriesApi.pullCategories();

  for (const row of rows) {
    await db.runAsync(
      `insert into categories (id, user_id, name, parent_category_id, icon, sync_status)
       values (?, ?, ?, ?, ?, 'synced')
       on conflict(id) do update set
         name = excluded.name, parent_category_id = excluded.parent_category_id, icon = excluded.icon`,
      [row.id, row.user_id, row.name, row.parent_category_id, row.icon],
    );
  }
}

export async function pull(userId: string): Promise<void> {
  await pullCategories();
  await pullCards(userId);
  await pullPaymentMethods(userId);
  await pullPayments(userId);
}

export function useSyncEngine(userId: string | null) {
  const isOnline = useIsOnline();
  const onlineRef = useRef(isOnline);

  useEffect(() => {
    onlineRef.current = isOnline;
  }, [isOnline]);

  // Runs on login (userId appears while already online) and on every offline→online
  // transition (isOnline flips to true) — both are "connectivity just became usable" moments.
  useEffect(() => {
    if (!userId || !isOnline) return;
    pull(userId).then(flush);
  }, [isOnline, userId]);

  useEffect(() => {
    if (!userId) return;
    const uid = userId;

    function run() {
      if (!onlineRef.current) return;
      pull(uid).then(flush);
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    const interval = setInterval(run, 60000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [userId]);
}
