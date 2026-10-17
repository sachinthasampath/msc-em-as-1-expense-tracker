import * as Crypto from 'expo-crypto';

import { supabase } from '@/data/remote/supabase-client';

// Receipt uploads require connectivity — they aren't queued in the outbox like cards/payments
// (04-offline-sync.md's outbox only covers those three tables), so attaching a photo is a
// best-effort, online-only action. A payment itself still saves fine offline with photo_path null.
//
// Upload ArrayBuffer, not Blob: React Native Blob goes through a slow base64 native round-trip
// (and triggers Expo's Response.blob() warning). Supabase's RN storage docs also recommend
// ArrayBuffer over Blob/File/FormData.
export async function uploadReceipt(userId: string, localUri: string): Promise<string> {
  const path = `${userId}/${Crypto.randomUUID()}.jpg`;
  const response = await fetch(localUri);
  const bytes = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

  if (error) throw error;
  return path;
}

export async function getReceiptSignedUrl(path: string, ttlSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, ttlSeconds);
  if (error) throw error;
  return data.signedUrl;
}
