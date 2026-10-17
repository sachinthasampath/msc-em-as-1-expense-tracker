# Architecture

## Runtime pieces

```
Phone (Expo / React Native)
  Screens in src/app          routes only
  Hooks in src/features       one folder per product area
  Repositories                the only layer that talks to both stores
  expo-sqlite                 what the UI reads and writes
  Outbox + sync engine        copies changes to Supabase when online
        |
        |  HTTPS, user JWT (anon key, never the service-role key)
        v
Supabase project
  Auth          email + password, email OTP
  Postgres      profiles, cards, payments, categories, cache tables
  Storage       private receipts bucket, one folder per user
  Edge Function predict-expenses
        |
        |  only if OPENROUTER_API_KEY is set, and only for prose
        v
OpenRouter
```

Screens do not import `expo-sqlite` or the Supabase client. A screen calls a `use-*` hook. The hook calls a repository. The repository writes the local row and an outbox row in one SQLite transaction, then the UI reads SQLite again.

## Repository map

| Path | Role |
|---|---|
| `src/app/` | Expo Router. `(auth)` is register, activate, login. `(tabs)` is Dashboard, Cards, Add Payment, Predictions, Settings. `receipt-capture` is a full-screen modal. |
| `src/features/` | Domain hooks: auth, cards, payments, categories, dashboard budget, notifications, predictions. |
| `src/data/local/` | SQLite open, schema, outbox helpers. |
| `src/data/remote/` | Supabase client and thin table/storage wrappers. |
| `src/data/repositories/` | Local-first writes and the remote calls the sync engine uses. |
| `src/services/` | Connectivity, sync engine, notification scheduling, OS notification API. |
| `src/components/ui/` | `SpendingGauge`, `SwipeableCardItem`, `ReceiptCaptureOverlay`. |
| `supabase/migrations/0001_init.sql` | Postgres schema, RLS, profile trigger, storage policies. |
| `supabase/functions/predict-expenses/` | Forecast HTTP handler. Pure logic is in `aggregate.ts` and `schema.ts` so Jest can import it without Deno. |

`src/app/_layout.tsx` waits until auth and SQLite are ready, then shows either the auth stack or the signed-in stack via `Stack.Protected`. The same layout starts the sync engine and the reminder scheduler for the signed-in user.

## Sync

`src/services/sync-engine.ts` does two jobs while a session exists:

1. **Push.** `flush()` sends outbox rows in FIFO order so a card exists remotely before a payment that references it. A network failure stops the queue (order is preserved) and retries with backoff from 2s up to 30s. A row the server rejects is dead-lettered after five attempts. Later rows that depend on a dead-lettered row are parked.
2. **Pull.** `pull()` loads rows changed since a per-table `sync_state.last_pulled_at`. If the same row also has an unsynced local edit, the newer `updated_at` wins.

Deletes set `deleted_at`. Reads ignore rows with `deleted_at` set or `sync_status = 'pending_delete'`.

Connectivity comes from `@react-native-community/netinfo` (`src/services/connectivity.ts`). Unknown reachability is treated as online so a real request can fail visibly. `isInternetReachable === false` is treated as offline, including captive portals that still report a link.

## Money

SQLite stores `amount_minor` as an integer number of cents. Postgres stores `numeric(12,2)`. Conversion happens only in the remote API boundary, so sums on the phone are not binary floats.

## Sessions

`src/data/remote/supabase-client.ts` creates one Supabase client with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The session is stored in AsyncStorage. Token refresh is on. Session detection from the URL is off (this is a native app, not a browser callback page).

## Forecast call path

The Predictions screen calls the Edge Function with the user’s access token (`supabase.functions.invoke`). The function:

1. Identifies the user with the anon key plus that JWT, so payment reads go through row-level security.
2. Uses the service-role key only for `predictions_cache` and `ai_invocation_log`, which clients cannot insert into.
3. Returns a cached forecast when it is under 24 hours old and no payment has been updated since it was generated.
4. Otherwise aggregates payments in `aggregate.ts`, optionally asks OpenRouter for an explanation, validates that text in `schema.ts`, and stores the result.

See [How features work](features.md) for the insufficient-data rule and the daily cap.
