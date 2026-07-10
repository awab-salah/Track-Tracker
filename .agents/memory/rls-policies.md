---
name: RLS Policies
description: Row-level security strategy for all five TrackTracker tables.
---

## Tables with RLS enabled

All five: `companies`, `drivers`, `loads`, `sales`, `sale_items`

## Policy matrix

| Table | Actor | Operations | Condition |
|---|---|---|---|
| companies | Company owner | ALL | `auth.uid() = auth_user_id` |
| companies | Anyone | SELECT | `true` (public — needed for join-code validation pre-signup) |
| drivers | Driver | ALL | `auth.uid() = drivers.auth_user_id` |
| drivers | Company owner | ALL | `companies.auth_user_id = auth.uid()` via join |
| loads | Driver | ALL | via `drivers.auth_user_id = auth.uid()` |
| loads | Company owner | ALL | via `companies.auth_user_id = auth.uid()` double join |
| sales | Driver | ALL | same as loads |
| sales | Company owner | ALL | same as loads |
| sale_items | Driver | ALL | via sales → drivers join |
| sale_items | Company owner | ALL | via sales → drivers → companies join |

## Important: companies SELECT is public

`driverSignUp` in `auth.ts` calls `fetchCompanyByJoinCode` **before** the driver has a Supabase account. This means the query runs unauthenticated, requiring a public SELECT policy on companies. Company names and emails are treated as non-sensitive for this B2B fleet use case.

**How to apply:** If you add tables that reference drivers or companies, add corresponding RLS policies following this pattern. The schema.sql file is the single source of truth — run the full file (or the migration block at the bottom) in the Supabase SQL Editor.
