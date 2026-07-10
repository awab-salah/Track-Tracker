---
name: RLS Policies
description: Which tables have RLS, what policies exist, and the key design decision around join-code validation.
---

## Tables with RLS enabled
All five tables: `companies`, `drivers`, `loads`, `sales`, `sale_items`.

## Policy summary

| Table | Policy name | Access |
|---|---|---|
| companies | companies_owner | Owner (auth_user_id = auth.uid()) full CRUD |
| drivers | drivers_own_row | Driver full CRUD on own row |
| drivers | drivers_company_owner_all | Company owner full CRUD on their company's drivers |
| loads | loads_driver_own | Driver via driver.auth_user_id |
| loads | loads_company_owner_all | Company owner via company join |
| sales | sales_driver_own | Driver via driver.auth_user_id |
| sales | sales_company_owner_all | Company owner via company join |
| sale_items | sale_items_driver_own | Driver via sales → drivers join |
| sale_items | sale_items_company_owner_all | Company owner via sales → drivers → companies join |

## Key design decisions

**No public SELECT on companies.** The old `companies_select_any` policy (`USING (true)`) was removed. Join-code validation for driver pre-signup is handled by the `validate_join_code()` security-definer RPC which exposes only `{company_id, company_name}` to anon callers.

**auth_user_id columns.** Added via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` after table creation (not inline in CREATE TABLE) to avoid FK parse failures on some Supabase execution contexts.

**Partial unique indexes.** `WHERE auth_user_id IS NOT NULL` allows legacy null rows while enforcing uniqueness for authenticated rows.

## Schema source of truth
`artifacts/track-tracker/src/db/schema.sql` — idempotent, safe to re-run. Must be executed in Supabase SQL Editor (DDL cannot run from client).
