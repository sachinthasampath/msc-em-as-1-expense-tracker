# Expense Tracker

A mobile app for recording day-to-day spending in Sri Lankan rupees (LKR). It works offline, reminds you before a credit-card payment is due, and forecasts next month’s spend.

Each signed-in person sees only their own cards, payments, and receipts. There is no paid plan and no shared household account.

## Features

- Register with email and password, then confirm the account with a 6-digit email code.
- Add credit and debit cards (nickname and last four digits only).
- Log a payment with an amount, category, and payment method (card, cash, or other).
- Photograph a receipt, or pick one from the photo library, crop it, and attach it to a payment.
- Set a monthly budget and see current spend against it on the home screen.
- Get a reminder before a credit-card due date, respecting quiet hours and a daily cap.
- See a forecast of next month’s total, split by category, once there is enough recent history.

The forecast totals are calculated in TypeScript from past payments. When configured, a language model only writes a short explanation of those numbers. Receipt photos and payment notes are not sent to the model.

## Tech stack

| Layer | Technology |
|---|---|
| Mobile UI | Expo SDK 57, React Native 0.86, Expo Router, React 19 |
| Local store | `expo-sqlite` (screens always read this) |
| Remote store | Supabase Postgres with row-level security |
| Sign-in | Supabase Auth (email, password, 6-digit email code) |
| Receipt files | Supabase Storage, private bucket |
| Forecast | Supabase Edge Function `predict-expenses` (Deno), optional OpenRouter prose |
| Tests | Jest (`jest-expo`) |

## Prerequisites

- [Node.js](https://nodejs.org/) (current LTS) and npm
- An Expo-compatible device, [Expo Go](https://expo.dev/go), or an Android emulator ([Android Studio](https://developer.android.com/studio))
- A [Supabase](https://supabase.com/) project with the schema from this repo applied (see [Deployment](docs/deployment.md))

Camera, exact alarms, offline sync, and swipe gestures should be checked on Android or iOS. The web target is useful for layout only.

## Getting started

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root (it is gitignored):

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   ```

   Use the project’s anon key, not the service-role key. Restart Metro after changing `.env`. The OpenRouter key belongs on the Edge Function, not in this file.

3. Start the app:

   ```bash
   npm start
   ```

   From the Metro menu, open Android (`a`), iOS (`i`, macOS only), or web (`w`).

   On Windows, with an Android Studio emulator already installed:

   ```powershell
   npm run android
   ```

   `scripts/start-android.ps1` waits until the emulator has finished booting, forwards Metro with `adb reverse`, then starts Expo. Wait until the app UI is visible before reloading.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the Expo dev server |
| `npm run android` | Boot-aware Android start (Windows) |
| `npm run ios` | Start and open the iOS simulator |
| `npm run web` | Start the web preview |
| `npm run lint` | Run ESLint (`expo lint`) |
| `npm run typecheck` | Typecheck with `tsc --noEmit` |
| `npm test` | Run Jest (scheduler and forecast tests) |

Install Expo libraries with `npx expo install <package>` so the version matches SDK 57.

## Project structure

```
src/app/                  Expo Router screens (auth, tabs, receipt capture)
src/features/             Domain hooks (auth, cards, payments, budget, forecast)
src/data/                 SQLite, Supabase clients, repositories
src/services/             Sync engine and notification scheduler
src/components/           Shared UI, including custom receipt and card components
supabase/migrations/      Postgres schema
supabase/functions/       predict-expenses Edge Function
docs/                     Product, architecture, and operations docs
```

Screens do not call SQLite or Supabase directly. A screen uses a feature hook, which uses a repository. Mutations write to SQLite first and sync to Supabase when the device is online.

## Documentation

| Document | What it covers |
|---|---|
| [docs/README.md](docs/README.md) | Index of the operating docs |
| [Product overview](docs/product-overview.md) | What the app does |
| [User guide](docs/user-guide.md) | How to register, log a payment, and read a forecast |
| [Architecture](docs/architecture.md) | Phone, local database, and Supabase |
| [How features work](docs/features.md) | Behaviour of each feature |
| [Local development](docs/local-development.md) | Emulator, env, and schema changes |
| [Deployment](docs/deployment.md) | Database, Edge Function, and mobile build |
| [Data and security](docs/data-and-security.md) | Tables, access rules, and secrets |

The course write-up is in [SUBMISSION.md](SUBMISSION.md).

## License

This project is released under the [MIT License](LICENSE).
