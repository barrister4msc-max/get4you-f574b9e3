# TaskFlow (get4you)

Marketplace platform that connects clients with executors (taskers).
Clients post tasks, executors send proposals, the winning proposal is paid
through escrow, and funds are released after completion. Built on Lovable
Cloud (managed Supabase) with React + Vite on the frontend and Deno edge
functions for backend logic.

- **Lovable project**: https://lovable.dev/projects/81048fae-b380-4fe2-857e-21b0bb28eff3
- **Live**: https://get4you.lovable.app · https://www.get4you.ai

## Tech stack

- **Frontend**: React 18, TypeScript, Vite 5, Tailwind CSS 3, shadcn/ui,
  React Router, TanStack Query, sonner toasts, framer-motion
- **Maps & geo**: Leaflet / react-leaflet / maplibre-gl, PostGIS
- **State / forms**: React Hook Form + Zod
- **Backend**: Lovable Cloud (Supabase Postgres, Auth, Storage, Realtime)
- **Edge functions**: Deno (deployed automatically by Lovable Cloud)
- **AI**: Lovable AI Gateway (Gemini family)
- **Payments**: Allpay (escrow + commission)
- **Email**: Resend, on `notify.www.get4you.ai`
- **Mobile**: Capacitor (iOS / Android shells)
- **Testing**: Vitest (unit), Playwright (e2e)

## Repository layout

```
src/                       Frontend application
  pages/                   Route components (admin/, auth, tasks, chat, ...)
  components/              Shared UI + shadcn primitives in components/ui/
  hooks/                   React hooks (auth, geolocation, voice, ...)
  i18n/                    Languages (en, ru, he, ar) + translations
  integrations/supabase/   Auto-generated client + types (do NOT edit)
  lib/, shared/lib/        Utilities (analytics, logging, csv export, ...)
supabase/
  config.toml              Project + edge function config (auto-managed)
  functions/               Edge functions (one folder per function)
  migrations/              SQL migrations (read-only — create new ones)
tests/                     Playwright e2e specs
scripts/                   Utility SQL / scripts
capacitor.config.ts        Mobile shell config
```

## Run locally

Requirements: Node.js 18+ (or Bun) and npm/bun.

```sh
# 1. Install dependencies
npm install        # or: bun install

# 2. Start the dev server
npm run dev        # http://localhost:8080 (Vite)
```

The frontend talks to the hosted Lovable Cloud backend, so no local
Postgres or Supabase CLI is required for normal development. Edge function
changes pushed to the repo are deployed automatically.

## Environment variables

`.env` is **auto-generated and managed by Lovable Cloud** — do not edit it
manually. It exposes only the safe, public values needed by the browser:

| Variable                        | Used by  | Notes                                    |
| ------------------------------- | -------- | ---------------------------------------- |
| `VITE_SUPABASE_URL`             | frontend | Public Supabase project URL              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend | Public anon key (safe in the browser)    |
| `VITE_SUPABASE_PROJECT_ID`      | frontend | Public project ref                       |
| `SUPABASE_URL`                  | edge fn  | Same URL, available inside edge runtime  |
| `SUPABASE_PUBLISHABLE_KEY`      | edge fn  | Public anon key for user-scoped clients  |

Server-only secrets are stored in **Lovable Cloud → Secrets** (never in
`.env` or the codebase). Currently used:

- `SUPABASE_SERVICE_ROLE_KEY` — privileged DB access from edge functions
- `LOVABLE_API_KEY` — Lovable AI Gateway (Gemini)
- `RESEND_API_KEY` — transactional email
- `ALLPAY_*` — payment provider credentials
- `WHATSAPP_*` — WhatsApp broadcast (admin)

Add or rotate secrets from the Cloud dashboard; they become available as
`Deno.env.get("NAME")` inside edge functions on the next invocation.

## Build, lint, test

```sh
npm run dev          # Start Vite dev server
npm run build        # Production build (dist/)
npm run build:dev    # Development-mode build
npm run preview      # Preview the production build
npm run lint         # ESLint
npm run test         # Run Vitest unit tests once
npm run test:watch   # Vitest in watch mode
npx playwright test  # Run e2e specs in tests/
```

Type-check only:

```sh
npx tsc --noEmit -p tsconfig.app.json
```

## Edge functions

All functions live in `supabase/functions/<name>/index.ts` and deploy
automatically when pushed.

| Function                       | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `ai-support-chat`              | AI customer-support chat (Lovable AI / Gemini)       |
| `ai-task-assistant`            | AI helper for drafting tasks (text + voice + photos) |
| `analyze-categories`           | Auto-categorisation of "Other" tasks                 |
| `allpay-webhook`               | Allpay payment status webhook → updates orders/escrow|
| `create-payment`               | Creates an order + Allpay payment URL (idempotent)   |
| `exchange-rates`               | Cached USD/ILS exchange rates                        |
| `manage-admin`                 | Super-admin: add/remove roles, ban/unban by email    |
| `manage-user`                  | Super-admin user actions (roles + bans by user_id)   |
| `send-transactional-email`     | Render + send branded transactional emails (Resend)  |
| `process-email-queue`          | Background worker draining the email queue           |
| `auth-email-hook`              | Auth email customisation hook                        |
| `handle-email-suppression`     | Resend suppression / bounce handler                  |
| `handle-email-unsubscribe`     | One-click unsubscribe handler                        |
| `preview-transactional-email`  | Dev preview of transactional templates               |
| `send-whatsapp`                | WhatsApp broadcast (admin only)                      |

Useful commands while developing functions:

```sh
# Tail logs for a function
supabase functions logs <name> --project-ref emkiekjlxmtnzrgzfdep

# Run a function's Deno tests, if present
deno test supabase/functions/<name>
```

## Database & migrations

Schema lives in `supabase/migrations/` and is **read-only** — never edit
existing migration files. To change schema, RLS, triggers, or functions,
create a new timestamped migration file. The auto-generated types in
`src/integrations/supabase/types.ts` reflect the live schema and must not
be edited by hand.

Roles: `client`, `executor`, `admin`, `super_admin` (stored in
`user_roles`, never on `profiles`). Privilege checks use the `has_role`
SECURITY DEFINER function.

## Deployment

- **Frontend**: click **Publish** in the Lovable editor (top-right on
  desktop, bottom-right of the preview on mobile). Subsequent frontend
  changes go live by clicking **Update** in the publish dialog.
- **Backend** (edge functions, migrations): deploy automatically when
  changes land in the repo — no manual step.
- **Custom domain**: project must be published once, then add the domain
  via **Project Settings → Domains** or the publish dialog.
- **Mobile**: build the web app, then `npx cap sync` and open the iOS /
  Android project with Xcode / Android Studio to produce store builds.

Preview links (`id-preview--*.lovable.app`) require a Lovable login by
default. Use **Share → Share preview** for a 7-day public link.

## Contributing

- Use semantic Tailwind tokens from `index.css` and `tailwind.config.ts`;
  do not hard-code colors in components.
- Never write to `user_roles` or `banned_users` directly from the
  frontend — go through `manage-admin` / `manage-user`.
- Do not edit `src/integrations/supabase/{client,types}.ts`, `.env`, or
  files under `supabase/migrations/` — they are generated or immutable.