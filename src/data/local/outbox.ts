import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '@/data/local/db';

export type OutboxOp = 'insert' | 'update' | 'delete';
export type OutboxTable = 'cards' | 'payment_methods' | 'payments';

export type OutboxRow = {
  id: number;
  entity_table: OutboxTable;
  entity_id: string;
  op: OutboxOp;
  payload: string;
  created_at: number;
  attempt_count: number;
  next_attempt_at: number;
  dead_letter: number;
  last_error: string | null;
};

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [2000, 4000, 8000, 16000, 30000];

// When called inside withWriteTransaction / withExclusiveTransactionAsync, pass the txn so the
// outbox insert runs on that connection — using getDb() there deadlocks the exclusive lock.
export async function enqueue(
  table: OutboxTable,
  id: string,
  op: OutboxOp,
  payload: unknown,
  executor?: SQLiteDatabase,
) {
  const db = executor ?? (await getDb());
  await db.runAsync(
    'insert into outbox (entity_table, entity_id, op, payload, created_at) values (?, ?, ?, ?, ?)',
    [table, id, op, JSON.stringify(payload), Date.now()],
  );
}

export async function listPending(now: number): Promise<OutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxRow>(
    'select * from outbox where dead_letter = 0 and next_attempt_at <= ? order by created_at asc',
    [now],
  );
}

export async function markSynced(id: number) {
  const db = await getDb();
  await db.runAsync('delete from outbox where id = ?', [id]);
}

export async function recordFailure(id: number, error: string) {
  const db = await getDb();
  const row = await db.getFirstAsync<{ attempt_count: number }>(
    'select attempt_count from outbox where id = ?',
    [id],
  );
  const attemptCount = (row?.attempt_count ?? 0) + 1;
  const deadLetter = attemptCount >= MAX_ATTEMPTS ? 1 : 0;
  const backoff = BACKOFF_MS[Math.min(attemptCount - 1, BACKOFF_MS.length - 1)];
  const nextAttemptAt = Date.now() + backoff;

  await db.runAsync(
    'update outbox set attempt_count = ?, next_attempt_at = ?, dead_letter = ?, last_error = ? where id = ?',
    [attemptCount, nextAttemptAt, deadLetter, error, id],
  );
}

export async function parkAsBlocked(id: number, blockedByEntityId: string) {
  const db = await getDb();
  await db.runAsync('update outbox set dead_letter = 1, last_error = ? where id = ?', [
    `blocked by ${blockedByEntityId}`,
    id,
  ]);
}

export async function listDeadLettered(): Promise<OutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxRow>('select * from outbox where dead_letter = 1 order by created_at asc');
}

export async function unparkDeadLettered(id: number) {
  const db = await getDb();
  await db.runAsync(
    'update outbox set dead_letter = 0, attempt_count = 0, next_attempt_at = 0, last_error = null where id = ?',
    [id],
  );
}
