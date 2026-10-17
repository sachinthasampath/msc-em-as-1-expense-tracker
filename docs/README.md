# Expense Tracker documentation

Expense Tracker is a mobile app for recording day-to-day spending in Sri Lankan rupees (LKR). It works offline, reminds you before a credit-card payment is due, and forecasts next month’s spend.

## Who should read what

| Document | Audience | What it answers |
|---|---|---|
| [Product overview](product-overview.md) | Anyone evaluating the product | What the app does and what it deliberately does not do |
| [User guide](user-guide.md) | People using the app | How to register, log a payment, attach a receipt, and read a forecast |
| [Architecture](architecture.md) | Engineers | How the phone, local database, and Supabase connect |
| [How features work](features.md) | Engineers | Behaviour of each feature, from screen to stored data |
| [Local development](local-development.md) | Engineers | How to run the app on an Android emulator |
| [Deployment](deployment.md) | Engineers | How to deploy the database, the forecast function, and the mobile app |
| [Data and security](data-and-security.md) | Engineers | Tables, who can read them, and which secrets belong where |

The course write-up lives in [SUBMISSION.md](../SUBMISSION.md) at the repository root. These docs are the operating reference; that file is the assessment narrative.

## Stack at a glance

| Layer | Technology |
|---|---|
| Mobile UI | Expo SDK 57, React Native 0.86, Expo Router, React 19 |
| Local store | `expo-sqlite` (the screen always reads this) |
| Remote store | Supabase Postgres with row-level security |
| Sign-in | Supabase Auth (email, password, 6-digit email code) |
| Receipt files | Supabase Storage, private bucket |
| Forecast | Supabase Edge Function `predict-expenses` (Deno). Numbers are computed in TypeScript. Optional prose comes from OpenRouter. |
| Package manager | npm (`package-lock.json`) |
