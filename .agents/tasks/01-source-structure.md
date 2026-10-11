# 01 — Source Structure

See [`00-overview.md`](./00-overview.md) for product context. This doc defines where code lives and why.

## Layer summary

```
UI (src/app/**, routes only)
  → domain hooks (src/features/**)
    → repositories (src/data/repositories/**)
      → data access (src/data/local/** expo-sqlite, src/data/remote/** Supabase)
        → sync engine (src/services/sync-engine.ts + connectivity.ts)
          → Supabase (Postgres+RLS, Auth, one Edge Function, Storage)
```

Screens never call `expo-sqlite` or the Supabase client directly — they call a `use-*` hook from `src/features/**`, which calls a repository, which decides local-vs-remote. This is what keeps the write path explainable in one sentence during the viva: *"every mutation writes to SQLite first, then gets queued for Supabase."*

## Full tree

```
src/
  app/                          # Expo Router routes ONLY — every file here is a route, no business logic
    _layout.tsx                 # root stack: AuthProvider, NetworkProvider, SQLite init
    (auth)/
      register.tsx
      activate.tsx
      login.tsx
    (tabs)/
      _layout.tsx                # bottom tab navigator
      index.tsx                  # Dashboard: recent payments, SpendingGauge (actual vs budget)
      cards.tsx                  # Cards list: SwipeableCardItem
      add-payment.tsx
      predictions.tsx            # AI prediction screen
      settings.tsx               # quiet hours, per-card lead time, daily notification cap
    cards/[id].tsx                # card detail/edit
    payments/[id].tsx             # payment detail/edit
    receipt-capture.tsx           # modal route hosting ReceiptCaptureOverlay

  components/
    ui/
      spending-gauge.tsx          # custom component 1
      swipeable-card-item.tsx     # custom component 2
      receipt-capture-overlay.tsx # custom component 3
    forms/                        # shared plain-RN form inputs (no form library needed at this scale)
    feedback/                     # loading / empty / error state components, reused across screens

  features/
    auth/
      use-auth.ts                 # session state, sign in/out
      activation.ts                # signUp / verifyOtp / resend wrappers
    cards/
      use-cards.ts
    payments/
      use-payments.ts
    predictions/
      use-predictions.ts          # calls the predict-expenses edge function
    notifications/
      use-notification-settings.ts

  data/
    local/
      db.ts                       # expo-sqlite open + migration runner
      schema.sql.ts                # CREATE TABLE statements as exported strings
      outbox.ts                   # outbox table CRUD helpers
    remote/
      supabase-client.ts           # createClient() with AsyncStorage session adapter
      payments-api.ts
      cards-api.ts
      payment-methods-api.ts
      predictions-api.ts           # invokes the predict-expenses edge function
    repositories/
      payments-repository.ts       # local-write + outbox-enqueue + read-merge logic
      cards-repository.ts
      payment-methods-repository.ts

  services/
    connectivity.ts                # useIsOnline(), built on @react-native-community/netinfo
    sync-engine.ts                 # outbox push + pull, backoff, dead-lettering
    notification-scheduler.ts      # pure constraint-satisfaction module, no I/O
    notifications.ts               # expo-notifications permission/channel/schedule wrapper

  types/
    database.ts                    # generated: `npx supabase gen types typescript` output
    domain.ts                      # app-level DTOs that aren't 1:1 with DB rows

  constants/, hooks/                # existing scaffold — keep as-is, extend in place
                                    # (NB: assets/ lives at the REPO ROOT, not under src/ —
                                    #  tsconfig maps "@/assets/*" to "./assets/*" separately)

supabase/
  migrations/
    0001_init.sql                  # == content of 02-supabase-schema.sql, committed as a real migration
  functions/
    predict-expenses/
      index.ts                     # HTTP handler: auth, rate limit, cache, orchestration (Deno-specific)
      aggregate.ts                 # deterministic forecasting module (pure, unit-tested)
      openrouter.ts                 # OpenRouter fetch wrapper (Deno-specific)
      schema.ts                     # zod schema validating the LLM's structured response

      # aggregate.ts and schema.ts must be RUNTIME-NEUTRAL — no Deno.* globals, clock and
      # env passed in as arguments — so jest-expo (Node) can import them directly. Only
      # index.ts and openrouter.ts touch Deno APIs. See 07-ai-prediction.md.
      # Add supabase/functions/** to tsconfig's "exclude" or `tsc --noEmit` will try to
      # typecheck Deno code against the app's config.

.agents/
  tasks/                           # this directory — planning docs + decision-log.md
```

## Naming conventions

- **kebab-case filenames** for everything under `src/` — matches the existing scaffold (`animated-icon.tsx`, `hint-row.tsx`, `use-color-scheme.ts`). Don't introduce PascalCase filenames even though component names themselves are PascalCase (`SpendingGauge` lives in `spending-gauge.tsx`).
- **One component/hook per file**, named to match the filename. Use whichever of named or default export matches the surrounding scaffold (`themed-text.tsx` and friends use named exports) — consistency with what's already there beats a blanket rule.
- **Hooks prefixed `use-`** both in filename and export name.
- **Routes only under `src/app/`.** Route groups `(auth)` and `(tabs)` use Expo Router's parenthesized-group syntax so they don't appear as URL segments. Never put a non-route helper file directly inside `src/app/` — if two screens need to share logic, that logic belongs in `src/features/**`, imported by both screens.
- **Repositories are the only files allowed to import both `src/data/local/**` and `src/data/remote/**` in the same module** — this boundary is what keeps "which store is authoritative" a one-file question instead of being scattered across the app.

## Existing scaffold — what to keep vs. replace

**Nothing in the tree above exists yet** apart from the five scaffold files listed as "keep". `src/data/`, `src/features/`, `src/services/`, `src/types/` and `supabase/` are all absent, as are `components/forms/` and `components/feedback/`; `components/ui/` currently holds only `collapsible.tsx`. Treat the tree as the target, not a description of the repo.

- Keep: `src/constants/theme.ts`, `src/hooks/use-color-scheme.ts`, `src/hooks/use-theme.ts`, `src/components/themed-text.tsx`, `src/components/themed-view.tsx` — these are generic and reusable.
- Remove once no longer referenced: `src/app/index.tsx`, `src/app/explore.tsx`, and the demo components `animated-icon.tsx`, `app-tabs.tsx`, `external-link.tsx`, `hint-row.tsx`, `web-badge.tsx`, `ui/collapsible.tsx`. With the web target dropped (see `00-overview.md`), also remove every `*.web.tsx` variant, `animated-icon.module.css`, `src/global.css` and `src/hooks/use-color-scheme.web.ts` — deleting these two CSS imports is also what clears the current `tsc --noEmit` errors.

**Two traps when doing this:**

1. **`src/app/_layout.tsx` imports two components from the removal list** (`AnimatedSplashOverlay` from `animated-icon`, `AppTabs` from `app-tabs`). Deleting them breaks the only layout file in the project, so removal and the real `(tabs)/_layout.tsx` have to land in the same change.
2. **The scaffold implements tabs as a *component*** (`<AppTabs />` rendered from the root layout), not as an Expo Router `(tabs)/_layout.tsx` navigator. Moving to the route-group structure above is a real refactor of the navigation tree, not a matter of adding files. Budget for it in build-order step 4.
