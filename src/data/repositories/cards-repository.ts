import * as Crypto from 'expo-crypto';

import { getDb, withWriteTransaction } from '@/data/local/db';
import { enqueue } from '@/data/local/outbox';
import { Card, NewCard } from '@/types/domain';

type CardRow = {
  id: string;
  user_id: string;
  nickname: string;
  card_type: 'credit' | 'debit';
  last4: string | null;
  statement_day: number | null;
  payment_due_day: number | null;
  reminder_lead_days: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function rowToCard(row: CardRow): Card {
  return {
    id: row.id,
    userId: row.user_id,
    nickname: row.nickname,
    cardType: row.card_type,
    last4: row.last4,
    statementDay: row.statement_day,
    paymentDueDay: row.payment_due_day,
    reminderLeadDays: row.reminder_lead_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function listCards(userId: string): Promise<Card[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CardRow>(
    `select * from cards where user_id = ? and sync_status != 'pending_delete' and deleted_at is null order by created_at desc`,
    [userId],
  );
  return rows.map(rowToCard);
}

export async function createCard(input: NewCard): Promise<Card> {
  const db = await getDb();
  const now = new Date().toISOString();
  const card: Card = { ...input, id: Crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null };

  await withWriteTransaction(db, async (txn) => {
    await txn.runAsync(
      `insert into cards
        (id, user_id, nickname, card_type, last4, statement_day, payment_due_day, reminder_lead_days, created_at, updated_at, sync_status)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_sync')`,
      [
        card.id,
        card.userId,
        card.nickname,
        card.cardType,
        card.last4,
        card.statementDay,
        card.paymentDueDay,
        card.reminderLeadDays,
        card.createdAt,
        card.updatedAt,
      ],
    );
    await enqueue('cards', card.id, 'insert', card, txn);
  });

  return card;
}

export async function updateCard(card: Card): Promise<Card> {
  const db = await getDb();
  const updated: Card = { ...card, updatedAt: new Date().toISOString() };

  await withWriteTransaction(db, async (txn) => {
    await txn.runAsync(
      `update cards set
        nickname = ?, card_type = ?, last4 = ?, statement_day = ?, payment_due_day = ?,
        reminder_lead_days = ?, updated_at = ?, sync_status = 'pending_sync'
       where id = ?`,
      [
        updated.nickname,
        updated.cardType,
        updated.last4,
        updated.statementDay,
        updated.paymentDueDay,
        updated.reminderLeadDays,
        updated.updatedAt,
        updated.id,
      ],
    );
    await enqueue('cards', updated.id, 'update', updated, txn);
  });

  return updated;
}

export async function deleteCard(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await withWriteTransaction(db, async (txn) => {
    await txn.runAsync(`update cards set deleted_at = ?, sync_status = 'pending_delete' where id = ?`, [
      now,
      id,
    ]);
    await enqueue('cards', id, 'delete', { id }, txn);
  });
}
