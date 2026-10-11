# 02 — Schema Notes

Companion to [`02-supabase-schema.sql`](./02-supabase-schema.sql). Read [`00-overview.md`](./00-overview.md) first for product context.

## How to apply this

1. Create the Supabase project (free tier).
2. Save the full SQL file as `supabase/migrations/0001_init.sql` in the repo — treat it as a real migration, not a scratch script, so the submission doc can point at it as evidence of the schema design.
3. Apply it with the Supabase CLI (`supabase link --project-ref <ref>` then `supabase db push`), or paste it into the Supabase Studio SQL editor for a first pass and then reconcile the migrations folder afterward so the repo stays the source of truth.
4. Generate TypeScript types for the client: `npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.ts`. Re-run this any time the schema changes.
5. In Supabase Dashboard → Auth → Email Templates, set the "Confirm signup" template's delivery to **OTP code**, not magic link (see [`03-auth-activation.md`](./03-auth-activation.md)).
6. In Supabase Dashboard → Edge Functions → Secrets (or `supabase secrets set`), add `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` once you reach the AI prediction step — not needed until then.

## Design rationale (for the submission doc's architecture section)

- **RLS on every user-owned table, policy pattern `(select auth.uid()) = user_id`.** This is the single authorization mechanism in the app — the mobile client always uses the anon key, never a service-role key, so a compromised client can't read other users' data even if application code has a bug. The `predict-expenses` Edge Function also reads through an **anon-key client carrying the caller's JWT**, precisely so RLS applies to it too; it uses the service-role key *only* to write `predictions_cache` and `ai_invocation_log`, which clients have no insert policy for. See [`07-ai-prediction.md`](./07-ai-prediction.md).

  **Why the `(select ...)` wrapper**: a bare `auth.uid()` in a policy is re-evaluated **once per row**; wrapping it in a subselect lets Postgres evaluate it once per query. On a payments list this is the difference between a fast screen and a visibly slow one, and it costs nothing.

- **Every FK and every RLS filter column is indexed.** RLS policies filter on `user_id` on every single read, so an unindexed `user_id` means a sequential scan per query; and an unindexed FK makes the parent's delete/cascade scan the child table. The `payments` list index is *partial* (`where deleted_at is null`) to match the only query the app actually runs, and `(user_id, updated_at)` indexes exist specifically to serve the sync engine's incremental pull.
- **`profiles` is created by a database trigger (`handle_new_user`), not client code.** This guarantees a profile row exists the instant `auth.users` gets a row, before the OTP is even verified — so the activation screen can safely **`update`** `activated_at` without a race condition against profile creation. Note it must be an `update`, **not** an upsert: there is deliberately no client insert policy on `profiles`, so an upsert's INSERT branch would be denied by RLS. (An earlier draft of this file said "upsert" — that was wrong; `03-auth-activation.md` has it right.)

- **`updated_at` is maintained by a trigger, not by client code.** `cards` and `payments` both have a `before update` trigger calling `set_updated_at()`. This is not tidiness: the offline sync engine's last-write-wins conflict resolution and its incremental pull query both read `updated_at`, and a `default now()` only fires on INSERT. Without the trigger the column would stay frozen at creation time, silently disabling conflict resolution *and* making remote edits invisible to the pull path. It also stops a client back-dating `updated_at` to win a conflict it should lose.

- **`profiles.timezone` exists for the notification scheduler.** `quiet_hours_start`/`end` are `time` without time zone, so '22:00' means nothing on its own. Deciding whether a candidate reminder falls in quiet hours, and bucketing reminders into calendar days for the per-day cap, are only correct in the user's local zone — see `05-notification-scheduler.md`.

- **Single currency is enforced, not just documented.** `payments.currency` carries `check (currency = 'LKR')`. Listing multi-currency as a scope cut in prose while leaving the column unconstrained means the invariant holds only as long as every write path remembers it. One CHECK makes it real, and dropping that CHECK is the entire migration when multi-currency is wanted.

- **`ai_invocation_log` is a cost control.** The app is free, but `predict-expenses` fronts a metered LLM API. Without a per-user daily cap, any authenticated user can loop the endpoint and bill the project owner. See `07-ai-prediction.md`.
- **Soft deletes (`deleted_at`) on `cards` and `payments`, not hard deletes.** The offline sync engine (see [`04-offline-sync.md`](./04-offline-sync.md)) needs a way to propagate a client-side delete to Supabase and to other scenarios (re-sync after a long offline period) without ambiguity about "was this row deleted or never created." A soft-delete column is simpler to reason about and explain live than tombstone tables.
- **`card_billing_period_start`/`card_billing_period_end` on `payments`, not derived at query time.** Computed once, client-side, when a card-linked payment is saved (from the card's `statement_day`). This avoids the AI prediction feature (and any future reporting) needing to re-derive billing periods from `occurred_at` + the card's current settings every time — which would silently change historical attribution if the user later edits a card's statement day. Storing it is the simpler, more explainable, and more correct choice.
- **`categories.user_id` nullable = shared defaults vs. personal categories in one table.** Avoids a second `default_categories` table and a union query everywhere categories are read; the RLS policy (`user_id is null or auth.uid() = user_id`) is a one-liner.
- **`predictions_cache` is keyed `(user_id, period_month)`, written only by the Edge Function (service role).** No client insert/update RLS policy exists for it by design — the client can only ever read its own cached forecast, never write one directly, which is part of why the deterministic forecast can't be tampered with client-side.
- **`notification_log` exists so the constraint scheduler is idempotent.** Without it, re-running the scheduler (e.g. on every app foreground, as planned) would have no way to know which local notifications already exist and need cancelling before rescheduling.
- **Every user-owned table's `user_id` column defaults to `auth.uid()`.** This means repository/API code (`cards-api.ts`, `payments-api.ts`, etc.) never needs to explicitly set `user_id` on insert — Postgres fills it in from the requester's JWT automatically. This closes off the single most common RLS footgun: forgetting to pass `user_id` on one insert call out of many, which otherwise produces a cryptic `new row violates row-level security policy` error that looks like a policy bug but is actually a missing-column bug. (`categories.user_id` is the one exception — it's nullable and has no default, because `null` there is meaningful: it marks a shared system-default category rather than a personal one.)

## How to test RLS without fooling yourself

Running an insert/select in the **Supabase Studio SQL Editor** executes as the `postgres` superuser, which **bypasses RLS entirely**. A query succeeding there proves nothing about whether the mobile app — using the `anon` key plus a real signed-in user's JWT — can do the same thing. This is the single most common way students think they've "lost" their RLS setup partway through development: the SQL Editor still shows all the data, so it looks like policies vanished, when actually they were always being skipped by that tool.

To verify RLS is actually working:
- Test through the real app (sign in as a real user, perform the action, confirm it works for your own data and fails/returns empty for anything that isn't yours).
- Or use `supabase-js` directly with a real user session's JWT (not the service-role key) in a scratch script.
- Or use the Dashboard's **Advisors → Security Advisor**, which flags tables with RLS disabled or policies that don't reference `auth.uid()`.

If something that should be blocked isn't, check first whether you're accidentally testing with the service-role key or the SQL Editor — that's a false negative, not a broken policy.

## Known simplifications (document these as deliberate scope decisions, not oversights)

- **No multi-currency support** — `payments.currency` defaults to `LKR` and is CHECK-constrained to it. Acceptable for an 8-week single-user assignment; flagged as a documented scope cut, not a bug.
- **`amount > 0` forbids refunds and credits.** A card-centric app arguably wants negative amounts eventually. Recorded here as a deliberate simplification so it's a known boundary rather than a surprise.
- **The migration is written to be idempotent** (`create ... if not exists`, `drop policy if exists` before each create, `on conflict do nothing` on the seed, a unique index on default category names). This matters because the recommended workflow below is "paste into the SQL editor for a first pass, then reconcile the migrations folder" — which runs the file twice. Without it, the eight system categories silently duplicate.
- **No multi-device conflict resolution** — the offline sync engine uses last-write-wins via `updated_at`. Since this is a single-user-per-row app with no collaboration features in scope, real conflicts are rare and this is a defensible simplification (see [`04-offline-sync.md`](./04-offline-sync.md)).
