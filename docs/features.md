# How features work

Each section names the screen, the hook, and the stored result. Shared plumbing (SQLite first, then outbox) is described in [Architecture](architecture.md).

## Authentication

| | |
|---|---|
| Screens | `src/app/(auth)/register.tsx`, `activate.tsx`, `login.tsx` |
| Hook | `src/features/auth/use-auth.ts`, helper `activation.ts` |

Register calls Supabase Auth sign-up. A database trigger inserts `public.profiles` for the new `auth.users` row. The client does not insert that profile.

Activation verifies the 6-digit email OTP, then **updates** `profiles.activated_at`. It does not upsert: there is no insert policy on `profiles`, so an insert would be rejected.

Login restores a session into AsyncStorage. Root layout treats a session as the gate for the tab navigator.

## Cards and payment methods

| | |
|---|---|
| Screen | `src/app/(tabs)/cards.tsx` |
| Hooks | `src/features/cards/use-cards.ts`, `src/features/payments/use-payment-methods.ts` |
| Tables | `cards`, `payment_methods` |

Creating a card also creates a `payment_methods` row with `method_type = 'card'`. Cash and “other” methods are rows with no `card_id`. A check constraint requires `card_id` if and only if the method is a card.

Credit cards must have `statement_day` and `payment_due_day`. Debit cards may omit them. `last4` is four digits or null. Days of month are limited to 1–28 so every month has that day.

The list row is `SwipeableCardItem`: a pan gesture reveals edit and delete. Delete confirms with an alert, then soft-deletes.

## Payments and categories

| | |
|---|---|
| Screen | `src/app/(tabs)/add-payment.tsx` |
| Hooks | `use-payments.ts`, `use-categories.ts`, `billing-period.ts` |
| Tables | `payments`, `categories` |

System categories have `user_id` null and are readable by every signed-in user. Custom categories belong to one user. Category names are 1–60 characters because those names are the only user-written strings sent toward the language model.

A payment stores amount, category, payment method, optional note, and optional receipt path. The Dashboard sums the current period from local rows via `billing-period.ts`. The monthly budget is stored in AsyncStorage under `monthly-budget-minor:<userId>` (`use-budget.ts`). It stays on that device and is not synced.

## Receipts

| | |
|---|---|
| Screen | `src/app/receipt-capture.tsx` |
| Component | `src/components/ui/receipt-capture-overlay.tsx` |
| Upload | `src/data/remote/receipts-api.ts` |

`ReceiptCaptureOverlay` uses `expo-camera` `CameraView`. The gallery path uses `expo-image-picker` and the same crop UI. Four edges (`left`, `top`, `right`, `bottom`) are shared values; corners are derived from them. Cropping uses `expo-image-manipulator` (`crop`, `resize`, `renderAsync`, `saveAsync`). `takePictureAsync` keeps default processing so the bitmap matches device orientation before crop.

The file is uploaded to the private `receipts` bucket under the user’s id. Storage policies allow a user to read and write only objects in their own folder. The payment row stores the object path, not a public URL.

## Reminders

| | |
|---|---|
| Settings UI | `src/app/(tabs)/settings.tsx` |
| Scheduler | `src/services/notification-scheduler.ts` (pure, unit-tested) |
| OS bridge | `src/services/notifications.ts`, `use-reminder-scheduler.ts`, `recompute-reminders.ts` |
| Profile columns | `timezone`, `quiet_hours_start`, `quiet_hours_end`, `max_notifications_per_day` |

For each credit card the scheduler picks one notification time in `(now, dueDate]`, starting at `dueDate − reminder_lead_days` and moving forward only. Constraints:

1. Outside quiet hours (evaluated in the profile IANA time zone; default `Asia/Colombo`).
2. At most `max_notifications_per_day` reminders on one local calendar day.
3. At least a minimum gap between any two reminders.
4. Strictly after now and on or before the due date.
5. Exactly one reminder per card per cycle.

Cards are assigned soonest-due first. Repair nudges the current candidate later; it does not undo an earlier card. After a bounded number of attempts the card is reported infeasible. Settings lists those cards (`use-infeasible-reminders.ts`). The clock and time zone are arguments, so the same inputs always schedule the same times (`notification-scheduler.test.ts`).

Android declares `SCHEDULE_EXACT_ALARM` in `app.json` so a reminder can fire at the computed instant.

## Predictions

| | |
|---|---|
| Screen | `src/app/(tabs)/predictions.tsx` |
| Hook | `src/features/predictions/use-predictions.ts` |
| Function | `supabase/functions/predict-expenses/` |

`aggregate.ts` builds the next-month total, per-category amounts, and a trend from recent payments. It refuses to forecast when the two calendar months before “now” do not contain enough activity (old clusters of data do not count as recent). `openrouter.ts` requests a short explanation. `schema.ts` checks the model output before it is stored. Category names are length-capped in the database to limit prompt injection.

Cache rows live in `predictions_cache` (one per user per forecast month). A failed explanation is not stored as a permanent error, so a later call can fill in the prose. `ai_invocation_log` counts non-cache calls toward a daily limit of 10. Both tables are written with the service role. Clients can read their own rows and cannot insert.

`SpendingGauge` on this screen uses the predicted total as the target and recent actual spend as the value. The same component on the Dashboard uses the user budget as the target.

## Dashboard gauge

`src/components/ui/spending-gauge.tsx` draws an SVG arc. The ratio `actual / target` picks a color at the warning threshold (default 0.8) and the over threshold (default 1). A text label states the same status. `target === 0` renders “No target set” and does not divide.
