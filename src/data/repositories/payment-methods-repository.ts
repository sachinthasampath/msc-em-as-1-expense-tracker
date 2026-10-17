import * as Crypto from 'expo-crypto';

import { getDb } from '@/data/local/db';
import { enqueue } from '@/data/local/outbox';
import { NewPaymentMethod, PaymentMethod } from '@/types/domain';

type PaymentMethodRow = {
  id: string;
  user_id: string;
  method_type: 'card' | 'cash' | 'other';
  card_id: string | null;
  label: string | null;
  created_at: string;
};

function rowToPaymentMethod(row: PaymentMethodRow): PaymentMethod {
  return {
    id: row.id,
    userId: row.user_id,
    methodType: row.method_type,
    cardId: row.card_id,
    label: row.label,
    createdAt: row.created_at,
  };
}

export async function listPaymentMethods(userId: string): Promise<PaymentMethod[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PaymentMethodRow>(
    `select * from payment_methods where user_id = ? and sync_status != 'pending_delete' order by created_at asc`,
    [userId],
  );
  return rows.map(rowToPaymentMethod);
}

export async function createPaymentMethod(input: NewPaymentMethod): Promise<PaymentMethod> {
  const db = await getDb();
  const method: PaymentMethod = { ...input, id: Crypto.randomUUID(), createdAt: new Date().toISOString() };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `insert into payment_methods (id, user_id, method_type, card_id, label, created_at, sync_status)
       values (?, ?, ?, ?, ?, ?, 'pending_sync')`,
      [method.id, method.userId, method.methodType, method.cardId, method.label, method.createdAt],
    );
    await enqueue('payment_methods', method.id, 'insert', method);
  });

  return method;
}

// 'cash'/'other' are regular payment_methods rows (no magic sentinel values), so every user
// needs one of each created once before they can log a non-card payment.
export async function ensureDefaultPaymentMethods(userId: string): Promise<void> {
  const db = await getDb();
  const existing = await db.getAllAsync<{ method_type: string }>(
    `select method_type from payment_methods where user_id = ? and method_type in ('cash', 'other') and sync_status != 'pending_delete'`,
    [userId],
  );
  const have = new Set(existing.map((row) => row.method_type));

  if (!have.has('cash')) {
    await createPaymentMethod({ userId, methodType: 'cash', cardId: null, label: 'Cash' });
  }
  if (!have.has('other')) {
    await createPaymentMethod({ userId, methodType: 'other', cardId: null, label: 'Other' });
  }
}

export async function deletePaymentMethod(id: string): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync(`update payment_methods set sync_status = 'pending_delete' where id = ?`, [id]);
    await enqueue('payment_methods', id, 'delete', { id });
  });
}
