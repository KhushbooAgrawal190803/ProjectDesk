# ProjectDesk — Performance and Complexity Analysis

**Last updated:** October 4, 2026  
**Context:** Internal team tool (~10–100 users, thousands–tens of thousands of bookings). Not optimized for millions of users.

---

## Dominant Cost by Workflow

### Login
| Dimension | Estimate |
|-----------|----------|
| CPU | O(1) — Supabase auth JWT verify |
| Memory | O(1) |
| DB | 1 write (`profiles.last_login`) |
| Network | 1–2 round trips to Supabase Auth |
| External | Supabase Auth latency (~50–200ms) |
| Rendering | Client form — negligible |

**Bottleneck:** Supabase Auth RTT. **Matters for internal use?** No.

---

### Create / Submit Booking
| Dimension | Estimate |
|-----------|----------|
| CPU | O(1) field mapping + optional unit check |
| Memory | O(1) |
| DB | 1 unit availability SELECT; 1 INSERT/UPDATE; 1 audit INSERT |
| Network | 3–4 Supabase round trips |
| External | None unless documents linked |

**Bottleneck:** Sequential DB calls (not batched). **Matters?** No at <50 concurrent users.

---

### Load Dashboard
| Dimension | Estimate |
|-----------|----------|
| CPU | O(n) over all non-draft bookings for owner split + parking sums |
| Memory | O(n) — loads all `booking_amount_paid, unit_no` rows |
| DB | ~6 queries: counts, full scan for amounts, recent 10, parking fields, tower allocations, active users |
| Network | 6+ round trips (partially parallelized with `Promise.all` for stats + tower) |
| Rendering | Tower grid + stat cards |

**Tower allocations query:** SELECT all Anandam non-draft bookings — O(n).

**Bottleneck:** **Full table scan of bookings for dashboard aggregations** as booking count grows.

**Matters for internal use?**
- **< 5,000 bookings:** No noticeable issue
- **10,000–50,000 bookings:** Dashboard load may exceed 1–2s without indexes/materialized views
- **100,000+:** Dashboard pattern becomes problematic

---

### Load All Bookings List (`/bookings`)
| Dimension | Estimate |
|-----------|----------|
| CPU | O(n) client-side filter if all loaded — **server loads all matching rows** |
| Memory | O(n) booking rows + creator join |
| DB | 1 SELECT with filters + 1 for filter options |
| Network | 1–2 round trips; payload grows with n |

**Bottleneck:** Unpaginated full list fetch. **Matters at ~10,000+ bookings.**

---

### Generate Single Booking PDF (ZIP)
| Dimension | Estimate |
|-----------|----------|
| CPU | O(p) where p = PDF page/layout work — jsPDF renders ~2 A4 pages × 2 PDFs |
| Memory | O(p) — two PDF buffers + zip buffer (~hundreds KB each) |
| DB | 1 booking SELECT |
| Network | 1 DB + response stream |
| External | None |

**Bottleneck:** **CPU-bound jsPDF generation** on serverless (Vercel function timeout risk).

**Matters?** Single PDF: No. Bulk download: **YES** (see below).

---

### Bulk PDF Download (`/api/bookings/bulk-download`)
| Dimension | Estimate |
|-----------|----------|
| CPU | O(n × p) — sequential loop generating PDFs for every booking |
| Memory | O(n × p) — all PDF buffers held before zip |
| DB | 1 SELECT all non-draft bookings |
| Network | Large response payload |

```typescript
// bulk-download/route.ts — sequential per booking
for (const booking of bookings) {
  // generateCompanyPDF / generateCustomerPDF
}
```

**Bottleneck:** **This is the single most likely performance bottleneck in ProjectDesk today.**

Evidence:
1. Sequential PDF generation in a loop (no parallelism limit)
2. All buffers accumulated in memory before zip
3. Runs on serverless with default timeout (~10–60s on Vercel)
4. Complexity O(n) PDF generations where n = all active bookings

**Matters for internal use?**
- **< 100 bookings:** Fine (~few seconds)
- **500+ bookings:** Likely timeout or very slow download
- **1,000+:** High risk of OOM / timeout on serverless

---

*(Historical: the payment-reminder email batch and System Console cell sync were analyzed here; both features have been removed.)*

---

## Algorithms and Data Structures (Actual, Not Invented)

| Location | Structure/Algorithm | Time | Space | n in practice |
|----------|---------------------|------|-------|---------------|
| `flat-ownership.ts` | `Set` lookup for landowner flats | O(1) | O(1) ~40 flats | Constant |
| `flat-areas.ts` | `Record` pattern + overrides | O(1) | O(1) | Constant |
| `bookings/page.tsx` | Filter/search via URL params + SQL | O(n) rows returned | O(n) | Hundreds–thousands |
| `payment-slab-actions.ts` | `Map` for payment join | O(n) | O(n) | Bookings count |
| `dashboard/page.tsx` | Reduce for owner totals | O(n) | O(n) | Bookings count |
| `generate_serial_number()` | `MAX(serial_no)+1` | O(n) scan | O(1) | Serial count |
| `tower-view.tsx` | Grid render fixed floors × units | O(1) grid | O(1) | ~80 cells |
| `bulk-download` | Sequential PDF loop | O(n) | O(n) | **All bookings** |
| Booking status | Implicit state machine | O(1) transitions | — | 4 states |

**No sophisticated caching, queues, or indexing beyond PostgreSQL defaults.**

---

## Database Query Patterns

| Query pattern | Index used? | Risk |
|---------------|-------------|------|
| `bookings` by status, deleted_at | `idx_bookings_status`, partial on deleted_at | OK |
| `bookings` by applicant_mobile search | `idx_bookings_applicant_mobile` | OK for exact; ILIKE may scan |
| `bookings` ORDER BY submitted_at | `idx_bookings_created_at` on created_at, not submitted_at | **Missing index on submitted_at** |
| Unit availability `(project_name, unit_no)` | No composite index | Sequential scan at scale |
| MAX(serial_no) | `idx_bookings_serial` | OK |

---

## Capacity Analysis (Assumptions Stated)

### By concurrent users

| Users | Expected issue |
|-------|----------------|
| 10 | None |
| 25 | None |
| 50 | None unless bulk PDF used |
| 100 | Supabase connection pool; bulk PDF timeout |

### By booking records

| Bookings | Expected issue first |
|----------|------------------------|
| 1,000 | Bulk PDF download slow |
| 10,000 | Dashboard full-scan aggregations; unpaginated list |
| 100,000 | Dashboard + list + bulk PDF untenable without redesign |
| 1,000,000 | Not designed for this — would need pagination, aggregates table, background jobs |

**Benchmarking needed before confident thresholds:** Dashboard load time vs booking count, bulk PDF timeout vs count, Vercel function memory with 500 PDFs.

---

## Single Most Likely Bottleneck

> **Bulk PDF download** (`GET /api/bookings/bulk-download`) — sequential O(n) jsPDF generation with full memory retention.

### Does it matter for expected internal usage?

- **Daily operations (single booking PDF):** No
- **Occasional bulk export with <200 bookings:** Probably acceptable
- **Full archive export as business grows:** **Yes, will matter** — recommend background job + object storage before booking count exceeds ~300–500 (estimate; needs benchmark)

---

## Recommended Performance Improvements (Future)

1. Paginate `/bookings` list (server-side cursor)
2. Dashboard: SQL aggregates (`SUM`, `COUNT`) instead of loading all rows
3. Bulk PDF: queue job, stream zip, or limit batch size
4. Index on `(project_name, unit_no)` and `submitted_at`
5. Parallel PDF generation with concurrency cap (p-limit pattern)
