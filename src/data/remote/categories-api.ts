import { supabase } from '@/data/remote/supabase-client';

// categories has no updated_at column and no outbox entry — it is a small, rarely-changing
// table (system defaults + a handful of user rows at most) that's pulled in full, mirroring the
// payment_methods pull strategy.
export async function pullCategories() {
  const { data, error } = await supabase.from('categories').select('*');
  if (error) throw error;
  return data;
}
