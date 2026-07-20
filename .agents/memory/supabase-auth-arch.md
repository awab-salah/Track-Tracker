---
name: Supabase Auth Architecture
description: How auth and data contexts are structured; import rules and role flow.
---

## Structure

- `src/lib/supabase.ts` — singleton Supabase client, `isSupabaseConfigured` flag
- `src/lib/auth.ts` — pure async auth functions (signUp, signIn, signOut, resetPassword); no React
- `src/store/AuthContext.tsx` — session/profile state; wraps entire app
- `src/store/AppContext.tsx` — data layer; reads auth state via `useAuth()`
- `src/types.ts` — `CompanyProfile` interface shared by both contexts (avoids circular imports)

## Circular import prevention

Both contexts import `CompanyProfile` from `@/types`. AppContext imports `useAuth` from AuthContext. AuthContext does NOT import from AppContext. This one-way dependency is intentional.

## Role flow

1. User signs up via `auth.ts` → `user_metadata.role = 'company' | 'driver'` set at creation
2. On sign-in or page refresh → `AuthContext.loadProfile()` reads `user_metadata.role`, fetches the matching DB row
3. `AuthContext` exposes `companyId`, `driverId`, `companyProfile`, `driverProfile`
4. `AppContext` uses these to bootstrap data (drivers/loads/sales)
5. Route guards in `App.tsx` check `useAuth().role` before rendering protected pages

## Provider nesting order in App.tsx

```
<WouterRouter>
  <AuthProvider>
    <AppProvider>    ← can call useAuth()
      <Router />
    </AppProvider>
  </AuthProvider>
</WouterRouter>
```

**Why:** AppProvider needs to be inside both WouterRouter (uses `useLocation`) and AuthProvider (uses `useAuth`).
