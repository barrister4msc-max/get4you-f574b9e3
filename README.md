
# Get4You

AI-powered marketplace platform connecting clients and taskers with escrow-based payments.

## 🚀 Overview

Get4You is a service marketplace that allows users to:

- Create tasks
- Receive proposals from executors
- Select a contractor
- Pay securely via escrow
- Communicate via built-in chat
- Complete work and release funds

## 🤖 AI Integration

- AI Gateway: Gemini family
- Used for task assistance, automation, and user interaction flows
- AI usage tracking via `ai_usage` table

## 🧠 Core Features

- Tasks & Proposals system
- Secure payment flow (Allpay integration)
- Escrow transactions (with commission)
- Real-time chat (task + direct messages)
- Role system (client / executor / admin / super admin)
- Admin panel
- Event logging (`app_events`)
- Notifications system
- Email system with retry (Resend via notify.www.get4you.ai)

## 🏗️ Tech Stack

- Frontend: React + TypeScript + Vite
- Backend: Supabase (PostgreSQL + RLS)
- Edge Functions: Deno (Supabase Functions)
- Payments: Allpay (escrow + commission)
- Storage: Supabase Storage
- Mobile: Capacitor (iOS / Android wrappers)
- AI: Gemini
- Testing: Vitest (unit), Playwright (e2e)

## 🔐 Security

- RLS on all critical tables
- No direct client writes for financial flows
- Server-side price validation
- Idempotent payment logic
- Webhook signature validation
- Role-based access control

## 💸 Payment Flow

1. Client selects proposal
2. `create-payment` Edge Function creates order
3. User is redirected to Allpay
4. Allpay sends webhook (`allpay-webhook`)
5. Order marked as `paid`
6. Escrow transaction created
7. Task moves to `in_progress`

## 📊 Observability

Events stored in `app_events`:

- payment.create_started
- payment.created
- payment.webhook_received
- payment.webhook_paid
- payment.webhook_failed

## ⚙️ Environment

⚠️ Do NOT commit `.env`

Required variables:

SUPABASE_URL  
SUPABASE_ANON_KEY  
SUPABASE_SERVICE_ROLE_KEY  
ALLPAY_LOGIN  
ALLPAY_API_KEY  

## 🧪 Development & Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Production build (dist/)
npm run build:dev    # Development-mode build
npm run preview      # Preview the production build
npm run lint         # ESLint
npm run test         # Run Vitest unit tests once
npm run test:watch   # Vitest in watch mode
npx playwright test  # Run e2e tests
📱 Mobile
Built using Capacitor
Supports iOS and Android builds
📌 Status

MVP: ready
Production hardening: in progress
Payments: integrated
Escrow: active

📬 Contact
get4you28@gmail.com
