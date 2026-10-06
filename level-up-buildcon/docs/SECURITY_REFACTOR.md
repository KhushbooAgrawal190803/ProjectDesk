# Security Refactor — October 2026

This document records what changed from the pre-refactor baseline (`archive/pre-security-refactor` branch).

## Roles

**Previously:** EXECUTIVE, ACCOUNTS, ADMIN  
**Now:** EXECUTIVE, ADMIN only

Former ACCOUNTS features (payment overview, slab tracking) are available to **both EXECUTIVE and ADMIN**.

## Removed entirely

- `/api/destruct` and `/api/bootstrap-admin`
- `/admin/destruct` page and `destruct-actions.ts`
- Login destruct/kill-phrase triggers (`NEXT_PUBLIC_DESTRUCT_*`, `NEXT_PUBLIC_SYSTEM_CONSOLE_KILL_PHRASE`)
- ACCOUNTS role from types, UI, SQL enum, RLS policies
- Lockdown dead code
- pdfkit dependency (unused)

## Simplification (second pass)

The app no longer sends any messages and no longer stores generated documents. The flow is: ProjectDesk generates the booking PDF → an authorized employee downloads it.

| Removed | Details |
|---------|---------|
| Email | `lib/email.ts`, Nodemailer, payment-reminder emails (`reminder-actions.ts`, `payment-reminder-client.tsx`), `SMTP_*`, `FINANCE_EMAIL` |
| WhatsApp/Twilio | `lib/whatsapp.ts`, `TWILIO_*`, `WHATSAPP_API_*` |
| Dispatch workflow | `dispatch-actions.ts`, dispatch UI clients, `/api/dispatch-documents/[id]`, `booking_dispatch_documents`, `dispatch_status`/`dispatch_copy_type`, `dispatch-documents` bucket + policies |
| System Console | Admin → Console tab, `system-console-*`, `lib/server-env.ts`, `system_console_meta`/`system_console_cells`, `SYSTEM_CONSOLE_PASSPHRASE` |
| Forgot-password notification | `/api/forgot-password` (unauthenticated service-role audit insert nobody read), `settings.forgot_password_email`. The page now tells users to ask an admin, who sends a Supabase Auth reset link from User Management. |
| Legacy storage | `booking_files` table and `bookings` bucket (never used; PDFs are generated on demand) |
| Dead helpers | `lib/supabase/middleware.ts`, `lib/supabase/soft-delete.ts` |

The Payments page's "Payment Slabs" tab now uses the existing `payment-schedule-client.tsx` (slab status + record payment) in place of the reminder UI.

Existing V2 databases: run `supabase/migrations/002_remove_dispatch_console_email.sql` once (see `supabase/README.md`).

## Authorization architecture

| Layer | Implementation |
|-------|----------------|
| Auth | `getCurrentUser()` / `requireProfile()` |
| Staff gate | `requireStaff()` / `requireStaffPage()` |
| Admin gate | `requireAdmin()` / `requireAdminPage()` |
| Resource rules | `lib/auth/permissions.ts` |
| Errors | `UnauthorizedError` (401), `ForbiddenError` (403) — not login redirect |

## IDOR fixes

PDF and KYC document API routes now: authenticate → load booking → `assertCanViewBooking` / `assertCanDownloadPdfs` → fetch resource.

## Double-booking

**Previously:** App check failed open on DB errors.  
**Now:** Fail-closed availability check + partial unique index `idx_bookings_active_unit_unique` on `(project_name, unit_no)` for PENDING/SUBMITTED/EDITED.

## Service role usage (justified)

| Location | Why |
|----------|-----|
| `admin/actions.ts` → `createUser` | Supabase Auth Admin API (`auth.admin.createUser`, rollback via `deleteUser`) |

All other server paths, including the rest of user management and admin-sent password resets, use `createClient()` + RLS.

## Validation

Server-side Zod: `parseBookingDraft`, `parseBookingSubmit` in booking actions.

## Tests

`npm test` — permissions, calculations, availability (fail-closed).

## New Supabase setup

Run only `supabase/schema.sql` on a fresh project. See `supabase/README.md`.
