-- 02 — Supabase schema
-- See 00-overview.md for product context and 02-schema-notes.md for design rationale.
-- Intended to be committed as supabase/migrations/0001_init.sql once the Supabase project exists.
-- Run via `supabase db push` (or pasted into the SQL editor for a first pass), then
-- `npx supabase gen types typescript --project-id <ref> > src/types/database.ts`.
--
-- This file is written to be IDEMPOTENT: running it twice must not duplicate seed rows or
-- error. That matters because 02-schema-notes.md's recommended workflow is "paste into the
-- SQL editor for a first pass, then reconcile the migrations folder" — which runs it twice.
--
-- RLS policy style note: every policy wraps auth.uid() as `(select auth.uid())`. This is
-- Supabase's documented performance pattern — the bare form is re-evaluated once PER ROW,
-- the subselect form is evaluated once per query. With list screens reading hundreds of
-- payments this is the difference between a fast and a visibly slow app.

-- ============================================================================
-- Shared helper: keep updated_at honest.
-- The offline sync engine's last-write-wins conflict resolution (04-offline-sync.md)
-- depends on updated_at actually changing on every UPDATE. A `default now()` only fires
-- on INSERT, so without this trigger updated_at stays frozen at creation time forever and
-- the whole conflict policy silently does nothing. It also stops a client from back-dating
-- updated_at to win a conflict it should have lost.
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- profiles: 1:1 with auth.users, created automatically on signup
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  activated_at timestamptz,                         -- set client-side right after verifyOtp succeeds
  timezone text not null default 'Asia/Colombo',    -- IANA zone; the notification scheduler needs this
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  max_notifications_per_day int not null default 3
    check (max_notifications_per_day between 1 and 20),
  created_at timestamptz not null default now()
);

-- Why `timezone` exists: quiet_hours_start/end are `time` WITHOUT time zone, so '22:00' is
-- meaningless on its own. The constraint scheduler (05-notification-scheduler.md) must
-- localize every candidate slot before testing it against quiet hours and before bucketing
-- it into a calendar day for the per-day cap. Storing the user's IANA zone here is what
-- makes that possible, and keeps it stable if they travel.

alter table public.profiles enable row level security;

drop policy if exists "select own profile" on public.profiles;
create policy "select own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- no insert/delete policy for clients: profile rows are created only by the trigger below.
-- This is why the activation screen must use UPDATE, never upsert — an upsert falls back to
-- INSERT on a conflict miss and would be denied. See 03-auth-activation.md.

-- Auto-create a profile row the moment a new auth user is created (before activation).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;      -- never abort the signup transaction
  return new;
end;
$$;

-- Why `on conflict do nothing`: anything that raises inside this trigger aborts the whole
-- auth.users INSERT, and GoTrue surfaces it to the app as the opaque, much-googled
-- "Database error saving new user" 500. Making the trigger unconditionally safe to re-run
-- removes an entire category of unexplainable signup failures.

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- cards: credit/debit cards
-- ============================================================================
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname text not null,
  card_type text not null check (card_type in ('credit', 'debit')),
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  statement_day int check (statement_day between 1 and 28),      -- billing-cycle anchor day of month
  payment_due_day int check (payment_due_day between 1 and 28),
  reminder_lead_days int not null default 3
    check (reminder_lead_days between 0 and 28),                  -- per-card configurable reminder lead time
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                                         -- soft delete, needed so sync can propagate deletes

  -- A credit card is the only thing that gets a reminder, and the scheduler can't compute
  -- a due date without these. Enforce the invariant rather than discovering it as a null
  -- dereference inside notification-scheduler.ts.
  constraint credit_cards_need_billing_days check (
    card_type <> 'credit'
    or (statement_day is not null and payment_due_day is not null)
  )
);

drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

create index if not exists cards_user_idx on public.cards (user_id) where deleted_at is null;
create index if not exists cards_user_updated_idx on public.cards (user_id, updated_at);

alter table public.cards enable row level security;

drop policy if exists "select own cards" on public.cards;
create policy "select own cards" on public.cards
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert own cards" on public.cards;
create policy "insert own cards" on public.cards
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "update own cards" on public.cards;
create policy "update own cards" on public.cards
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "delete own cards" on public.cards;
create policy "delete own cards" on public.cards
  for delete to authenticated using ((select auth.uid()) = user_id);
-- Note: the app soft-deletes (sets deleted_at) rather than issuing DELETE — see
-- 04-offline-sync.md. This policy exists only as an escape hatch; the sync engine must
-- never use it, or the soft-delete rationale in 02-schema-notes.md is defeated.

-- ============================================================================
-- payment_methods: normalizes "link payment to card, cash, or other"
-- ============================================================================
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  method_type text not null check (method_type in ('card', 'cash', 'other')),
  card_id uuid references public.cards(id) on delete cascade,
  label text,                                                      -- e.g. "Cash", "Bank transfer"
  created_at timestamptz not null default now(),

  -- The original schema documented "non-null only when method_type = 'card'" as a comment
  -- and then used `on delete set null`, which actively produced the state the comment said
  -- was impossible. Enforce it, and cascade instead: if the card is gone, the card-backed
  -- payment method is meaningless.
  constraint card_method_requires_card check ((method_type = 'card') = (card_id is not null))
);

create index if not exists payment_methods_user_idx on public.payment_methods (user_id);
create index if not exists payment_methods_card_idx on public.payment_methods (card_id);

alter table public.payment_methods enable row level security;

drop policy if exists "select own payment methods" on public.payment_methods;
create policy "select own payment methods" on public.payment_methods
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert own payment methods" on public.payment_methods;
create policy "insert own payment methods" on public.payment_methods
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "update own payment methods" on public.payment_methods;
create policy "update own payment methods" on public.payment_methods
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "delete own payment methods" on public.payment_methods;
create policy "delete own payment methods" on public.payment_methods
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- categories: system defaults (user_id null) + user-custom, with subcategory support
-- ============================================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,        -- null = shared system default
  name text not null check (length(trim(name)) between 1 and 60),
  parent_category_id uuid references public.categories(id) on delete set null,
  icon text
);

-- `on delete set null` on parent_category_id: without an explicit action this defaults to
-- NO ACTION, so deleting a parent category that has children fails with an FK violation —
-- which the client's delete policy happily lets it attempt, producing an opaque 409.
-- Promoting orphaned children to top-level is the behaviour a user expects.

-- Length cap on `name` is not cosmetic: category names are the one user-controlled string
-- that reaches the LLM prompt in 07-ai-prediction.md. Bounding them here bounds the
-- prompt-injection surface at the source.

create index if not exists categories_user_idx on public.categories (user_id);
create index if not exists categories_parent_idx on public.categories (parent_category_id);

-- Makes the seed below idempotent and stops duplicate system defaults appearing.
create unique index if not exists categories_default_name_uniq
  on public.categories (name) where user_id is null;

alter table public.categories enable row level security;

drop policy if exists "select own or default categories" on public.categories;
create policy "select own or default categories" on public.categories
  for select to authenticated using (user_id is null or (select auth.uid()) = user_id);
drop policy if exists "insert own categories" on public.categories;
create policy "insert own categories" on public.categories
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "update own categories" on public.categories;
create policy "update own categories" on public.categories
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "delete own categories" on public.categories;
create policy "delete own categories" on public.categories
  for delete to authenticated using ((select auth.uid()) = user_id);
-- Note the insert policy's `with check (auth.uid() = user_id)` also blocks a client from
-- creating a system default (user_id null), which is intended — defaults come from the seed.

-- Seed system default categories (user_id null, shared read-only defaults).
insert into public.categories (name, icon) values
  ('Food', 'utensils'),
  ('Transport', 'car'),
  ('Utilities', 'bolt'),
  ('Entertainment', 'film'),
  ('Health', 'heart-pulse'),
  ('Shopping', 'bag'),
  ('Education', 'book'),
  ('Other', 'tag')
on conflict do nothing;

-- ============================================================================
-- payments (expenses)
-- ============================================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'LKR' check (currency = 'LKR'),
  occurred_at timestamptz not null,
  category_id uuid references public.categories(id) on delete set null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  card_billing_period_start date,          -- attribution window, computed client-side from the card's statement_day
  card_billing_period_end date,            -- used by the AI feature to avoid double-counting near statement boundaries
  photo_path text,                          -- Supabase Storage object path in the `receipts` bucket, nullable
  notes text,
  is_recurring_guess boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint billing_period_ordered check (
    card_billing_period_start is null
    or card_billing_period_end is null
    or card_billing_period_start <= card_billing_period_end
  )
);

-- `check (currency = 'LKR')` turns 00-overview.md's "currency is LKR throughout" from a
-- prose claim into an enforced invariant. 02-schema-notes.md documents single-currency as
-- a deliberate scope cut; this is what makes that cut real rather than aspirational. When
-- multi-currency is wanted later, dropping one CHECK is the whole migration.

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- Partial index: every read path filters `deleted_at is null` (soft deletes), so the index
-- should too — it stays smaller and Postgres can use it for exactly the query the app runs.
create index if not exists payments_user_occurred_idx
  on public.payments (user_id, occurred_at desc) where deleted_at is null;
-- Supports the sync engine's incremental pull ("rows changed since X") — 04-offline-sync.md.
create index if not exists payments_user_updated_idx on public.payments (user_id, updated_at);
create index if not exists payments_category_idx on public.payments (category_id);
create index if not exists payments_method_idx on public.payments (payment_method_id);
-- Supports the AI feature's billing-period grouping — 07-ai-prediction.md.
create index if not exists payments_billing_period_idx
  on public.payments (user_id, card_billing_period_start) where card_billing_period_start is not null;

alter table public.payments enable row level security;

drop policy if exists "select own payments" on public.payments;
create policy "select own payments" on public.payments
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert own payments" on public.payments;
create policy "insert own payments" on public.payments
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "update own payments" on public.payments;
create policy "update own payments" on public.payments
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "delete own payments" on public.payments;
create policy "delete own payments" on public.payments
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- predictions_cache: last AI forecast per user per month (read-through cache)
-- ============================================================================
create table if not exists public.predictions_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  forecast jsonb not null,                  -- { predictedTotal, lowerEstimate, upperEstimate, byCategory, trend, monthsOfData }
  ai_explanation jsonb,                      -- validated LLM output; null when AI call failed/was skipped
  ai_error boolean not null default false,   -- true when the numeric forecast is good but the LLM call failed
  generated_at timestamptz not null default now(),
  primary key (user_id, period_month)
);

-- The CHECK on period_month is what makes the primary key actually mean "one row per
-- month". Without it '2026-11-01' and '2026-11-15' are two distinct cache entries for the
-- same forecast month, and the cache silently stops being a cache.
-- `user_id` deliberately has NO `default auth.uid()` here, unlike every other table: rows
-- are only ever written by the Edge Function's service-role client, which has no auth.uid().

alter table public.predictions_cache enable row level security;

drop policy if exists "select own predictions" on public.predictions_cache;
create policy "select own predictions" on public.predictions_cache
  for select to authenticated using ((select auth.uid()) = user_id);
-- insert/update is performed by the Edge Function using the service-role key, which bypasses RLS —
-- no client-side insert/update policy needed or wanted here. Absence of a policy = denied.

-- ============================================================================
-- ai_invocation_log: per-user rate limiting for the metered OpenRouter endpoint
-- ============================================================================
-- 00-overview.md says the app is free with no paid tier, but predict-expenses fronts a
-- metered LLM API with no cost ceiling. Without this, any authenticated user can invoke the
-- function in a loop and run up a real bill. Written by the Edge Function (service role);
-- clients can read their own usage so the UI can explain "daily limit reached".
create table if not exists public.ai_invocation_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  invocation_count int not null default 0 check (invocation_count >= 0),
  primary key (user_id, day)
);

alter table public.ai_invocation_log enable row level security;

drop policy if exists "select own ai usage" on public.ai_invocation_log;
create policy "select own ai usage" on public.ai_invocation_log
  for select to authenticated using ((select auth.uid()) = user_id);

-- ============================================================================
-- Storage: receipts bucket (private; path-prefix-scoped per user)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The size/mime limits are enforcement, not decoration: without them any authenticated user
-- can push arbitrarily large arbitrary-type blobs into the free-tier storage quota. 5 MB is
-- comfortably above what ReceiptCaptureOverlay produces once it resizes (06-custom-components.md).

-- Note: on hosted Supabase, RLS is already enabled on storage.objects. This statement is
-- here so the migration is self-contained against a bare Postgres / `supabase start`.
alter table storage.objects enable row level security;

drop policy if exists "select own receipts" on storage.objects;
create policy "select own receipts" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "insert own receipts" on storage.objects;
create policy "insert own receipts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- REQUIRED, and missing from the original schema: supabase-js `upload(..., { upsert: true })`
-- issues an UPDATE against an existing object. With no update policy, re-capturing a receipt
-- at the same path fails with a policy violation that looks like a bug in the upload code.
drop policy if exists "update own receipts" on storage.objects;
create policy "update own receipts" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "delete own receipts" on storage.objects;
create policy "delete own receipts" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Client uploads to `${auth.uid()}/<uuid>.jpg` and stores that relative path in payments.photo_path;
-- reads resolve a signed URL via supabase.storage.from('receipts').createSignedUrl(path, ttlSeconds).
-- Objects written to the bucket ROOT (no '/' in the name) have foldername()[1] = the filename,
-- which never equals a uid — so those fail closed. That is the intended behaviour.
