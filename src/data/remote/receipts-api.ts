import * as Crypto from 'expo-crypto';

import { supabase } from '@/data/remote/supabase-client';

// Receipt uploads require connectivity — they aren't queued in the outbox like cards/payments
// (04-offline-sync.md's outbox only covers those three tables), so attaching a photo is a
// best-effort, online-only action. A payment itself still saves fine offline with photo_path null.
export async function uploadReceipt(userId: string, localUri: string): Promise<string> {
  const path = `${userId}/${Crypto.randomUUID()}.jpg`;
  const response = await fetch(localUri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

  if (error) throw error;
  return path;
}

export async function getReceiptSignedUrl(path: string, ttlSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, ttlSeconds);
  if (error) throw error;
  return data.signedUrl;
}
