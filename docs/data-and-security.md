# Data and security

## Who can see a row

Every user-owned table has row-level security. The mobile app sends the anon key plus the signed-in user’s JWT. Postgres applies the policies even if the client asks for another user’s id.

Policies compare `(select auth.uid())` to `user_id` (or to `profiles.id`). The subselect form is evaluated once per query.

| Table | Client access |
|---|---|
| `profiles` | Select and update own row. No client insert or delete. The signup trigger creates the row. |
| `cards`, `payment_methods`, `payments` | Select, insert, update, delete own rows. The app updates `deleted_at` instead of issuing `DELETE`. |
| `categories` | Select system rows (`user_id` is null) and own rows. Insert, update, and delete own rows only. |
| `predictions_cache`, `ai_invocation_log` | Select own rows. No client insert or update. The Edge Function writes them with the service role. |
| Storage `receipts` | Private. Object name must start with the user’s id. |

`set_updated_at` runs before every update on the synced tables and sets `updated_at` to `now()`. Clients cannot back-date that column to win a sync conflict.

## Secrets

| Name | Where it lives | Must not |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | App `.env` or EAS env | — |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | App `.env` or EAS env | Be confused with the service-role key. The anon key is public by design; RLS is the access control. |
| `SUPABASE_SERVICE_ROLE_KEY` | Injected into the Edge Function by Supabase | Appear in the app, in git, or in a client request. |
| `OPENROUTER_API_KEY` | `supabase secrets` | Appear in `.env` with an `EXPO_PUBLIC_` prefix. |

`.env` is local. Do not commit it. If a key was committed, rotate it in the provider dashboard; deleting the file later does not remove it from git history.

## Data the model is allowed to see

The Edge Function sends aggregated totals and category names, not payment notes, receipt images, or card digits. The model response is parsed and rejected if it does not match `schema.ts`. Results are cached so a repeat visit inside 24 hours, with no payment edits, does not call the model again. Fresh generations are capped at 10 per user per day.

## Local data on the phone

SQLite holds a copy of the signed-in user’s mirrored tables plus the outbox. It is not encrypted by this app beyond the operating system’s file protections. Signing out does not by itself wipe that file; treat a shared device accordingly.

## Soft delete and retention

A deleted card or payment remains in Postgres with `deleted_at` set so other devices can learn about the delete. There is no separate retention job in this repository.
