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
