# 05 — Constraint-Based Notification Scheduler

See [`00-overview.md`](./00-overview.md) for context. **This is the feature that satisfies the assignment's graded "constraint design algorithms and principles" requirement** — write it, test it, and document it as a standalone, isolated module precisely so the submission doc and the live-coding defense can point at one file and explain a real constraint-satisfaction problem end to end.

## Why this is a genuine CSP (say this explicitly in the submission doc)

- **Variables:** one per **credit** card with both `statement_day` and `payment_due_day` set. Debit cards have no statement cycle and are filtered out before the solver runs.
- **Domain:** candidate notification date-times for that card, bounded to `(now, dueDate]` — starting from its naive desired slot `dueDate − leadDays` and searching *backwards* toward `now`.
- **Constraints:**
  1. A notification must not fall inside the user's quiet hours.
  2. No more than `max_notifications_per_day` notifications (across *all* cards) may land on the same calendar day **in the user's timezone**.
  3. Two notifications must be at least `minSpacingMinutes` apart.
  4. `now < scheduledAt <= dueDate` — a reminder that fires after the due date is worse than none at all.
  5. (Implicit) each card gets exactly one scheduled reminder per cycle.
- **Goal:** find an assignment of a concrete date-time to every card that satisfies all constraints, preferring times as close as possible to each card's naive desired slot.

This is solved with a **greedy most-constrained-first assignment with forward repair** — not an off-the-shelf constraint-solver library. That's a deliberate choice: it's simple enough to write from scratch, explain in 2 minutes, and extend live if asked to add a constraint during the viva, while still being a textbook CSP by the definition above.

> **Naming note — read this before you write the submission doc.** An earlier draft of this
> file called the algorithm "greedy-earliest-due-first **with backtrack-on-conflict**". The
> pseudocode below does *not* backtrack: it never revisits an assignment it has already
> made, it only repairs the current candidate forward. Claiming backtracking in an assessed
> document that is then defended by live coding is a real risk — a marker can ask you to
> point at the backtracking step, and there isn't one. Describe it honestly as greedy with
> forward repair. Greedy-with-repair is still a legitimate CSP solving strategy, and being
> precise about which one you used is worth more marks than overclaiming.
>
> If you want backtracking for its own sake, the smallest honest version is: when a card
> ends up infeasible, undo the *most recent* assignment that contributed to the blocking
> day's count, push that card later instead, and retry — bounded to a handful of undos.
> Only add this if the core is already working and tested.

## File: `src/services/notification-scheduler.ts`

**Pure functions only — no SQLite, no Supabase, no `expo-notifications` calls in this file.** That's what makes it unit-testable in isolation and demoable as "here's the algorithm" independent of "here's how it's wired up."

### Types

```ts
export type CardReminder = {
  cardId: string;
  dueDate: Date;       // the card's computed payment-due date for the current cycle
  leadDays: number;    // per-card configurable reminder lead time
};

export type SchedulerConstraints = {
  quietHoursStart: string;   // 'HH:MM', e.g. '22:00'
  quietHoursEnd: string;     // 'HH:MM', e.g. '07:00' (may wrap past midnight)
  maxPerDay: number;         // across all cards combined
  minSpacingMinutes: number; // minimum gap between any two reminders, default 30
  timeZone: string;          // IANA zone from profiles.timezone, e.g. 'Asia/Colombo'
  now: Date;                 // injected clock — never read Date.now() inside this module
};

// Discriminated union: makes the illegal states ({ scheduledAt: Date, infeasible: true }
// and { scheduledAt: null, infeasible: false }) unrepresentable rather than merely unused.
export type ScheduledReminder =
  | { cardId: string; infeasible: false; scheduledAt: Date }
  | { cardId: string; infeasible: true; reason: 'no-slot' | 'due-date-passed' };
```

**Why `timeZone` and `now` are explicit inputs.** The original types had neither, while the
doc claimed the module was deterministic and had "no wall-clock dependency." Both claims
were false without these:

- `quietHoursStart: '22:00'` is a wall-clock time with no zone attached. Deciding whether a
  given instant falls inside quiet hours, and bucketing instants into "the same calendar
  day" for the per-day cap, are **only meaningful in the user's local zone**. Doing it in
  UTC puts a 23:00 Colombo reminder on the following calendar day and silently corrupts the
  daily cap. `profiles.timezone` exists for exactly this.
- Several constraints (`scheduledAt > now`) need the current time. Reading `Date.now()`
  inside the module would make it untestable and non-deterministic. Passing `now` in keeps
  the module pure *and* lets tests pin a fixed clock.

Use a zone-aware date library for the local-time arithmetic. Naive `+24h` day arithmetic
breaks across DST; Sri Lanka has no DST today, but the bug is invisible until someone
travels, and "I used an injected IANA zone" is a better viva answer than "it works here."

### Algorithm (pseudocode — implement this directly, don't redesign it)

```
MAX_SHIFTS = 14

function scheduleReminders(reminders: CardReminder[], constraints: SchedulerConstraints): ScheduledReminder[]

  candidates = reminders.map(r => ({
    cardId:  r.cardId,
    dueDate: r.dueDate,
    desired: subtractDays(r.dueDate, r.leadDays)
  }))

  // Most-constrained-first: the card whose DUE DATE is soonest has the least room to move,
  // so it gets first pick. Tie-break on cardId so the result never depends on the order
  // SQLite happened to return rows in (see Determinism, below).
  sort candidates by (dueDate ascending, cardId ascending)

  assigned: Date[] = []                  // every slot taken so far, for the spacing check
  dayCounts: Map<string, number> = {}    // localDateKey -> count already assigned
  result: ScheduledReminder[] = []

  for candidate in candidates:

    // Constraint 4: a reminder for an already-passed due date is meaningless.
    if candidate.dueDate <= constraints.now:
      result.push({ cardId: candidate.cardId, infeasible: true, reason: 'due-date-passed' })
      continue

    slot = candidate.desired
    placed = false

    for shift in 0 .. MAX_SHIFTS:
      slot = clampOutsideQuietHours(slot, constraints)

      if slot > candidate.dueDate:      break   // searched past the deadline; give up
      if slot <= constraints.now:
        slot = addDays(slot, 1); continue       // in the past — try a day later

      day = dateKey(slot, constraints.timeZone)

      if (dayCounts.get(day) ?? 0) < constraints.maxPerDay
         and respectsSpacing(slot, assigned, constraints.minSpacingMinutes):
        placed = true
        break

      // Forward repair. Prefer nudging LATER within the same day first (cheap, keeps the
      // original lead time), and only fall back to a whole day if the day is full.
      if (dayCounts.get(day) ?? 0) >= constraints.maxPerDay:
        slot = startOfNextDay(slot, constraints.timeZone)
      else:
        slot = addMinutes(slot, constraints.minSpacingMinutes)

    if not placed:
      result.push({ cardId: candidate.cardId, infeasible: true, reason: 'no-slot' })
      continue   // explicitly flagged, never silently dropped

    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
    assigned.push(slot)
    result.push({ cardId: candidate.cardId, infeasible: false, scheduledAt: slot })

  return result
```

### Three bugs the earlier draft of this pseudocode contained

Worth knowing about, because two of them are the kind that pass a casual read and fail a test:

1. **`maxPerDay: 0` did nothing.** The guard was `dayCounts.get(day) >= constraints.maxPerDay`. `Map.get` on an unseen key returns `undefined`, and `undefined >= 0` is `false` — so with a cap of zero the loop body never ran and the card was scheduled anyway. The doc's own unit test (below) asserts the opposite. Fixed by `(dayCounts.get(day) ?? 0)`, which the *increment* line already did correctly — the two lines simply disagreed.
2. **Off-by-one false infeasibility.** The old post-loop check was `if attempts == 14`. But the `while` exits for *two* reasons: the day has room, or the counter ran out. If the 14th shift found a free day, `attempts` was still 14 and a perfectly good slot was thrown away. Fixed by tracking an explicit `placed` flag instead of inferring success from a counter.
3. **Conflicts were repaired in the wrong direction.** The old code did `addDays(slot, +1)`, pushing a "your payment is due soon" reminder *toward and past* the due date — the one direction that destroys the notification's purpose. There was also no `scheduledAt <= dueDate` constraint to stop it. The loop above breaks out as soon as it passes the due date.

**`clampOutsideQuietHours(slot, constraints)`:** if `slot`'s **local** time-of-day (in `constraints.timeZone`) falls within `[quietHoursStart, quietHoursEnd)`, move it forward to `quietHoursEnd` on the appropriate local calendar day; otherwise return `slot` unchanged. Handle the overnight-wrap case (`22:00`–`07:00` spans midnight) — note that clamping a 22:30 slot lands it at 07:00 the *next* day, which changes its `dateKey` and therefore which day's cap it counts against. Define the degenerate cases explicitly: `start == end` means **no** quiet hours (not 24 hours of them), and reject a config that would leave no legal time of day at all.

**Why `minSpacingMinutes` exists.** Without it, every card clamped out of quiet hours lands on the *exact same instant* — `quietHoursEnd`, e.g. 07:00:00 — because the per-day cap only counts notifications, it doesn't spread them. Three cards would fire simultaneously at 07:00 and the user would see one notification stack. It is also the most natural extra constraint to add live if a viva examiner asks you to extend the model.

**Determinism:** given the same inputs — including `now` and `timeZone`, which are inputs precisely so this holds — the function always produces the same output. No randomness, no ambient clock reads. That determinism is what makes it unit-testable:
- Cards whose desired slots collide on one day beyond `maxPerDay` → assert the overflow lands on a different day, still before each card's due date.
- A desired slot inside quiet hours → assert it clamps to `quietHoursEnd`.
- `maxPerDay: 0` → assert `infeasible: true` with `reason: 'no-slot'`, rather than throwing or (as the old code did) scheduling anyway.
- A due date in the past relative to the injected `now` → assert `reason: 'due-date-passed'`.
- Two cards with an identical `dueDate` → assert the output order and assignment are stable across runs (this is what the `cardId` tie-break buys; without it the result depended on SQLite row order, which no query in this project pins with an `ORDER BY`).
- A slot that would land just after midnight in the user's zone but before midnight UTC → assert it counts against the correct local day's cap.

## Invocation points

- **On card create/edit** (whenever `statement_day`, `payment_due_day`, or `reminder_lead_days` changes): recompute that user's *entire* reminder set (cheap — realistically a handful of cards), reconcile against the OS (see below), then only cancel+reschedule the entries that actually changed.

**Computing `dueDate` for the current cycle.** The types take a `dueDate: Date`, but the database stores `payment_due_day` as a day-of-month (1–28). Converting one to the other is the caller's job and needs a stated rule, or the scheduler is handed garbage: take `payment_due_day` in the current month, in the user's timezone; **if that date is already at or before `now`, roll forward to next month**. This is also what makes "each card gets exactly one reminder per cycle" actually hold — without a rollover rule the system schedules in the past once the first cycle passes, and then goes quiet forever. Only credit cards with both day columns set are eligible; the schema now enforces that a credit card has them.
- **On app foreground** (`AppState` listener): re-run the same recomputation, so changes made in `settings.tsx` (quiet hours, daily cap) take effect without requiring a card edit to trigger them.
- **Never inside the sync engine, and never gated on `useIsOnline()`.** Scheduling local notifications is a fully offline concern — it must keep working with no network connectivity at all, which is also worth saying explicitly in the submission doc since it's easy to accidentally couple with the sync engine if not careful.

## Wiring to `expo-notifications` (`src/services/notifications.ts`)

1. **Startup** (once, in `src/app/_layout.tsx` or an app-init effect). **Order matters** — create the channel *before* requesting permission, because on Android 13+ creating a channel is what triggers the system opt-in prompt. And you must actually check the result: the old version of this snippet awaited `requestPermissionsAsync()`, discarded its return value, then scheduled unconditionally, so a denial was silently ignored.
   ```ts
   // Without a handler, nothing is displayed while the app is foregrounded.
   Notifications.setNotificationHandler({
     handleNotification: async () => ({
       shouldShowBanner: true,   // NB: replaced the older `shouldShowAlert` — check the
       shouldShowList: true,     // SDK 57 docs for the current field names before writing.
       shouldPlaySound: true,
       shouldSetBadge: false,
     }),
   });

   if (Platform.OS === 'android') {
     await Notifications.setNotificationChannelAsync('card-reminders', {
       name: 'Card payment reminders',
       importance: Notifications.AndroidImportance.DEFAULT,
     });
   }

   const { granted } = await Notifications.requestPermissionsAsync();
   if (!granted) return; // surface a "reminders are off" note in Settings; never schedule
   ```
2. **For each `ScheduledReminder` with `infeasible: false`:**
   ```ts
   const id = await Notifications.scheduleNotificationAsync({
     content: {
       title: 'Card payment due soon',
       body: `${card.nickname} statement is due on ${dueDateLabel}`,
       data: { cardId },
       channelId: 'card-reminders',   // REQUIRED — without it the notification lands in the
                                      // default channel and the channel created above is
                                      // dead weight. This was missing from the first draft.
     },
     trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: scheduledAt },
   });
   ```
   Store the returned `id` in the **local SQLite** `notification_log` table (see below) alongside `scheduled_for`.

   Android 12+ needs `SCHEDULE_EXACT_ALARM` for exact-time triggers — add it via the `expo-notifications` config plugin block in `app.json`, which does not exist yet.

   iOS caps pending notifications at **64**. With a handful of cards this is never hit, but say so in the submission doc: it's a real OS-level constraint sitting outside the CSP model, and noticing it is the kind of detail that reads well.
3. **Before rescheduling a card that already has a log entry:**
   ```ts
   await Notifications.cancelScheduledNotificationAsync(oldId);
   ```
   then schedule the new one and update the log row.

   This sequence is **not atomic**: if `scheduleNotificationAsync` throws after the cancel succeeded, the log holds a dead id and the user silently gets no reminder, with nothing to detect it. That's what the reconcile pass below is for.

## `notification_log` belongs in local SQLite, not Supabase

The original plan put `notification_log` in the Supabase schema. That is wrong on two counts, and both are worth stating in the submission doc because the reasoning is the interesting part:

1. **It would make scheduling depend on the network**, which directly contradicts the rule above that local notification scheduling must work fully offline.
2. **`local_notification_id` is device-specific.** An id returned by `expo-notifications` on this phone means nothing on any other device. Syncing it to Postgres and back down would produce ids that cancel nothing, or cancel the wrong thing.

So: mirror it as a local-only table in `src/data/local/schema.sql.ts`, with the same columns, **not** registered with the outbox and never synced. Give it a unique constraint on `(card_id, scheduled_for)` so re-running the scheduler can't duplicate rows — idempotency was the entire reason this table exists.

## Reconciling the log with the OS

`notification_log` is the app's belief about what is scheduled; the OS holds the truth. They drift — a crash between cancel and schedule, the user clearing notifications, an OS upgrade, a restore from backup. Every time the scheduler runs:

1. Read the OS's actual state with `Notifications.getAllScheduledNotificationsAsync()`.
2. Cancel anything the OS has that the log doesn't know about (orphans — e.g. from a card that was deleted while the app was closed).
3. Drop log rows whose id no longer exists in the OS.
4. Then diff the new schedule against the reconciled log, and only cancel+reschedule entries that actually changed.

Define "changed" precisely, or you will reschedule everything on every foreground: compare `scheduledAt` **truncated to the minute**, not by exact `Date` equality. A drift of a few milliseconds is not a change.

Two cases the original plan left undefined:
- **A card that flips to `infeasible`** must have its existing OS notification cancelled and its log row removed. Otherwise the old reminder still fires, at a time the constraints now forbid.
- **A deleted card** must have its notification cancelled at delete time, not merely soft-deleted in the database — step 2 above is the safety net, but doing it eagerly is better.

## Surfacing infeasibility

The algorithm flags infeasible cards "rather than silently dropping" them — but that is only true if something tells the user. If nothing renders it, it *is* a silent drop from their point of view. Show it on the Settings screen: list any card with no reminder and the reason, e.g. *"No reminder for HSBC Visa — your daily limit of 3 leaves no free slot before the due date."* That line is also the best possible viva demo of the constraint model doing real work, so it's worth building properly rather than as a toast.

## What to put in the submission doc for this section

- State the CSP formulation (variables/domain/constraints/goal) verbatim from above.
- Show the pseudocode (or the real TypeScript, it's short enough).
- Explain the **most-constrained-first** heuristic (soonest due date has least room, so it picks first) and the bounded `MAX_SHIFTS` lookahead — it prevents unbounded search on a pathologically over-constrained input, at the cost of occasionally reporting infeasibility rather than searching further. A deliberate, explainable tradeoff. Describe the bound as **14 repair attempts**, not "14 days": each attempt may advance by a day *or* by `minSpacingMinutes`, and the quiet-hours clamp can itself push into the next day, so attempts don't map 1:1 to days.
- Describe it as **greedy with forward repair**, not backtracking — see the naming note at the top of this file. Don't claim a technique the code doesn't contain.
- Be explicit that the module is pure and takes `now` and `timeZone` as inputs, and explain *why* (testability + correctness of day bucketing). This is a strong point: it's a real engineering reason, not a stylistic preference.
- Reference the unit tests as evidence the constraints are actually enforced, not just asserted in prose. The `maxPerDay: 0` and timezone-boundary tests are the two that would have caught real bugs in the first draft of this design — worth saying so, since the brief explicitly asks for failures encountered during the build.
