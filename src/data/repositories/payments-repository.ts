import * as Crypto from 'expo-crypto';

import { getDb, withWriteTransaction } from '@/data/local/db';
import { enqueue } from '@/data/local/outbox';
import { NewPayment, Payment } from '@/types/domain';

type PaymentRow = {
  id: string;
  user_id: string;
  amount_minor: number;
  currency: string;
  occurred_at: string;
  category_id: string | null;
  payment_method_id: string | null;
  card_billing_period_start: string | null;
  card_billing_period_end: string | null;
  photo_path: string | null;
  notes: string | null;
  is_recurring_guess: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function rowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    userId: row.user_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    occurredAt: row.occurred_at,
    categoryId: row.category_id,
    paymentMethodId: row.payment_method_id,
    cardBillingPeriodStart: row.card_billing_period_start,
    cardBillingPeriodEnd: row.card_billing_period_end,
    photoPath: row.photo_path,
    notes: row.notes,
    isRecurringGuess: row.is_recurring_guess === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function listPayments(userId: string): Promise<Payment[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PaymentRow>(
    `select * from payments where user_id = ? and sync_status != 'pending_delete' and deleted_at is null order by occurred_at desc`,
    [userId],
  );
  return rows.map(rowToPayment);
}

export async function createPayment(input: NewPayment): Promise<Payment> {
  const db = await getDb();
  const now = new Date().toISOString();
  const payment: Payment = { ...input, id: Crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null };

  await withWriteTransaction(db, async (txn) => {
    await txn.runAsync(
      `insert into payments
        (id, user_id, amount_minor, currency, occurred_at, category_id, payment_method_id,
         card_billing_period_start, card_billing_period_end, photo_path, notes, is_recurring_guess,
         created_at, updated_at, sync_status)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_sync')`,
      [
        payment.id,
        payment.userId,
        payment.amountMinor,
        payment.currency,
        payment.occurredAt,
        payment.categoryId,
        payment.paymentMethodId,
        payment.cardBillingPeriodStart,
        payment.cardBillingPeriodEnd,
        payment.photoPath,
        payment.notes,
        payment.isRecurringGuess ? 1 : 0,
        payment.createdAt,
        payment.updatedAt,
      ],
    );
    await enqueue('payments', payment.id, 'insert', payment, txn);
  });

  return payment;
}

export async function updatePayment(payment: Payment): Promise<Payment> {
  const db = await getDb();
  const updated: Payment = { ...payment, updatedAt: new Date().toISOString() };

  await withWriteTransaction(db, async (txn) => {
    await txn.runAsync(
      `update payments set
        amount_minor = ?, occurred_at = ?, category_id = ?, payment_method_id = ?,
        card_billing_period_start = ?, card_billing_period_end = ?, photo_path = ?, notes = ?,
        is_recurring_guess = ?, updated_at = ?, sync_status = 'pending_sync'
       where id = ?`,
      [
        updated.amountMinor,
        updated.occurredAt,
        updated.categoryId,
        updated.paymentMethodId,
        updated.cardBillingPeriodStart,
        updated.cardBillingPeriodEnd,
        updated.photoPath,
        updated.notes,
        updated.isRecurringGuess ? 1 : 0,
        updated.updatedAt,
        updated.id,
      ],
    );
    await enqueue('payments', updated.id, 'update', updated, txn);
  });

  return updated;
}

export async function deletePayment(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await withWriteTransaction(db, async (txn) => {
    await txn.runAsync(`update payments set deleted_at = ?, sync_status = 'pending_delete' where id = ?`, [
      now,
      id,
    ]);
    await enqueue('payments', id, 'delete', { id }, txn);
  });
}
