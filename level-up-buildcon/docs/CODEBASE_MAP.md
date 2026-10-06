# ProjectDesk — Codebase Map

**Repository root:** `/ProjectDesk/level-up-buildcon/`  
**Purpose:** File-by-file engineering reference. Trivial config/CSS omitted unless relevant.

**Interview importance:** LOW | MEDIUM | HIGH | MUST UNDERSTAND

---

## Entry & Configuration

### `package.json`
| | |
|---|---|
| **Responsibility** | Dependencies and scripts |
| **Why** | Standard Node project manifest |
| **Key exports** | Scripts: dev, build, start, lint |
| **Dependencies** | next@16.1.6, react@19, @supabase/*, jspdf, archiver, nodemailer, zod, zustand |
| **Security** | Declares server-external packages indirectly via next.config |
| **Interview** | MEDIUM |

### `next.config.ts`
| | |
|---|---|
| **Responsibility** | Next.js config: serverExternalPackages, turbopack root (local only) |
| **Why** | Prevent Edge bundling of nodemailer/pdfkit/archiver |
| **Interview** | MEDIUM |

### `proxy.ts`
| | |
|---|---|
| **Responsibility** | Next.js 16 proxy (route protection via cookie check) |
| **Why** | Redirect unauthenticated users from dashboard paths |
| **Exports** | `proxy()`, `config.matcher` |
| **Dependents** | Next.js runtime (automatic) |
| **Side effects** | HTTP redirects |
| **Security** | Cookie presence only — not JWT validation |
| **Interview** | HIGH |

### `tsconfig.json`, `eslint.config.mjs`, `components.json`, `postcss.config.mjs`
Config only — **Interview: LOW**

---

## `app/` — Routes

### `app/page.tsx`
Root redirect: auth → `/dashboard`, else `/login`. **Interview: LOW**

### `app/layout.tsx`
Root layout: fonts, Toaster, NavigationEvents. **Interview: LOW**

### `app/(auth)/login/page.tsx` + `login-content.tsx`
| | |
|---|---|
| **Responsibility** | Email/password login via Supabase |
| **Side effects** | Auth session, last_login update, optional `/api/destruct`, sessionStorage `lubc_tab` |
| **Security** | Destruct trigger via NEXT_PUBLIC env — HIGH concern |
| **Interview** | HIGH |

### `app/(auth)/signup/page.tsx`
Redirects to login (disabled). **Interview: LOW**

### `app/(auth)/forgot-password/page.tsx`
Posts to `/api/forgot-password`. **Interview: MEDIUM**

### `app/(auth)/reset-password/page.tsx`
Client Supabase password update after email link. **Interview: MEDIUM**

### `app/(dashboard)/dashboard/page.tsx`
| | |
|---|---|
| **Responsibility** | Stats, owner split, parking, tower view, recent bookings |
| **Data** | Multiple booking/profile aggregations |
| **Complexity** | O(n) scans over all bookings |
| **Interview** | HIGH |

### `app/(dashboard)/dashboard/recent-bookings.tsx`
Recent booking list UI component. **Interview: LOW**

### `app/(dashboard)/bookings/page.tsx`
Full booking registry with URL filters. **Interview: HIGH**

### `app/(dashboard)/bookings/bookings-table.tsx`
Client table with search/filter UI. **Interview: MEDIUM**

### `app/(dashboard)/bookings/actions.ts`
| | |
|---|---|
| **Responsibility** | deleteBooking, restoreBooking, revertToDraft, approveBooking, rejectBooking |
| **Auth** | ADMIN only |
| **Side effects** | Soft delete, audit log, revalidatePath |
| **Interview** | MUST UNDERSTAND |

### `app/(dashboard)/bookings/[id]/page.tsx`
Booking detail: pricing, docs, audit, action buttons. **Interview: HIGH**

### `app/(dashboard)/bookings/[id]/edit/page.tsx` + `booking-edit-form.tsx` + `actions.ts`
Admin edit flow; page allows EXECUTIVE, action ADMIN-only. **Interview: HIGH**

### `app/(dashboard)/bookings/[id]/*-button.tsx`
Approve, reject, delete, revert, download PDFs — client triggers. **Interview: MEDIUM**

### `app/(dashboard)/bookings/deleted/page.tsx` + `restore-button.tsx`
Admin trash bin. **Interview: MEDIUM**

### `app/(dashboard)/new-booking/page.tsx` + `booking-wizard.tsx`
4-step booking wizard entry. **Interview: MUST UNDERSTAND**

### `app/(dashboard)/new-booking/step-1-project-unit.tsx`
Project/unit selection; flat area lookup. **Interview: HIGH**

### `app/(dashboard)/new-booking/step-2-applicant.tsx`
Applicant/co-applicant form. **Interview: MEDIUM**

### `app/(dashboard)/new-booking/step-3-pricing-payment.tsx`
Rate × area, GST 5%, parking counts. **Interview: MUST UNDERSTAND**

### `app/(dashboard)/new-booking/step-4-review.tsx`
Review and submit. **Interview: MEDIUM**

### `app/(dashboard)/new-booking/actions.ts`
| | |
|---|---|
| **Responsibility** | saveDraft, submitBooking, checkUnitAvailability, drafts CRUD |
| **Auth** | requireProfile |
| **Side effects** | DB writes, audit log |
| **Security** | Fail-open unit check; no server Zod |
| **Interview** | MUST UNDERSTAND |

### `app/(dashboard)/new-booking/document-upload.tsx` + `document-actions.ts`
KYC upload to Supabase storage. **Interview: HIGH**

### `app/(dashboard)/lookup/page.tsx` + `lookup-client.tsx` + `tower-view.tsx` + `tower-actions.ts`
Quick search + Anandam tower grid. **Interview: HIGH**

### `app/(dashboard)/downloads/page.tsx`
Links to bulk PDF API. **Interview: MEDIUM**

### `app/(dashboard)/accounts/page.tsx` + client components
Financial overview, payment reminders; dispatch UI partially wired. **Interview: HIGH**

### `app/(dashboard)/accounts/payment-slab-actions.ts`
Slab payment recording; getPaymentSlabs unauthenticated. **Interview: HIGH**

### `app/(dashboard)/accounts/reminder-actions.ts`
Payment reminder emails. **Interview: MEDIUM**

### `app/(dashboard)/accounts/dispatch-actions.ts`
Dispatch document upload/approve/email/WhatsApp. **Interview: HIGH**

### `app/(dashboard)/admin/page.tsx` + `users-table.tsx` + `settings-form.tsx`
User management, settings, console tab. **Interview: HIGH**

### `app/(dashboard)/admin/actions.ts`
User CRUD, settings, password reset. **Interview: HIGH**

### `app/(dashboard)/admin/system-console-client.tsx` + `system-console-actions.ts`
Encrypted admin workbook. **Interview: HIGH**

### `app/(dashboard)/admin/destruct/page.tsx` + `destruct-actions.ts`
Wipe all bookings. **Interview: HIGH**

### `app/(dashboard)/locked/*`
Disabled lockdown feature. **Interview: LOW**

### `app/(dashboard)/template.tsx`
Dashboard fade-in + NProgress. **Interview: LOW**

### `app/**/loading.tsx`
Skeleton loaders. **Interview: LOW**

---

## `app/api/` — Route Handlers

### `app/api/bootstrap-admin/route.ts`
**CRITICAL:** Unauthenticated admin creation. **Interview: MUST UNDERSTAND**

### `app/api/destruct/route.ts`
Wipe bookings + audit + console. Email allowlist auth. **Interview: MUST UNDERSTAND**

### `app/api/forgot-password/route.ts`
Admin notification for password reset requests. **Interview: MEDIUM**

### `app/api/bookings/[id]/download/route.ts`
Single booking PDF ZIP. IDOR risk. **Interview: MUST UNDERSTAND**

### `app/api/bookings/bulk-download/route.ts`
All bookings PDF ZIP. Performance bottleneck. **Interview: MUST UNDERSTAND**

### `app/api/bookings/[id]/documents/[docId]/route.ts`
Signed URL redirect for KYC. IDOR risk. **Interview: HIGH**

### `app/api/dispatch-documents/[id]/route.ts`
Signed URL for dispatch docs; ACCOUNTS/ADMIN. **Interview: MEDIUM**

---

## `lib/` — Shared Logic

### `lib/auth/get-user.ts`
| | |
|---|---|
| **Responsibility** | getCurrentUser, getCurrentProfile, requireAuth, requireProfile, requireRole |
| **Side effects** | redirect('/login') |
| **Security** | Service role for profile fetch |
| **Interview** | MUST UNDERSTAND |

### `lib/auth/lockdown.ts` + `lockdown-config.ts`
Commented-out lockdown feature. **Interview: LOW**

### `lib/supabase/client.ts`
Browser Supabase client. **Interview: MEDIUM**

### `lib/supabase/server.ts`
createClient (cookie), createServiceClient (service role). **Interview: MUST UNDERSTAND**

### `lib/supabase/middleware.ts`
Full session proxy logic — **unused**. **Interview: MEDIUM**

### `lib/supabase/soft-delete.ts`
Soft delete helpers (if used). **Interview: LOW**

### `lib/types/database.ts`
TypeScript interfaces mirroring DB. **Interview: HIGH**

### `lib/validations/booking.ts`
Zod schemas — client only currently. **Interview: HIGH**

### `lib/pdf/generator.ts`
generateCompanyPDF, generateCustomerPDF (jsPDF). **Interview: HIGH**

### `lib/email.ts`
Nodemailer sendEmail, dispatch HTML template. **Interview: MEDIUM**

### `lib/whatsapp.ts`
WhatsApp dispatch messages. **Interview: LOW**

### `lib/data/flat-areas.ts`
Static Anandam flat → area map. **Interview: HIGH**

### `lib/data/flat-ownership.ts`
Developer vs landowner flat classification. **Interview: HIGH**

### `lib/server-env.ts`
Env var loading for system console passphrase. **Interview: MEDIUM**

### `lib/utils.ts`
cn() tailwind merge helper. **Interview: LOW**

---

## `components/`

### `components/layout/dashboard-layout.tsx`
Shell: nav filtered by role, logout, tab guard. **Interview: HIGH**

### `components/ui/*`
shadcn/ui primitives (button, card, dialog, form, table, etc.). **Interview: LOW**

### `components/navigation-events.tsx`, `loading-bar.tsx`, `page-loading-indicator.tsx`
UX loading indicators. **Interview: LOW**

---

## `supabase/` — SQL

### `supabase/schema.sql`
Baseline schema — **lags migrations**. **Interview: HIGH**

### `supabase/migration-*.sql`, `full-reset-and-schema.sql`
Incremental schema changes — see ENGINEERING_HANDBOOK Data Model. **Interview: HIGH**

---

## Test / Script Files (Non-production)

| File | Purpose |
|------|---------|
| `test-pdf-generator.js` | PDF dev test |
| `test-pdfkit.js` | pdfkit experiment |
| `test-*.pdf` | Sample output |

**No automated test suite exists.**

---

## Dependency Graph (Simplified)

```
pages (RSC)
  → requireProfile / requireRole (get-user.ts)
  → createServiceClient (server.ts)
  → PostgreSQL via Supabase

client components
  → createClient (client.ts)
  → server actions (actions.ts)

API routes
  → requireProfile + createServiceClient
  → lib/pdf, lib/email

proxy.ts
  → cookie check → redirect (no Supabase call)
```

---

## Files by Interview Priority (Study Order)

**Must understand first:**
1. `lib/auth/get-user.ts`
2. `lib/supabase/server.ts`
3. `new-booking/actions.ts`
4. `bookings/actions.ts`
5. `lib/pdf/generator.ts`
6. `lib/data/flat-ownership.ts`
7. `proxy.ts`
8. `app/api/bootstrap-admin/route.ts` (as anti-pattern)
9. `supabase/schema.sql` + role migration
10. `components/layout/dashboard-layout.tsx`
