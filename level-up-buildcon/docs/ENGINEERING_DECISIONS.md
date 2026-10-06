# ProjectDesk — Engineering Decision Records

**Note:** Where original rationale cannot be established from repository evidence, entries are marked **Retrospective justification**.

---

## Decision: Next.js App Router + Server Actions

### Problem
Internal web app for booking management with authenticated pages, PDF generation, and admin tools.

### Options
- Next.js Pages Router + API routes
- Next.js App Router + Server Actions
- Separate React SPA + Express backend
- Supabase-only with Edge Functions

### Current choice
Next.js 16 App Router with React Server Components and `'use server'` actions.

### Why it makes sense (retrospective)
- Single TypeScript codebase for UI + server logic
- Server Actions reduce boilerplate vs REST for form workflows
- Vercel deployment is first-class
- Git history shows iterative migration (middleware → proxy, Edge fixes)

### Tradeoffs
- Server Actions harder to test than pure functions
- Service role pattern couples auth to each action
- Serverless limits on long PDF batch jobs

### When would we reconsider?
- Need long-running background jobs → add queue worker
- Mobile app needs API → extract REST layer

**Evidence:** `package.json` next@16.1.6, app/ directory structure, git commits.

---

## Decision: Supabase (PostgreSQL + Auth + Storage)

### Problem
Need authenticated users, relational booking data, file storage for documents, hosted DB.

### Options
- Supabase
- Firebase
- Custom PostgreSQL + Auth0/Clerk
- PlanetScale + separate auth

### Current choice
Supabase with PostgreSQL, Supabase Auth, Storage buckets, RLS policies.

### Why it makes sense (retrospective)
- Postgres fits financial/booking relational model
- RLS available for defense in depth (partially used)
- Auth + storage integrated
- Small team internal tool — managed backend reduces ops

### Tradeoffs
- Service role bypasses RLS in practice → app must enforce auth
- Migration files scattered; schema drift risk
- Vendor lock-in for auth/storage APIs

### When would we reconsider?
- Strict compliance requiring self-hosted DB only
- RLS-first architecture without service role bypass

**Evidence:** `lib/supabase/`, `supabase/schema.sql`, README.

---

## Decision: Service Role Client for Server Actions

### Problem
Server needs reliable DB access; RLS complicates server-side queries; profile fetch must work for all roles.

### Options
- User-scoped Supabase client (respects RLS)
- Service role for all server operations
- Hybrid: user client for reads, service for admin

### Current choice
**Service role (`createServiceClient`) for virtually all server actions**; `getCurrentProfile()` explicitly bypasses RLS.

### Why it makes sense (retrospective)
- Simplifies queries — no RLS debugging on server
- Admin actions need elevated access anyway
- Comment in get-user.ts: "Use service role to fetch profile (bypasses RLS completely)"

### Tradeoffs
- **Critical:** Every action must implement its own authorization
- RLS policies largely unused for server path
- IDOR vulnerabilities if checks missed

### When would we reconsider?
- After security audit — move to hybrid model

**Evidence:** `lib/supabase/server.ts`, `lib/auth/get-user.ts`, all actions.ts files.

**Original rationale:** Cannot be determined from repository — likely pragmatic RLS avoidance during rapid development (git shows many auth/middleware fixes).

---

## Decision: Role Model (EXECUTIVE / ACCOUNTS / ADMIN)

### Problem
Different staff need different capabilities: sales lookup vs accounts/payments vs admin.

### Options
- Single role + feature flags
- RBAC with 3+ roles
- Per-user permissions table

### Current choice
Three roles in `user_role` enum: `EXECUTIVE`, `ACCOUNTS`, `ADMIN` (evolved from STAFF → EXECUTIVE via migration).

### Why it makes sense (retrospective)
- Matches org structure: sales executives, accounts team, administrators
- Simple to explain in interview
- Enforced via `requireRole()` arrays

### Tradeoffs
- Nav vs page enforcement inconsistent
- EXECUTIVE can view all bookings but limited edit — may be intentional
- No fine-grained permissions (e.g., read-only admin)

### When would we reconsider?
- More than 3 distinct permission sets needed

**Evidence:** `migration-roles-restructure.sql`, `lib/types/database.ts`, dashboard nav.

---

## Decision: Booking Approval Workflow (PENDING → SUBMITTED)

### Problem
Non-admin staff submit bookings; admin must approve before serial assignment.

### Options
- Immediate submit for all users
- Approval queue for non-admins
- External approval system

### Current choice
- ADMIN submit → `SUBMITTED` immediately
- EXECUTIVE/ACCOUNTS submit → `PENDING` → admin approves → `SUBMITTED`
- Serial number assigned by DB trigger on `SUBMITTED`

### Why it makes sense (retrospective)
- Quality control on sales submissions
- Serial numbers only on approved bookings
- Audit log tracks APPROVED/REJECTED

### Tradeoffs
- Admin bottleneck for high volume
- Status `EDITED` after admin edits submitted booking — separate from approval

**Evidence:** `new-booking/actions.ts` line 267, `bookings/actions.ts` approve/reject, git commit `89e0917`.

---

## Decision: Serial Number Generation in PostgreSQL Trigger

### Problem
Unique, formatted booking serials (e.g., `LUBC 01`) on approval.

### Options
- Application-level counter
- PostgreSQL sequence + trigger
- UUID display only

### Current choice
`generate_serial_number()` BEFORE INSERT/UPDATE trigger; MAX+1 over active submitted bookings; prefix from `settings.serial_prefix`.

### Why it makes sense
- Atomic within transaction — reduces race vs app-only
- Centralized format logic
- Multiple migration iterations show format changes (`LUBC 01`, `LUBC/001/R/unit`, R-/C- prefixes) — **latest intended: `LUBC 01` per migration-serial-reset-to-lubc-01.sql**

### Tradeoffs
- MAX+1 scan is O(n) — fine at internal scale
- Migration history shows format churn — operational confusion
- Soft-delete clears serial; restore gets new serial on re-submit

**Evidence:** `supabase/schema.sql`, migration files, git commits on serial reset.

---

## Decision: jsPDF for PDF Generation (Client-Server)

### Problem
Generate company and customer booking confirmation PDFs.

### Options
- jsPDF (programmatic)
- pdfkit (Node streams)
- Puppeteer HTML→PDF
- Pre-filled PDF templates

### Current choice
**jsPDF** in `lib/pdf/generator.ts` — programmatic layout, returns Buffer.

### Why it makes sense (retrospective)
- Pure JS, works in Node serverless
- No headless browser needed
- pdfkit also in package.json but **not used in production generator** (test scripts only)

### Tradeoffs
- Verbose layout code (~460 lines × 2 PDFs)
- CPU-heavy for bulk generation
- console.log debug statements left in

**Evidence:** `lib/pdf/generator.ts`, `test-pdfkit.js`, next.config `serverExternalPackages`.

---

## Decision: Owner Split via Static Flat Map

### Problem
Dashboard must show revenue split between developer (Level Up Buildcon) and landowner (Balaji Hospitality).

### Options
- DB column on booking for owner
- Static map of flat numbers → owner
- Derive from unit category

### Current choice
Hardcoded `LANDOWNER_FLATS` Set in `lib/data/flat-ownership.ts`; all other flats → DEVELOPER.

### Why it makes sense (retrospective)
- Fixed Anandam tower ownership doesn't change often
- O(1) lookup, no DB migration
- Business rule documented in code

### Tradeoffs
- New projects need code change
- Wrong if ownership changes without code update

**Evidence:** `flat-ownership.ts`, dashboard owner totals.

---

## Decision: Encrypted System Console (Admin Workbook)

### Problem
Admins need shared encrypted spreadsheet-like notes without storing plaintext in DB.

### Options
- Plaintext in DB (bad)
- Client-side encryption with shared passphrase
- External tool (Google Sheets)

### Current choice
Client-side encryption (Web Crypto); DB stores `cipher_text` + `iv` per cell; shared `SYSTEM_CONSOLE_PASSPHRASE` verified server-side; KDF salt in `system_console_meta`.

### Why it makes sense
- Passphrase never stored in DB
- RLS enabled with no policies → service role only
- Version field for wipe detection

### Tradeoffs
- Shared passphrase = shared secret among all admins
- Plaintext compare on server for passphrase verification
- Changing passphrase invalidates existing cells

**Evidence:** `migration-system-console.sql`, `system-console-actions.ts`, `system-console-client.tsx`, git `abb5459`.

---

## Decision: Soft Delete for Bookings

### Problem
Admins need to remove bookings from active views without losing audit trail.

### Options
- Hard delete
- Soft delete (`deleted_at`, `deleted_by`)
- Archive table

### Current choice
Soft delete; serial cleared on delete; restore clears flags; new serial on re-approval.

### Tradeoffs
- Serial numbers not reused (MAX+1 continues)
- `deleted_bookings_temp` table exists from interim migration — may be legacy

**Evidence:** `add-soft-delete.sql`, `bookings/actions.ts` deleteBooking.

---

## Decision: Proxy (formerly Middleware) Cookie Check

### Problem
Redirect unauthenticated users from dashboard routes.

### Options
- Full Supabase session in proxy
- Cookie presence check only
- No proxy — page-only auth

### Current choice
`proxy.ts` checks Supabase auth cookie name exists; does not validate JWT.

### Why it makes sense (retrospective)
- Git commits cite Edge Runtime issues with @supabase/ssr in middleware
- Lightweight redirect for UX

### Tradeoffs
- Not a security boundary
- `lib/supabase/middleware.ts` has full session logic but unused

**Evidence:** git `5e4cb83`, `739606f`, `proxy.ts`.

---

## Decision: AI-Assisted Development (Cursor)

### Problem
Accelerate implementation of booking system, PDF, tower view, migrations.

### Current choice
Repository git history and file patterns consistent with Cursor/AI-assisted iterative development (fix commits, feature batches).

### Appropriate story for interviews
AI accelerated implementation, debugging, and repetitive work; engineer responsible for understanding, validating, security, and maintenance.

### Human verification especially important
- Authorization on every server action
- Financial calculations
- RLS vs service role boundaries
- Destructive operations
- Migration SQL correctness

**Evidence:** User query context, git commit messages, comprehensive audit request.
