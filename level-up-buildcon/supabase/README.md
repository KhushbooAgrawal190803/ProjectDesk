# ProjectDesk — Supabase Setup

## New project (recommended)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → **New query**.
3. Paste and run the entire contents of [`schema.sql`](./schema.sql).
4. In **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only, never expose to browser)
5. Copy [`.env.example`](../.env.example) to `level-up-buildcon/.env.local` and fill values.
6. Create the first admin user via Supabase **Authentication → Users → Add user**, then insert a profile row:

```sql
INSERT INTO profiles (id, full_name, email, role, status)
VALUES (
  '<auth-user-uuid>',
  'Admin Name',
  'admin@yourcompany.com',
  'ADMIN',
  'ACTIVE'
);
```

Alternatively, use the Admin UI after temporarily inserting your profile with service role SQL.

## Legacy migrations

Files under `supabase/migration-*.sql` and older schemas are **archived history** from before the security refactor. Do not run them on a fresh project — use `schema.sql` only.

## Existing V2 database (one-time cleanup)

A project already initialized with the previous V2 `schema.sql` still has the removed dispatch, System Console, payment-reminder and legacy `booking_files` objects. Do **not** rerun `schema.sql` over it. Instead:

1. Dashboard → **Storage**: delete the `dispatch-documents` and `bookings` buckets (keep `booking-documents`).
2. SQL Editor: run [`migrations/002_remove_dispatch_console_email.sql`](./migrations/002_remove_dispatch_console_email.sql) once. Its final query should return `false` for every row.

## Bootstrap checklist

| Step | Action |
|------|--------|
| Schema | Run `schema.sql` |
| Env | Set Supabase URL, anon key, service role, `NEXT_PUBLIC_APP_URL` |
| Admin | Create auth user + ADMIN profile |

Do not commit `.env.local` or service role keys.
