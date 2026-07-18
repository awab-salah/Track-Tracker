# Verification artifacts for PR #7 (feature/fix-image-uploads)

This directory contains the artifacts requested for the pre-merge review of
PR #7 (https://github.com/awab-salah/Track-Tracker/pull/7).

## Files

| File | What it is |
|---|---|
| `storage_setup.sql.snapshot` | The exact `src/db/storage_setup.sql` that matches the final implementation (commit `9be7bc7`). |
| `verify-image-uploads-output.log` | Full output of `node scripts/verify-image-uploads.mjs` captured against the live Supabase project (qexafenusvjkyzfhtpda.supabase.co). NOT just the summary — every step is logged. Final result: **15 PASS / 0 FAIL**. |
| `worklog.snapshot.md` | Snapshot of `/home/z/my-project/worklog.md` at the time of the verification, including the root-cause analysis and the fix log for the bucket-name mismatch. |
| `screenshots/` | Browser screenshots captured while running the React app against the live Supabase project, showing all three upload flows with a full page refresh between upload and verification. |
| `screenshots/flow-summary.txt` | Test accounts used + DB-verified URLs after refresh. |

## Screenshots (19 total)

### Flow A — Company logo upload
| # | File | What it shows |
|---|---|---|
| 01 | `01-owner-dashboard.png` | Owner dashboard after REST-seeded company login (logo circle shows "V" placeholder) |
| 02 | `02-company-profile.png` | Company profile page (logo circle still shows "V" placeholder) |
| 03 | `03-company-profile-edit.png` | Profile page in edit mode (camera button visible on logo circle) |
| 04 | `04-logo-uploaded.png` | After logo upload — logo circle now shows the uploaded LOGO image |
| 05 | `05-logo-saved.png` | After clicking Save — logo still visible |
| 06 | `06-logo-after-refresh.png` | **After full page refresh** — logo persists from DB ✅ |

### Flow B — Driver profile photo upload
| # | File | What it shows |
|---|---|---|
| 07 | `07-driver-dashboard.png` | Driver dashboard after REST-seeded driver login |
| 08 | `08-driver-profile.png` | Driver profile page |
| 09 | `09-driver-profile-edit.png` | Profile page in edit mode |
| 10 | `10-avatar-uploaded.png` | After avatar upload — circle now shows the uploaded AVATAR image |
| 11 | `11-avatar-saved.png` | After clicking Save |
| 12 | `12-avatar-after-refresh.png` | **After full page refresh** — avatar persists from DB ✅ |

### Flow C — Sale receipt upload
| # | File | What it shows |
|---|---|---|
| 13 | `13-driver-dashboard.png` | Driver dashboard (Load tab — inventory was added via REST) |
| 14 | `14-sales-tab.png` | Sales tab showing "Test Product" available in inventory |
| 15 | `15-product-added.png` | Product added to cart, receipt upload buttons visible |
| 16 | `16-receipt-uploaded.png` | After receipt upload — receipt preview shows the uploaded RECEIPT image |
| 17 | `17-sale-created.png` | After clicking "بيع" (Sell) — sale created |
| 18 | `18-sale-after-refresh.png` | **After full page refresh** — sales form reset (sale persisted to DB) ✅ |
| 19 | `19-sale-in-stats-history.png` | Stats tab — sales chart reflects the new sale |

### DB verification (from `flow-summary.txt`)

```
Company logo_url (from DB after refresh):
  https://qexafenusvjkyzfhtpda.supabase.co/storage/v1/object/public/avatars/<uid>/company-<ts>.png

Driver profile_picture_url (from DB after refresh):
  https://qexafenusvjkyzfhtpda.supabase.co/storage/v1/object/public/avatars/<uid>/driver-<ts>.png

Latest sale record (from DB):
  [{
    "id": "<uuid>",
    "receipt_image_url": "https://qexafenusvjkyzfhtpda.supabase.co/storage/v1/object/public/receipts/<uid>/receipt-<ts>.png",
    "total_price": 500,
    "created_at": "2026-07-18T22:31:06.443335+00:00"
  }]
```

## Browser console + errors

- `screenshots/browser-console.log` — 30 lines, all `[debug] [vite] connecting...` / `[info] React DevTools` / one pre-existing `[error] Cannot update a component while rendering a different component` warning from `DriverDashboard` (a known React warning unrelated to image uploads — same warning appears on `main`).
- `screenshots/browser-errors.log` — **0 lines** (no uncaught errors).

## Sanity check (no probe/debug scripts in the final commit)

```
$ git ls-files | grep -iE 'probe|debug|test-tmp|tmp-'
(no output — no probe/debug scripts tracked in git)

$ ls scripts/
e2e-results-before-sql.log
list-buckets.mjs
seed-test-users.mjs    ← used by the browser E2E below; commits with this PR
verify-image-uploads.mjs
```

The temporary `probe-buckets.mjs` used during investigation was deleted before
committing. `seed-test-users.mjs` is a permanent helper for the browser-based
E2E (signs up test users via the REST API because the React signup form gets
`session=null` from the `handle_new_user` trigger — a quirk unrelated to the
image-upload fix).
