# Audit Results

| Area | Status |
|---|---|
| Telegram DB fields | **None** (only chat-moderation regex blocks `t.me/`, `telegram` keywords) |
| Telegram bot integration | **None** |
| Notification system | **Exists** — `public.notifications` (user_id, type, title, message, task_id, proposal_id, is_read) |
| `app_events` logging | **Exists** — used everywhere; helper `src/shared/lib/logAppEvent.ts` |
| Edge Functions for notifications | WhatsApp queue (`send-whatsapp`, `process-whatsapp-queue`, `admin-run-whatsapp-queue`, `twilio-status-webhook`), Email queue (`send-transactional-email`, `process-email-queue`) — **no Telegram** |
| Profile settings | `profiles` already has `whatsapp_opt_in`, `whatsapp_opt_in_at`, `whatsapp_opt_out_at`, `whatsapp_phone` — perfect template |
| Supabase Auth | Standard email + Google OAuth, custom `auth-email-hook`. **Will not touch.** |
| Feature flags | `app_settings` key/value/jsonb table — will reuse |

**Sensitive areas preserved:** payments, escrow, orders, proposals, chat — no changes.

# Plan — Additive Telegram Notifications

## 1. Migration (all `IF NOT EXISTS`)

**`profiles`** — add columns:
- `telegram_chat_id BIGINT` (nullable, unique)
- `telegram_username TEXT`
- `telegram_opt_in BOOLEAN DEFAULT false`
- `telegram_opt_in_at TIMESTAMPTZ`
- `telegram_opt_out_at TIMESTAMPTZ`
- `telegram_linked_at TIMESTAMPTZ`

**`telegram_link_codes`** — short-lived codes users paste to bot to link account:
- `code TEXT PK`, `user_id UUID`, `expires_at TIMESTAMPTZ`, `consumed_at TIMESTAMPTZ`
- RLS: user can insert/select own; service role full access.

**`telegram_logs`** — mirror of `whatsapp_logs` pattern:
- `id`, `user_id`, `chat_id`, `event`, `status` (pending/sent/failed), `error`, `metadata jsonb`, `created_at`, `sent_at`
- RLS: admins read; service role full.

**`telegram_queue`** — pending outbound messages (same shape as whatsapp queue):
- `id`, `user_id`, `chat_id`, `event`, `payload jsonb`, `status`, `attempts`, `next_attempt_at`, `created_at`
- RLS: admins read; service role full.

**`app_settings`** seed:
```
INSERT ... ('telegram', '{"enabled": false, "bot_username": null}', false) ON CONFLICT DO NOTHING
```
This is the feature flag `telegram_notifications_enabled` (read as `value->>'enabled'`).

## 2. Secret
Request `TELEGRAM_BOT_TOKEN` via `add_secret` (never exposed to frontend).

## 3. Edge Functions (new, isolated)

- **`telegram-webhook`** (`verify_jwt = false`) — receives Telegram updates. Handles `/start <code>` to consume `telegram_link_codes` and link `telegram_chat_id` → `profiles`. Verifies `X-Telegram-Bot-Api-Secret-Token` (derived from bot token hash).
- **`send-telegram`** (internal, `verify_jwt = false`, requires `x-internal-secret` like WhatsApp pattern) — sends a single message via Telegram Bot API.
- **`process-telegram-queue`** (`verify_jwt = false`, internal-secret guarded) — drains `telegram_queue` with retry/backoff.
- **`admin-run-telegram-queue`** (auth required, admin/super_admin only) — mirrors `admin-run-whatsapp-queue`.
- **`telegram-link-code`** (auth required) — issues a one-time code for the logged-in user to paste to the bot.

All log to `app_events`:
- `telegram.webhook_received` / `telegram.link_succeeded` / `telegram.link_failed`
- `telegram.queue_manual_run_started/finished/failed`
- `telegram.send_started/succeeded/failed`

Each send checks `app_settings.telegram.value->>'enabled' = 'true'` and `profiles.telegram_opt_in = true` before delivering.

## 4. Frontend (Profile page only, additive)

Add a "Telegram notifications" card below the WhatsApp card:
- Toggle `telegram_opt_in` (default off; never auto-enable)
- If opted-in but not linked → button "Get link code" → calls `telegram-link-code`, shows code + deep link `https://t.me/<bot_username>?start=<code>`
- If linked → show `@telegram_username` + "Unlink" button
- Helper text + 3 bullets (messages / proposals / payments) — reuse `whatsapp.optin.*` style. New `telegram.*` i18n keys for EN/RU/HE/AR.

No marketing toggle. No changes to Signup (keep flow minimal).

## 5. Wiring into existing notification triggers
**Not in this pass.** Tables + functions + UI ship first behind the feature flag (default OFF). A follow-up will add `telegram_queue` inserts next to existing `notifications`/`whatsapp_queue` inserts — no business logic changes.

## 6. Guarantees
- No edits to: payments, escrow, orders, proposals, chat, auth flow, existing edge functions.
- All DDL uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`.
- Bot token only in edge function env (`TELEGRAM_BOT_TOKEN`).
- Feature flag default **off** — nothing sends until super_admin flips `app_settings.telegram.value.enabled`.

---

Approve to proceed. I'll start by requesting `TELEGRAM_BOT_TOKEN` and running the migration.
