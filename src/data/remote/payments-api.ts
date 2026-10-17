import { supabase } from '@/data/remote/supabase-client';
import { Payment } from '@/types/domain';

// Local storage is integer minor units (cents); Supabase's numeric(12,2) column is major units.
// This is the one conversion boundary — see 04-offline-sync.md on why amount_minor exists.
function toMajorUnits(amountMinor: number): number {
  return amountMinor / 100;
}

export function toMinorUnits(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

export async function upsertPayment(payment: Payment): Promise<string> {
  const { data, error } = await supabase
    .from('payments')
    .upsert({
      id: payment.id,
      user_id: payment.userId,
      amount: toMajorUnits(payment.amountMinor),
      currency: payment.currency,
      occurred_at: payment.occurredAt,
      category_id: payment.categoryId,
      payment_method_id: payment.paymentMethodId,
      card_billing_period_start: payment.cardBillingPeriodStart,
      card_billing_period_end: payment.cardBillingPeriodEnd,
      photo_path: payment.photoPath,
      notes: payment.notes,
      is_recurring_guess: payment.isRecurringGuess,
    })
    .select('updated_at')
    .single();

  if (error) throw error;
  return data.updated_at;
}

export async function softDeletePayment(id: string): Promise<string> {
  const { data, error } = await supabase
    .from('payments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('updated_at')
    .single();

  if (error) throw error;
  return data.updated_at;
}

export async function pullPaymentsSince(since: string) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .gt('updated_at', since)
    .order('updated_at')
    .limit(500);

  if (error) throw error;
  return data;
}
