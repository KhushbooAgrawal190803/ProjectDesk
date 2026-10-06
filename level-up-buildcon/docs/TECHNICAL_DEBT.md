# ProjectDesk — Technical Debt (Open Items)

**Last updated:** October 6, 2026

Only **remaining** debt is listed here. Resolved items (bootstrap-admin, IDOR, service-role bypass, destruct triggers, server Zod, fail-closed availability, unit unique index, pdfkit, lockdown, dispatch dead code) are recorded in [SECURITY_REFACTOR.md](./SECURITY_REFACTOR.md).

---

## TD-007 — Proxy Cookie-Only Auth Check

**Problem:** `proxy.ts` checks cookie presence, not JWT validity.  
**Risk:** LOW — pages and actions re-validate via `requireProfile()`.  
**Fix:** Document as UX gate only, or add Supabase session refresh in proxy.  
**Priority:** P2

---

## TD-008 — Nav vs Server Role Mismatch

**Problem:** Sidebar hides routes users can still open by URL.  
**Files:** `dashboard-layout.tsx`, individual `page.tsx` files.  
**Fix:** Align nav `roles` arrays with each page's auth gate.  
**Priority:** P1

---

## TD-009 — Edit Page Allows EXECUTIVE, Action Requires ADMIN

**Problem:** `/bookings/[id]/edit` is reachable by EXECUTIVE; `updateBooking` is ADMIN-only.  
**Fix:** Restrict page to ADMIN or allow EXECUTIVE edits per business rules.  
**Priority:** P1

---

## TD-010 — Delete/Revert UI Shown to Non-Admins

**Problem:** Admin-only buttons visible before server rejects the action.  
**Fix:** Conditional render on `profile.role === 'ADMIN'`.  
**Priority:** P2

---

## TD-015 — PDF Generator console.log PII

**Problem:** Booking fields logged during PDF generation → Vercel log leakage.  
**Files:** `lib/pdf/generator.ts`  
**Priority:** P2

---

## TD-018 — Signup Route Disabled but Still Exists

**Problem:** `/signup` redirects to login; admins create users instead.  
**Priority:** P3

---

## TD-020 — Floating-Point Currency Arithmetic

**Problem:** JS `Number` for rupees; Postgres uses `NUMERIC`. Minor rounding drift possible.  
**Fix:** Integer paise or decimal library; align client/server formulas.  
**Priority:** P2

---

## Future improvements (not bugs)

| Item | Why | Priority |
|------|-----|----------|
| Paginate bookings list | Full-table fetch won't scale past ~10k rows | P1 |
| Dashboard SQL aggregates | O(n) scans for stats and owner split | P1 |
| Background bulk PDF job | Sequential jsPDF in serverless is the main perf bottleneck | P1 |
| Transactions on submit+audit | Multi-step writes not wrapped in one DB transaction | P2 |
| E2E tests (Playwright) | Wizard flow only manually tested today | P2 |

See [PERFORMANCE_AND_COMPLEXITY.md](./PERFORMANCE_AND_COMPLEXITY.md) for scale discussion.
