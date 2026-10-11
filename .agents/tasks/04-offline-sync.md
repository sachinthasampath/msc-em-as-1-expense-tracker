# 04 — Offline-First Sync

See [`00-overview.md`](./00-overview.md) for context and [`01-source-structure.md`](./01-source-structure.md) for where these files live. This is the assignment's graded "offline capability + sync-back" requirement — treat the whole of this doc as in-scope for that grading criterion, and write the submission doc's offline section from this.

## Why a local database, not just a client-state store

This came up during planning and is worth stating explicitly, since it's an easy thing to get asked about live: `expo-sqlite` and a state library like Zustand/Redux solve different problems, and this architecture only needs one of them.

- A client-state store (Zustand, Redux, etc.) holds **in-memory UI state** — it lives only while the app process is running and evaporates on restart (unless you bolt on a persistence middleware, at which point it's usually reinventing a worse version of a real local database).
- `expo-sqlite` is a **real, persistent, on-device database** — actual files on the phone's storage that survive app restarts, with no network required to read or write.

This app has two databases, not one, because it has two different jobs to do:
- **Supabase/Postgres** is the **remote** database: the durable, shared, server-side source of truth, reachable only over the network.
- **SQLite** is the **local** database: a mirror of that same user's data, stored on the device, readable/writable with zero connectivity.

Because the assignment requires the app to work fully offline, the UI cannot talk to Supabase directly — that would make every screen depend on network access. Instead:

```
UI → SQLite (immediate read/write, always available, no network needed)
         ↕ (background sync, only when online — see Sync engine, below)
     Supabase (durable remote copy, shared source of truth)
```

Every mutation writes to SQLite first (instant, always works) and the UI reads straight from SQLite (instant, always works); a background sync engine drains the `outbox` queue into Supabase whenever connectivity allows. There is no separate in-memory store layered on top of this — it would either duplicate state already in SQLite (inviting cache-invalidation bugs) or just be a redundant pass-through, which is why this project has no Zustand/Redux/React Query (see `00-overview.md`'s locked-in decisions).

**Is this common in real production apps?** Yes — this is the standard "offline-first" mobile architecture, used widely in production (e.g. messaging apps, note-taking apps, field-service/logistics apps that must work with no signal). The general pattern — local database as the single source of truth for the UI, with a background sync/outbox mechanism reconciling against a remote backend — appears under names like "offline-first," "local-first," or specific implementations of it (e.g. WatermelonDB, Realm's sync, PouchDB/CouchDB replication, SQLDelight + a custom sync layer). This project's hand-rolled `outbox` table is a simplified, from-scratch version of the same idea those libraries automate — a deliberate choice here so the mechanism stays small enough to explain and extend live in the viva, rather than being hidden inside a third-party sync library's internals.

## Connectivity detection: `@react-native-community/netinfo`

**This decision was reversed during planning.** The original plan was to reuse `react-native-offline` (https://github.com/rgommezz/react-native-offline) from a prior lab, gated behind a compatibility spike. It is now `@react-native-community/netinfo` by default, and the spike is optional. The reasoning is worth keeping, because it's a good Decision Record:

- `react-native-offline` has two feature areas. **Connectivity detection** (`NetworkProvider`, `useIsConnected()`) is standalone. Its **action-queue that auto-replays on reconnect** is a Redux middleware/reducer/saga feature — and this project deliberately has no Redux (see `00-overview.md`), so that half was never usable. Our own `outbox` table (below) does that job. So only ever half the library was wanted.
- That remaining half is a thin wrapper over NetInfo, which is what `@react-native-community/netinfo` *is*. The wrapper adds a provider and a hook; we need one hook.
- `react-native-offline`'s README only confirms compatibility through Expo SDK 41 / RN 0.60+. This project is SDK 57 / RN 0.86 with the New Architecture on by default — three years and a whole architecture beyond what's attested.
- **The deciding factor:** `netinfo` is bundled in Expo Go; `react-native-offline` is not. Since `expo-sqlite` and `expo-camera` also run in Expo Go on SDK 57, picking netinfo keeps the *entire* app runnable in Expo Go with no dev build until release. Picking `react-native-offline` would have forced `expo prebuild` on day one, for a wrapper around the library we'd end up using anyway.

Taking the dependency with fewer layers between our code and the platform, where the extra layers were all things we'd disabled, is the kind of tradeoff worth stating plainly in the submission doc.

`src/services/connectivity.ts`:
```ts
import { useNetInfo } from '@react-native-community/netinfo';

export function useIsOnline(): boolean {
  const state = useNetInfo();
  // `isInternetReachable` distinguishes "attached to a wifi AP" from "actually has
  // internet" — a captive portal reports isConnected: true and would otherwise send the
  // sync engine into a retry loop against a login page. It is null while unknown, so
  // treat null as online and let the request itself fail rather than blocking writes.
  return state.isConnected === true && state.isInternetReachable !== false;
}
```
Everything else in this doc imports `useIsOnline` from this one file and doesn't care what's behind it. `useNetInfo` needs no provider, so nothing wraps the app root.

**Optional spike.** If you want `react-native-offline` as extra Decision Record material, try it — build a dev client (`npx expo prebuild` then `npx expo run:android`), wrap a test screen in `NetworkProvider`, toggle airplane mode, and log whatever happens on New Architecture in [`decision-log.md`](./decision-log.md). Either outcome is a legitimate entry. But it is **no longer on the critical path**, and swapping back would touch only this one file.

## Local storage: `expo-sqlite`

`expo-sqlite`'s current (SDK 57) API is async: `openDatabaseAsync`, `execAsync`, `runAsync`, `getAllAsync` — do not write against the legacy callback/`tx.executeSql` API from older tutorials.

`src/data/local/db.ts` opens one database (`expense-tracker.db`) and runs a simple migration runner (an array of numbered SQL migration strings, a `schema_version` pragma or table tracking which have run — mirror the simplicity of the Supabase migrations approach, don't add a migration framework dependency for this).

`src/data/local/schema.sql.ts` mirrors the Supabase tables that matter for offline use (`cards`, `payment_methods`, `categories`, `payments`) — same column names as the Supabase schema (see [`02-supabase-schema.sql`](./02-supabase-schema.sql)) so repository code doesn't need a mapping layer, with two deliberate exceptions: `amount` becomes `amount_minor INTEGER` (see below), and `notification_log` is mirrored as a **local-only** table that is never synced (see [`05-notification-scheduler.md`](./05-notification-scheduler.md) — local notification ids are device-specific and meaningless on another device).

Use `PRAGMA user_version` to track which migrations have run — it's the pattern the SDK 57 `expo-sqlite` docs themselves demonstrate, and it needs no extra table or dependency.

Every mirrored table also gets two extra columns:

```sql
sync_status text not null default 'pending_sync' check (sync_status in ('synced', 'pending_sync', 'pending_delete')),
server_updated_at text  -- ISO timestamp last seen from Supabase, used for last-write-wins conflict resolution
```

Primary keys are **client-generated UUIDs** (`expo-crypto`'s `randomUUID()` or a small UUID v4 helper) — the same id is used locally and remotely, so there's no id-remapping step after a row syncs.

## The outbox table

```sql
create table outbox (
  id integer primary key autoincrement,
  entity_table text not null,        -- 'cards' | 'payment_methods' | 'payments'
  entity_id text not null,           -- the client-generated UUID
  op text not null check (op in ('insert', 'update', 'delete')),
  payload text not null,             -- JSON snapshot of the row at enqueue time
  created_at integer not null,       -- epoch ms — defines flush order
  attempt_count integer not null default 0,
  next_attempt_at integer not null default 0,   -- epoch ms; flush skips rows until now >= this
  dead_letter integer not null default 0,       -- 0/1; set after MAX_ATTEMPTS failures
  last_error text
);

create index outbox_flush_idx on outbox (dead_letter, next_attempt_at, created_at);
```

Two of these columns were missing from the first draft of this doc, which then referred to them anyway — worth knowing why each is load-bearing:

- **`next_attempt_at`** is where the exponential backoff actually lives. With only `attempt_count` there is nowhere to persist *when* a row becomes eligible again, so the 60-second interval trigger would retry a failing row on every single tick and the documented 2s → 4s → 8s → 30s backoff would be prose with no implementation.
- **`dead_letter`** was referenced by the flush algorithm as "add this column to `outbox`" while the canonical DDL above didn't have it — anyone copying the DDL got `no such column: dead_letter` at runtime.

`src/data/local/outbox.ts` exposes `enqueue(table, id, op, payload)`, `listPending(now)` (filters `dead_letter = 0 and next_attempt_at <= now`, orders by `created_at`), `markSynced(id)`, `recordFailure(id, error)` (bumps `attempt_count`, sets `next_attempt_at`, flips `dead_letter` at the cap), and `listDeadLettered()` for the Settings banner.

## Repository write path (e.g. `payments-repository.ts`)

```
create(payment):
  await db.withTransactionAsync(async () => {
    1. write the row into local SQLite `payments` (sync_status = 'pending_sync')
    2. outbox.enqueue('payments', payment.id, 'insert', JSON.stringify(payment))
  })
  3. return immediately — UI updates from SQLite, no network wait
```

**The transaction is not optional.** Steps 1 and 2 must commit together or not at all. If the app is killed between them you get either a row that will never sync (invisible data loss — the user sees it locally forever and it never reaches Supabase) or an outbox entry pointing at a row that doesn't exist. `expo-sqlite` provides `withTransactionAsync` for exactly this; use it in every repository write.

Same pattern for `update`/`delete` (delete sets `sync_status = 'pending_delete'` locally and is filtered out of reads, rather than actually removing the SQLite row, until the outbox confirms the remote delete succeeded).

**The `'delete'` op means a soft delete.** This needs saying explicitly, because the obvious reading of `op = 'delete'` is "issue a DELETE", and a naive implementation will do exactly that — permanently defeating the soft-delete design that [`02-schema-notes.md`](./02-schema-notes.md) justifies at length. When the sync engine drains a `'delete'` row it must issue:

```ts
await supabase.from('payments').update({ deleted_at: new Date().toISOString() }).eq('id', id);
```

The schema still grants a real `for delete` RLS policy as an escape hatch, but **the sync engine must never use it**. Correspondingly, *every* read path — local SQLite and remote — filters `deleted_at is null` (locally: `sync_status != 'pending_delete'`). The Supabase index on `payments` is partial on `where deleted_at is null` to match.

**Money is stored as integer minor units locally.** Postgres has `numeric(12,2)`; SQLite has no exact decimal type, and a column declared `numeric` gets NUMERIC affinity, which stores a non-integral value as an 8-byte IEEE float. That reintroduces binary-float rounding on the *local source of truth* — the one place this app cannot afford it, since the UI reads from SQLite and sums those values. Store `amount_minor INTEGER` (cents) locally and convert at the API boundary when talking to Supabase. This is the one place the "same column names as Supabase, no mapping layer" rule is deliberately broken; the cost of one explicit conversion is much lower than the cost of drifting totals.

## Sync engine (`src/services/sync-engine.ts`)

**Triggers** (any of these calls `flush()`):
- `useIsOnline()` transitioning `false → true`.
- App returning to foreground (`AppState` listener) while online.
- A 60-second interval while the app is foregrounded and online (belt-and-braces, catches anything the above two miss).

**`flush()` algorithm:**
1. Guard: skip if a flush is already in progress (simple in-memory boolean lock) or currently offline.
2. `SELECT * FROM outbox ORDER BY created_at ASC` — **strict FIFO**, not parallelized. This matters: e.g. a card insert must flush before a payment referencing that card, and FIFO order guarantees that as long as writes were enqueued in causal order (which they are, since each UI action enqueues synchronously before the next can happen).
3. For each row, in order:
   - Call the matching Supabase repository method (`cards-api.ts` / `payments-api.ts`) using the row's client-generated UUID as the primary key — no id remapping needed.
   - **On success:** delete the outbox row; set the local mirrored row's `sync_status = 'synced'` and `server_updated_at` to the server's returned timestamp.
   - **On network error (request didn't reach the server, or timed out):** stop the entire flush loop immediately (don't skip ahead — preserves ordering guarantees for anything still queued behind it); it will retry on the next trigger.
   - **On a validation/4xx/5xx response (request reached the server but was rejected):** increment `attempt_count`, store `last_error`, and set `next_attempt_at = now + backoff` (2s → 4s → 8s → capped at 30s) so this row specifically is skipped until then. After **5** failed attempts, set `dead_letter = 1` instead of retrying forever, and surface a "sync issue — N items couldn't be saved" banner in Settings so the user isn't silently losing data.

**Resolving the FIFO / dead-letter contradiction.** An earlier draft said both "strict FIFO, because a card insert must flush before a payment referencing that card" *and* "continue flushing past a dead-lettered row". Those cannot both hold: if a `cards` insert dead-letters, every queued `payments` insert referencing that card will FK-fail against Supabase and dead-letter too — turning one bad row into a cascade, which is exactly what skipping ahead was supposed to prevent.

The rule, stated properly:

> Skip past a dead-lettered row **unless** a later row causally depends on it. A row depends on a dead-lettered row if its payload references that row's `entity_id` (a payment's `payment_method_id`/`card_id`, a payment method's `card_id`). Dependents of a dead-lettered row are themselves parked as `dead_letter = 1` with `last_error = 'blocked by <entity_id>'` rather than being attempted and failing noisily.

Keep the dependency check small and literal — a helper that extracts the FK fields from a payload by entity type. The point is that one unrelated bad row doesn't block the queue, while a *related* bad row doesn't generate a cascade of confusing FK errors. Retrying a dead-lettered row from the Settings banner should also un-park its dependents.

## Pulling remote changes down (`pull()`)

The push path above is only half a sync engine. Without a pull path, a user who signs in on a reinstalled app or a second device sees an **empty database** — SQLite is the UI's source of truth, and nothing ever puts existing server rows into it. This was missing from the original plan entirely.

`pull()` runs before `flush()` on each trigger:

1. Read the high-water mark: `max(server_updated_at)` per mirrored table, stored in a small `sync_state` table (`entity_table`, `last_pulled_at`).
2. For each mirrored table, request rows changed since then — including soft-deleted ones, which is how a delete made on another device propagates:
   ```ts
   await supabase.from('payments').select('*').gt('updated_at', lastPulledAt).order('updated_at');
   ```
   (The Supabase indexes on `(user_id, updated_at)` exist to serve exactly this query.)
3. For each returned row, **last-write-wins**: if the local row has `sync_status = 'synced'`, overwrite it. If the local row has unsynced local changes (`pending_sync`/`pending_delete`), compare the server's `updated_at` against the local edit time and keep the newer — the local edit is still queued in the outbox, so if it wins it will overwrite the server shortly.
4. Advance `last_pulled_at` to the newest `updated_at` received, in the same transaction as the writes.

Paginate (e.g. 500 rows per request) so a first sign-in on an account with a long history doesn't try to hold everything in memory at once. Run the initial full pull behind a visible "Setting up…" state after login — it's the one moment the app legitimately needs the network.

This is also where the Supabase-side `updated_at` **trigger** matters: step 2 is a query on `updated_at`, and without the `before update` trigger added to [`02-supabase-schema.sql`](./02-supabase-schema.sql) that column never changes after insert, so edits made elsewhere would never be pulled. The trigger isn't a nicety — the pull path doesn't work without it.

**Conflict policy:** last-write-wins via `updated_at`. This is a **deliberate, documented scope simplification**: the app has no multi-device or multi-user collaboration requirement, so real conflicting edits to the same row are rare, and a more sophisticated merge strategy (CRDTs, three-way merge) would add complexity with no corresponding grading benefit — write this reasoning into the submission doc's offline-access section verbatim, it's a legitimate architectural defense for the viva.

## Where this plugs into the UI

- `src/app/_layout.tsx` starts the sync engine's foreground/interval listeners once. `useNetInfo` needs no provider, so nothing extra wraps the tree for connectivity. (It *does* need `GestureHandlerRootView` at the root for the swipe component — see [`06-custom-components.md`](./06-custom-components.md).)
- Any screen can call `useIsOnline()` directly to show a small "offline — changes will sync" indicator; this is a UX nicety, not a requirement to build elaborate banners everywhere.
- The constraint-based notification scheduler ([`05-notification-scheduler.md`](./05-notification-scheduler.md)) must **never** be gated on `useIsOnline()` — local notification scheduling is a fully offline concern and must keep working with no network at all.

## Manual verification checklist

- Toggle airplane mode on, create/edit a card and a payment, confirm they appear immediately in the UI (reading from SQLite) and that `outbox` has matching rows (inspect via a debug screen or `expo-sqlite`'s dev tools).
- Toggle airplane mode off, confirm the outbox drains within the next trigger window and the rows now exist in Supabase (check via Supabase Studio's table editor).
- Force a validation failure (e.g. temporarily violate a check constraint) and confirm the dead-letter path kicks in after 5 attempts without blocking *unrelated* queued rows — and that rows which depend on the dead-lettered one are parked rather than failing noisily.
- **Pull path:** sign in on a second device (or clear app data and sign in again) and confirm existing cards/payments appear. This is the check that would have caught the missing pull path.
- **Soft delete:** delete a payment on device A, confirm device B's copy disappears after a pull — and confirm the Supabase row still exists with `deleted_at` set rather than having been destroyed.
- **Money precision:** enter an amount like `0.07` repeatedly, sum them locally, and confirm the local total matches Supabase exactly. This is what the integer-minor-units decision protects.
