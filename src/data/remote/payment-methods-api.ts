import { supabase } from '@/data/remote/supabase-client';
import { PaymentMethod } from '@/types/domain';

export async function upsertPaymentMethod(method: PaymentMethod): Promise<void> {
  const { error } = await supabase.from('payment_methods').upsert({
    id: method.id,
    user_id: method.userId,
    method_type: method.methodType,
    card_id: method.cardId,
    label: method.label,
  });

  if (error) throw error;
}

// payment_methods has no delete RLS use in the sync engine and no updated_at column — rows are
// cascade-deleted via their card, or left orphaned harmlessly if unreferenced (02-schema-notes.md).
export async function deletePaymentMethod(id: string): Promise<void> {
  const { error } = await supabase.from('payment_methods').delete().eq('id', id);
  if (error) throw error;
}

export async function pullPaymentMethodsSince(): Promise<PaymentMethod[]> {
  // payment_methods has no updated_at column, so it is pulled in full on each sign-in rather
  // than incrementally — the table is small per user (one row per card + a couple of static
  // cash/other rows), so this is cheap.
  const { data, error } = await supabase.from('payment_methods').select('*');
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    methodType: row.method_type as PaymentMethod['methodType'],
    cardId: row.card_id,
    label: row.label,
    createdAt: row.created_at,
  }));
}
