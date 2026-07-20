---
name: RLS cross-table recursion
description: companies/drivers policies that reference each other via plain subqueries trigger Postgres "infinite recursion detected in policy" (42P17); use security-definer helper functions to break the cycle.
---

## Rule
Never write a `companies` RLS policy that contains a direct `SELECT … FROM drivers` subquery, and never write a `drivers` policy that contains a direct `SELECT … FROM companies` subquery. Use the security-definer helpers instead.

## Helper functions (defined in schema.sql section 6d)

| Function | Returns | Used by |
|---|---|---|
| `public.driver_company_id()` | `uuid` — the company_id for the currently authenticated driver | `companies_select_own_driver_company` policy |
| `public.is_company_owner(target_company_id uuid)` | `boolean` | `drivers_company_owner_all` policy |

Both are `SECURITY DEFINER` + `STABLE`, so Postgres evaluates them once per query rather than recursing into the other table's RLS stack.

## Why it happens
Postgres evaluates RLS policies inline during query planning. If policy A on table X references table Y, and policy B on table Y references table X, the planner enters an infinite loop and raises `42P17`. Security-definer functions bypass RLS on the table they read, breaking the cycle.

**How to apply:** Any time you add a new policy that joins `companies` ↔ `drivers`, wrap the cross-table lookup in one of the helper functions above. If you need a new helper, add it to section 6d of `schema.sql` with `SECURITY DEFINER set search_path = public`.
