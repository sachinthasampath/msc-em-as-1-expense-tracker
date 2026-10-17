# Decision Records & Failure Log

Append-only. One entry per AI-assisted implementation step, and one entry for every build/test/runtime error encountered — not just the ones you fixed easily. This file is the raw material for the submission document's required "Decision Records & Failure Logs" section (see [`00-overview.md`](./00-overview.md)); that section should be a curated edit of this file, not written from scratch afterward.

**Discipline:** commit your update to this file in the **same commit** as the code change it documents. Commit timestamps are what let you credibly claim this was tracked during the build, not reconstructed after the fact for the submission.

## Entry template

```
## [YYYY-MM-DD HH:MM] <short title>
**Context:** what was being built
**Prompt used:** <exact prompt given to the AI tool, verbatim>
**Outcome:** what the AI produced / decision made
**Errors/failures encountered:** <exact error text, stack trace, or "none">
**Resolution:** how it was fixed, or "still open, deferred to <date>"
```

---

## [2026-10-11] Initial architecture planning session

**Context:** Before any code was written, used Claude Code (Sonnet 5) in plan mode to design the full app architecture against the assignment brief (`Assignment - Enterprise Mobility 2026.pdf`) and the student's own product spec, including a ChatGPT-authored spec for the AI prediction feature supplied as input.

**Prompt used:** The student described the product (free expense tracker, Supabase backend, OpenRouter AI prediction, Expo app) and pasted a detailed ChatGPT-authored feature spec for the AI prediction Edge Function, then asked for the implementation to be planned and written to `.agents/tasks/`.

**Outcome:** Produced the full architecture in `.agents/tasks/00-overview.md` through `07-ai-prediction.md`: layered architecture (UI → feature hooks → repositories → local/remote data access → sync engine → Supabase), `expo-sqlite` + hand-built outbox table for offline sync (with `react-native-offline` scoped to connectivity detection only after researching that its action-queue feature requires Redux, which this project doesn't otherwise use), a constraint-satisfaction notification scheduler as the graded "constraint design" feature, three hand-built custom components (radial gauge, swipeable card item, camera capture/crop overlay), and the AI prediction Edge Function made concrete against the actual schema.

**Errors/failures encountered:** None yet (no code written during this session) — but two decisions were explicitly flagged as uncertain/risky going into implementation and need to be revisited with a real entry once attempted:
1. `react-native-offline`'s README only confirms compatibility to Expo SDK 41 / RN 0.60+; this project is SDK 57 with the New Architecture on by default. Compatibility is unconfirmed — see the Week-1 spike in `04-offline-sync.md`.
2. No test runner (`jest-expo`) is configured in the starter project yet; needs to be added before any of the required unit tests can run.

**Resolution:** Deferred — both are the first items in the build order (`00-overview.md`). Log the actual outcome of the `react-native-offline` spike as its own entry the moment it's attempted, whichever way it goes. *(Superseded by the 2026-10-11 audit entry below — the spike was removed from the critical path.)*

---

## [2026-10-11] Plan audit before first line of code

**Context:** Before starting implementation, ran a full review of the `.agents/tasks/` plan against the actual repo state and the live Expo SDK 57 documentation, looking for inconsistencies, security issues and stale-API assumptions.

**Prompt used:** "Read `.agents/tasks/00-overview.md`. There I have planned for a project which is also my assignment. Check it for any inconsistencies, issues, misconfigurations etc. and fix if any issues found. Ultimately I should have clean, quality, proper project that I can use for my assignment work as well as my day to day work as an MVP. Update any documents we planned earlier if needed."

**Outcome:** Four decisions taken, plus a set of corrections applied across all eight planning docs.

1. **Connectivity: `react-native-offline` → `@react-native-community/netinfo`.** Only half of `react-native-offline` was ever usable (its action-queue is Redux-coupled; this project has no Redux), and that half wraps NetInfo. Deciding factor: netinfo is bundled in Expo Go and `react-native-offline` is not — and since `expo-sqlite` and `expo-camera` are *also* in Expo Go on SDK 57, netinfo keeps the entire app running without a dev build. The compatibility spike is now optional rather than the first task.
2. **Image crop: `manipulateAsync` → `useImageManipulator`.** The plan asserted `manipulateAsync` was "still fully supported in SDK 57". Checking the SDK 57 docs showed it is **deprecated**: *"It has been replaced by the new, contextual and object-oriented API."* Since this app is also meant as a long-lived personal MVP, took the current API.
3. **Dropped the web target.** `app.json` had `web.output: "static"`, but `expo-sqlite`'s web support is alpha and needs wasm + COOP/COEP headers — so the offline-first core, which is the whole architecture, cannot work there. Carrying a knowingly broken platform wasn't worth the maintenance.
4. **`.env` secret remediation.** Audit found `.env` tracked in git containing a live OpenRouter API key; `.gitignore` only matched `.env*.local`.

**Errors/failures encountered:** The audit found these before any code was written:
- **Security:** live OpenRouter key committed to git. Env var names in `.env` (`EXPO_PUBLIC_SUPABASE_KEY`, `OPEN_ROUTE_KEY`) didn't match what every doc's code reads, so `createClient` would have thrown at startup. The `predict-expenses` design used a service-role client for the *data read*, which bypasses RLS — making its "belt-and-braces" explicit filter actually the only thing separating users. Prompt-injection surface via user-created category names, which the doc claimed didn't exist.
- **Scheduler logic:** `maxPerDay: 0` silently did nothing (`undefined >= 0` is `false`), directly contradicting the doc's own unit test. Off-by-one made a valid 14th-attempt slot report infeasible. Conflicts were repaired by pushing reminders *later*, i.e. toward and past the due date. No timezone input, so quiet hours and the per-day cap were both undefined in meaning. The algorithm was described as "backtrack-on-conflict" while containing no backtracking — in a document meant to be reproduced verbatim in an assessed submission and defended by live coding.
- **Sync:** the `outbox` DDL lacked `dead_letter` and `next_attempt_at`, both of which the flush algorithm referenced. "Strict FIFO" and "continue past a dead-lettered row" were mutually contradictory. There was **no pull path at all** — a user signing in on a second device would have seen an empty app.
- **Schema:** no `updated_at` trigger, silently disabling the documented last-write-wins conflict policy; no `for update` storage policy, so re-uploading a receipt would fail; missing `on delete` actions guaranteeing FK errors on category/payment-method deletion; non-idempotent seed data, against a workflow that runs the file twice.

**Resolution:** All fixed in the planning docs in this commit. The `.env` remediation (rotate key, untrack, rewrite the initial commit, add `.env.example`) and the package/config installs are listed as blocking tasks at the top of `00-overview.md` and must be done before build-order step 1.

---

## [2026-10-11] Foundation step 1: `.env` remediation

**Context:** Build-order step 1 (Foundation) blocking task — the committed `.env` with a live OpenRouter key, and the env var name mismatch (`EXPO_PUBLIC_SUPABASE_KEY`/`OPEN_ROUTE_KEY` vs. the `EXPO_PUBLIC_SUPABASE_ANON_KEY`/`OPENROUTER_API_KEY` every doc reads).

**Prompt used:** User asked to implement the app per `.agents/tasks/`, starting with the build-order's first item (clarified with the user to be Foundation, not the optional `react-native-offline` spike the initial instruction named). Before any `.env` edit, asked the user to confirm the live OpenRouter key was rotated at openrouter.ai, and confirmed via `AskUserQuestion` whether to also rewrite git history (already pushed to `origin/feat/plan-implementation`) and strip a live GitHub PAT found embedded in the local `git remote -v` URL.

**Outcome:**
- Rewrote `.env` to the two client-safe vars only, correctly named: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- `git rm --cached .env`; `.gitignore` now ignores `.env` (with `!.env.example` negated back in).
- Added committed `.env.example` with placeholders and a comment that `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` are server-only (`supabase secrets set`), never client `.env`.
- User rotated the OpenRouter key themselves at openrouter.ai (confirmed) and chose to keep the new key locally in `.env` temporarily (untracked, not committed) until the Supabase project/Edge Function secrets exist — flagged that it must move to `supabase secrets set` before `predict-expenses` ships, never read via `EXPO_PUBLIC_*`.
- User approved rewriting the two existing commits (`99c5816`, `b0366a6`) to remove `.env` from history and force-pushing `feat/plan-implementation`, since they're the sole contributor so far. Declined stripping the embedded PAT from the `origin` remote URL for now (deferred).

**Errors/failures encountered:** `git filter-branch --index-filter 'git rm --cached --ignore-unmatch .env' --prune-empty -- --all` initially refused with "Cannot rewrite branches: You have unstaged changes" because the `.env` untrack + `.gitignore`/`.env.example` changes weren't committed yet. After the rewrite, `git log --all -- .env` still showed the old commits — `filter-branch` keeps `refs/original/*` backup refs reachable via `--all`, so the purge looked incomplete until those were cleaned up.

**Resolution:** Committed the env-fix changes first (`b68711e`), then ran `git filter-branch --index-filter 'git rm --cached --ignore-unmatch .env' --prune-empty -- --all`, deleted the `refs/original/*` backup refs, expired the reflog, and ran `git gc --prune=now --aggressive`. Verified with `git log --all -- .env` (no results) and a literal grep of the old key string across `git rev-list --all` (no matches). Force-pushed the rewritten `feat/plan-implementation` to origin (`b0366a6...64f6442`, sole contributor so far so this is safe). `main` was untouched since it only ever had the initial commit, which never carried `.env`. The embedded GitHub PAT in the `origin` remote URL was flagged to the user but left as-is at their request (deferred).

---

## [2026-10-12] Foundation step 1: missing packages, babel/eslint config, app.json fixes

**Context:** Remaining Foundation blocking items from `00-overview.md`: no `babel.config.js`, no ESLint config, `app.json` missing bundle identifiers/config-plugin permission blocks, the `reactCompiler`/web-target decisions, and none of the packages listed in the overview's item 3 installed yet.

**Prompt used:** "now next day. Lets continue implementation." (continuing the session from the previous day's `.env` remediation).

**Outcome:**
- Installed via `npx expo install`: `expo-sqlite`, `@react-native-community/netinfo`, `@react-native-async-storage/async-storage`, `react-native-svg`, `expo-camera`, `expo-image-manipulator`, `expo-image-picker`, `expo-notifications`, `expo-crypto`; dev: `jest-expo`, `jest`, `@types/jest`, `eslint`, `eslint-config-expo`.
- Added `babel.config.js` with `babel-preset-expo` + `react-native-worklets/plugin` (per the overview's SDK 57 API table: Reanimated 4 split worklets into a separate package, so the plugin path is `react-native-worklets/plugin`, not `react-native-reanimated/plugin`).
- Added `eslint.config.js` (flat config, required by ESLint 9) using `eslint-config-expo/flat`, excluding `dist` and the not-yet-created `supabase/functions`.
- Added `"typecheck": "tsc --noEmit"` and `"test": "jest"` scripts plus a `"jest": { "preset": "jest-expo" }` block to `package.json`.
- `app.json`: added `ios.bundleIdentifier`/`android.package` (`com.sachinthasampath.expensetrackeremas1`, a reasonable default from the repo name — not confirmed with the user, can be changed before any EAS build); added config-plugin blocks with permission strings for `expo-camera` and `expo-image-picker`; added `expo-notifications` plugin block; **decision:** set `experiments.reactCompiler: false` (overview flagged this as needing a decision — chose off over logging-and-keeping-on, since the custom components batch will hand-write Reanimated worklets and the interaction between React Compiler and hand-written worklets isn't something to debug mid-build); dropped the `web` key entirely per the locked decision (expo-sqlite web support is alpha/wasm-only, so the offline-first core can't work there).
- Removed the three web-only source files (`src/hooks/use-color-scheme.web.ts`, `src/components/animated-icon.web.tsx`, `src/components/app-tabs.web.tsx`) and `src/global.css` (NativeWind-style web CSS, unused once the web target is dropped).

**Errors/failures encountered:**
- `npx tsc --noEmit` initially failed: `src/constants/theme.ts(6,8): error TS2882: Cannot find module or type declarations for side-effect import of '@/global.css'.` — a leftover web-only CSS import from the starter template, broken as soon as `global.css` was removed (it was unused dead weight tied to the dropped web target regardless).

**Resolution:** Removed the `import '@/global.css'` line from `src/constants/theme.ts`. After that: `npx tsc --noEmit` clean, `npx expo lint` clean (exit 0), `npx expo-doctor` 21/21 checks passed.

---

## [2026-10-12] Foundation step 1: Supabase project link, schema apply, auth/activation flow, SQLite scaffold

**Context:** Remainder of build-order step 1: get a real Supabase project linked, apply `02-supabase-schema.sql`, verify RLS through a real session, generate TS types, build the auth/activation screens end-to-end, and scaffold the empty local SQLite schema.

**Prompt used:** Continuation of "now next day. Lets continue implementation." Several follow-up clarifications were needed mid-task (below) rather than one single prompt.

**Outcome:**
- **Project identity mismatch found and resolved.** `.env`'s `EXPO_PUBLIC_SUPABASE_URL` pointed to project `sxvjoekfllyuckpzuznb`, but the CLI's then-authenticated account only had an unrelated, generically-named, `INACTIVE` project (`sjuluekmxkvvowcpfjhs`). User confirmed `sxvjoekfllyuckpzuznb` belongs to a different Supabase login; logged the CLI into that account, after which `supabase projects list` showed it as `expense-tracker-em-as-1`, `ACTIVE_HEALTHY` — confirmed correct and linked (`supabase link --project-ref sxvjoekfllyuckpzuznb`).
- **Schema applied.** Copied `.agents/tasks/02-supabase-schema.sql` to `supabase/migrations/0001_init.sql` (per `01-source-structure.md`) and ran `supabase db push`. Verified via direct REST calls: the 8 seeded default categories exist and are correctly hidden from the unauthenticated `anon` role by RLS (`select ... to authenticated`), and the `receipts` Storage bucket exists with the correct `private`/5MB/mime-type config.
- **TS types generated** via `supabase gen types typescript --db-url postgresql://postgres:<password>@db.sxvjoekfllyuckpzuznb.supabase.co:5432/postgres > src/types/database.ts` (Management-API route was blocked — see failures below), formatted with `oxfmt`. Confirmed all 7 tables present (`profiles`, `cards`, `payment_methods`, `categories`, `payments`, `predictions_cache`, `ai_invocation_log`).
- **Auth/activation flow built** per `03-auth-activation.md`: `src/data/remote/supabase-client.ts` (typed with the generated `Database`), `src/features/auth/use-auth.ts`, `src/features/auth/activation.ts` (signUp/verifyOtp+profile-activation-update/resend/signIn/email-not-confirmed check), and the three screens under `src/app/(auth)/` (`register.tsx`, `activate.tsx`, `login.tsx`) plus an `(auth)/_layout.tsx` Stack with `login` as the initial route.
- **Root layout rebuilt** (`src/app/_layout.tsx`): removed the scaffold's component-based tab rendering (`AnimatedSplashOverlay`/`AppTabs`), replaced with `GestureHandlerRootView` (required per `AGENTS.md`'s SDK 57 table — gestures silently no-op on Android without it) wrapping a `Stack` that uses `Stack.Protected` to show `(auth)` vs `(tabs)` based on `useAuth()`'s session, gated on both auth state and SQLite init (`getDb()`) before hiding the splash screen.
- **`(tabs)` group scaffolded**: `_layout.tsx` (bottom tabs: index/cards/add-payment/predictions/settings) and five placeholder screens with a "coming in the X build step" note each — intentionally not implemented yet, since Cards/Payments CRUD are build-order steps 2–3, not step 1. `index.tsx` additionally has a working sign-out button to close the loop for manual testing.
- **Empty local SQLite schema scaffolded** (`src/data/local/db.ts` + `schema.sql.ts`) per `01-source-structure.md`/`00-overview.md` step 1 scope: mirrors the offline-capable Supabase tables (cards/payment_methods/categories/payments) with no sync/outbox columns yet — that's build-order step 2.
- Removed the remaining demo scaffold files per `01-source-structure.md`'s removal list (`src/app/index.tsx`, `explore.tsx`, `animated-icon.*`, `app-tabs.tsx`, `external-link.tsx`, `hint-row.tsx`, `web-badge.tsx`, `ui/collapsible.tsx`).
- Verified end-to-end with `npx tsc --noEmit` (clean), `npx expo lint` (clean), and `npx expo export --platform android` (bundles 1742 modules with no errors) as a build-time smoke test. Did not do a live on-device signup/activation/login run this session — user deferred manual testing to a later session.
- User did the one remaining manual Dashboard step from `03-auth-activation.md` (Confirm-signup template → OTP code, confirm email-confirmation enabled) themselves; not independently verified by inspection this session.

**Errors/failures encountered:**
1. `supabase db push` first failed outright: `unexpected login role status 403: Your account does not have the necessary privileges to access this endpoint.` The CLI's own account (bound to the unrelated `sjuluekmxkvvowcpfjhs` project) had no role on this org at all.
2. After logging into the correct account with a new personal access token, `supabase db push` got further but failed on the last statement: `ERROR: must be owner of table objects (SQLSTATE 42501)` on `alter table storage.objects enable row level security` — the migration's own comment anticipated "RLS is already enabled on `storage.objects`" on hosted Supabase but didn't anticipate the ensuing privilege error from a bare `ALTER TABLE` against a table the connecting role doesn't own there.
3. `supabase gen types typescript --project-id ...` (the Management API route) hit the same privilege wall as (1) on a different endpoint, independent of the `db push` fix — type generation needed the direct-DB-connection flag (`--db-url`) with the database password instead.
4. User twice reset `.env` back to the old wrong variable names (`EXPO_PUBLIC_SUPABASE_KEY`, `OPEN_ROUTE_KEY`) between sessions, once also re-adding the (already-rotated) OpenRouter key directly to the file — re-fixed both times; flagged again that `OPENROUTER_API_KEY` must never live in the client `.env`, only as a Supabase Edge Function secret, since it would otherwise risk reaching the client bundle depending on how it's later read.

**Resolution:**
1. Resolved by logging into the Supabase account that actually owns the `sxvjoekfllyuckpzuznb` project (confirmed via `supabase projects list` before retrying).
2. Fixed in both `supabase/migrations/0001_init.sql` and the canonical `.agents/tasks/02-supabase-schema.sql` by wrapping the `alter table storage.objects enable row level security` statement in a `do $$ ... exception when insufficient_privilege then null; end $$` block, so it still self-enables RLS against a bare local Postgres (`supabase start`) without erroring on hosted Supabase where RLS is already on and the role lacks ownership.
3. Used `supabase gen types typescript --db-url "postgresql://postgres:<password>@db.sxvjoekfllyuckpzuznb.supabase.co:5432/postgres"` instead, with the user providing the DB password directly in chat (noted to the user afterward: this leaves the password as a plain CLI argument in local shell history on their machine — low risk since it's their own machine, but worth being aware of; not rotated as part of this session).
4. Re-applied the correct `.env` contents each time; no further action needed since `.env` is gitignored and the mistakes never reached git.

---

## [2026-10-16] Build-order step 2: offline core (outbox + sync engine + Cards CRUD)

**Context:** Build-order step 2 per `00-overview.md`: outbox table + sync engine built and tested, Cards CRUD as the first fully offline-capable vertical slice. Spec is `04-offline-sync.md`.

**Prompt used:** "lets continue implementation and we need to complete the whole thing as soon as possible without wasting tokens."

**Outcome:**
- `src/services/connectivity.ts`: `useIsOnline()` wrapping `@react-native-community/netinfo`'s `useNetInfo()`, exactly per the doc (treats `isInternetReachable === null` as online).
- `src/data/local/schema.sql.ts` rewritten as a `MIGRATIONS: string[]` array (one entry so far) per the doc's `PRAGMA user_version` migration-runner pattern: mirrors `cards`/`payment_methods`/`categories`/`payments` with `sync_status`/`server_updated_at` columns, `amount_minor INTEGER` instead of a float-prone local numeric column, a local-only `notification_log` table (never synced), the `outbox` table, and a new `sync_state` table (`entity_table`, `last_pulled_at`) for the pull high-water mark.
- `src/data/local/db.ts` updated to run pending migrations by comparing `pragma user_version` against `MIGRATIONS.length`.
- `src/data/local/outbox.ts`: `enqueue`/`listPending`/`markSynced`/`recordFailure` (exponential backoff 2s→4s→8s→16s→30s, dead-letters at 5 attempts)/`parkAsBlocked`/`listDeadLettered`/`unparkDeadLettered`.
- `src/types/domain.ts`: app-level `Card`/`PaymentMethod`/`Payment` DTOs (camelCase), decoupled from the generated snake_case `Database` types.
- `src/data/remote/{cards,payment-methods,payments}-api.ts`: thin Supabase wrappers. Insert and update both use `upsert` (safe to retry, no id-remapping needed since PKs are client-generated UUIDs). `payments-api.ts` owns the one amount-unit conversion boundary (`amount_minor` ⇄ Postgres `numeric` major units).
- `src/data/repositories/{cards,payment-methods,payments}-repository.ts`: the only files importing both local and remote data access, per `01-source-structure.md`'s boundary rule — though in practice each repository only imports `local/db` + `local/outbox` directly; the remote APIs are only ever called from the sync engine, not from a repository. Every write (`create*`/`update*`/`delete*`) wraps the local SQLite write and the `outbox.enqueue(...)` call in a single `db.withTransactionAsync(...)`, matching the doc's "transaction is not optional" requirement. Deletes are soft (set `deleted_at`/`sync_status = 'pending_delete'` locally), never a real `DELETE`.
- `src/services/sync-engine.ts`: `flush()` (strict FIFO, stops entirely on a network error to preserve ordering, dead-letters after 5 attempts on a server-rejected row, and parks *dependent* rows — a payment whose `paymentMethodId` or a payment method whose `cardId` points at an already-dead-lettered row — as blocked rather than letting them fail noisily per the doc's resolved FIFO/dead-letter contradiction) and `pull()` (per-table high-water mark via `sync_state`, last-write-wins by comparing `updated_at`, with `payment_methods` pulled in full each time since it has no `updated_at` column to pull incrementally against). `useSyncEngine(userId)` hook wires the three triggers (`useIsOnline()` offline→online transition, `AppState` foreground, 60s interval) and is called once from `src/app/_layout.tsx`.
- Cards vertical slice: `src/features/cards/use-cards.ts` (list/add/remove, refreshing from SQLite after each write) and a real `src/app/(tabs)/cards.tsx` (list + inline add form; nickname, debit/credit toggle, last4, and statement/due day fields shown only for credit). Adding a card also creates a matching `payment_methods` row so it's selectable once payment logging exists (build step 3). Delete is a plain button for now — the real `SwipeableCardItem` swipe gesture is build step 4, not step 2.
- Verified: `npx tsc --noEmit` clean, `npx expo lint` clean, `npx expo export --platform android` bundles clean (1767 modules). Did not do the doc's manual airplane-mode verification checklist on a device this session (no device/emulator attached in this environment) — deferred to the user.

**Errors/failures encountered:**
1. `pull(uid)` inside a nested `function run() {}` closure in `useSyncEngine`'s `AppState`/interval effect failed `tsc` with `Argument of type 'string | null' is not assignable to parameter of type 'string'` — TypeScript doesn't narrow a closed-over `string | null` parameter through a nested function declaration even after an early-return guard in the enclosing effect.
2. `npx expo lint` flagged two React Compiler-era hook rule violations: `use-cards.ts` calling `refresh().finally(() => setLoading(false))` directly in a `useEffect` body ("Calling setState() directly within an effect"), and `sync-engine.ts` assigning `onlineRef.current = isOnline` during render instead of in an effect ("Cannot update ref during render" / "Cannot access refs during render").

**Resolution:**
1. Captured the narrowed value into a local `const uid = userId` before defining the nested `run()` function, so the closure captures the already-narrowed `string`.
2. Wrapped the `use-cards.ts` effect body in an inner `async function load() { await refresh(); setLoading(false); }` instead of chaining `.finally()` directly off the effect-body statement; moved `sync-engine.ts`'s ref assignment into its own `useEffect(() => { onlineRef.current = isOnline; }, [isOnline])`. Both lint clean afterward.

---

## [2026-10-16] Build-order step 3: payments core

**Context:** Build-order step 3: Payments CRUD, seeded default categories, payment-method linking (card/cash/other), a basic dashboard.

**Prompt used:** Continuation of the same "complete the whole thing as soon as possible without wasting tokens" session.

**Outcome:**
- **Gap found and filled:** `04-offline-sync.md` never specifies how the local `categories` mirror table gets populated — the Supabase table has RLS allowing read of system defaults + a user's own rows, but nothing in the offline doc pulls it down. Added `src/data/remote/categories-api.ts` (`pullCategories()`, full pull, no `updated_at` to pull incrementally against — same reasoning as `payment_methods`) and a `pullCategories()` step in `sync-engine.ts`'s `pull()`, run first since categories/payment_methods/cards are all referenced by payments.
- `src/data/repositories/categories-repository.ts`: read-only `listCategories(userId)` (system defaults + own).
- `payment-methods-repository.ts`: added `ensureDefaultPaymentMethods(userId)` — cash/other are plain `payment_methods` rows with no magic sentinel value, so every user needs one of each created once (checked locally, created via the normal `createPaymentMethod` write path if missing).
- `src/features/payments/billing-period.ts`: pure `computeBillingPeriod(occurredAt, statementDay)` per `02-schema-notes.md` — computed once client-side at payment-save time from the card's current `statementDay`, not derived at query time, so a later edit to a card's statement day can't retroactively change historical billing-period attribution.
- `src/features/payments/use-payments.ts`, `use-payment-methods.ts`, `src/features/categories/use-categories.ts`: feature hooks over the repositories, following the layer boundary in `01-source-structure.md`.
- Real `(tabs)/add-payment.tsx` (amount/category-chips/payment-method-chips/notes) and `(tabs)/index.tsx` (this-month total + recent payments list), replacing the step-1 placeholders.
- **`useSyncEngine`'s initial-sync gap also fixed in this step:** the online→offline→online transition guard from step 2 never fired on a fresh login while already online (no actual transition occurs) — the first payments/cards a user should see after sign-in would never get pulled until the next real connectivity flip or the 60s interval. Simplified the trigger to `if (!userId || !isOnline) return; pull(userId).then(flush);`, which fires on both "login while online" and "come online while logged in" without needing an explicit prior-state comparison.
- Verified: `npx tsc --noEmit` clean, `npx expo lint` clean, `npx expo export --platform android` bundles clean. Not manually tested on-device this session (no device/emulator attached in this environment).

**Errors/failures encountered:** None new beyond the `useSyncEngine` initial-pull design gap described above (caught by re-reading the trigger logic against the "basic dashboard" requirement, not by a runtime error).

**Resolution:** See above — fixed before it was ever run, during this same step.

---

## [2026-10-16] Build-order step 4: custom components batch 1 (SwipeableCardItem, SpendingGauge)

**Context:** `SwipeableCardItem` wired into the cards list; `SpendingGauge` wired to real (non-AI) actual-vs-budget numbers, per `06-custom-components.md`'s prop/event spec and `00-overview.md` build order step 4.

**Prompt used:** Same ASAP-continuation session.

**Outcome:**
- `src/components/ui/spending-gauge.tsx`: built exactly to the doc's prop table (`actual`/`target`/`formattedActual`/`formattedTarget`/`size`/`thresholds`/`onPressDetails`/`accessibilityLabel`/`testID`). `react-native-svg` `Circle` + `Animated.createAnimatedComponent` + `useAnimatedProps` drive the arc via `strokeDasharray`/`strokeDashoffset`; guards `target === 0` with an explicit "No target set" state instead of letting `actual / 0` reach the animation; renders a worded "+N% over" label (not just arc color) for the colour-blind-accessibility note; gates the fill animation on `AccessibilityInfo.isReduceMotionEnabled()`; sets `accessibilityRole="progressbar"`/`"button"` + `accessibilityValue`.
- `src/components/ui/swipeable-card-item.tsx`: built on `Gesture.Pan()` + Reanimated `useSharedValue`/`useAnimatedStyle`/`withSpring` directly (not gesture-handler's `Swipeable`), matching the doc's controlled `isOpen`/`onRequestOpen`/`onRequestClose` shape. `.activeOffsetX([-10, 10])`/`.failOffsetY([-10, 10])` so it doesn't steal vertical list scroll; `runOnJS` imported from `react-native-worklets` (not `react-native-reanimated` — a v2/v3 habit the doc specifically warns against); resets to resting position if `disabled` flips true mid-gesture; delete requires an `Alert.alert` confirmation per the doc's "irreversible action behind a single swipe" warning; `accessibilityActions`/`onAccessibilityAction` for edit/delete since a swipe gesture alone is unreachable by screen readers.
- **Gap found and filled (budget storage):** the Dashboard needs a "user-set budget" to feed `SpendingGauge.target`, but no budget field exists anywhere in `02-supabase-schema.sql` — it was never specified where this number lives. Decided it's a per-device display preference, not shared data worth a new synced table for one number, so added `src/features/dashboard/use-budget.ts` storing it in `AsyncStorage` keyed per user id.
- Wired both into real screens: `(tabs)/cards.tsx` now renders `SwipeableCardItem` rows (open/close state lifted to the screen, edit currently shows an "coming in a later build step" alert since card editing isn't yet built, delete calls the existing `removeCard` outbox-backed delete); `(tabs)/index.tsx` now shows the gauge against this-month's actual spend with an inline budget-entry field.
- Verified: `npx tsc --noEmit` clean, `npx expo lint` clean, `npx expo export --platform android` bundles clean (1889 modules, includes gesture-handler/reanimated/svg). Not manually tested on-device this session.

**Errors/failures encountered:** `npx expo lint` flagged the swipeable component's Reanimated `.value` mutations under two React-Compiler-era hook rules: `react-hooks/immutability` ("This value cannot be modified" — fired on every `translateX.value =`/`actionsWidth.value =` assignment, inside and outside effects) and `react-hooks/exhaustive-deps` (wanted `actionsWidth.value`/`translateX` added to effect dependency arrays, which doesn't type-check/make sense for a shared value). This is a known category of false positive: these lint rules assume React-Compiler-style immutable render data, which is fundamentally incompatible with Reanimated's intentionally-mutable `.value` API — the same tension noted when `experiments.reactCompiler` was turned off for this project in the Foundation step.

**Resolution:** Added a file-level `/* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps */` at the top of `swipeable-card-item.tsx` with a comment explaining why — Reanimated shared values are mutated by design throughout this file, and per-line disables would have meant disabling on nearly every line. `npx expo lint` clean afterward with no other files affected.

---

## [2026-10-16] Build-order step 5: camera + receipts

**Context:** `ReceiptCaptureOverlay` (camera + crop), Supabase Storage `receipts` bucket wiring, per `06-custom-components.md` section 3 and build-order step 5.

**Prompt used:** Same ASAP-continuation session.

**Outcome:**
- `src/components/ui/receipt-capture-overlay.tsx`: `CameraView` preview with a shutter button and a secondary "Gallery" (`expo-image-picker`) entry feeding the same crop step; permission state has its own screen with a "Grant permission"/"Open Settings" (`Linking.openSettings()`) split depending on `canAskAgain`, since a permanently-denied permission can't be re-requested in-app. **EXIF normalization**: left `takePictureAsync`'s `skipProcessing` at its default (`false`) rather than handling rotation manually — per the installed `expo-camera` types, the default already rotates the result to match device orientation before returning it, which is the "pass an already-rotated image" option the doc offers as an alternative to manual EXIF correction; documented this choice in a code comment since it's exactly the trap the doc warns about.
- Crop step: 4 independently draggable corner handles implemented as 4 edge shared values (`left`/`top`/`right`/`bottom`) rather than 4 point pairs — equivalent, but avoids duplicating coordinates between adjacent corners. `cropAspectRatio` anchors the diagonally-opposite corner and derives the dragged corner's position to preserve the ratio, per the doc's anchor rule. Crop rectangle is computed in original-image pixel coordinates via a uniform `scale = image.width / displayWidth` (the display container is sized to exactly match the captured image's aspect ratio, so there's no letterboxing to account for separately). Uses the current contextual `useImageManipulator` API (`.crop().resize().renderAsync()` → `ref.saveAsync()`), not the deprecated `manipulateAsync`. Added the doc's required `onRetake` affordance and a "use the whole image" accessible alternative to the handle-drag UI.
- `onCapture`'s `fileSize` is currently hardcoded to `0` — `ImageResult` from `saveAsync()` doesn't return a file size, and getting the real one would need `expo-file-system` purely for this one field. Deferred as a known gap rather than adding a new dependency for one number; noted here so it doesn't look like an oversight.
- `src/app/receipt-capture.tsx`: modal route (`presentation: 'fullScreenModal'`, added to the `(tabs)`-guarded group in `_layout.tsx` since it's only reachable once signed in) hosting the overlay. Since Expo Router can't return a value from a modal route directly, added `src/features/payments/pending-receipt.ts` — a minimal module-level variable + `setPendingReceiptUri`/`consumePendingReceiptUri` — read back via `useFocusEffect` on `add-payment.tsx`.
- `src/data/remote/receipts-api.ts`: `uploadReceipt(userId, localUri)` (path `${userId}/${uuid}.jpg`, matching the Storage RLS policies' `foldername(name)[1] = auth.uid()` check) and `getReceiptSignedUrl`. **Scope decision:** receipt uploads are online-only and not outbox-queued — `04-offline-sync.md`'s outbox schema only has `entity_table` values `'cards' | 'payment_methods' | 'payments'`, with no photo-blob entity type, so a payment captured offline with a receipt attached saves fine locally but silently skips the photo (caught and swallowed in `add-payment.tsx`'s save handler) until the user is back online — documented as a deliberate gap, not retrofitted into the outbox given it's out of this doc's stated scope.
- `app.json`/`tsconfig` already had the `expo-camera`/`expo-image-picker` permission-string plugin blocks from the Foundation step, so no new config needed.
- Verified: `npx tsc --noEmit` clean, `npx expo lint` clean, `npx expo export --platform android` bundles clean (1909 modules). **Not** manually tested on a physical device this session — `expo-camera` needs real hardware (no simulator/emulator camera), and none is attached to this environment; this is the one component of the whole build that genuinely cannot be verified without the user's own device.

**Errors/failures encountered:**
1. `router.push('/receipt-capture')` failed `tsc` initially: the typed-routes experiment (`experiments.typedRoutes: true`) generates `.expo/types/router.d.ts` from the files Expo Router has actually seen in a dev/build run, and that cache predated the new route file, so the literal `"/receipt-capture"` wasn't yet a member of the allowed route-string union type.
2. Accidentally ran `npx expo customize tsconfig.json`, worried it might overwrite the hand-customized `tsconfig.json` (paths/strict mode) with a fresh scaffold — checked immediately.

**Resolution:**
1. Started `npx expo start` briefly in the background (just long enough to regenerate `.expo/types/router.d.ts`, confirmed via `grep -c receipt-capture`), then stopped it. `tsc --noEmit` clean afterward.
2. `tsconfig.json` was confirmed unchanged (the customize command no-ops when the target file already exists) — no actual damage, just a wasted command.

---

## [2026-10-16] Build-order step 6: constraint scheduler + notifications

**Context:** `notification-scheduler.ts` pure CSP module + unit tests, `expo-notifications` wiring, a Settings screen for quiet hours / per-card lead time / daily cap, per `05-notification-scheduler.md` — the assignment's graded "constraint design algorithms and principles" feature.

**Prompt used:** Same ASAP-continuation session.

**Outcome:**
- `src/services/notification-scheduler.ts`: transcribed the doc's greedy-most-constrained-first-with-forward-repair algorithm directly (deliberately not "backtracking" — see the doc's own naming note), including all three of its documented bug fixes (`?? 0` on the `maxPerDay` guard, an explicit `placed` flag instead of an attempt-counter check, repair always moves toward/past-never the due date). Pure module: only inputs are `reminders`/`constraints`, including injected `now`/`timeZone` — no `Date.now()`, no I/O.
- `src/features/notifications/compute-due-date.ts`: `computeCurrentCycleDueDate(paymentDueDay, now, timeZone)` — the "caller's job" conversion from `payment_due_day` (1-28) to a concrete cycle due date, with the doc's rollover-to-next-month rule when the naive date has already passed.
- `src/services/notification-scheduler.test.ts`: all of the doc's required scenarios as Jest tests — quiet-hours clamp (including the overnight-wrap "lands on the next local day" case), `maxPerDay: 0` → infeasible, due-date-passed, overflow-to-a-different-day, cardId tie-break determinism, and a slot that's past local midnight but not past midnight UTC bucketing to the correct local day. All 8 pass.
- `src/services/notifications.ts`: `expo-notifications` wiring per the doc — channel-before-permission ordering, permission result actually checked, `channelId` set on the trigger (confirmed against the installed `expo-notifications` types that `channelId` lives on `DateTriggerInput`, not inside `content` as an earlier doc draft suggested — not a bug in the current doc, just double-checked against the SDK 57 types rather than trusting the snippet verbatim per `AGENTS.md`), and the full log/OS reconciliation pass (cancel OS orphans, drop stale log rows, diff by `scheduledAt` truncated to the minute, cancel+remove on a card flipping to infeasible).
- `src/features/notifications/`: `use-notification-settings.ts` (quiet hours/max-per-day/timezone as a local `AsyncStorage` preference, not round-tripped through Supabase — scheduling must work fully offline, so this can't depend on a network read even though `profiles` has these columns server-side), `recompute-reminders.ts` (orchestrates cards-repository → `computeCurrentCycleDueDate` → `scheduleReminders` → `applyReminders`, returns the infeasible list), `reminder-events.ts` (a minimal pub-sub — `notifyCardsChanged`/`onCardsChanged` and `publishInfeasibleReminders`/`onInfeasibleRemindersChanged` — so card mutations and the Settings screen can hook into the scheduler without a second copy of its side effects or a state-management library), `use-reminder-scheduler.ts` (mounted once from `_layout.tsx`; wires the two invocation points — card-change pub-sub and `AppState` foreground — never gated on `useIsOnline()`), `use-infeasible-reminders.ts` (lets Settings read the latest result without re-running the scheduler).
- `(tabs)/settings.tsx`: quiet hours start/end, max-per-day, a read-only timezone display (defaults to the device's own IANA zone via `Intl.DateTimeFormat().resolvedOptions().timeZone`), and the doc-required infeasible-reminders banner with the specific reason per card.
- `use-cards.ts`: `addCard` now calls `notifyCardsChanged()`; `removeCard` calls `cancelRemindersForCard(id)` eagerly (not just relying on the reconcile pass) before refreshing.
- `app.json`: added `android.permissions: ["SCHEDULE_EXACT_ALARM"]` (Android 12+ requirement for exact-time triggers, per the doc).
- Verified: `npx tsc --noEmit` clean, `npx expo lint` clean, `npx jest` (8/8 pass), `npx expo export --platform android` bundles clean (1978 modules).

**Errors/failures encountered:** A real, non-trivial bug, caught by the doc's own required tests rather than by inspection — exactly the kind of thing the brief asks to log:

`date-fns-tz` v3's `toZonedTime`/`fromZonedTime` do not behave as a pure IANA-zone converter. Reading its own source (`resultDate.setFullYear(...)`/`.setHours(...)` using the *host machine's local* setters, fed from UTC-getter values) revealed it uses the system's local timezone as scratch storage internally. On this development machine — whose system timezone happens to already be `Asia/Colombo` (UTC+5:30) — the quiet-hours clamp test still failed outright: `toZonedTime(new Date('2026-01-01T12:00:00Z'), 'Asia/Colombo')` returned the input completely unchanged (`wall === original instant`, no offset applied at all), and the clamp test asserted `getUTCHours() === 1` but got `7` (i.e., it treated the local 07:00 wall-clock time as if it were already 07:00 UTC — exactly the zone-unaware bug `05-notification-scheduler.md` warns the whole module exists to avoid). This is precisely the "works here, breaks on a different machine" trap `AGENTS.md` and this project's own docs call out repeatedly — a library, not hand-rolled code, was the source this time.

**Resolution:** Replaced all `date-fns-tz` usage with a small self-contained implementation built directly on `Intl.DateTimeFormat` (`wallClockParts`/`localWallClock`/`toInstant`, using a 2-iteration fixed-point conversion for the instant↔wall-clock round trip), verified correct against Node's own full-ICU `Intl` (confirmed via `Intl.DateTimeFormat(..., { timeZone: 'Asia/Colombo', timeZoneName: 'longOffset' })` independently reporting `GMT+05:30` correctly) rather than trusting the third-party library's internal convention. Uninstalled `date-fns`/`date-fns-tz` entirely since nothing else in the codebase used them. All 8 scheduler tests pass afterward, including the two that initially needed their own fix: the "overnight clamp" and "midnight-boundary" tests had `leadDays: 0`, which — once the timezone math was actually correct — made their own desired slots equal to the due date with zero slack, so quiet-hours clamping pushed them infeasibly past it. Rewrote those two fixtures to use `leadDays: 2` with the due date 2 local days later, which tests the same behavior (overnight wrap, local-midnight bucketing) with genuine room for the clamp to land before the deadline.

---

## [2026-10-16] Build-order step 7: AI prediction

**Context:** `predict-expenses` Edge Function (aggregate + OpenRouter + validation), mobile prediction screen with all UI states, Jest suite with OpenRouter mocked — per `07-ai-prediction.md`.

**Prompt used:** Same ASAP-continuation session.

**Outcome:**
- `supabase/functions/predict-expenses/aggregate.ts` (pure, runtime-neutral): `windowStart`/`forecastMonth` computed from injected `now`, never `Date.now()`; monthly bucketing attributes card-linked payments to their FIXED `card_billing_period_start`'s calendar month (not `occurred_at`) to avoid double-counting across a statement boundary, mapped onto calendar months so the series stays comparable with cash/other payments; category roll-up to top-level via `parent_category_id`; recurring detection (±10% amount match in ≥3 of the last 4 months); trend via short-vs-full moving average; `predictedTotal` via the doc's exact recency-weighted mean (`[3,2,1,1,1,1]`, newest-first, excluding the partial current month); `byCategory` scaled to sum exactly to `predictedTotal`; `insufficientData` short-circuit (<3 complete months, or no payment in the actual last 2 calendar months before `now`).
- `supabase/functions/predict-expenses/schema.ts`: `AiExplanationSchema` (zod, with both array-count AND string-length caps) and `parseAiExplanation` (defensive 3-step parse: string check → `JSON.parse` with code-fence stripping → `safeParse`, `null` on any failure). Written against a bare `import { z } from 'zod'` specifier that resolves differently per runtime: via `node_modules` under Jest, and via a new `supabase/functions/predict-expenses/deno.json` import map (`"zod": "npm:zod@3"`) under Deno — this is what makes the file genuinely runtime-neutral rather than just claiming to be.
- `supabase/functions/predict-expenses/openrouter.ts` (Deno-only, not Jest-tested directly): sends ids/numbers only in `byCategory` (never category names — user-created text is a real prompt-injection surface, per the doc's correction of an earlier draft's claim that the surface didn't exist), `response_format: json_object`, `temperature: 0`, `max_tokens: 700`, an 8s `AbortSignal.timeout`, and explicit handling of HTTP-200-with-`error`-body and `finish_reason: 'length'` (truncated JSON) as failures distinct from a thrown exception.
- `supabase/functions/predict-expenses/index.ts`: anon-key-plus-caller-JWT client for the actual query (RLS applies, not bypassed) per the doc's security correction; 401 on missing/malformed `Authorization`; service-role client reserved strictly for `predictions_cache`/`ai_invocation_log` upserts; cache-first (checked before the rate limit even matters); staleness = >24h old OR a payment updated since `generated_at`; daily cap (10/invocation_count) enforced and incremented *before* calling OpenRouter, returns 429 past it; a degraded AI result (`aiError: true`) is never cached, only the numeric forecast is, so a transient OpenRouter outage doesn't lock the AI section broken for the rest of the month.
- `tsconfig.json`: added `exclude: ["node_modules", "supabase/functions/**"]` (Deno globals would otherwise fail `tsc --noEmit` against the app's config). `eslint.config.js` already excluded it from the Foundation step.
- Mobile: `src/types/predictions.ts` (mirrors the function's `Forecast`/`PredictResponse` contract — duplicated rather than imported, since the Deno-side files live outside `src/` and aren't meant to be bundled into the app), `src/features/predictions/use-predictions.ts` (20s client-side `AbortSignal` timeout distinct from the function's own 8s OpenRouter-only timeout; 429 detected via `error.context.status` and shown as "daily limit reached" rather than a generic error; offline path reads the last successfully-fetched response from `AsyncStorage` rather than erroring, since `predictions_cache` itself has no local mirror and reading it would need the same connectivity the offline case is trying to route around), and a real `(tabs)/predictions.tsx` covering all five states from the doc (loading / insufficient-data / error-with-retry / success / success-with-ai-degraded) plus the two the doc's own state list left implicit given this hook design (rate-limited, offline-with-or-without-a-cached-result) — reusing `SpendingGauge` for actual-so-far vs. `predictedTotal`, a trend badge, the `byCategory` list, and the required persistent "This is an estimate, not a guarantee" disclaimer plus the OpenRouter data-sharing disclosure.
- `supabase/functions/predict-expenses/aggregate.test.ts` (10 tests) and `schema.test.ts` (6 tests): the doc's required scenarios — insufficient-data short-circuit (both under-3-months and all-data-stale cases), current-partial-month exclusion, billing-period attribution avoiding double-count across a statement boundary, `byCategory` summing exactly to `predictedTotal`, recurring detection both flagging and not-flagging, `recurringCategories: []` under 4 months, determinism across runs with the same injected `now`, and `parseAiExplanation`'s malformed-JSON/non-2xx-shaped/oversized-string/code-fence cases. All pass (25/25 project-wide).
- Verified: `npx tsc --noEmit` clean, `npx expo lint` clean, `npx jest` 25/25, `npx expo export --platform android` bundles clean (1979 modules — Deno-side code isn't bundled into the app, as expected).
- **Deployment deferred to the user**: handed off the exact `supabase secrets set OPENROUTER_API_KEY=... OPENROUTER_MODEL=...` and `supabase functions deploy predict-expenses` commands for them to run themselves (the key shouldn't pass through this session a third time, and `supabase/config.toml`'s default `verify_jwt = true` for Edge Functions was left untouched — the function must never be deployed with `--no-verify-jwt`, per the doc).

**Errors/failures encountered:**
1. A genuine logic bug in `aggregate.ts`'s own "insufficient data" guard, caught by its own test: `hasRecentData` was computed as `completeMonths.slice(-2)` — the two most recent months *present in the data* — rather than the two actual calendar months immediately before `now`. A fixture with 3 months of data all clustered in Nov/Dec/Jan relative to a `now` of mid-June passed as "has recent data" because Dec/Jan were the data's own most-recent two entries, even though both are 5+ months stale relative to `now`. This is exactly the "data clustered only in the oldest months" case `07-ai-prediction.md` calls out as needing `insufficientData: true`.
2. `tsc` initially flagged `state.cached.generatedAt` in `predictions.tsx` as not existing on the `PredictResponse` union's `insufficientData: true` branch — correct behavior from the discriminated union, just needed a narrowing guard.

**Resolution:**
1. Replaced the slice-based check with `recentMonthKeys` computed directly from `now` (`now`'s month minus 1, minus 2), and checked those specific calendar-month keys against `monthTotals` instead of whatever happened to be present. The misleading test (`'reports insufficientData when all data is older than the last 2 months, even with 3+ months'`) now passes for the right reason.
2. Added an `if (!state.cached.insufficientData)` guard before rendering the offline-cache timestamp.
