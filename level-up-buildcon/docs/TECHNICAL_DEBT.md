# ProjectDesk — Technical Debt Register

**Last updated:** October 4, 2026

Each item: Problem → Files → Why it matters → Risk → Fix → Effort → Priority

---

## TD-001 — Unauthenticated Bootstrap Admin Endpoint

**Problem:** `GET /api/bootstrap-admin` creates admin with hardcoded password, no auth.  
**Affected files:** `app/api/bootstrap-admin/route.ts`  
**Why it matters:** Single HTTP request = full system compromise.  
**Risk:** CRITICAL security  
**Recommended fix:** Delete route or protect with deploy-time secret + remove from production.  
**Effort:** S  
**Priority:** P0

---

## TD-002 — IDOR on PDF and Document APIs

**Problem:** Any active user can access any booking's PDFs/KYC by UUID.  
**Affected files:** `app/api/bookings/[id]/download/route.ts`, `app/api/bookings/[id]/documents/[docId]/route.ts`, `document-actions.ts`  
**Why it matters:** PAN/Aadhaar and financial data exposure.  
**Risk:** HIGH security / privacy  
**Recommended fix:** Authorization check: role + ownership or ACCOUNTS/ADMIN-only.  
**Effort:** M  
**Priority:** P0

---

## TD-003 — Service Role Used for All Server Operations

**Problem:** `createServiceClient()` bypasses RLS everywhere; auth is app-layer only.  
**Affected files:** Most `actions.ts`, API routes, `lib/auth/get-user.ts`  
**Why it matters:** One missed `requireRole` = full DB access.  
**Risk:** HIGH security (architectural)  
**Recommended fix:** Use authenticated client for reads; service role for admin writes only.  
**Effort:** L  
**Priority:** P1

---

## TD-004 — No Server-Side Validation on Booking Submit

**Problem:** Zod schemas only on client; server trusts FormData.  
**Affected files:** `lib/validations/booking.ts`, `new-booking/actions.ts`, `edit/actions.ts`  
**Why it matters:** Data integrity, injection of invalid states.  
**Risk:** MEDIUM correctness  
**Recommended fix:** `bookingSchema.safeParse()` in server actions.  
**Effort:** S  
**Priority:** P0

---

## TD-005 — Unit Availability Fails Open

**Problem:** DB errors return `available: true`.  
**Affected files:** `new-booking/actions.ts` → `checkUnitAvailability`  
**Why it matters:** Double booking same flat.  
**Risk:** MEDIUM business correctness  
**Recommended fix:** Fail closed; DB unique constraint on active bookings per unit.  
**Effort:** M  
**Priority:** P0

---

## TD-006 — Schema Migration Sprawl and Conflicts

**Problem:** 18+ SQL files with conflicting serial formats, role enums, RLS policies.  
**Affected files:** `supabase/*.sql`  
**Why it matters:** Fresh deploy ambiguity; production drift.  
**Risk:** MEDIUM maintainability / correctness  
**Recommended fix:** Single canonical `schema.sql` reflecting production; archive old migrations.  
**Effort:** M  
**Priority:** P1

---

## TD-007 — Proxy Cookie-Only Auth Check

**Problem:** `proxy.ts` checks cookie name existence, not JWT validity.  
**Affected files:** `proxy.ts`, unused `lib/supabase/middleware.ts`  
**Why it matters:** Misleading security boundary; stale cookies.  
**Risk:** LOW (pages re-validate)  
**Recommended fix:** Integrate Supabase session refresh in proxy or document as UX gate only.  
**Effort:** S  
**Priority:** P2

---

## TD-008 — Nav vs Server Role Mismatch

**Problem:** Sidebar hides routes users can still access via URL.  
**Affected files:** `dashboard-layout.tsx`, various `page.tsx`  
**Why it matters:** Confusing permissions model.  
**Risk:** LOW security, MEDIUM UX  
**Recommended fix:** Align `roles` arrays with `requireRole` on each page.  
**Effort:** S  
**Priority:** P1

---

## TD-009 — Edit Page Allows EXECUTIVE, Action Requires ADMIN

**Problem:** `/bookings/[id]/edit` vs `updateBooking` role mismatch.  
**Affected files:** `edit/page.tsx`, `edit/actions.ts`  
**Why it matters:** Broken feature for EXECUTIVE role.  
**Risk:** LOW  
**Recommended fix:** Either allow EXECUTIVE to update or restrict page to ADMIN.  
**Effort:** S  
**Priority:** P1

---

## TD-010 — Delete/Revert UI Shown to Non-Admins

**Problem:** Buttons visible when server actions reject.  
**Affected files:** `bookings/[id]/page.tsx`, button components  
**Why it matters:** Poor security UX.  
**Risk:** LOW  
**Recommended fix:** Conditional render on ADMIN role.  
**Effort:** S  
**Priority:** P2

---

## TD-011 — Zero Automated Tests

**Problem:** No unit, integration, or e2e tests in repository.  
**Affected files:** N/A (missing `__tests__`, no test script beyond lint)  
**Why it matters:** Regressions in auth, payments, serial logic undetected.  
**Risk:** HIGH maintainability  
**Recommended fix:** P0 test pyramid (see ENGINEERING_HANDBOOK Testing Audit).  
**Effort:** L  
**Priority:** P1

---

## TD-012 — `getPaymentSlabs()` Missing Auth

**Problem:** Server action callable without authentication.  
**Affected files:** `accounts/payment-slab-actions.ts`  
**Why it matters:** Information disclosure; pattern violation.  
**Risk:** LOW  
**Recommended fix:** Add `requireRole(['ACCOUNTS', 'ADMIN'])`.  
**Effort:** S  
**Priority:** P0

---

## TD-013 — Destruct Triggers in NEXT_PUBLIC Env Vars

**Problem:** Kill phrase and destruct email exposed to browser bundle.  
**Affected files:** `login-content.tsx`, `.env` usage  
**Why it matters:** Secrets visible in client JS.  
**Risk:** HIGH  
**Recommended fix:** Server-only env vars; remove client-side destruct trigger.  
**Effort:** S  
**Priority:** P0

---

## TD-014 — Accounts Page Dead Code

**Problem:** `getBookingsForDispatch()` fetched but unused; `pendingDispatches` hardcoded `[]`.  
**Affected files:** `accounts/page.tsx`, dispatch clients  
**Why it matters:** Dispatch workflow incomplete in UI.  
**Risk:** LOW  
**Recommended fix:** Wire pending dispatches or remove fetch.  
**Effort:** S  
**Priority:** P2

---

## TD-015 — PDF Generator console.log PII

**Problem:** Booking details logged during PDF generation.  
**Affected files:** `lib/pdf/generator.ts`  
**Why it matters:** Vercel log leakage.  
**Risk:** LOW privacy  
**Recommended fix:** Remove debug logs in production.  
**Effort:** S  
**Priority:** P2

---

## TD-016 — Duplicate PDF Libraries (jsPDF + pdfkit)

**Problem:** Both in package.json; generator uses jsPDF only.  
**Affected files:** `package.json`, `lib/pdf/generator.ts`, `test-pdfkit.js`  
**Why it matters:** Bundle size, confusion.  
**Risk:** LOW  
**Recommended fix:** Remove unused pdfkit if confirmed unused.  
**Effort:** S  
**Priority:** P3

---

## TD-017 — Lockdown Feature Half-Removed

**Problem:** Commented code in lockdown.ts, lockdown-config.ts, get-user.ts, locked page.  
**Affected files:** `lib/auth/lockdown*.ts`, `locked/`  
**Why it matters:** Dead code confusion.  
**Risk:** LOW maintainability  
**Recommended fix:** Delete or finish feature.  
**Effort:** S  
**Priority:** P3

---

## TD-018 — Signup Page Disabled but Route Exists

**Problem:** `/signup` redirects to login; self-signup policy in DB unused from UI.  
**Affected files:** `app/(auth)/signup/page.tsx`, `settings.allow_self_signup`  
**Why it matters:** Dead route; admin creates users instead.  
**Risk:** LOW  
**Recommended fix:** Remove route or implement controlled signup.  
**Effort:** S  
**Priority:** P3

---

## TD-019 — No Database Constraint on Unit Uniqueness

**Problem:** Double booking prevented only by app check.  
**Affected files:** DB schema, `checkUnitAvailability`  
**Why it matters:** Race conditions under concurrent submit.  
**Risk:** MEDIUM correctness  
**Recommended fix:** Partial unique index: `(project_name, unit_no) WHERE status NOT IN ('DRAFT') AND deleted_at IS NULL`.  
**Effort:** M  
**Priority:** P1

---

## TD-020 — Floating-Point Currency Arithmetic

**Problem:** JS `Number` for rupee calculations; DB uses NUMERIC.  
**Affected files:** `step-3-pricing-payment.tsx`, `payment-slab-actions.ts`, dashboard aggregations  
**Why it matters:** Rounding drift (mitigated by no rounding policy currently).  
**Risk:** LOW at current scale  
**Recommended fix:** Use decimal library or integer paise; align client/server formulas.  
**Effort:** M  
**Priority:** P2

---

## Improvement Roadmap Cross-Reference

| Phase | Debt items |
|-------|------------|
| Phase 1 — Secure | TD-001, TD-002, TD-004, TD-005, TD-012, TD-013 |
| Phase 2 — Clean Architecture | TD-003, TD-006, TD-008, TD-009, TD-017 |
| Phase 3 — Testing | TD-011 |
| Phase 4 — Reliability | TD-019, TD-020, TD-005 |
| Phase 5 — Polish | TD-014, TD-015, TD-016, TD-018 |
