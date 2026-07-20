---
name: Auth Bootstrap Race Fixes
description: Two concurrency fixes applied to prevent stale state from auth/data loading races.
---

## Problem 1 — AuthContext: getSession + onAuthStateChange overlap

Both calls are made on mount. If `getSession()` is slow, `onAuthStateChange` fires first, then the slow `getSession()` response can overwrite the newer state.

**Fix:** `loadVersionRef` counter in AuthContext. Each `loadProfile` call increments it and captures its value. Before committing any state (especially after async DB fetches), it checks `loadVersionRef.current !== myVersion` and returns early if stale.

## Problem 2 — AppContext: bootstrap effect with async DB calls

Three separate effects handle: company bootstrap, driver bootstrap, sign-out clear. Each async-data effect:
- Runs only when its specific role+id deps change
- Uses a `let cancelled = false` flag; cleanup function sets `cancelled = true`
- All `setX(...)` calls after `await` are guarded by `if (cancelled) return`

**Why:** Without cancellation, rapidly switching auth state (e.g., sign-out while still loading) would commit stale data from the previous user's session.

## Effect dependency strategy

- Company bootstrap deps: `[role, authCompanyId, authCompany?.name, authLoading]` — primitive string proxy for the company object
- Driver bootstrap deps: `[role, authDriverId, authLoading]`
- Clear deps: `[role, authLoading]`

Using string primitives (not object references) prevents infinite re-render loops from reference inequality.
