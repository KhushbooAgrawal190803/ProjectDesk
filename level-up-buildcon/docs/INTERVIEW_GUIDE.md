# ProjectDesk — Interview Guide

**Purpose:** Explain ProjectDesk confidently in a software engineering interview.

---

## 30-Second Explanation

> "ProjectDesk is an internal Next.js app I built for a real estate developer to manage Anandam property bookings. Staff create bookings through a wizard, admins approve them and assign serial numbers, accounts track construction-linked payments, and the system generates PDF confirmations. It uses Supabase for auth and PostgreSQL, with role-based access for executives, accounts, and admins."

---

## 2-Minute Explanation

> "The business problem is replacing spreadsheet-based booking tracking for an internal sales and accounts team. Executives submit bookings that go into a PENDING queue; admins approve to SUBMITTED status, which triggers a PostgreSQL function to assign serial numbers like LUBC 01.
>
> The stack is Next.js 16 App Router with Server Actions, TypeScript, Tailwind, and Supabase. Most server logic uses the Supabase service role with explicit requireRole checks — that's the main architectural tradeoff I can discuss in depth.
>
> Key features: a tower grid showing unit availability with owner split between developer and landowner, jsPDF-generated company and customer PDFs, payment slab tracking against 14 construction milestones, and an encrypted admin console for sensitive notes.
>
> The primary engineering challenge wasn't scale — it's maybe 25 internal users — it was **correct authorization and PII protection** for booking and payment data. The security audit found IDOR gaps on PDF APIs that I'd fix first."

---

## 5-Minute Architecture Walkthrough

1. **Browser** — React 19, shadcn UI, client forms with Zod + react-hook-form
2. **Next.js proxy** — cookie presence check (Next.js 16 renamed middleware)
3. **Server Components / Actions** — requireProfile/requireRole gates
4. **Service client** — bypasses RLS; all auth in application layer
5. **Supabase** — Auth JWT cookies, PostgreSQL with RLS (backup layer), Storage for KYC
6. **External** — optional SMTP (nodemailer), optional WhatsApp for dispatch

Draw the diagram from ENGINEERING_HANDBOOK Part 2.

---

## Primary Engineering Challenge

**Secure and correct management of internal booking/payment information with strong authorization and data isolation.**

NOT: "We designed for 10,000 concurrent users."

Supporting points:
- Service role pattern requires discipline on every action
- PII in PDFs and KYC documents
- Financial slab calculations must be correct
- Unit double-booking prevention
- Admin approval workflow integrity

---

## Three Strongest Components (Know Deeply)

### 1. Booking Lifecycle + Serial Number Trigger

**Why interesting:** Combines app state machine (DRAFT→PENDING→SUBMITTED→EDITED) with database trigger for atomic serial assignment.

**Files:** `new-booking/actions.ts`, `bookings/actions.ts`, `supabase/schema.sql` (generate_serial_number)

**Business logic:** Non-admin submit → PENDING; admin approve → SUBMITTED → trigger fires

**Security:** approveBooking ADMIN-only; serial only on SUBMITTED

**Interview questions:** Race on serial? What happens on soft delete? Why MAX+1 not sequence?

### 2. Owner Split via Static Flat Classification

**Why interesting:** Business rule encoded as O(1) Set lookup — pragmatic for single-tower project.

**Files:** `lib/data/flat-ownership.ts`, `dashboard/page.tsx`

**Algorithm:** `LANDOWNER_FLATS.has(unitNo) ? LANDOWNER : DEVELOPER`

**Tradeoff:** Code change needed for ownership updates vs DB column

### 3. Encrypted System Console

**Why interesting:** Client-side encryption with server storing only ciphertext; shared passphrase model.

**Files:** `system-console-client.tsx`, `system-console-actions.ts`, `migration-system-console.sql`

**Security:** RLS enabled, no policies — service role only; passphrase verified server-side

**Tradeoff:** Shared secret among admins; version field for wipe detection

---

## Difficult Technical Decisions

1. **Service role everywhere** — speed vs defense-in-depth
2. **Approval workflow** — admin bottleneck vs data quality
3. **jsPDF vs Puppeteer** — serverless compatibility vs layout ease
4. **Proxy cookie check** — Edge runtime issues led to simplified gate
5. **Fail-open unit availability** — UX vs correctness (should change)

---

## Bugs / Debugging Stories (from Git)

- Edge Runtime broke Supabase middleware → simplified to proxy cookie check
- Next.js 16 renamed middleware.ts → proxy.ts
- Nodemailer/pdfkit bundled into Edge → serverExternalPackages fix
- Serial number format changed multiple times (LUBC 01 vs R-/C- vs LUBC/001/R/unit)
- Lockdown feature built then disabled
- Vercel build issues with Web Crypto typings and env loading

---

## Security Discussion (How to Answer)

"I performed a static security audit. The architecture uses Supabase service role on the server with explicit requireRole checks — RLS is a backup, not primary enforcement. I found IDOR on PDF download APIs where any authenticated user can access any booking by UUID — that's P0 to fix with role and ownership checks. There's also an unauthenticated bootstrap-admin endpoint that should never be in production. I would not claim the system is fully hardened until those are addressed."

---

## Database Discussion

"PostgreSQL via Supabase with normalized payment slabs — 14 reference rows and a junction table for per-booking progress. Bookings use soft delete. Serial numbers assigned by trigger on SUBMITTED status using MAX+1. Schema migrations are messy — multiple conflicting serial format migrations — I'd consolidate to one canonical schema. Missing a partial unique index on project+unit for active bookings."

---

## Performance Discussion

"For internal scale, most pages are fine. The bottleneck is bulk PDF download — O(n) sequential jsPDF generation in a serverless function. Single booking PDFs are fast. Dashboard does O(n) scans for aggregations which would matter around 10k+ bookings. I'd add SQL aggregates and pagination before optimizing anything else."

---

## "What Would You Improve?"

1. Remove bootstrap-admin / fix IDOR (security)
2. Server-side Zod validation
3. Fail-closed unit availability + DB constraint
4. Consolidate schema migrations
5. Add P0 authorization tests
6. Paginate bookings list
7. Background job for bulk PDF

---

## "How Would This Change at 100x Scale?"

"100x users (2500 internal) wouldn't matter much. 100x **bookings** (100k+) would require: pagination everywhere, materialized dashboard aggregates, background PDF generation to object storage, read replicas, and removing full-table scans. The current architecture is appropriate for tens of users and thousands of bookings."

---

## "Why This Tech Stack?"

"Next.js + Supabase lets a small team ship fast with typed full-stack TypeScript, managed Postgres, integrated auth and storage. Vercel deployment is zero-config. For an internal tool with <100 users, this beats running our own backend. Tradeoff is vendor coupling and service-role auth pattern."

---

## "What Did You Personally Learn?"

- Authorization must be designed action-by-action when bypassing RLS
- Database triggers good for serial assignment atomicity
- Migration discipline matters early — we have conflicting SQL files
- Internal tools still need security audits — IDOR is easy to miss
- Next.js 16 proxy rename and Edge runtime constraints

---

## "How Did You Use AI?"

"AI (Cursor) accelerated boilerplate — wizard UI, PDF layout, migration SQL, debugging Edge issues. I own the architecture decisions, security review, and business rule validation. AI output required verification especially for: authorization checks, financial formulas, RLS policies, and destructive operations. This audit document is part of ensuring I understand every path, not just generated code."

---

## 50+ Interview Questions (Repository-Specific)

### Authentication & Authorization

**Q1:** Why does `getCurrentProfile` use the service role instead of the user's Supabase client?  
**Answer:** Bypasses RLS to reliably fetch profile regardless of policy recursion issues. Tradeoff: app must enforce auth.  
**Files:** `lib/auth/get-user.ts`  
**Tests:** Auth model understanding

**Q2:** What happens if an unauthenticated user hits `/dashboard` directly?  
**Answer:** proxy.ts may redirect if no cookie; page also calls requireProfile → redirect /login.  
**Files:** `proxy.ts`, `dashboard/page.tsx`

**Q3:** Why does proxy check cookies instead of validating JWT?  
**Answer:** Edge/runtime simplification after Supabase middleware issues; real validation on server pages.  
**Files:** `proxy.ts`, git history

**Q4:** Can an EXECUTIVE call `approveBooking` directly?  
**Answer:** Server action calls requireRole(['ADMIN']) → redirect login. Would fail authorization.  
**Files:** `bookings/actions.ts`

**Q5:** What's wrong with `getPaymentSlabs()` having no auth?  
**Answer:** Callable without session; information disclosure pattern violation.  
**Files:** `payment-slab-actions.ts`

**Q6:** Why is `sessionStorage.lubc_tab` not a security feature?  
**Answer:** Client-controlled; bypassable; UX tab guard only.  
**Files:** `dashboard-layout.tsx`

**Q7:** How does signup work?  
**Answer:** Disabled — `/signup` redirects to login; admins create users via admin panel.  
**Files:** `signup/page.tsx`, `admin/actions.ts`

**Q8:** What roles exist and what can ACCOUNTS do that EXECUTIVE cannot?  
**Answer:** ACCOUNTS: accounts page, slab payments, dispatch upload. EXECUTIVE: lookup/downloads but not accounts.  
**Files:** `dashboard-layout.tsx`, role checks

**Q9:** If I know booking UUID, can I download PDFs?  
**Answer:** YES — current code only checks requireProfile. Known IDOR.  
**Files:** `api/bookings/[id]/download/route.ts`

**Q10:** What does `/api/bootstrap-admin` do and why is it dangerous?  
**Answer:** Creates ADMIN with hardcoded password, no auth. Critical vulnerability.  
**Files:** `bootstrap-admin/route.ts`

### Booking Workflow

**Q11:** What status does an EXECUTIVE get on submit vs ADMIN?  
**Answer:** EXECUTIVE → PENDING; ADMIN → SUBMITTED directly.  
**Files:** `new-booking/actions.ts` line ~267

**Q12:** When is serial number assigned?  
**Answer:** DB trigger when status becomes SUBMITTED and serial_no IS NULL.  
**Files:** `generate_serial_number()` in schema.sql

**Q13:** What happens to serial on soft delete?  
**Answer:** Cleared to null; restore doesn't immediately reassign — new serial on next SUBMITTED transition.  
**Files:** `bookings/actions.ts` deleteBooking

**Q14:** Why does checkUnitAvailability fail open?  
**Answer:** On DB error returns available:true — intentional? Likely oversight; risks double booking.  
**Files:** `new-booking/actions.ts`

**Q15:** Can two bookings get the same unit?  
**Answer:** Possible under race — app check only, no DB unique constraint.  
**Files:** checkUnitAvailability, schema

**Q16:** What's the difference between EDITED and SUBMITTED status?  
**Answer:** Admin edits a SUBMITTED booking → status becomes EDITED.  
**Files:** `edit/actions.ts`

**Q17:** Can ACCOUNTS edit another user's PENDING booking?  
**Answer:** saveDraft scopes to created_by; submit same. Cannot update others' drafts.  
**Files:** `new-booking/actions.ts`

**Q18:** Why is unit_type always 'Flat' in submitBooking?  
**Answer:** Comment: "for Anandam everything is treated as a flat" — simplified enum persistence.  
**Files:** `new-booking/actions.ts`

**Q19:** What audit actions are logged?  
**Answer:** CREATED, EDITED, APPROVED, REJECTED, DELETED, RESTORED, REVERTED_TO_DRAFT, etc.  
**Files:** various actions.ts

**Q20:** Why can EXECUTIVE open edit page but not save?  
**Answer:** Page requireRole includes EXECUTIVE; updateBooking ADMIN only — bug/mismatch.  
**Files:** edit/page.tsx, edit/actions.ts

### Financial / Payments

**Q21:** How is total_cost calculated in the wizard?  
**Answer:** Client: rate_per_sqft × super_builtup_area (no rounding). Server accepts submitted value.  
**Files:** `step-3-pricing-payment.tsx`

**Q22:** How is GST calculated?  
**Answer:** 5% of booking_amount_paid — client useEffect; stored in gst_amount.  
**Files:** step-3

**Q23:** How is slab amount_due computed?  
**Answer:** total_cost × slab.percentage / 100 at write time in setSlabPayment.  
**Files:** `payment-slab-actions.ts`

**Q24:** Why NUMERIC in Postgres but Number in JavaScript?  
**Answer:** DB correct for currency; JS uses floats — minor drift possible.  
**Files:** schema, step-3

**Q25:** What are the 14 payment slabs?  
**Answer:** Construction-linked milestones from 20% at agreement to 5% at handover — seeded in schema.  
**Files:** `supabase/schema.sql`

**Q26:** What happens if payment reminder email fails?  
**Answer:** sendEmail returns false; logged; no retry.  
**Files:** `lib/email.ts`, reminder-actions

### PDF / Documents

**Q27:** Why jsPDF instead of pdfkit in production?  
**Answer:** generator.ts uses jsPDF; pdfkit only in test scripts.  
**Files:** `lib/pdf/generator.ts`

**Q28:** What PII is in the company PDF?  
**Answer:** PAN, Aadhaar, full applicant details, financial amounts.  
**Files:** generator.ts

**Q29:** How are KYC documents accessed?  
**Answer:** API creates signed Supabase storage URL — 1 hour typical.  
**Files:** documents API route

**Q30:** Why bulk download is the performance bottleneck?  
**Answer:** Sequential O(n) PDF generation in memory before zip.  
**Files:** bulk-download/route.ts

### Database

**Q31:** Why both serial_no and serial_display?  
**Answer:** serial_no integer for ordering/uniqueness; serial_display formatted string for UI/PDF.  
**Files:** bookings table

**Q32:** What RLS policy exists on bookings SELECT?  
**Answer:** All active users can view all bookings.  
**Files:** schema.sql

**Q33:** Does RLS protect server actions?  
**Answer:** No — service role bypasses RLS entirely.  
**Files:** server.ts

**Q34:** What's wrong with schema.sql vs production?  
**Answer:** Lags migrations — missing ACCOUNTS role, soft delete, documents tables, etc.  
**Files:** supabase/*.sql

**Q35:** Why is admin_id nullable in admin_audit_log after migration?  
**Answer:** Allows system events without admin user reference.  
**Files:** migration-consolidated.sql

### Architecture / System Design

**Q36:** Why Server Actions vs REST API?  
**Answer:** Less boilerplate for form workflows; colocated with UI.  
**Files:** actions.ts pattern

**Q37:** What external services does the app depend on?  
**Answer:** Supabase (required), SMTP (optional), WhatsApp (optional).  
**Files:** email.ts, whatsapp.ts

**Q38:** How is owner split calculated on dashboard?  
**Answer:** Iterate all bookings; getOwnerTypeForFlat(unit_no); sum amounts. O(n).  
**Files:** dashboard/page.tsx, flat-ownership.ts

**Q39:** Where are flat areas stored?  
**Answer:** Static TypeScript map in flat-areas.ts — not database.  
**Files:** `lib/data/flat-areas.ts`

**Q40:** What is the system console?  
**Answer:** Encrypted 100×100 grid workbook for admin notes; client-side crypto.  
**Files:** system-console-*

### Security / Destructive Ops

**Q41:** How many ways can all bookings be deleted?  
**Answer:** Three — login destruct API, admin destruct page, bootstrap compromise.  
**Files:** destruct route, destruct-actions, login

**Q42:** Why is NEXT_PUBLIC_SYSTEM_CONSOLE_KILL_PHRASE a problem?  
**Answer:** Exposed in client bundle; can trigger destruct from login.  
**Files:** login-content.tsx

**Q43:** Does destruct leave audit trail?  
**Answer:** Deletes admin_audit_log too — no trail of destruct itself.  
**Files:** destruct route

**Q44:** How is console data encrypted?  
**Answer:** Client Web Crypto; server stores cipher_text + iv; passphrase not stored in DB.  
**Files:** system-console-client.tsx

**Q45:** Are dispatch signed URLs safe to forward?  
**Answer:** Valid 7 days; recipient can share — time-limited exposure.  
**Files:** dispatch-actions.ts

### Testing / Quality

**Q46:** What tests exist?  
**Answer:** None automated — only manual pdf test scripts.  
**Files:** test-pdf*.js

**Q47:** What would you test first?  
**Answer:** Authorization on server actions; approve/reject transitions; IDOR fixes.  
**Files:** see handbook testing section

**Q48:** Is Zod validation sufficient?  
**Answer:** No — client only; server must re-validate.  
**Files:** validations/booking.ts

**Q49:** How do you prevent double-click submit issues?  
**Answer:** UI loading state only — no server idempotency.  
**Files:** wizard components

**Q50:** What happens if two admins approve same PENDING booking concurrently?  
**Answer:** Both UPDATE to SUBMITTED — likely idempotent; serial trigger fires once if serial_no null.  
**Files:** approveBooking, trigger

**Q51:** Why parking limits 27 and 9?  
**Answer:** Business rule hardcoded — total parking inventory for Anandam.  
**Files:** dashboard page, step-3, submitBooking clamp

**Q52:** How does forgot password work?  
**Answer:** Not self-service — notifies admin via audit log entry.  
**Files:** forgot-password route

**Q53:** What's the proxy matcher exclude?  
**Answer:** Static assets, _next, images — standard Next.js pattern.  
**Files:** proxy.ts config

**Q54:** Could logs expose customer data?  
**Answer:** Yes — PDF generator console.logs booking fields.  
**Files:** generator.ts

**Q55:** If Supabase anon key leaked, what's the risk?  
**Answer:** RLS limits direct client access; service role key leak is catastrophic.  
**Files:** RLS policies, env vars

---

## Recommended Learning Order (7 Days)

### Day 1 — Architecture + Request Lifecycle
- Read README, ENGINEERING_HANDBOOK Part 1-2
- Trace: login → dashboard → requireProfile
- Files: `proxy.ts`, `get-user.ts`, `server.ts`, `dashboard-layout.tsx`

### Day 2 — Database
- Read schema.sql + migration-roles-restructure.sql
- Draw ER diagram from handbook
- Understand serial trigger and payment slabs

### Day 3 — Authentication & Authorization
- Read SECURITY_AUDIT.md
- Map every requireRole call
- Understand service role tradeoff

### Day 4 — Booking Workflow
- Walk wizard: step-1 through step-4
- Read submitBooking, approveBooking, rejectBooking
- Practice explaining status state machine

### Day 5 — Payment Logic & Owner Split
- step-3-pricing-payment calculations
- payment-slab-actions setSlabPayment
- flat-ownership.ts + dashboard aggregations

### Day 6 — Admin, PDF, Security Edge Cases
- PDF generator + download APIs
- bootstrap-admin (anti-pattern)
- system console encryption model
- destruct paths

### Day 7 — Performance, Testing, Interview Practice
- PERFORMANCE_AND_COMPLEXITY.md
- TECHNICAL_DEBT.md priorities
- Practice 30s/2min/5min pitches
- Answer Q1-Q20 out loud without notes

---

**You are ready when you can:** open `new-booking/actions.ts`, `get-user.ts`, and `generator.ts` and explain every function without assistance.
