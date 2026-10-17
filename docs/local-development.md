# Local development

Requirements: Node.js, npm, and (for the Android script) Android Studio with an emulator. The app targets Expo SDK 57. Install libraries with `npx expo install <package>` so the version matches that SDK.

## Environment

Create a `.env` in the project root (it is gitignored):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Use the project’s anon key, not the service-role key. Expo inlines any `EXPO_PUBLIC_` variable into the client bundle. Restart Metro after changing `.env`.

The OpenRouter key is not a client variable. It is a secret on the Edge Function. See [Deployment](deployment.md).

## Install and check

```powershell
npm install
npx expo lint
npx tsc --noEmit
npm test
```

`npm test` runs Jest (`jest-expo`) including the notification scheduler and the forecast aggregate/schema tests.

## Run on Android

From the project folder, with an Android Studio emulator installed:

```powershell
npm run android
```

`scripts/start-android.ps1` waits until the emulator has finished booting and port 5554 is open, forwards Metro with `adb reverse`, forces IPv4, then starts Expo once. Do not press `r` until the app UI is visible. The first launch takes about ten seconds. A reload before that prints “No apps connected” even though the packager is fine.

Other entry points:

```powershell
npm start          # Metro; then press a / i / w
npm run ios        # iOS simulator (macOS)
npm run web        # browser preview; camera and notifications are limited
```

## Auth email in development

Supabase must be allowed to send the signup OTP (Authentication → email provider). During local testing, the Auth logs in the Supabase dashboard show the code if email delivery is not set up.

## Database changes

Schema changes belong in a new file under `supabase/migrations/`, following `0001_init.sql`. After they are applied:

```powershell
npx supabase gen types typescript --project-id <project-ref> > src/types/database.ts
```

The local SQLite shape is maintained separately in `src/data/local/schema.sql.ts`. A column added only on one side will fail sync.

## What needs a device or emulator

Offline sync, the camera, exact alarms, and swipe gestures should be checked on Android or iOS. The web target is useful for layout only.
