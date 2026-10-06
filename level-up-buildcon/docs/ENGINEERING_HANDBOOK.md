# ProjectDesk — Engineering Handbook

**Version:** Post security-refactor — October 2026  
**Repository:** `/ProjectDesk/level-up-buildcon/`  
**Pre-refactor snapshot:** git branch `archive/pre-security-refactor`  
**Refactor changelog:** [SECURITY_REFACTOR.md](./SECURITY_REFACTOR.md)

This handbook documents the **current state** of ProjectDesk as verified against source code. Sections labeled **RECOMMENDED** describe future improvements, not existing behavior.

**Related documents:**
- [CODEBASE_MAP.md](./CODEBASE_MAP.md)
- [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)
- [PERFORMANCE_AND_COMPLEXITY.md](./PERFORMANCE_AND_COMPLEXITY.md)
- [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md)
- [ENGINEERING_DECISIONS.md](./ENGINEERING_DECISIONS.md)
- [INTERVIEW_GUIDE.md](./INTERVIEW_GUIDE.md)

---

# Part 1 — What ProjectDesk Is

## Plain-English Description

**ProjectDesk** (package name: `level-up-buildcon`) is an **internal web application** for **Level Up Buildcon** to manage property **bookings** for the **Anandam** residential/commercial project in Ranchi, Jharkhand.

### Who uses it

| Role | Typical user |
|------|--------------|
| **EXECUTIVE** | Sales staff — create/edit bookings, lookup, tower view, PDFs, payment slab tracking |
| **ADMIN** | System administrators — everything executives can do, plus approve/reject bookings, delete/restore, user management, admin settings |

Users are internal staff only. There is no customer-facing portal.

### Business problem solved

- Replace manual/spreadsheet booking tracking with a centralized system
- Track unit availability across a multi-floor tower
- Generate standardized booking confirmation PDFs (company + customer copies)
- Split revenue attribution between **Level Up Buildcon** (developer) and **Balaji Hospitality** (landowner) by flat number
- Track construction-linked payment slabs
- Admin approval workflow before bookings receive official serial numbers

### Primary workflows

1. **Login** → dashboard overview
2. **Create booking** (4-step wizard) → save draft → submit → (if non-admin) **PENDING** → admin **approve** → **SUBMITTED** + serial (`LUBC 01`, etc.)
3. **Lookup** unit in tower grid or search by name/mobile/serial
4. **Download PDFs** per booking or bulk
5. **Payments** — view financials, record slab payments (EXECUTIVE + ADMIN)
6. **Admin** — manage users, settings (ADMIN only)

### Information managed

- Employee profiles (role, status)
- Booking records (project, unit, applicant PII, pricing, payment plan, parking)
- KYC documents (PAN, Aadhaar uploads)
- Payment slab progress per booking
- Audit logs (booking changes, admin actions)
- System settings (serial prefix, signup policy)

### What it does NOT do (verified)

- No customer self-service booking portal
- No online payment processing / payment gateway
- No automated RERA compliance workflow beyond PDF declaration text
- No multi-project generalization (Anandam-centric flat maps hardcoded)
- No real-time collaboration / websockets
- No customer signup UI (disabled; admins create users)
- No outbound messaging: no email, SMS, or WhatsApp (only Supabase Auth's own password-reset email, triggered by an admin)
- No document dispatch workflow or stored PDFs — PDFs are generated on demand and downloaded by staff

### Important engineering challenges (current)

1. **Authorization** — centralized in `lib/auth/permissions.ts`; service role used only by Admin → Create User (Auth Admin API)
2. **PII/financial data protection** — PDF/document APIs require staff auth + resource checks
3. **Data integrity** — fail-closed availability + partial unique index on active unit holds
4. **Auditability** — booking_audit_log and admin_audit_log; no emergency wipe paths
5. **Schema baseline** — use `supabase/schema.sql` for fresh installs; legacy migration files are historical only

---

# Part 2 — Tech Stack

See [ENGINEERING_DECISIONS.md](./ENGINEERING_DECISIONS.md) for rationale.

| Technology | Version | Where used | Keep? |
|------------|---------|------------|-------|
| **Next.js** | 16.1.6 | App Router, RSC, API routes, proxy | Yes |
| **React** | 19.2.3 | UI | Yes |
| **TypeScript** | ^5 | Entire app | Yes |
| **Supabase** | @supabase/supabase-js ^2.99, @supabase/ssr ^0.9 | Auth, PostgreSQL, Storage | Yes |
| **PostgreSQL** | via Supabase | All persistent data | Yes |
| **Tailwind CSS** | ^4 | Styling | Yes |
| **shadcn/ui + Radix** | various | UI components | Yes |
| **Zod** | ^4.3 | Client form validation only | Yes — extend to server |
| **react-hook-form** | ^7.71 | Wizard forms | Yes |
| **jsPDF** | ^4.1 | PDF generation | Yes |
| **pdfkit** | ^0.17 | test scripts only | Review — likely remove |
| **archiver** | ^7 | ZIP for PDF downloads | Yes |
| **zustand** | ^5 | Client state (wizard) | Yes |
| **date-fns** | ^4.1 | Date formatting | Yes |
| **framer-motion** | ^12 | UI animations | Yes |
| **Vercel** | typical deploy | Hosting (README) | Yes |

## Architecture Diagram (Actual)

```
Internal Staff (Browser)
        │
        ▼
┌───────────────────────────────────────┐
│  React UI (Client + Server Components)│
│  dashboard-layout, wizard, tables     │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  Next.js 16 App Router                │
│  • proxy.ts (cookie check redirect)   │
│  • Server Actions ('use server')      │
│  • API Routes (/api/*)                │
└───────────────────────────────────────┘
        │
        ├──► requireProfile / requireRole (lib/auth/get-user.ts)
        │
        ▼
┌───────────────────────────────────────┐
│  Business Logic                       │
│  • Booking lifecycle                  │
│  • Payment slab tracking              │
│  • PDF generation (jsPDF)             │
│  • Owner split (static flat map)      │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  Supabase                             │
│  • Auth (JWT sessions, cookies)       │
│  • PostgreSQL (RLS enforced; service  │
│    role only for Auth user creation)  │
│  • Storage (booking-documents: KYC)   │
└───────────────────────────────────────┘

No other external services.
```

---

# Part 3 — Screen-by-Screen Documentation

## `/login`
- **Purpose:** Staff authentication
- **User:** Public
- **UI:** Email/password form, logo, forgot password link
- **Code:** `app/(auth)/login/login-content.tsx`
- **Data:** Supabase Auth session; updates `profiles.last_login`
- **Actions:** Sign in; sets `sessionStorage.lubc_tab` for tab-guard UX
- **Backend flow:** Client → `signInWithPassword` → redirect to dashboard
- **Security:** Supabase Auth only; no destructive login triggers
- **Failure modes:** Invalid credentials → toast

## `/dashboard`
- **Purpose:** Executive overview — stats, owner split, parking, tower, recent bookings
- **User:** Any ACTIVE user (`requireProfile`)
- **Code:** `dashboard/page.tsx`, `tower-view.tsx`, `recent-bookings.tsx`
- **Data:** Booking counts, amounts, 10 recent bookings, tower allocations, parking totals
- **Actions:** Navigate to booking detail; tower cell → new booking or detail
- **Backend flow:** RSC → multiple Supabase queries via authenticated client (RLS) → render
- **Security:** All active users see aggregate stats including owner split
- **Failure modes:** Missing env → throw on createClient
- **Improvements:** SQL aggregates instead of full-table scan

## `/bookings`
- **Purpose:** Searchable registry of non-draft bookings
- **User:** Any ACTIVE user
- **Code:** `bookings/page.tsx`, `bookings-table.tsx`
- **Data:** Filtered bookings + creator profile; filter dropdown data
- **Actions:** Filter via URL params; row click → detail
- **Security:** All staff see all bookings — intentional for internal lookup?
- **Improvements:** Pagination at scale

## `/bookings/[id]`
- **Purpose:** Full booking detail
- **User:** Any ACTIVE user
- **Code:** `bookings/[id]/page.tsx` + action buttons
- **Data:** Booking, creator, audit log, documents
- **Actions:** Download PDFs, approve/reject (ADMIN+PENDING), edit, delete, revert
- **Security:** Approve/reject/delete buttons shown only to ADMIN; server enforces via `lib/auth/permissions.ts`

## `/bookings/[id]/edit`
- **Purpose:** Edit submitted booking fields
- **User:** EXECUTIVE + ADMIN (page and save); executives cannot edit another user's PENDING booking
- **Code:** `edit/page.tsx`, `booking-edit-form.tsx`, `edit/actions.ts`

## `/bookings/deleted`
- **Purpose:** Soft-deleted booking recovery
- **User:** ADMIN only

## `/new-booking`
- **Purpose:** 4-step wizard: project/unit → applicant → pricing → review
- **User:** EXECUTIVE + ADMIN
- **Code:** `booking-wizard.tsx`, step components, `actions.ts`, `document-actions.ts`
- **Data:** Drafts, parking availability, flat areas from static map
- **Actions:** Save draft, submit, upload KYC, check unit availability
- **Backend flow:** Step UI → saveDraft/submitBooking → authenticated client (RLS) → bookings + audit
- **Security:** Ownership on drafts; unit check fail-closed; DB unique index on active holds
- **Calculations:** `total_cost = rate_per_sqft × super_builtup_area`; `gst = booking_amount_paid × 0.05`

## `/lookup`
- **Purpose:** Quick search + tower grid
- **User:** Any ACTIVE user (nav: EXECUTIVE, ADMIN)

## `/downloads`
- **Purpose:** Bulk PDF download links
- **User:** Any ACTIVE user
- **Code:** Links to `/api/bookings/bulk-download?kind=...`

## `/accounts` (nav: Payments)
- **Purpose:** Booking financials + payment slab tracking (record received amounts)
- **User:** EXECUTIVE + ADMIN
- **Code:** `accounts/page.tsx`, `payment-schedule-client.tsx`, `payment-slab-actions.ts`

## `/admin`
- **Purpose:** Users, settings
- **User:** ADMIN only
- **Code:** `admin/page.tsx`, `actions.ts`, `users-table.tsx`, `settings-form.tsx`

## `/forgot-password`
- **Purpose:** Informational — tells users to ask an admin, who sends a Supabase Auth reset link from User Management
- **User:** Public

---

**Removed (Oct 2026 refactor):** `/admin/destruct`, `/api/destruct`, `/api/bootstrap-admin`, lockdown, ACCOUNTS role; later, email/WhatsApp messaging, the dispatch workflow, the Admin System Console, and `/api/forgot-password`. See [SECURITY_REFACTOR.md](./SECURITY_REFACTOR.md).

---

# Part 4 — Feature Inventory

| Feature | User sees | System does internally |
|---------|-----------|------------------------|
| Login | Email/password form | Supabase Auth; profile last_login |
| Logout | Sign out menu | Clear session + sessionStorage |
| Tab guard | Auto logout if no sessionStorage flag | Client-only UX check |
| Dashboard stats | Cards: bookings, amount, users, parking | COUNT/SUM queries; owner split via flat-ownership Set |
| Tower view | Color-coded grid by floor | Query Anandam bookings; static floor/unit layout |
| New booking wizard | 4 steps with validation | Draft INSERT/UPDATE; submit sets PENDING or SUBMITTED |
| Unit availability | Toast if unit taken | SELECT bookings by project+unit; fail-closed on error; DB unique index |
| Booking approval | Approve/Reject buttons | ADMIN updates status; trigger assigns serial on SUBMITTED |
| Serial numbers | `LUBC 01` display | PostgreSQL trigger MAX+1 + settings prefix |
| Soft delete | Booking disappears from list | Sets deleted_at; clears serial |
| Restore | Booking reappears | Clears deleted_at; new serial on re-submit |
| PDF download | ZIP with 2 PDFs | jsPDF generates company + customer; archiver zips |
| Bulk PDF | Download all | Loop all bookings — O(n) PDF gen |
| KYC upload | File picker per doc type | Storage upload + booking_documents row |
| Payment slabs | Slab list with stats | JOIN bookings × payment_slabs × booking_payment_slabs |
| Record slab payment | Form per booking/slab | Upsert booking_payment_slabs; amount_due = total × % |
| User management | Table of users | ADMIN CRUD on profiles (RLS); `createUser` uses Supabase Auth admin API |
| Password reset | Admin "Send password reset" | Supabase Auth `resetPasswordForEmail` → `/reset-password` |
| Settings | Serial prefix, default location | UPDATE settings table |
| Forgot password | Info page | Directs user to an admin; no backend call |
| Owner split | Dashboard developer/landowner totals | Static LANDOWNER_FLATS Set lookup O(1) |
| Parking tracking | Available/booked counts | Sum additional_parking (max 27) and premium (max 9) |

---

# Part 5 — Data Model

## Entity Relationship (Effective Schema)

```
auth.users
    │
    │ 1:1
    ▼
profiles ─────────────────────────────────────────┐
    │                                            │
    │ creates                                    │ admin_id / target_user_id
    ▼                                            ▼
bookings ◄────────────────────────────── admin_audit_log
    │
    ├──► booking_documents (KYC)
    ├──► booking_payment_slabs ──► payment_slabs (reference, 14 rows)
    └──► booking_audit_log

settings (singleton config)
```

## Core Tables Summary

Full column detail in subagent database report and `supabase/schema.sql` + migrations.

### `profiles`
- **Purpose:** Staff user metadata linked to Supabase Auth
- **Sensitive:** email, role, status
- **Read:** own profile; ADMIN all
- **Write:** own limited; ADMIN all

### `bookings`
- **Purpose:** Central booking record (draft through submitted)
- **Sensitive:** applicant PII, PAN, Aadhaar, financial amounts
- **Read:** all active users (RLS + app)
- **Write:** creator for drafts; ADMIN/EXECUTIVE per RLS + `enforce_booking_write_rules` trigger

### `booking_payment_slabs`
- **Purpose:** Per-booking construction-linked payment progress
- **Invariant (app):** `amount_due = total_cost × slab.percentage / 100`
- **Write:** EXECUTIVE, ADMIN (no deletes)

### `payment_slabs`
- **Purpose:** Reference table — 14 construction milestones totaling 100%

## Normalization Decisions

- **Normalized:** Payment slabs separated from bookings (many-to-many via junction)
- **Denormalized:** Owner type derived from static code map, not DB column
- **Denormalized:** Flat areas in TypeScript, not DB
- **Denormalized:** `serial_display` stored alongside `serial_no`

## Database Problems / Risks (CURRENT STATE)

| Issue | Severity |
|-------|----------|
| ~~No UNIQUE on active unit holds~~ | **FIXED** — `idx_bookings_active_unit_unique` in `schema.sql` |
| Legacy migration files vs canonical schema | Use `supabase/schema.sql` for fresh installs |
| Conflicting serial number migrations | MEDIUM |
| MAX(serial_no)+1 trigger — O(n) scan | LOW at scale |
| Nullable booking fields after consolidated migration | LOW — allows incomplete submits |
| admin_audit_log insert policy `WITH CHECK (true)` in consolidated | LOW |

---

# Part 6 — Security

Full audit: [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)

**Post-refactor (Oct 2026):** Bootstrap/destruct removed; IDOR fixed on PDF/document routes; permissions centralized in `lib/auth/permissions.ts`. Remaining items in [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md).

---

# Part 7 — Privacy Analysis

| Class | Fields | Enters via | Stored | Could leak via |
|-------|--------|------------|--------|----------------|
| Employee | name, email, role | Admin create / Auth | profiles | Admin UI |
| Customer | name, mobile, PAN, Aadhaar, address | Booking wizard | bookings, booking_documents | PDF API IDOR, logs |
| Financial | total_cost, payments | Wizard, accounts | bookings, booking_payment_slabs | All-bookings list, PDFs |
| Secrets | service role key | env | Vercel/host only | Misconfigured NEXT_PUBLIC |

**Least privilege gap:** EXECUTIVE can download all PDFs with full PII — confirm business requirement.

---

# Part 8 — Data Integrity

## Business Invariants (from code)

| Invariant | Enforced where | Gap |
|-----------|----------------|-----|
| Unit not double-booked | `checkUnitAvailability` + `idx_bookings_active_unit_unique` | Fail-closed app check; DB enforces active holds |
| PENDING → SUBMITTED only by admin approve | `approveBooking` | OK server-side |
| Serial on SUBMITTED only | DB trigger | OK |
| Serial cleared on soft delete | `deleteBooking` | OK |
| Slab amount_due = total × percentage | `setSlabPayment` | Recalculated on write; not verified on read |
| Parking max 27 additional, 9 premium | `submitBooking` clamp | Client + server clamp |
| total_cost = rate × area | Client useEffect + `lib/booking/calculations.ts` on submit | Server validates/recalculates on submit |
| GST = 5% of booking_amount_paid | Client useEffect + server calculations | Server validates on submit |
| Owner split totals | Dashboard reduce | Display only; not financial ledger |

## Currency / Rounding

- DB: `NUMERIC(12,2)` — correct choice
- JS: `Number` floating point — comment in step-3 says "no rounding"
- **Risk:** Minor drift between client display and stored values at many decimal places

## Concurrency

- No optimistic locking on booking edits — last write wins
- No transactions wrapping submit + audit log (partial failure possible)

## Idempotency

- Double-click submit can create duplicate if no draftId — mitigated by wizard flow
- No idempotency keys on server actions

---

# Part 9 — Function-Level Documentation (Key Functions)

## `requireProfile()` — `lib/auth/get-user.ts`
- **Purpose:** Gate server pages/actions to active users
- **Input:** none (reads cookies)
- **Output:** Profile or redirect to /login
- **Algorithm:** getUser → authenticated client fetches own profile (RLS) → status check
- **Complexity:** O(1) DB + O(1) auth

## `submitBooking(data, draftId?)` — `new-booking/actions.ts`
- **Purpose:** Finalize booking from wizard
- **Input:** BookingFormData, optional draft UUID
- **Output:** `{ success, bookingId }`
- **Flow:**
  1. requireProfile
  2. checkUnitAvailability (if project+unit set)
  3. Build bookingData object with toNum normalization
  4. status = ADMIN ? SUBMITTED : PENDING
  5. UPDATE draft or INSERT
  6. INSERT audit log
  7. revalidatePath
- **Edge cases:** Draft missing → fallback INSERT; unit check fail-open
- **Security:** No server Zod; ownership on draft update via created_by

## `checkUnitAvailability(project, unit, excludeId?)`
- **Purpose:** Prevent double booking
- **Query:** bookings WHERE project AND unit AND status != DRAFT AND deleted_at IS NULL
- **Complexity:** O(k) where k = matches (expect 0 or 1)
- **Fail-open:** Returns available:true on any error — **documented risk**

## `approveBooking(bookingId)`
- **Purpose:** PENDING → SUBMITTED; triggers serial assignment
- **Auth:** ADMIN only
- **DB:** UPDATE status; INSERT audit APPROVED

## `generate_serial_number()` — PostgreSQL trigger
- **Purpose:** Assign serial_no, serial_display, submitted_at
- **When:** INSERT/UPDATE where status=SUBMITTED and serial_no IS NULL
- **Algorithm:** MAX(serial_no)+1 over non-deleted SUBMITTED/EDITED; prefix from settings
- **Complexity:** O(n) scan on serial_no
- **Race:** Two concurrent SUBMITTED could collide on serial_no UNIQUE — transaction isolation dependent

## `generateCompanyPDF` / `generateCustomerPDF` — `lib/pdf/generator.ts`
- **Purpose:** Create A4 PDF buffers
- **Input:** Booking (+ optional creator)
- **Output:** Promise<Buffer>
- **Algorithm:** jsPDF programmatic layout; page break if yPos exceeds page height
- **Complexity:** O(p) pages/sections — constant ~2 pages per PDF
- **Security:** Embeds full PII including PAN/Aadhaar in company PDF

## `getOwnerTypeForFlat(unitNo)` — `lib/data/flat-ownership.ts`
- **Purpose:** Classify flat as DEVELOPER or LANDOWNER revenue
- **Algorithm:** Set.has(unitNo) — O(1)
- **Business rule:** ~40 flats hardcoded as landowner

## `setSlabPayment(bookingId, slabId, amountReceived, ...)`
- **Purpose:** Record payment against construction slab
- **Algorithm:** amount_due = total_cost × percentage / 100; upsert junction row
- **Complexity:** O(1) DB ops

---

# Part 10 — Workflow Sequence Diagrams

## LOGIN

```
User → Login Form
  → supabase.auth.signInWithPassword
  → UPDATE profiles.last_login
  → sessionStorage.lubc_tab = 1
  → redirect /dashboard
```

## CREATE BOOKING

```
User → Booking Wizard (4 steps)
  → saveDraft (optional, multiple times)
  → submitBooking
      → requireProfile
      → checkUnitAvailability
      → INSERT/UPDATE bookings (PENDING or SUBMITTED)
      → INSERT booking_audit_log
  → [if PENDING] Admin sees Approve button
  → approveBooking → status SUBMITTED
      → DB trigger generate_serial_number
  → serial_display shown
```

## GENERATE PDF

```
User → Download button
  → GET /api/bookings/[id]/download
      → requireProfile (any active user)
      → SELECT booking
      → generateCompanyPDF + generateCustomerPDF (parallel)
      → archiver ZIP
  → Browser download
```

## ADMIN ACTION (Approve User)

```
Admin → Users table → Approve
  → approveUser(userId)
      → requireRole ADMIN
      → UPDATE profiles status ACTIVE
      → INSERT admin_audit_log
```

---

# Part 11 — Error Handling & Failure Analysis

| Failure | Behavior | Assessment |
|---------|----------|------------|
| Supabase down | Pages throw / 500 | No graceful degradation |
| DB query fails in unit check | Returns available:true | **Bad** — fail open |
| Auth expires mid-session | requireProfile redirects login | OK |
| Authorization fails | redirect('/login') not 403 | Confusing |
| PDF generation fails | 500 JSON error | OK |
| Concurrent booking edit | Last write wins | No merge/conflict UI |
| Double submit | Possible duplicate without draftId | Partial risk |
| Missing env vars | throw Error with message | OK for server.ts |

---

# Part 12 — Testing Audit

## CURRENT STATE
- **Zero** automated tests (no `.test.ts`, no test script)
- Manual test scripts: `test-pdf-generator.js`, `test-pdfkit.js`

## Recommended Test Pyramid

### P0 — Must test
- `requireRole` / `requireProfile` on all server actions
- `submitBooking` status by role (ADMIN vs EXECUTIVE)
- `approveBooking` / `rejectBooking` state transitions
- `checkUnitAvailability` including fail-open behavior
- `setSlabPayment` amount_due calculation
- IDOR regression tests on PDF/document APIs
- Serial trigger behavior (integration with test DB)

### P1 — Should test
- Owner split classification for known flats
- Soft delete / restore serial behavior
- Zod schema server-side validation (once added)

### P2 — Nice to have
- PDF snapshot tests (layout smoke)
- E2E wizard flow with Playwright
- Bulk download timeout behavior

---

# Part 13 — System Design Principles

| Principle | Status | Notes |
|-----------|--------|-------|
| Separation of concerns | PARTIALLY | lib/ split good; actions mix auth+DB+logic |
| Single responsibility | PARTIALLY | Large PDF generator file |
| DRY | PARTIALLY | Duplicate PDF layout between company/customer |
| Least privilege | USES WELL | Service role only for Auth user creation; IDOR fixed |
| Defense in depth | USES WELL | App permission checks + RLS + guard triggers |
| Server/client boundaries | USES WELL | Secrets server-side (except NEXT_PUBLIC destruct) |
| Validation boundaries | VIOLATES | Client-only Zod |
| Database constraints | PARTIALLY | UNIQUE serial; missing unit uniqueness |
| Transactional integrity | VIOLATES | No explicit transactions on multi-step ops |
| Idempotency | NOT APPLICABLE / WEAK | No idempotency keys |
| Auditability | USES WELL | booking_audit_log; wiped by destruct |

---

# Part 14 — Improvement Roadmap

## Phase 1 — Understand and Secure (do first)
- Remove/protect bootstrap-admin
- Fix IDOR on PDF/documents
- Remove NEXT_PUBLIC destruct secrets
- Server-side Zod validation
- Auth on getPaymentSlabs
- Fail-closed unit availability

## Phase 2 — Clean Architecture
- Consolidate SQL schema
- Align nav/page/action roles
- Hybrid Supabase client strategy
- Remove dead code (lockdown, pdfkit)

## Phase 3 — Testing
- P0 tests from section 12

## Phase 4 — Reliability
- DB unique constraint on units
- Transactions for submit+audit
- Pagination on bookings list
- Dashboard SQL aggregates

## Phase 5 — Interview Polish
- This handbook + README update
- Demo script for booking flow
- Remove console.log PII from PDF generator

---

# Part 15 — Planned Source Code Comments

The following non-obvious areas received **WHY** comments in source (see git diff):

| File | Comment topic |
|------|---------------|
| `lib/auth/get-user.ts` | Auth gates and error types |
| `new-booking/actions.ts` | Fail-open unit check; role-based status |
| `lib/data/flat-ownership.ts` | Business rule for landowner flats |
| `proxy.ts` | Cookie check vs session validation |
| `payment-slab-actions.ts` | amount_due formula |

---

# Part 16 — Git History Notes (Debugging Stories)

| Commit | Story |
|--------|-------|
| `5e4cb83` | Removed @supabase/ssr from Edge middleware; deleted exposed set-env.ps1 |
| `739606f` | Renamed middleware → proxy for Next.js 16 |
| `89e0917` | Booking approvals, slab due calc, owner split, serial reset |
| `abb5459` | System console workbook added (since removed) |
| `4b1a15c` | Login kill user + parking save |
| `5839e04` | Lockdown feature disabled |

These explain auth/middleware churn — proxy is intentionally lightweight after Edge issues.

---

**End of Engineering Handbook.** For interview preparation see [INTERVIEW_GUIDE.md](./INTERVIEW_GUIDE.md).
