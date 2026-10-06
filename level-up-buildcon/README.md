# Level Up Buildcon — ProjectDesk

Internal web app for **Anandam** property bookings: executives create bookings, admins approve and manage users, and staff track payments, PDFs, and tower availability.

## Stack

- **Next.js 16** (App Router), **TypeScript**, **Tailwind CSS**, **shadcn/ui**
- **Supabase** (PostgreSQL, Auth, Storage, RLS)
- **Deploy**: Vercel (typical)

## Roles (two only)

| Role | Access |
|------|--------|
| **EXECUTIVE** | Bookings, lookup, downloads, payments, tower view. Submit → **PENDING** (needs admin approval). |
| **ADMIN** | Everything executives can do, plus approve/reject bookings, delete/restore, user management, settings. Submit → **SUBMITTED** immediately. |

## Quick start

```bash
cd level-up-buildcon
npm install
cp .env.example .env.local
# Fill Supabase keys — see supabase/README.md for fresh DB setup
npm run dev
```

Open `http://localhost:3000`.

## Database (fresh Supabase project)

1. Create a Supabase project.
2. Run **`supabase/schema.sql`** in the SQL Editor (single canonical file).
3. Create an auth user and insert an ADMIN profile — see [supabase/README.md](./supabase/README.md).

Use `supabase/schema.sql` for new projects. Existing databases may need one-time scripts in `supabase/migrations/` (see `supabase/README.md`).

## Scripts

```bash
npm run dev       # development
npm run build     # production build
npm run test      # unit tests (permissions, calculations, availability)
npm run lint      # ESLint
```

## Security model

- **Authentication**: Supabase Auth (JWT cookies).
- **Authorization**: Centralized in `lib/auth/permissions.ts`; enforced server-side in every action/API.
- **Database**: RLS enabled; all reads/writes use the authenticated Supabase client. The service role is used only by Admin → Create User (Supabase Auth Admin API).
- **Documents**: Booking PDFs are generated on demand and downloaded by authorized staff. The app sends no email, SMS, or WhatsApp messages.
- **Unit integrity**: App check (fail-closed) + PostgreSQL partial unique index on active `(project_name, unit_no)`.

## Interview prep

Start with **[docs/INTERVIEW_GUIDE.md](./docs/INTERVIEW_GUIDE.md)** — pitches, 50+ Q&A, and a 7-day study plan.

| Document | Purpose |
|----------|---------|
| [INTERVIEW_GUIDE.md](./docs/INTERVIEW_GUIDE.md) | Pitches, Q&A, study plan |
| [ENGINEERING_HANDBOOK.md](./docs/ENGINEERING_HANDBOOK.md) | Full technical reference |
| [CODEBASE_MAP.md](./docs/CODEBASE_MAP.md) | File map with interview priority |
| [SECURITY_REFACTOR.md](./docs/SECURITY_REFACTOR.md) | Oct 2026 security changelog |
| [TECHNICAL_DEBT.md](./docs/TECHNICAL_DEBT.md) | Open improvements only |
| [PERFORMANCE_AND_COMPLEXITY.md](./docs/PERFORMANCE_AND_COMPLEXITY.md) | Scale / bottlenecks |
| [ENGINEERING_DECISIONS.md](./docs/ENGINEERING_DECISIONS.md) | Stack tradeoff stories |

**Codebase size:** ~12,550 lines of source (TS/TSX ~11,600, SQL ~730, CSS ~210).

## License / use

Internal use — Level Up Buildcon.
