# User guide

## Create an account

1. Open the app and choose register.
2. Enter a display name, email, and password.
3. On the activation screen, enter the 6-digit code from the email.
4. You land on the Dashboard.

If the code expires, request another from the activation screen. Signing in later uses the same email and password on the login screen.

## Dashboard

The gauge compares this billing period’s spend with the budget you set. Recent payments are listed underneath. Tap the gauge area’s budget control to change the monthly target. A budget of zero shows “No target set” until you choose one.

## Cards

- Add a card with a nickname, type (credit or debit), and the last four digits.
- A credit card also needs a statement day, a payment-due day (both between 1 and 28), and how many days before the due date you want the reminder (0–28, default 3).
- Swipe a row sideways to reveal Edit and Delete. Delete asks for confirmation.
- Only one row stays open at a time.

Deleting a card removes the payment method that pointed at that card. Past payments stay in the history.

## Add a payment

1. Open **Add Payment**.
2. Enter the amount in rupees.
3. Pick a category and a payment method (a saved card, cash, or another label).
4. Optionally attach a receipt: take a photo or choose one from the library, drag the crop corners, and confirm.
5. Save. The payment appears on the Dashboard immediately.

Receipt capture needs camera permission. Choosing from the library needs photo permission. The saved image is resized so the long edge is at most 2000 pixels.

## Predictions

Open **Predictions** while online. The screen shows one of these states:

| State | Meaning |
|---|---|
| Loading | The forecast is being fetched |
| Not enough history | There is not enough spending in the recent months to forecast |
| Forecast | Next month’s total, category breakdown, and trend versus recent months |
| Explanation unavailable | The numbers are shown; the written summary could not be produced |

The forecast is cached for about a day and is refreshed if you edit a payment after it was generated. The service allows a limited number of fresh forecasts per day.

## Settings and reminders

- Quiet hours default to 22:00–07:00 in the profile time zone (default `Asia/Colombo`).
- At most three reminders are placed on the same calendar day unless you raise the cap (1–20).
- If a card cannot be scheduled, Settings lists that card and the reason (for example, the due date has already passed, or every remaining slot breaks quiet hours or the daily cap).

Reminders are local notifications on the phone. They are recalculated when cards or these settings change, and when the app starts while you are signed in.

## Signing out

Use Settings to sign out. The next person to use the phone must sign in with their own account. Their data is separate on the server.
