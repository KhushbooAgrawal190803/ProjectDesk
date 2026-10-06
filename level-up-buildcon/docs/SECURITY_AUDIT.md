# ProjectDesk — Security Audit

**Audit date:** October 4, 2026 (pre-refactor baseline)  
**Refactor completed:** October 2026 — see [SECURITY_REFACTOR.md](./SECURITY_REFACTOR.md) for current behavior  
**Pre-refactor snapshot:** git branch `archive/pre-security-refactor`

> **How to read this document:** Findings below describe the **pre-refactor** codebase. Items marked **FIXED** in [SECURITY_REFACTOR.md](./SECURITY_REFACTOR.md) are resolved on `main`. Use this file for historical context and threat modeling; use the handbook + refactor doc for current architecture.

**Scope:** Static analysis of `/level-up-buildcon` repository only. No production exploitation.  
**Classification legend:** CRITICAL | HIGH | MEDIUM | LOW | INFORMATIONAL

---

## Executive Summary (historical — pre-refactor)

ProjectDesk is an **internal** sales/booking system. Authentication uses Supabase Auth; authorization was enforced primarily in **server actions and API routes** via `requireProfile()` / `requireRole()`, with most database access through the **Supabase service role** (bypassing RLS).

The most serious **pre-refactor** findings were:

1. **Unauthenticated admin bootstrap endpoint** — **FIXED** (route removed)
2. **Broken object-level authorization (IDOR)** on PDF/document APIs — **FIXED** (resource checks in API routes)
3. **Destructive login triggers** — **FIXED** (entire destruct system removed)
4. **Service-role-heavy architecture** — **FIXED** (all paths use `createClient()` + RLS; service role remains only in Admin → Create User for the Auth Admin API)
5. **Proxy (middleware) only checks cookie presence**, not session validity — **OPEN** (acceptable for internal app; pages re-validate)

---

## Findings

### SEC-001 — Unauthenticated Admin Bootstrap API

| Field | Detail |
|-------|--------|
| **Severity** | **CRITICAL** |
| **Risk** | Anyone who can reach `GET /api/bootstrap-admin` creates or resets an ADMIN user with known credentials |
| **Affected code** | `app/api/bootstrap-admin/route.ts` |
| **Attack scenario** | Attacker calls endpoint on deployed URL → receives `{ login_email, password }` → full admin access |
| **Impact** | Complete compromise: all bookings, PII, financial data, user management, destructive actions |
| **Current protection** | **None** — no auth, uses service role |
| **Recommended mitigation** | Remove from production builds; gate behind one-time deploy secret + IP allowlist; or delete entirely and use Supabase dashboard for bootstrap |

Hardcoded values in source:
- Email: `KHUSHBOO190803@internal.local`
- Password: `Passw0rd`

---

### SEC-002 — IDOR: Any Active User Can Download Any Booking's PDFs

| Field | Detail |
|-------|--------|
| **Severity** | **HIGH** |
| **Risk** | PDFs contain PAN, Aadhaar, mobile, financial amounts |
| **Affected code** | `app/api/bookings/[id]/download/route.ts`, `app/api/bookings/bulk-download/route.ts` |
| **Attack scenario** | Logged-in EXECUTIVE obtains another booking UUID (from network tab, guess, or listing) → `GET /api/bookings/{id}/download` → ZIP with company + customer PDFs |
| **Impact** | PII/financial data exposure across all bookings |
| **Current protection** | `requireProfile()` only — any ACTIVE user |
| **Recommended mitigation** | Role-based access: ACCOUNTS/ADMIN for all; EXECUTIVE only own-created bookings; or enforce booking-level policy server-side |

---

### SEC-003 — IDOR: KYC Document Access

| Field | Detail |
|-------|--------|
| **Severity** | **HIGH** |
| **Risk** | PAN/Aadhaar document images/PDFs |
| **Affected code** | `app/api/bookings/[id]/documents/[docId]/route.ts`, `getBookingDocuments()` in `document-actions.ts` |
| **Attack scenario** | Authenticated user requests signed URL for arbitrary `bookingId` + `docId` |
| **Impact** | Identity document exposure |
| **Current protection** | `requireProfile()` on API; RLS on `booking_documents` allows uploader OR ADMIN/EXECUTIVE — but API uses service client |
| **Recommended mitigation** | Verify caller role/ownership before generating signed URL; use user-scoped Supabase client where possible |

---

### SEC-004 — Destructive Data Wipe via Login

| Field | Detail |
|-------|--------|
| **Severity** | **HIGH** |
| **Risk** | All bookings + admin audit log + system console wiped |
| **Affected code** | `app/(auth)/login/login-content.tsx`, `app/api/destruct/route.ts`, `admin/destruct-actions.ts` |
| **Attack scenario** | (A) Login with email in `NEXT_PUBLIC_DESTRUCT_EMAIL` or password matching `NEXT_PUBLIC_SYSTEM_CONSOLE_KILL_PHRASE` → POST `/api/destruct`. (B) Admin uses `/admin/destruct` with `DESTRUCT_PASSWORD` |
| **Impact** | Irrecoverable data loss (unless Supabase backups) |
| **Current protection** | Email allowlist for API; ADMIN + password for server action; kill phrase in **NEXT_PUBLIC_** env (exposed to browser bundle) |
| **Recommended mitigation** | Remove `NEXT_PUBLIC_*` destruct triggers; require ADMIN + re-auth + typed confirmation; never expose kill phrase client-side; audit log before wipe |

---

### SEC-005 — Service Role Bypasses All RLS

| Field | Detail |
|-------|--------|
| **Severity** | **HIGH** (architectural) |
| **Risk** | Application-layer auth is the only gate |
| **Affected code** | `lib/supabase/server.ts` → `createServiceClient()` used in ~all server actions |
| **Attack scenario** | Any server action/API missing `requireRole` check grants full DB access |
| **Impact** | Privilege escalation, data exfiltration, unauthorized writes |
| **Current protection** | Per-function `requireProfile` / `requireRole` (inconsistent) |
| **Recommended mitigation** | Defense in depth: use anon/authenticated client + RLS for reads; reserve service role for admin-only ops; audit all `'use server'` exports |

Known gaps (pre-refactor; both since fixed — `getPaymentSlabs()` requires staff, console/destruct code removed):
- `getPaymentSlabs()` — **no auth**
- `_performConsolePurge()` — exported, no auth (called from authenticated destruct API)

---

### SEC-006 — Proxy Checks Cookie Presence, Not Session Validity

| Field | Detail |
|-------|--------|
| **Severity** | **MEDIUM** |
| **Risk** | Stale/forged cookie names may pass proxy; real protection is per-page |
| **Affected code** | `proxy.ts` (Next.js 16 proxy convention) |
| **Attack scenario** | Set `sb-{ref}-auth-token` cookie manually → access protected routes until page-level `getUser()` fails |
| **Impact** | Limited — server components still call Supabase `getUser()` |
| **Current protection** | Page-level `requireProfile()` validates session |
| **Recommended mitigation** | Use Supabase session refresh in proxy (`@supabase/ssr` `updateSession` pattern) or accept cookie-check as UX-only gate |

Note: the unused `lib/supabase/middleware.ts` has been deleted; the cookie check is accepted as a UX-only gate.

---

### SEC-007 — No Server-Side Input Validation on Booking Submit

| Field | Detail |
|-------|--------|
| **Severity** | **MEDIUM** |
| **Risk** | Malformed, incomplete, or manipulated booking data persisted |
| **Affected code** | `new-booking/actions.ts` (`submitBooking`, `saveDraft`), `edit/actions.ts` |
| **Attack scenario** | Call server action directly with crafted payload bypassing client Zod |
| **Impact** | Data integrity issues; possible business rule violations |
| **Current protection** | Client-side Zod only (`lib/validations/booking.ts`) |
| **Recommended mitigation** | `bookingSchema.safeParse()` on server; reject invalid payloads |

---

### SEC-008 — Unit Availability Fails Open

| Field | Detail |
|-------|--------|
| **Severity** | **MEDIUM** |
| **Risk** | Double-booking same unit |
| **Affected code** | `checkUnitAvailability()` in `new-booking/actions.ts` |
| **Attack scenario** | DB error during check → returns `{ available: true }` |
| **Impact** | Two active bookings for same unit — business/legal risk |
| **Current protection** | Application check only; no DB UNIQUE on `(project_name, unit_no)` |
| **Recommended mitigation** | Fail closed on errors; partial unique index excluding DRAFT/deleted |

---

### SEC-009 — Nav vs Server Role Mismatch

| Field | Detail |
|-------|--------|
| **Severity** | **MEDIUM** |
| **Risk** | Users access features via direct URL that nav hides |
| **Affected code** | `dashboard-layout.tsx` vs page `requireRole` |
| **Examples** | `/new-booking` nav ADMIN-only but page allows EXECUTIVE/ACCOUNTS; `/lookup` hidden from ACCOUNTS but page allows any active user |
| **Impact** | Confusing access model; accidental over-permission |
| **Recommended mitigation** | Align nav and server enforcement |

---

### SEC-010 — Edit Page vs Update Action Role Mismatch

| Field | Detail |
|-------|--------|
| **Severity** | **MEDIUM** |
| **Risk** | EXECUTIVE can open edit UI but `updateBooking` requires ADMIN |
| **Affected code** | `bookings/[id]/edit/page.tsx`, `edit/actions.ts` |
| **Impact** | Broken UX; suggests incomplete authorization design |
| **Recommended mitigation** | Align page gate with action gate |

---

### SEC-011 — Delete/Revert Buttons Shown to Non-Admins

| Field | Detail |
|-------|--------|
| **Severity** | **LOW** |
| **Risk** | UI shows actions that server rejects |
| **Affected code** | `bookings/[id]/page.tsx`, `delete-button.tsx`, `revert-to-draft-button.tsx` |
| **Impact** | Error toast, no data change — but poor security UX |
| **Recommended mitigation** | Gate buttons on `profile.role === 'ADMIN'` |

---

### SEC-012 — RLS: All Active Users Can SELECT All Bookings

| Field | Detail |
|-------|--------|
| **Severity** | **MEDIUM** (by design for internal tool?) |
| **Risk** | Any staff sees all customer PII if using anon client |
| **Affected code** | `supabase/schema.sql` — `"Active users can view bookings"` |
| **Impact** | No row-level isolation between sales staff |
| **Current protection** | Intentional for internal lookup; server uses service role anyway |
| **Recommended mitigation** | If EXECUTIVE should see subset only, tighten RLS + server queries |

---

### SEC-013 — Storage: Authenticated Users Can Read All Booking Files Bucket

| Field | Detail |
|-------|--------|
| **Severity** | **MEDIUM** |
| **Risk** | Direct Supabase storage access from client if paths known |
| **Affected code** | Storage policies in schema/migrations |
| **Impact** | Depends on whether client-side storage API is used |
| **Current protection** | App uses signed URLs from server |
| **Recommended mitigation** | Restrict storage SELECT to path prefix matching user role |

---

### SEC-014 — System Console Passphrase Compared Server-Side in Plaintext

**Status: RESOLVED — the System Console was removed entirely.**

---

### SEC-015 — PDF Generation Logs PII to Server Console

| Field | Detail |
|-------|--------|
| **Severity** | **LOW** |
| **Risk** | Log aggregation may capture customer names, amounts |
| **Affected code** | `lib/pdf/generator.ts` — `console.log` with booking fields |
| **Impact** | Log leakage in Vercel/hosting logs |
| **Recommended mitigation** | Remove or redact production logs |

---

### SEC-016 — Email/WhatsApp Dispatch Signed URLs (7 Days)

**Status: RESOLVED — email, WhatsApp and the dispatch workflow were removed; staff download PDFs directly.**

---

### SEC-017 — Session Tab Guard (`lubc_tab`) Is Client-Only

| Field | Detail |
|-------|--------|
| **Severity** | **INFORMATIONAL** |
| **Risk** | Not a security boundary — bypassed by omitting check |
| **Affected code** | `dashboard-layout.tsx`, `login-content.tsx` |
| **Impact** | UX feature to sign out duplicate tabs, not auth |
| **Recommended mitigation** | Document as UX only |

---

### SEC-018 — Secrets in Repository History / Root PDFs

| Field | Detail |
|-------|--------|
| **Severity** | **INFORMATIONAL** |
| **Risk** | Root repo contains sample PDFs; git history mentions env fixes |
| **Affected code** | `/ProjectDesk/*.pdf`, git log |
| **Impact** | May contain sample customer data |
| **Recommended mitigation** | Ensure no real PII in committed artifacts |

---

## Authentication vs Authorization Matrix

| Question | Answer |
|----------|--------|
| If I know another booking's ID, can I retrieve it? | **YES** — any active user via detail page, PDF API, documents API |
| Can I edit another user's booking via crafted request? | **Partially** — draft edit scoped to `created_by`; ADMIN can edit any; EXECUTIVE edit page exists but save requires ADMIN |
| Can ordinary users invoke admin server actions? | **NO** — if `requireRole(['ADMIN'])` present; **YES** for unprotected actions (`getPaymentSlabs`) |
| Are permissions enforced server-side? | **Mostly YES** — but inconsistent; RLS not relied upon for server actions |
| Are RLS policies sufficient? | **NO** — service role bypasses RLS; RLS matters only for direct client Supabase calls |
| Could client expose sensitive config? | **YES** — `NEXT_PUBLIC_DESTRUCT_EMAIL`, `NEXT_PUBLIC_SYSTEM_CONSOLE_KILL_PHRASE` |
| Could logs expose PII? | **YES** — PDF generator console.log |
| Are destructive actions protected? | **Partially** — multiple paths with different auth models |

---

## Immediate Actions (Before Production / Interview)

1. **Disable or delete** `/api/bootstrap-admin` in production
2. **Remove** `NEXT_PUBLIC_*` destruct/kill phrase variables from client bundle
3. **Add booking-level authorization** to PDF and document API routes
4. **Add auth** to `getPaymentSlabs()`
5. **Server-side Zod validation** on submit/update
6. **Fail closed** on unit availability errors

---

## Privacy Classification

| Data class | Examples | Storage | Who needs access |
|------------|----------|---------|------------------|
| Employee | profiles (name, email, role) | `profiles` | ADMIN for management; self for own profile |
| Customer PII | name, mobile, PAN, Aadhaar, address | `bookings`, `booking_documents` | Sales/accounts staff involved in booking |
| Financial | total_cost, booking_amount_paid, slab payments | `bookings`, `booking_payment_slabs` | EXECUTIVE, ADMIN |
| Credentials | Supabase auth, service role key | env vars | Server only |

**Least privilege gap:** EXECUTIVE role can download all PDFs and view all bookings — verify this matches business need.
