# ProjectDesk — Codebase Map

**Repository root:** `/ProjectDesk/level-up-buildcon/`  
**Purpose:** File-by-file engineering reference. Trivial config/CSS omitted unless relevant.

**Interview importance:** LOW | MEDIUM | HIGH | MUST UNDERSTAND

> Historical note: the destruct/bootstrap/lockdown code, the ACCOUNTS role, email/WhatsApp messaging, the document dispatch workflow and the Admin System Console have been removed. See [SECURITY_REFACTOR.md](./SECURITY_REFACTOR.md); the old code is on branch `archive/pre-security-refactor`.

---

## Entry & Configuration

### `package.json`
| | |
|---|---|
| **Responsibility** | Dependencies and scripts (dev, build, start, lint, test) |
| **Dependencies** | next@16, react@19, @supabase/*, jspdf, archiver, zod, react-hook-form, zustand |
| **Interview** | MEDIUM |

### `next.config.ts`
| | |
|---|---|
| **Responsibility** | `serverExternalPackages: ['archiver']`, turbopack root (local only) |
| **Interview** | LOW |

### `proxy.ts`
| | |
|---|---|
| **Responsibility** | Next.js 16 proxy (route protection via cookie check) |
| **Security** | Cookie presence only — UX gate; real auth is in pages/actions/routes |
| **Interview** | HIGH |

### `vitest.config.ts`
Unit test config. **Interview: LOW**

---

## `app/` — Routes

### `app/page.tsx`, `app/layout.tsx`
Root redirect and root layout. **Interview: LOW**

### `app/(auth)/login/page.tsx` + `login-content.tsx`
Email/password login via Supabase Auth; updates `last_login`; sets `sessionStorage.lubc_tab`. **Interview: HIGH**

### `app/(auth)/signup/page.tsx`
Redirects to login (self-signup disabled). **Interview: LOW**

### `app/(auth)/forgot-password/page.tsx`
Static notice: ask an administrator to send a reset link. No backend call. **Interview: LOW**

### `app/(auth)/reset-password/page.tsx`
Client Supabase password update after the Supabase Auth reset link. **Interview: MEDIUM**

### `app/(dashboard)/dashboard/page.tsx` + `recent-bookings.tsx`
Stats, owner split, parking, tower view, recent bookings. O(n) scans. **Interview: HIGH**

### `app/(dashboard)/bookings/page.tsx` + `bookings-table.tsx`
Booking registry with URL filters. **Interview: HIGH**

### `app/(dashboard)/bookings/actions.ts`
deleteBooking, restoreBooking, revertToDraft, approveBooking, rejectBooking — ADMIN only; audit log. **Interview: MUST UNDERSTAND**

### `app/(dashboard)/bookings/[id]/page.tsx` + `*-button.tsx`
Booking detail; approve/reject, delete, revert, download PDFs. **Interview: HIGH**

### `app/(dashboard)/bookings/[id]/edit/*`
Edit flow for EXECUTIVE + ADMIN, gated by `canEditBooking`. **Interview: HIGH**

### `app/(dashboard)/bookings/deleted/*`
Admin trash bin + restore. **Interview: MEDIUM**

### `app/(dashboard)/new-booking/*`
4-step wizard (`booking-wizard.tsx`, `step-1…4`), `actions.ts` (saveDraft, submitBooking, availability, server Zod), `document-actions.ts` + `document-upload.tsx` (KYC upload). **Interview: MUST UNDERSTAND**

### `app/(dashboard)/lookup/*`
Quick search + Anandam tower grid. **Interview: HIGH**

### `app/(dashboard)/downloads/page.tsx`
Links to bulk PDF API. **Interview: MEDIUM**

### `app/(dashboard)/accounts/page.tsx` (nav: Payments)
Tabs: Booking Financials, Payment Slabs (`payment-schedule-client.tsx`). **Interview: HIGH**

### `app/(dashboard)/accounts/payment-slab-actions.ts`
getPaymentSlabs, getBookingsForSlab, setSlabPayment (`amount_due = total × %`). Staff only. **Interview: HIGH**

### `app/(dashboard)/admin/page.tsx` + `users-table.tsx` + `settings-form.tsx`
User management and settings (ADMIN). **Interview: HIGH**

### `app/(dashboard)/admin/actions.ts`
User CRUD, settings, admin-sent password reset. Only `createUser` uses the service role (Auth Admin API). **Interview: MUST UNDERSTAND**

### `app/(dashboard)/template.tsx`, `**/loading.tsx`, `admin/error.tsx`
Transitions, skeletons, error boundary. **Interview: LOW**

---

## `app/api/` — Route Handlers

### `app/api/bookings/[id]/download/route.ts`
Single booking PDF ZIP (company + customer). Auth + `assertCanViewBooking` / `assertCanDownloadPdfs`. **Interview: MUST UNDERSTAND**

### `app/api/bookings/bulk-download/route.ts`
All bookings PDF ZIP. Performance bottleneck. **Interview: HIGH**

### `app/api/bookings/[id]/documents/[docId]/route.ts`
Short-lived signed URL redirect for KYC files after booking/document checks. **Interview: HIGH**

---

## `lib/` — Shared Logic

### `lib/auth/get-user.ts`
getCurrentUser, getCurrentProfile, requireProfile, requireStaff, requireAdmin (+ `*Page` variants). **Interview: MUST UNDERSTAND**

### `lib/auth/permissions.ts` (+ `.test.ts`)
Pure permission rules: isAdmin, canEditBooking, canViewBooking, assert* helpers. **Interview: MUST UNDERSTAND**

### `lib/auth/errors.ts`, `lib/api/auth-response.ts`
UnauthorizedError/ForbiddenError and their HTTP mapping. **Interview: MEDIUM**

### `lib/supabase/client.ts`
Browser Supabase client (anon key). **Interview: MEDIUM**

### `lib/supabase/server.ts`
`createClient()` (cookie session, RLS) and `createServiceClient()` (service role, server only). **Interview: MUST UNDERSTAND**

### `lib/booking/availability.ts` + `calculations.ts` (+ tests)
Fail-closed unit availability; total cost / GST / slab math. **Interview: HIGH**

### `lib/types/database.ts`
TypeScript interfaces mirroring the DB. **Interview: HIGH**

### `lib/validations/booking.ts`
Zod schemas used client and server side. **Interview: HIGH**

### `lib/pdf/generator.ts`
generateCompanyPDF, generateCustomerPDF (jsPDF). **Interview: HIGH**

### `lib/data/flat-areas.ts`, `lib/data/flat-ownership.ts`
Static Anandam flat → area map; developer vs landowner classification. **Interview: HIGH**

### `lib/utils.ts`
`cn()` helper. **Interview: LOW**

---

## `components/`

### `components/layout/dashboard-layout.tsx`
Shell: nav filtered by role, logout, tab guard. **Interview: HIGH**

### `components/ui/*`, loading indicators
shadcn/ui primitives and UX loaders. **Interview: LOW**

---

## `supabase/` — SQL

### `supabase/schema.sql`
Canonical fresh-install schema: tables, RLS, guard triggers, serial trigger, KYC storage bucket. **Interview: MUST UNDERSTAND**

### `supabase/migrations/002_remove_dispatch_console_email.sql`
One-time cleanup for databases created from the earlier V2 schema. **Interview: LOW**

### `supabase/migration-*.sql`, `full-reset-and-schema.sql`, etc.
Archived history — do not run. **Interview: LOW**

---

## Dependency Graph (Simplified)

```
pages (RSC) / server actions
  → requireProfile / requireStaff / requireAdmin (get-user.ts)
  → lib/auth/permissions.ts
  → createClient (server.ts) → PostgreSQL via RLS
  → createServiceClient only in admin createUser

client components
  → createClient (client.ts) for auth session
  → server actions

API routes
  → requireStaff + permission asserts + createClient
  → lib/pdf, archiver

proxy.ts
  → cookie check → redirect (no Supabase call)
```

---

## Files by Interview Priority (Study Order)

1. `lib/auth/get-user.ts` + `lib/auth/permissions.ts`
2. `lib/supabase/server.ts`
3. `supabase/schema.sql` (RLS, triggers)
4. `new-booking/actions.ts`
5. `bookings/actions.ts`
6. `app/api/bookings/[id]/download/route.ts` + `lib/pdf/generator.ts`
7. `lib/data/flat-ownership.ts`
8. `proxy.ts`
9. `components/layout/dashboard-layout.tsx`
