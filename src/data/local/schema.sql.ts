// Mirrors the offline-capable Supabase tables (02-supabase-schema.sql): cards, payment_methods,
// categories, payments. Same column names as Supabase, with two deliberate exceptions —
// `amount_minor INTEGER` instead of a float-prone local numeric column (04-offline-sync.md), and
// `notification_log`, which is local-only and never synced (local notification ids are
// device-specific). Every mirrored table also gets `sync_status` + `server_updated_at` for the
// outbox/last-write-wins sync policy.
//
// Numbered migrations, tracked via `PRAGMA user_version` — no migration framework dependency.
export const MIGRATIONS: string[] = [
  // 1: base mirror schema + outbox + sync_state
  `
  create table if not exists cards (
    id text primary key,
    user_id text not null,
    nickname text not null,
    card_type text not null check (card_type in ('credit', 'debit')),
    last4 text,
    statement_day integer,
    payment_due_day integer,
    reminder_lead_days integer not null default 3,
    created_at text not null,
    updated_at text not null,
    deleted_at text,
    sync_status text not null default 'pending_sync' check (sync_status in ('synced', 'pending_sync', 'pending_delete')),
    server_updated_at text
  );

  create table if not exists payment_methods (
    id text primary key,
    user_id text not null,
    method_type text not null check (method_type in ('card', 'cash', 'other')),
    card_id text references cards(id),
    label text,
    created_at text not null,
    sync_status text not null default 'pending_sync' check (sync_status in ('synced', 'pending_sync', 'pending_delete')),
    server_updated_at text
  );

  create table if not exists categories (
    id text primary key,
    user_id text,
    name text not null,
    parent_category_id text references categories(id),
    icon text,
    sync_status text not null default 'synced' check (sync_status in ('synced', 'pending_sync', 'pending_delete')),
    server_updated_at text
  );

  create table if not exists payments (
    id text primary key,
    user_id text not null,
    amount_minor integer not null,
    currency text not null default 'LKR',
    occurred_at text not null,
    category_id text references categories(id),
    payment_method_id text references payment_methods(id),
    card_billing_period_start text,
    card_billing_period_end text,
    photo_path text,
    notes text,
    is_recurring_guess integer not null default 0,
    created_at text not null,
    updated_at text not null,
    deleted_at text,
    sync_status text not null default 'pending_sync' check (sync_status in ('synced', 'pending_sync', 'pending_delete')),
    server_updated_at text
  );

  -- Local-only: never synced. Local notification ids are device-specific and meaningless
  -- on another device (05-notification-scheduler.md).
  create table if not exists notification_log (
    id text primary key,
    card_id text not null references cards(id),
    scheduled_for text not null,
    local_notification_id text not null,
    created_at text not null
  );

  create table if not exists outbox (
    id integer primary key autoincrement,
    entity_table text not null,
    entity_id text not null,
    op text not null check (op in ('insert', 'update', 'delete')),
    payload text not null,
    created_at integer not null,
    attempt_count integer not null default 0,
    next_attempt_at integer not null default 0,
    dead_letter integer not null default 0,
    last_error text
  );

  create index if not exists outbox_flush_idx on outbox (dead_letter, next_attempt_at, created_at);

  create table if not exists sync_state (
    entity_table text primary key,
    last_pulled_at text not null default '1970-01-01T00:00:00.000Z'
  );
  `,
];
