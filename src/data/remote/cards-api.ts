import { supabase } from '@/data/remote/supabase-client';
import { Card } from '@/types/domain';

// insert/update both use upsert: the primary key is a client-generated UUID, so retries are
// safe and there is no id-remapping step (04-offline-sync.md).
export async function upsertCard(card: Card): Promise<string> {
  const { data, error } = await supabase
    .from('cards')
    .upsert({
      id: card.id,
      user_id: card.userId,
      nickname: card.nickname,
      card_type: card.cardType,
      last4: card.last4,
      statement_day: card.statementDay,
      payment_due_day: card.paymentDueDay,
      reminder_lead_days: card.reminderLeadDays,
    })
    .select('updated_at')
    .single();

  if (error) throw error;
  return data.updated_at;
}

// A sync-engine 'delete' op is always a soft delete — the real DELETE RLS policy is an escape
// hatch the sync engine must never use (04-offline-sync.md).
export async function softDeleteCard(id: string): Promise<string> {
  const { data, error } = await supabase
    .from('cards')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('updated_at')
    .single();

  if (error) throw error;
  return data.updated_at;
}

export async function pullCardsSince(since: string) {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .gt('updated_at', since)
    .order('updated_at')
    .limit(500);

  if (error) throw error;
  return data;
}
