# SE5070 Enterprise Mobility — Project Submission

**Student index number:** MS24034104
**Project area:** Artificial Intelligence
**GitHub repository:** _add link here_

---

## 1. Digit-sum calculation and project area

Index number: **MS24034104**

Digit sum: 2 + 4 + 0 + 3 + 4 + 1 + 0 + 4 = **18**

18 mod 5 = **3** → **Artificial Intelligence**

---

## 2. Project overview and features

**Expense Tracker** is a mobile expense-tracking app (Expo/React Native, SDK 57) for recording
day-to-day spending, with Supabase as the backend and an AI-powered forecast as the
Artificial Intelligence feature.

Core features:
- Email + password registration with a 6-digit email OTP activation step (Supabase Auth).
- Add and manage credit/debit cards.
- Log payments (expenses), optionally attaching a receipt photo (camera or gallery).
- Link each payment to a card, cash, or another payment method.
- Credit cards get a configurable reminder notification ahead of the statement/payment-due date,
  computed by a constraint-satisfaction scheduler (the graded "constraint design" feature).
- An AI-powered screen forecasts next month's total spend, with a category breakdown and trend —
  the numeric forecast is computed deterministically in TypeScript; an LLM (via OpenRouter) only
  explains the numbers in prose.
- Fully offline-capable: every read/write goes through a local SQLite mirror first, with a
  background sync engine draining changes to Supabase once connectivity returns.
- Free, single-currency (LKR), no paid tier.

**Why this idea in the AI domain:** rather than bolting a chatbot onto an unrelated app, the AI
feature here does the one thing an LLM is well-suited for and nothing it isn't — turning
already-correct, deterministically computed numbers into a plain-English explanation. The model
never computes, never sees raw transaction text, and never touches money; trusting an LLM with
arithmetic it can quietly get wrong would be the wrong design for a finance app. This also kept
the AI feature's engineering interesting (prompt-injection mitigation, response validation, cost
control) rather than being a thin fetch-and-display wrapper.

---

## 3. Architecture and design

### 3.1 Major decisions

| Decision | Rationale |
|---|---|
| `expo-sqlite` + a hand-built `outbox` table, instead of `react-native-offline` | `react-native-offline`'s README only attests compatibility to Expo SDK 41/RN 0.60+, while this app is SDK 57/RN 0.86 with the New Architecture on by default. Its only usable half (connectivity detection) is a thin wrapper over `@react-native-community/netinfo`, which is bundled in Expo Go — keeping the whole app runnable without a dev build until release. |
| No Redux/Zustand/React Query | `expo-sqlite` is already a real, persistent local database and the single source of truth for the UI. A client-state library on top would either duplicate that state (cache-invalidation bugs) or be a redundant pass-through. Plain React hooks per feature keep the architecture simple enough to extend live in a viva. |
| Greedy-with-forward-repair scheduler, not a constraint-solver library | Satisfies the graded "constraint design" requirement with an algorithm that is small enough to explain completely and extend on the spot, rather than hiding the mechanism inside a third-party solver. |
| Three hand-built custom components (`SpendingGauge`, `SwipeableCardItem`, `ReceiptCaptureOverlay`), not a UI/gesture library | The assignment requires components implemented by the student; all three are built directly on low-level primitives (`react-native-svg`, `react-native-gesture-handler`'s `Gesture.Pan()`, `react-native-reanimated`), not bundled "swipeable list" or "gauge" components. |
| AI prediction: deterministic math in TypeScript, LLM only for prose | Keeps the one place that touches money fully auditable and testable, while still using the LLM where it adds real value (natural-language explanation). |
| RLS on every user-owned table, single authorization mechanism | The mobile client always uses the anon key, never service-role — a compromised client cannot read another user's data even with an application bug, because Postgres enforces it at the row level regardless of what the client asks for. |

### 3.2 Data flow between layers

```
UI (src/app/**, routes only)
  → domain hooks (src/features/**)
    → repositories (src/data/repositories/**)
      → data access (src/data/local/** expo-sqlite, src/data/remote/** Supabase)
        → sync engine (src/services/sync-engine.ts + connectivity.ts)
          → Supabase (Postgres + RLS, Auth, one Edge Function, Storage)
```

Screens never call `expo-sqlite` or the Supabase client directly. A screen calls a `use-*` hook,
which calls a repository. A repository is the only kind of file allowed to import both local and
remote data access — this is what keeps "which store is authoritative" a one-file question.
Every mutation writes to SQLite first (inside a transaction with its outbox enqueue), and the UI
reads straight back from SQLite — this is what makes every write path explainable in one
sentence: *"every mutation writes to SQLite first, then gets queued for Supabase."*

### 3.3 Source organization

```
src/
  app/            Expo Router routes only — (auth)/, (tabs)/, no business logic
  components/ui/  the three hand-built custom components
  features/       one folder per domain (auth, cards, payments, categories, notifications,
                   predictions, dashboard) — each exposes use-*.ts hooks, nothing else
  data/
    local/        expo-sqlite db + migrations + outbox
    remote/       Supabase client + thin per-table API wrappers
    repositories/ the local/remote boundary — writes via SQLite+outbox transaction
  services/       connectivity, sync-engine, notification-scheduler (pure), notifications
  types/          generated Supabase types + hand-written domain DTOs
supabase/
  migrations/     0001_init.sql — the full schema as a real, idempotent migration
  functions/predict-expenses/  the one Edge Function (Deno)
```

This mirrors the data-flow diagram directly: each layer in the diagram is a real directory, not
a convention living only in comments, so a reader (or a viva examiner) can find "where does X
happen" by following the tree.

---

## 4. Offline access and techniques

Two databases, two jobs: Supabase/Postgres is the durable, shared, remote source of truth;
`expo-sqlite` is the local mirror, read/writable with zero connectivity. The UI only ever talks
to SQLite.

- **Outbox pattern.** Every create/update/delete writes its local-table row and an `outbox` row
  (entity table, id, op, JSON payload) inside a single SQLite transaction (`withTransactionAsync`)
  — so a crash between the two is impossible, not just unlikely.
- **Sync engine** (`src/services/sync-engine.ts`): `flush()` drains the outbox strictly in FIFO
  order (so a card insert flushes before a payment referencing it), stopping entirely on a
  network error to preserve ordering, and applying exponential backoff (2s→4s→8s→16s→30s) with a
  5-attempt dead-letter cap on rows the server actually rejects. A dead-lettered row's
  *dependents* (e.g. a payment whose payment method references a dead-lettered card) are parked
  rather than retried, avoiding a cascade of confusing FK failures from one bad row.
- **Pull path**: `pull()` requests rows changed since a per-table high-water mark
  (`sync_state.last_pulled_at`), applying last-write-wins by comparing `updated_at` against any
  unsynced local edit — this is what lets a reinstalled app or a second sign-in see existing data.
- **Soft deletes.** A delete never issues `DELETE`; it sets `deleted_at` locally and remotely.
  Every read path filters `deleted_at is null` / `sync_status != 'pending_delete'`.
- **Money as integer minor units locally.** SQLite has no exact decimal type; a `numeric` column
  there gets float affinity, reintroducing binary-rounding error in the one place (the local
  source of truth the UI sums from) it cannot be tolerated. Stored as `amount_minor INTEGER`
  (cents), converted to Postgres's `numeric(12,2)` only at the API boundary.
- **Connectivity detection**: `useIsOnline()` wraps `@react-native-community/netinfo`, treating
  `isInternetReachable === null` as online (lets a real request fail rather than blocking writes
  on an unknown state) and `isInternetReachable === false` as offline (catches captive portals
  that report `isConnected: true`).

Manual verification (to be completed on-device): toggle airplane mode, create a card and a
payment, confirm they appear instantly (reading from SQLite) with matching `outbox` rows;
restore connectivity and confirm the outbox drains and the rows appear in Supabase.

---

## 5. Constraint design algorithms and principles

This is a genuine constraint-satisfaction problem, implemented in
`src/services/notification-scheduler.ts` as an isolated, pure, unit-tested module.

- **Variables:** one per credit card with both `statement_day` and `payment_due_day` set.
- **Domain:** candidate notification date-times for that card, bounded to `(now, dueDate]`,
  starting from the desired slot (`dueDate − leadDays`) and searching forward.
- **Constraints:** (1) not inside the user's quiet hours; (2) no more than `maxPerDay` reminders
  across *all* cards on the same local calendar day; (3) any two reminders at least
  `minSpacingMinutes` apart; (4) `now < scheduledAt <= dueDate`; (5) each card gets exactly one
  reminder per cycle.
- **Goal:** assign every card a date-time satisfying all constraints, as close as possible to its
  desired slot.

**Algorithm:** greedy most-constrained-first assignment with forward repair — the card whose due
date is soonest (least room to move) is assigned first; repair never revisits a prior assignment,
only nudges the current candidate later (first within the day by `minSpacingMinutes`, then to the
next day if the day is full), bounded to 14 repair attempts before reporting the card infeasible
rather than searching unboundedly. This is deliberately **not backtracking** — it never undoes an
earlier decision — and is described that way throughout, since overclaiming a technique the code
doesn't contain is a real risk under live-coding questioning.

The module takes `now` and `timeZone` as explicit inputs rather than reading `Date.now()` or an
ambient zone — both quiet hours and the per-day cap are only meaningful in the user's local
calendar day, and injecting the clock is what makes the module's output reproducible and testable
(8 unit tests cover quiet-hours clamping including the overnight-wrap case, `maxPerDay: 0`,
due-date-passed, overflow-to-a-different-day, deterministic tie-breaking, and local-midnight
bucketing). Infeasible cards are surfaced on the Settings screen with the specific reason, never
silently dropped.

---

## 6. Native hardware integration

**Camera** (`expo-camera`'s `CameraView`), via the `ReceiptCaptureOverlay` custom component —
see section 8 for the full prop/event table and internal flow. Covers capture, EXIF-safe
rotation, a hand-built 4-corner crop UI, and upload to a private Supabase Storage bucket scoped
per user. A secondary gallery-picker path (`expo-image-picker`) reuses the same crop UI as a
convenience; the camera path is what satisfies the graded requirement.

---

## 7. UI/UX flow and screenshots

_Screenshots to be captured on-device and inserted here:_

- [ ] Register → email OTP activation → Dashboard
- [ ] Login
- [ ] Dashboard (SpendingGauge actual-vs-budget, recent payments)
- [ ] Cards list (SwipeableCardItem open/closed), add-card form
- [ ] Add Payment (category/method chips, receipt attach)
- [ ] Receipt capture: camera preview → crop step → confirmed
- [ ] Predictions screen: loading / insufficient-data / success / AI-degraded states
- [ ] Settings: quiet hours, daily cap, infeasible-reminder banner

Navigation is a standard Expo Router tab stack (`(tabs)/`: Dashboard, Cards, Add Payment,
Predictions, Settings) gated behind an auth stack (`(auth)/`: register, activate, login) via
`Stack.Protected`, so an unauthenticated user can never reach app screens and a signed-in user
never sees the auth screens.

---

## 8. Custom components

All three live under `src/components/ui/`, built on low-level primitives only (no pre-built
gauge/swipeable-list/camera-UI package).

### `SpendingGauge`

Radial progress gauge (`react-native-svg` `Circle` + `strokeDasharray`/`strokeDashoffset`),
showing actual spend against a target (a user-set budget on the Dashboard; the AI
`predictedTotal` on the Predictions screen).

| Prop | Type | Description |
|---|---|---|
| `actual` | `number` | Current spend amount |
| `target` | `number` | Budget or AI-predicted total to measure against |
| `formattedActual` / `formattedTarget` | `string?` | Pre-formatted display strings |
| `size` | `number?` | Diameter in px, default 160 |
| `thresholds` | `{ warning, over }?` | Ratio cutoffs driving arc color, default `{0.8, 1}` |
| `onPressDetails` | `() => void` | Fired on tap |
| `accessibilityLabel`, `testID` | `string?` | Overrides / test hook |

Guards `target === 0` with an explicit "No target set" state (a brand-new user's very first
render) rather than letting `actual / 0` reach the animation. Status is conveyed both by arc
color and a worded "+N% over" label, since color alone is invisible to a colour-blind user.

### `SwipeableCardItem`

Swipe-to-reveal list item for the cards screen, built directly on `Gesture.Pan()` +
`useSharedValue`/`useAnimatedStyle`/`withSpring` — not gesture-handler's bundled `Swipeable`.

| Prop | Type | Description |
|---|---|---|
| `card` | `Pick<Card, 'id'\|'nickname'\|'last4'\|'cardType'>` | Card data to render |
| `isOpen` | `boolean` | Controlled by the parent (only one row open at a time) |
| `onRequestOpen` / `onRequestClose` | `(id) => void` | Row wants to open/close |
| `onEdit` / `onDelete` | `(id) => void` | Revealed action pressed |
| `swipeThreshold` | `number?` | Px to snap open, default 80 |
| `disabled` | `boolean?` | Ignores gestures (e.g. mid-sync) |
| `testID` | `string?` | |

`.activeOffsetX([-10,10])`/`.failOffsetY([-10,10])` so it doesn't steal vertical list scroll.
Delete requires an `Alert.alert` confirmation — an irreversible action behind a single swipe,
with no undo, would eventually delete a card by accident. `runOnJS` is imported from
`react-native-worklets` (Reanimated v4 split it out of `react-native-reanimated`).

### `ReceiptCaptureOverlay`

Camera capture + crop overlay, on `expo-camera`'s `CameraView` plus hand-drawn, Reanimated-driven
draggable crop corner handles; the crop itself uses `expo-image-manipulator`'s current
contextual `useImageManipulator` API (`.crop().resize().renderAsync()` → `saveAsync()`), not the
deprecated `manipulateAsync` free function.

| Prop | Type | Description |
|---|---|---|
| `onCancel` | `() => void` | Backed out without capturing |
| `onCapture` | `(result: {uri, width, height, mimeType, fileSize}) => void` | Final cropped image |
| `onError` | `(error: {code, message}) => void` | permission-denied / camera-unavailable / capture-failed / crop-failed |
| `cropAspectRatio` | `number?` | Fixed ratio; default free-form |
| `maxDimension` | `number?` | Longest saved edge, default 2000 |
| `testID` | `string?` | |

Four draggable corners are modeled as four edge shared values (`left`/`top`/`right`/`bottom`),
equivalent to four points but without duplicating coordinates between adjacent corners. A fixed
`cropAspectRatio` anchors the corner diagonally opposite the one being dragged. EXIF
orientation is normalized by leaving `takePictureAsync`'s `skipProcessing` at its default
(`false`), which rotates the result to match device orientation before it's returned — the most
common bug in hand-rolled crop UIs, handled deliberately rather than by chance.

---

## 9. Decision Records & Failure Logs

Maintained continuously, in the same commit as the code each entry documents, in
[`.agents/tasks/decision-log.md`](.agents/tasks/decision-log.md) — the raw material this section
is a curated summary of. Highlights:

1. **Pre-build security audit** found a committed `.env` with a live OpenRouter key, mismatched
   env var names that would have crashed `createClient` at startup, and a design flaw where the
   AI Edge Function's planned service-role client bypassed RLS. All fixed before any feature
   code was written; the key was rotated and git history rewritten to remove it.
2. **Supabase schema bug, caught before any damage**: `alter table storage.objects enable row
   level security` failed with a permissions error on the hosted project (migration role doesn't
   own that table there) — fixed by wrapping it in an exception-tolerant `do $$ ... $$` block.
3. **A real third-party library bug**: `date-fns-tz` v3's `toZonedTime`/`fromZonedTime` turned
   out to use the host machine's own system timezone as internal scratch storage rather than
   being a pure IANA-zone converter — it "worked" during early testing purely because the dev
   machine's system timezone happened to match the test fixture's target zone (`Asia/Colombo`).
   Caught by the notification scheduler's own required unit tests, not by inspection. Replaced
   with a small self-contained `Intl.DateTimeFormat`-based implementation.
4. **A genuine logic bug** in the AI aggregation's "insufficient data" guard: it checked whether
   the *data's own* most-recent two months had activity, rather than the two actual calendar
   months before `now` — meaning data clustered entirely in old months could still pass as
   "recent" if there was nothing better in the dataset. Caught by the required
   data-clustered-in-the-oldest-months test case.
5. Two React-Compiler-era ESLint hook rules (`react-hooks/immutability`,
   `react-hooks/exhaustive-deps`) are fundamentally incompatible with Reanimated's
   intentionally-mutable `.value` API — documented and scoped-disabled per file with a comment
   explaining why, rather than silenced blanket-wide.

See the full log for every entry, including the exact AI prompts used at each build-order step.
