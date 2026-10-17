# Deployment

Three parts ship separately: the Postgres schema, the `predict-expenses` Edge Function, and the mobile binary. The phone talks to whichever Supabase project is in `EXPO_PUBLIC_SUPABASE_URL`. Deploy the database and the function to that same project.

The Supabase CLI is a dev dependency (`npx supabase`). You need an account that can edit the project.

## 1. Database

Link once:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
```

`<project-ref>` is the subdomain of the project URL (`https://<project-ref>.supabase.co`).

Apply migrations:

```powershell
npx supabase db push
```

`supabase/migrations/0001_init.sql` is idempotent: policies are dropped and recreated, seed categories use conflict handling, and the storage RLS statement tolerates a hosted project where the migration role does not own `storage.objects`.

After the first push, confirm in the dashboard:

- Tables `profiles`, `cards`, `payment_methods`, `categories`, `payments`, `predictions_cache`, `ai_invocation_log` exist and have RLS enabled.
- The `receipts` bucket exists and is private.
- Authentication email sign-up is enabled, including email OTP.

Do not run the app against a project that has not had this migration applied. Sign-up depends on the `handle_new_user` trigger.

## 2. Forecast function

From the linked project:

```powershell
npx supabase secrets set OPENROUTER_API_KEY=<key> OPENROUTER_MODEL=openai/gpt-4o-mini
npx supabase functions deploy predict-expenses
```

`OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are optional for the numeric forecast. Without them the function still returns totals and category figures, and the explanation section is unavailable.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided by the Supabase runtime. Do not put the service-role key in `.env` or in the app.

If the Predictions tab reports that the prediction service is not deployed, or the invoke call returns a non-2xx status, this function is missing or it was deployed to a different project than the app’s URL.

Function source: `supabase/functions/predict-expenses/`. Only that directory is deployed; Jest tests stay in the repo and are not the runtime entry.

## 3. Mobile app

### Expo Go (day-to-day)

`npm run android` or `npx expo start` loads the JS bundle from Metro into Expo Go. Native modules in this project (`expo-sqlite`, `expo-camera`, `expo-notifications`, `expo-image-picker`) are in Expo Go for SDK 57, so a custom dev client is not required for these features.

The device must reach both Metro and the Supabase URL. The Android script sets `adb reverse` so the emulator uses the host’s Metro port.

### Release binary (EAS)

This repo does not contain an `eas.json`. To produce an installable Android or iOS build:

1. Install and log in: `npx eas-cli@latest login`.
2. Configure the project: `npx eas-cli@latest build:configure`.
3. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS environment variables for the build profile. They are baked into the JS bundle at build time.
4. Build: `npx eas-cli@latest build --platform android` (or `ios`).

Native permissions already declared in `app.json` (camera, photos, notifications, exact alarms, SQLite) are applied by Expo config plugins during the cloud build. Do not hand-edit an `android/` or `ios/` directory; those folders are generated.

Over-the-air JS updates, after the first binary exists: `npx eas-cli@latest update`. An update cannot change native permissions or add a new native module; that needs a new build.

Identifiers already set in `app.json`:

- Android package and iOS bundle id: `com.sachinthasampath.expensetrackeremas1`
- URL scheme: `expensetrackeremas1`

## What is not deployed from this repo

- OpenRouter account and billing (only the API key, as a function secret).
- Supabase Auth email templates and SMTP, configured in the hosted project.
- App Store or Play Store listing (`eas submit` when you are ready to publish).
