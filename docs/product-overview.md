# Product overview

Expense Tracker helps one person record what they spend, see it against a monthly budget, and get a reminder before a credit-card bill is due.

## What a person can do

- Create an account with email and password, then confirm it with a 6-digit code sent to that email.
- Add credit and debit cards (nickname and last four digits only — the app never stores a full card number).
- Log a payment: amount, category, and how it was paid (a card, cash, or another method).
- Photograph a receipt, or pick one from the photo library, crop it, and attach it to a payment.
- Set a monthly budget and see current spend against it on the home screen.
- See a forecast of next month’s total, broken down by category, once there is enough recent history.
- Choose quiet hours and a daily cap so payment reminders do not arrive all at once, or during the night.

The currency is LKR. There is no paid plan and no shared household account. Each signed-in person sees only their own cards, payments, and receipts.

## What happens with no network

The phone keeps a full copy of the person’s data. Adding a card or a payment succeeds immediately. Those changes are sent to the server when the phone is online again. A second sign-in, or a reinstall after signing in, pulls the existing records down.

## How the forecast is produced

The forecast total and the category split are calculated from past payments with ordinary arithmetic. A language model, when configured, only writes a short explanation of those numbers. If that service is unavailable, the numbers still appear and the explanation is marked unavailable. The model does not see receipt photos or free-text payment notes, and it does not decide the amounts.

## Reminders

Only credit cards with a statement day and a payment-due day get a reminder. The reminder is scheduled a chosen number of days before the due date, then moved later if it would fall in quiet hours, crowd the same day as other reminders, or sit too close to another reminder. If no valid time exists before the due date, Settings explains why that card was skipped.
