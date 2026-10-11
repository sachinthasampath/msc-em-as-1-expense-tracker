# 00 — Overview

**Read this file first.** It is the entry point for everyone else in `.agents/tasks/` — read it, then open whichever numbered doc matches the area you're implementing. Each doc is self-contained: it restates the relevant parts of this context so you don't need to read the others to start working, but if something here conflicts with a later doc, the later (more specific) doc wins for its own area.

## What this project is

A mobile expense tracker, built for SE5070 Enterprise Mobility (SLIIT M.Sc. IT), assignment area **Artificial Intelligence** (index number MS24034104 → digit sum mod 5 = 3). Stack: **Expo (SDK 57, React 19.2.3, RN 0.86.3, New Architecture on by default) + Supabase (Postgres, Auth, Edge Functions, Storage) + OpenRouter** for AI-generated insights. Currency is **LKR** throughout.

Product scope:
- Register with email + password, activate the account by entering a 6-digit code emailed by Supabase Auth.
- Add credit/debit cards.
- Log payments (expenses), optionally attaching a receipt photo via camera or gallery.
- Each payment links to a card, cash, or another payment method.
- Credit cards get a reminder notification ahead of the statement/payment-due date; lead time is configurable per card.
- An AI-powered screen forecasts next month's total spend, with category breakdown, trend, and an LLM-generated explanation — numbers are computed deterministically in TypeScript, the LLM only explains them.
- No paid tier. Everything in the app is free.

## Why the architecture looks the way it does (assignment requirements → design decisions)

The assignment (`Assignment - Enterprise Mobility 2026.pdf`) grades, among other things:
- **Offline capability with sync-back once online** → see [`04-offline-sync.md`](./04-offline-sync.md).
- **"Constraint design algorithms and principles"** as part of the 50%-weighted implementation criterion → see [`05-notification-scheduler.md`](./05-notification-scheduler.md), a genuine constraint-satisfaction problem (not just general offline UX).
- **Native hardware integration** (camera/GPS/gyro) → camera, via the receipt-capture custom component in [`06-custom-components.md`](./06-custom-components.md).
- **At least one hand-built custom component** (not from a library) → three are built: a radial spending gauge, a swipeable card-list item, and the receipt capture/crop overlay. See [`06-custom-components.md`](./06-custom-components.md).
- **A submission document** covering digit-sum calc, architecture/data-flow, source organization rationale, offline technique, constraint-algorithm outline, native-hardware outline, UI/UX screenshots, custom-component prop/event docs, and a **"Decision Records & Failure Logs"** section (AI prompts used + failures hit during implementation, tracked *during* the build). See [`decision-log.md`](./decision-log.md) — append to it continuously, in the same commit as the code it documents.
- **Live viva with live-coding defense** → architecture is deliberately simple (no Redux/Zustand/React Query, no exotic constraint-solver library) so it can be explained and extended live.

## Locked-in decisions (do not revisit without a documented reason in `decision-log.md`)

1. **Offline storage:** `expo-sqlite` as the local source of truth + a hand-built `outbox` sync-queue table. Connectivity detection is **`@react-native-community/netinfo`** behind a `useIsOnline()` hook in `src/services/connectivity.ts`.

   This reverses an earlier decision to use `react-native-offline` (logged in [`decision-log.md`](./decision-log.md)). Two reasons: its README only confirms compatibility to Expo SDK 41/RN 0.60+, not New Architecture/RN 0.86; and — the deciding factor — **`netinfo` is bundled in Expo Go, `react-native-offline` is not**. Since `expo-sqlite` and `expo-camera` also run in Expo Go on SDK 57 (see the API table below), choosing netinfo keeps the *entire* app runnable in Expo Go, so no dev build is needed until release. Only the half of `react-native-offline` we ever wanted (connectivity detection) is replaced; its action-queue half is Redux-coupled and was never in scope, because our own `outbox` table does that job.

   `react-native-offline` remains available as an **optional** spike if you want the comparison as extra viva material — see [`04-offline-sync.md`](./04-offline-sync.md). It is no longer on the critical path.
2. **Constraint-design feature:** a constraint-satisfaction notification scheduler — card due dates + per-card lead time + quiet hours + max-notifications-per-day — implemented as an isolated pure-function module, unit-testable standalone.
3. **Custom components**, all hand-built, no UI library for core rendering:
   - `SpendingGauge` — radial gauge, `react-native-svg`.
   - `SwipeableCardItem` — swipe-to-reveal actions, built directly on `react-native-gesture-handler`'s `Gesture.Pan()` + `react-native-reanimated` (not gesture-handler's bundled `Swipeable`).
   - `ReceiptCaptureOverlay` — camera + crop, built on `expo-camera`'s `CameraView` + hand-drawn crop handles + `expo-image-manipulator`.
4. **No Redux, no Zustand, no React Query.** `expo-sqlite` is the single source of truth for the UI; Supabase is the eventual-consistency target. State is plain React hooks per feature.
5. **AI prediction** follows the spec the student already wrote (via ChatGPT) — Supabase Edge Function `predict-expenses`, deterministic TS forecasting math, OpenRouter only for explanation/insights text, structured+validated JSON output, server derives user identity from the verified JWT and never trusts a client-supplied user id.

## Confirmed Expo SDK 57 APIs (don't trust older training data — these are the current ones)

| Capability | Current package / API | Notes |
|---|---|---|
| Camera | `expo-camera` → `CameraView`, `useCameraPermissions` | Function-component/hooks API only; the old `Camera` class component is gone. Needs a config-plugin entry in `app.json` with permission strings. |
| Vector/SVG drawing | `react-native-svg` | No first-party Expo replacement; use `^15.x`, verified compatible with RN 0.86/New Architecture. |
| Local notifications | `expo-notifications` → `scheduleNotificationAsync`, `setNotificationChannelAsync` | This project only needs **local** scheduled notifications (no push token flow needed). Android requires an explicit notification channel created once at startup. |
| SQLite | `expo-sqlite` → async `openDatabaseAsync` / `execAsync` / `runAsync` / `getAllAsync` | The legacy callback `openDatabase`/`tx.executeSql` API is gone — don't write code against it. |
| Image crop | `expo-image-manipulator` → `useImageManipulator(uri)` hook (contextual API) | **Corrected after checking the SDK 57 docs.** The legacy free function `manipulateAsync(uri, actions[], options)` still exists but is **officially deprecated** ("It has been replaced by the new, contextual and object-oriented API"). An earlier draft of this doc claimed it was "still fully supported" — that was wrong, and is exactly the stale-training-data trap this table exists to prevent. Use the hook: it survives the next SDK bump, which matters because this app is also meant as a long-lived personal MVP. Note the result is an `ImageRef` — call `saveAsync()` to get `{ uri, width, height }`. |
| Gestures | `react-native-gesture-handler` `~2.32` → `Gesture.Pan()` etc. | `GestureHandlerRootView` **must** wrap the app root (`src/app/_layout.tsx`) or gestures silently do nothing on Android. The old `PanGestureHandler` component API is legacy — use the `Gesture.*` builder API. |
| Animation / worklets | `react-native-reanimated` **4.5.1** + `react-native-worklets` **0.10.1** | Reanimated v4 requires the New Architecture (fine here) and **split worklets into a separate package**. Two consequences that break code written from v2/v3 memory: the Babel plugin is `react-native-worklets/plugin`, **not** `react-native-reanimated/plugin`; and `runOnJS` is imported from `react-native-worklets`, not from reanimated. There is currently no `babel.config.js` in the repo — one is needed before `SwipeableCardItem` is built. |
| Gallery picker (secondary path) | `expo-image-picker` | Used only as an alternate entry into the same crop UI; camera is the graded native-hardware feature. |
| Env vars / Supabase keys | `.env` with `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, read via `process.env.EXPO_PUBLIC_*` | The anon/publishable key is **not a secret** — RLS enforces access. Only `OPENROUTER_API_KEY` (and `OPENROUTER_MODEL`) must stay server-side as Supabase Edge Function secrets, never in the client bundle. **These exact names are load-bearing** — see the task below. |

## ⚠️ Do these before writing any feature code

These are audit findings against the repo as it stands, not future work. Build-order step 1 assumes them.

**1. `.env` is committed to git and contains a live OpenRouter key.** `.gitignore` only matches `.env*.local`, which does not match `.env`, and `git ls-files` lists it. Remediation, in order:
   - **Rotate the OpenRouter key** at openrouter.ai — it is in version control and must be treated as burned. Nothing else matters until this is done.
   - `git rm --cached .env`, add `.env` to `.gitignore` (keep a negated `!.env.example`), and rewrite the single initial commit so the key was never in history.
   - Add a committed `.env.example` with placeholders.
   - Move `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` out of `.env` entirely — they belong in `supabase secrets set`. They are server-only and have no business in the mobile app's env file even unprefixed.

**2. Env var names don't match the documented code.** `.env` currently defines `EXPO_PUBLIC_SUPABASE_KEY` and `OPEN_ROUTE_KEY`; every doc (and the client snippet in [`03-auth-activation.md`](./03-auth-activation.md)) reads `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `OPENROUTER_API_KEY`. As it stands `createClient` receives `undefined` and throws at startup. Rename in `.env` to match the docs.

**3. Missing packages.** None of these are installed yet, and step 1 can't start without the first two: `expo-sqlite`, `@react-native-community/netinfo`, `@react-native-async-storage/async-storage` (the Supabase session adapter — without it `persistSession` silently degrades to memory and sessions die on restart), `react-native-svg`, `expo-camera`, `expo-image-manipulator`, `expo-image-picker`, `expo-notifications`, `expo-crypto`; dev: `jest-expo`, `jest`, `@types/jest`, `eslint`, `eslint-config-expo`. Install with `npx expo install`, never a hand-written caret range.

**4. Missing config.** No `babel.config.js` (needed for `react-native-worklets/plugin`). No ESLint config at all, so `npx expo lint` has never actually run despite being a stated gate below. `app.json` has no `android.package`/`ios.bundleIdentifier` (required for any dev or EAS build) and no config-plugin blocks for `expo-camera`/`expo-image-picker`/`expo-notifications` with their permission strings.

**5. Decide on two scaffold defaults.** `app.json` sets `experiments.reactCompiler: true`, which no planning doc mentions and which interacts with hand-written Reanimated worklets — either keep it and log it as a deliberate decision, or turn it off until the custom components work. And `web.output: "static"` targets web, but `expo-sqlite`'s web support is alpha and needs wasm + COOP/COEP headers, so the offline-first core cannot work there — drop the web target and the scaffold's `.web.tsx` files rather than carrying a knowingly broken platform.

Before writing any Expo/EAS/RN code not covered above, follow `AGENTS.md`'s instruction: check the versioned docs at `https://docs.expo.dev/versions/v57.0.0/` rather than relying on memory.

## Build order (dependency-ordered — not a calendar; break this into your own sprints/tasks as needed)

1. **Foundation:** clear the five "do these first" items above (rotate the key, fix `.env`, install packages, add babel/eslint/app.json config, settle reactCompiler + web) → Supabase project created, all migrations from `02-supabase-schema.sql` applied, RLS verified *through a real signed-in session*, TS types generated → full auth/activation flow working end-to-end → empty local SQLite schema scaffolded (no sync yet).
2. **Offline core:** outbox table + sync engine built and tested (toggle airplane mode, confirm drain-on-reconnect) → Cards CRUD as the first fully offline-capable vertical slice.
3. **Payments core:** Payments CRUD, seeded default categories, payment-method linking (card/cash/other), a basic dashboard.
4. **Custom components batch 1:** `SwipeableCardItem` wired into the cards list; `SpendingGauge` wired to real (non-AI) actual-vs-budget numbers first, before the AI feature exists.
5. **Camera + receipts:** `ReceiptCaptureOverlay`, Supabase Storage bucket `receipts` wiring, on-device test (camera needs a physical device/dev build, not a simulator or Expo Go).
6. **Constraint scheduler + notifications:** `notification-scheduler.ts` pure module + unit tests, `expo-notifications` wiring, a Settings screen for quiet hours / per-card lead time / daily cap.
7. **AI prediction:** Edge Function `predict-expenses` (aggregate + OpenRouter + validation), deployed via `supabase functions deploy`; mobile prediction screen with all UI states; Jest suite with OpenRouter mocked.
8. **Polish:** `npx expo lint` + `npx tsc --noEmit` clean, UI/UX screenshots captured, `decision-log.md` curated into the final submission doc, dry-run of the live-coding defense on 2–3 key files (`notification-scheduler.ts`, `sync-engine.ts`, `predict-expenses/index.ts`).

## Verification expectations (apply throughout, not just at the end)

- `npx expo lint` and `npx tsc --noEmit` pass after every vertical slice. Add a `"typecheck": "tsc --noEmit"` script to `package.json` (none exists yet). Note `tsc --noEmit` currently fails with 2 errors from the starter's CSS imports — dropping the web target clears them. Once `supabase/functions/` exists, add it to tsconfig's `exclude` or `tsc` will try to typecheck Deno code.
- Add `jest-expo` + a `"test"` script. Aggregation/scheduler/edge-function tests run headless, with OpenRouter calls mocked — no live API key required for the standard suite. **Caveat:** `jest-expo` cannot execute Deno modules that touch `Deno.env`, so the pure logic in `aggregate.ts`/`schema.ts` must be runtime-neutral with env injected — see [`07-ai-prediction.md`](./07-ai-prediction.md).
- Each vertical slice gets a manual on-device smoke test where relevant. **Corrected:** on SDK 57 both `expo-sqlite` and `expo-camera` are included in **Expo Go**, and with netinfo as the connectivity library (decision 1 above) the whole app runs there — an earlier draft of this doc wrongly claimed camera/notifications/SQLite all required a dev build. Local notifications also work in Expo Go. A dev build (`npx expo run:ios|android` or EAS) is only needed for a release build or if you take the optional `react-native-offline` spike. Camera still needs a **physical device** — Expo Go on a simulator has no camera.
- End-to-end offline check: toggle airplane mode mid-session, create/edit records, restore connectivity, confirm the `outbox` table drains and the Supabase rows match.

## Document index

| Doc | Covers |
|---|---|
| [`01-source-structure.md`](./01-source-structure.md) | `src/`/`supabase/` folder layout and naming conventions |
| [`02-supabase-schema.sql`](./02-supabase-schema.sql) + [`02-schema-notes.md`](./02-schema-notes.md) | Full DDL, RLS policies, Storage bucket policy, seed data |
| [`03-auth-activation.md`](./03-auth-activation.md) | Supabase Auth OTP signup/activation flow, screen-by-screen |
| [`04-offline-sync.md`](./04-offline-sync.md) | SQLite mirror schema, outbox design, sync algorithm, `react-native-offline` spike/fallback checklist |
| [`05-notification-scheduler.md`](./05-notification-scheduler.md) | The constraint-satisfaction scheduler: types, pseudocode, invocation points, `expo-notifications` wiring |
| [`06-custom-components.md`](./06-custom-components.md) | Prop/event API for all three custom components |
| [`07-ai-prediction.md`](./07-ai-prediction.md) | Edge function design, aggregation logic, OpenRouter call/validation, mobile UI states, tests |
| [`decision-log.md`](./decision-log.md) | Append-only AI-assisted Decision Records & Failure Log — start using it from step 1 |
