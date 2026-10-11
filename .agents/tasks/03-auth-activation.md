# 03 — Auth & Activation

See [`00-overview.md`](./00-overview.md) for context and [`02-supabase-schema.sql`](./02-supabase-schema.sql) for the `profiles` table + trigger this flow depends on.

## Why OTP, not magic link, and not custom SMTP

The product requirement is "receive an activation email with a code to complete registration." Supabase Auth supports this natively for the signup-confirmation step — set the delivery mode to OTP instead of a magic-link URL, and the student doesn't need to stand up or pay for a separate email service. This is the only auth approach used; do not build custom email infrastructure.

**One-time Dashboard configuration** (do once, before building the screens): Supabase Dashboard → Authentication → Email Templates → "Confirm signup" → change from magic link to **OTP code**. Also check Authentication → Providers → Email → "Confirm email" is enabled (it should be, by default).

## Supabase client setup

`src/data/remote/supabase-client.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // not a web OAuth redirect flow
    },
  },
);
```

`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` go in `.env` and are safe to ship in the client bundle; RLS is what actually protects data, not secrecy of this key.

> ⚠️ **Two things are currently broken here — see the task list in [`00-overview.md`](./00-overview.md).**
> `.env` is **committed to git** (`.gitignore` only matches `.env*.local`) and contains a live OpenRouter key that needs rotating, and there is no `.env.example`. Separately, `.env` defines `EXPO_PUBLIC_SUPABASE_KEY`, not `EXPO_PUBLIC_SUPABASE_ANON_KEY` — so the snippet above reads `undefined` and `createClient` throws at startup. Rename the variable before writing this file.

`@react-native-async-storage/async-storage` is **not installed yet**. Without it the `storage` adapter is undefined, `persistSession` quietly degrades to in-memory, and the session dies on every app restart — which silently breaks the offline-session promise at the bottom of this doc. Install it before building these screens.

## Screens (`src/app/(auth)/`)

### `register.tsx`
- Collects email + password (+ confirm password).
- Calls:
  ```ts
  const { error } = await supabase.auth.signUp({ email, password });
  ```
- On success, navigate to `activate.tsx`, passing `email` as a route param (`router.push({ pathname: '/(auth)/activate', params: { email } })`).
- On error, surface Supabase's error message directly (e.g. "User already registered") — don't invent custom copy that could hide what actually happened, since this is also useful for the Decision/Failure Log if something unexpected comes back during testing.

### `activate.tsx`
- Collects the 6-digit code (numeric input, 6 boxes or a single numeric `TextInput` — no OTP library needed, this is six digits).
- Calls:
  ```ts
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'signup',
  });
  ```
- On success, `data.session` is populated (the user is now signed in). Immediately upsert the profile's activation timestamp:
  ```ts
  await supabase
    .from('profiles')
    .update({ activated_at: new Date().toISOString() })
    .eq('id', data.session!.user.id);
  ```
  (This is a plain `update`, not an `upsert`/insert — the `handle_new_user` trigger already created the row at signup time, see `02-supabase-schema.sql`.)
- Navigate to `(tabs)/index` on success.
- Provide a "Resend code" action:
  ```ts
  await supabase.auth.resend({ type: 'signup', email });
  ```
- On `verifyOtp` error (wrong/expired code), show the error inline and keep the user on this screen — don't silently redirect anywhere.

### `login.tsx`
- Standard email+password sign-in:
  ```ts
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  ```
- If sign-in fails specifically because the email isn't confirmed (check `error.message` / `error.code` for Supabase's "Email not confirmed" case), redirect to `activate.tsx` with the "Resend code" action available rather than showing a generic login error.

## Session / route guarding

`src/features/auth/use-auth.ts` exposes the current session via `supabase.auth.onAuthStateChange`, consumed by `src/app/_layout.tsx` to decide whether to render the `(auth)` group or the `(tabs)` group — standard Expo Router conditional-rendering pattern, no separate "auth guard" library needed.

```ts
// use-auth.ts (shape, not full implementation)
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}
```

Because `persistSession: true` with the `AsyncStorage` adapter is set on the client, the session survives app restarts and works while offline — the app should treat "have a cached session" as logged-in even with no network, and only need network for the initial sign-in/activation itself.

## What NOT to build here

- No custom email/SMTP sending.
- No password-reset flow unless time remains after the core build order in `00-overview.md` — not part of the graded feature set, don't spend scoped time on it before everything else is done.
- No social/OAuth login — out of scope, adds complexity with no assignment-requirement benefit.
