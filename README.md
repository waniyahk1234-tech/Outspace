# Outspace

**"Talk to someone who actually does the job before you choose your degree."**

Outspace is a career exploration and mentorship platform for high-school students in Pakistan (Matric, O-Level, Intermediate, A-Level, ages 14–18). Students discover careers through a RIASEC Career Fit Quiz, connect with LinkedIn-verified Pakistani mentors, ask questions in niche groups, book 1:1 Jitsi video sessions (in PKT), and build a verifiable **Career Passport** with collectible badges and QR-verified PDF certificates.

---

## Demo Logins (Pre-seeded)

All demo accounts share password **`Demo@1234`** (also available as one-click buttons on `/login`):

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| Student | `student@demo.com` | `Demo@1234` | Waniyah Tariq (A-Level, Karachi) on 7-day trial with 1 free 1:1 |
| Mentor | `mentor@demo.com` | `Demo@1234` | Ayesha Khan (Senior Software Engineer, Karachi, approved) |
| Admin | `admin@demo.com` | `Demo@1234` | Approves/rejects pending mentors (`Zainab Raza` is queued) & reviews reports |

**Institution Access Code:** `DEMO2026` (*Demo College Karachi*, 100 seats)

---

## Architecture & Runtime

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 + `lucide-react` + `react-hook-form` + `zod` + `date-fns-tz` (`Asia/Karachi` PKT) + `jspdf` + `qrcode` + `sonner`.
- **Live Server & Database (AI Studio Runtime):** Express (`server.ts`) + `better-sqlite3` (`outspace.db`) + Server-Sent Events (`/api/realtime/stream`) + `multer` avatar uploads (`/uploads`), running on port `3000`. Every business rule, RLS-style authorization check, reply-time recalculation, contact-detail masking, trial gating, Jitsi booking transaction, and badge/certificate issuance runs server-side end-to-end with zero external credential blockers.
- **Supabase Deployment Assets:** `supabase/schema.sql` and `supabase/seed.sql` provide the complete PostgreSQL schema, enums, RLS policies on all tables, triggers (`trg_connection_response`), and security-definer functions (`book_slot`, `complete_meeting`, `redeem_institution_code`).

---

## Setup & Local Commands

1. Copy `.env.example` to `.env` (no external keys are required to run the local Express + SQLite app):
   ```bash
   cp .env.example .env
   ```
2. Install dependencies and start the app on port `3000`:
   ```bash
   npm install
   npm run dev
   ```
3. Build & typecheck:
   ```bash
   npm run lint
   npm run build
   ```

### Running `supabase/schema.sql` & `supabase/seed.sql` on Supabase

1. Create a new Supabase project and open **SQL Editor**.
2. Execute `supabase/schema.sql` to create all enums, tables, RLS policies, triggers, and security-definer RPCs.
3. Create demo Auth users in Supabase Authentication (`student@demo.com`, `mentor@demo.com`, `admin@demo.com`), then execute `supabase/seed.sql` to populate the 10 Pakistani career niches and `DEMO2026` institution.
4. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
