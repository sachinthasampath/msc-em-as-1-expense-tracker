// Inserts 100 cash payments into the remote database for the signed-in user.
// Predictions read Supabase, not the phone's local database, and they ignore the
// current calendar month. These rows cover June–September 2026 (four complete months).
//
// Usage (from the project folder):
//   node scripts/seed-payments.mjs you@example.com your-password

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const COUNT = 100;
const MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09'];
const CATEGORY_NAMES = ['Food', 'Transport', 'Utilities', 'Shopping', 'Entertainment'];
const NOTE = 'Sample history';

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

function buildRows(categoryIds) {
  const rows = [];
  for (let i = 0; i < COUNT; i++) {
    const month = MONTHS[i % MONTHS.length];
    const day = String((i % 27) + 1).padStart(2, '0');
    const categoryName = CATEGORY_NAMES[i % CATEGORY_NAMES.length];
    const amount = 500 + ((i * 137) % 9500);
    rows.push({
      amount,
      currency: 'LKR',
      occurred_at: `${month}-${day}T12:00:00.000Z`,
      category_id: categoryIds.get(categoryName) ?? null,
      photo_path: null,
      notes: NOTE,
      is_recurring_guess: false,
    });
  }
  return rows;
}

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/seed-payments.mjs <email> <password>');
  process.exit(1);
}

const env = loadEnv(new URL('../.env', import.meta.url));
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, anonKey);
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError || !auth.user) {
  console.error(authError?.message ?? 'Sign-in failed');
  process.exit(1);
}

const { data: categories, error: categoryError } = await supabase
  .from('categories')
  .select('id, name')
  .in('name', CATEGORY_NAMES);
if (categoryError) {
  console.error(categoryError.message);
  process.exit(1);
}

const categoryIds = new Map((categories ?? []).map((row) => [row.name, row.id]));
const { error: insertError } = await supabase.from('payments').insert(buildRows(categoryIds));
if (insertError) {
  console.error(insertError.message);
  process.exit(1);
}

console.log(`Inserted ${COUNT} payments for ${auth.user.email} across ${MONTHS.join(', ')}.`);
console.log('Reopen Predictions in the app so it fetches a new forecast.');
