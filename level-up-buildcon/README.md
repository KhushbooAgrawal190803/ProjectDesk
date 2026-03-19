# Level Up Buildcon — ProjectDesk

Internal web app for **Anandam** property bookings: staff and accounts create bookings, admins manage users, accounts handle payments and dispatch, and the tower grid shows availability by owner (Level Up Buildcon vs Balaji Hospitality).

## Stack

- **Next.js** (App Router), **TypeScript**, **Tailwind CSS**, **shadcn/ui**
- **Supabase** (PostgreSQL, Auth, Row Level Security)
- **Deploy**: Vercel (typical)

## Prerequisites

- Node.js 18+
- npm
- Supabase project (URL, anon key, service role key)

## Quick start

```bash
cd level-up-buildcon
npm install
```

Create `.env.local` in this folder (see table below).

Set in `.env.local`:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key (never expose to browser) |
| `BOOTSTRAP_ADMIN_EMAILS` | Comma-separated emails that become `ADMIN` on first signup |
| `NEXT_PUBLIC_APP_URL` | e.g. `http://localhost:3000` or production URL |

**Admin workbook (Console tab):** set `SYSTEM_CONSOLE_PASSPHRASE` to a strong shared secret (8+ characters) in `.env.local` and Vercel. Every admin enters that same passphrase each time they open the workbook (like a shared login). Keep it unchanged or existing encrypted cells may not decrypt until the sheet is cleared.

If you see errors about missing `premium_parking` or `system_console_*` tables, run the SQL files `supabase/migration-premium-parking.sql` and `supabase/migration-system-console.sql` in the Supabase SQL editor (in addition to your main schema).

Add any other deployment-specific variables your ops checklist requires (never commit secrets).

## Database

1. Open **Supabase → SQL Editor**.
2. Run migrations in a sensible order for your environment. Baseline schema is in `supabase/schema.sql` or `supabase/full-reset-and-schema.sql` (fresh install). Incremental files live under `supabase/` (e.g. `migration-roles-restructure.sql`, `migration-premium-parking.sql`, `migration-system-console.sql`, `migration-serial-reset-to-lubc-01.sql`).
3. **Production**: prefer additive migrations over full reset unless you mean to wipe data.

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Roles

| Role | Typical access |
|------|----------------|
| **EXECUTIVE** | Bookings, lookup, downloads |
| **ACCOUNTS** | Bookings, accounts module, can submit bookings for approval |
| **ADMIN** | Everything including user management, settings, deleted bookings, console tab |

Booking flow: non-admin submit → `PENDING` → admin approves → `SUBMITTED` and serial assignment (e.g. `LUBC 01`).

## Project layout (high level)

```
level-up-buildcon/
├── app/
│   ├── (auth)/          login, forgot/reset password
│   ├── (dashboard)/     dashboard, bookings, new-booking, lookup, accounts, admin, …
│   └── api/             route handlers (downloads, destruct, etc.)
├── components/          layout, UI primitives
├── lib/                 auth, supabase clients, validations, data (flats, ownership)
├── supabase/            SQL migrations and schema references
└── public/              static assets (e.g. logo)
```

## Scripts

```bash
npm run dev      # development
npm run build    # production build
npm run start    # production server
npm run lint     # ESLint
```

## Security notes

- Never commit `.env.local` or service role keys.
- RLS is enforced where configured; server actions often use the service client for trusted server work—review policies before exposing new client-side Supabase usage.
- The **Console** under Admin stores **encrypted** cell blobs; session passphrase stays in the browser/session. Run `migration-system-console.sql` before using that tab.

## License / use

Internal use — Level Up Buildcon.
