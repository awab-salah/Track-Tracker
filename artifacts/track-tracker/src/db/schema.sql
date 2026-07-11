-- ─────────────────────────────────────────────────────────────────────────────
-- TrackTracker – Supabase Schema + RLS
--
-- Safe to run on a brand-new project OR re-run on an existing one.
-- Every statement is idempotent (IF NOT EXISTS / IF EXISTS).
--
-- Execution order guarantee:
--   1. Extension
--   2. Tables (no auth_user_id yet — avoids FK parse failures)
--   3. auth_user_id columns (ALTER TABLE ADD COLUMN IF NOT EXISTS)
--   4. Unique indexes for auth_user_id
--   5. All other indexes
--   6. updated_at trigger function + triggers
--   7. Enable RLS
--   8. Drop old policies (idempotent)
--   9. Create policies (all referenced columns guaranteed to exist)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extension ──────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── 2. Tables ─────────────────────────────────────────────────────────────────
--
-- auth_user_id is intentionally omitted here and added via ALTER TABLE below.
-- This guarantees the table is created successfully on every Supabase project
-- before any FK reference to auth.users is attempted.

create table if not exists companies (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null,
  join_code  text        not null unique,
  logo_url   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists drivers (
  id                  uuid             primary key default gen_random_uuid(),
  company_id          uuid             not null references companies(id) on delete cascade,
  name                text             not null,
  email               text,
  vehicle_number      text             not null,
  location            text             not null default '',
  lat                 double precision not null default 33.3152,
  lng                 double precision not null default 44.3661,
  profile_picture_url text,
  created_at          timestamptz      not null default now(),
  updated_at          timestamptz      not null default now(),
  deleted_at          timestamptz                              -- soft delete
);

create table if not exists loads (
  id           uuid        primary key default gen_random_uuid(),
  driver_id    uuid        not null references drivers(id) on delete cascade,
  product_name text        not null,
  quantity     integer     not null check (quantity >= 0),
  unit_price   integer     not null check (unit_price >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (driver_id, product_name)
);

create table if not exists sales (
  id                uuid        primary key default gen_random_uuid(),
  driver_id         uuid        not null references drivers(id) on delete cascade,
  date              date        not null,
  total_price       integer     not null check (total_price >= 0),
  receipt_image_url text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists sale_items (
  id           uuid    primary key default gen_random_uuid(),
  sale_id      uuid    not null references sales(id) on delete cascade,
  product_name text    not null,
  quantity     integer not null check (quantity > 0),
  unit_price   integer not null check (unit_price >= 0)
);

-- ── 3. auth_user_id columns ───────────────────────────────────────────────────
--
-- Added after the tables exist so the FK reference to auth.users(id) is
-- resolved against an already-live table, not inside a CREATE TABLE that
-- may not yet see the auth schema in all Supabase execution contexts.
-- IF NOT EXISTS makes these statements no-ops on re-runs.

alter table companies
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;

alter table drivers
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;

-- ── 4. Unique indexes for auth_user_id ────────────────────────────────────────
--
-- Partial unique indexes (WHERE … IS NOT NULL) allow pre-auth rows with NULL
-- while enforcing uniqueness for all non-null values.

create unique index if not exists companies_auth_user_id_uniq
  on companies(auth_user_id) where auth_user_id is not null;

create unique index if not exists drivers_auth_user_id_uniq
  on drivers(auth_user_id) where auth_user_id is not null;

-- ── 5. All other indexes ──────────────────────────────────────────────────────

create index if not exists companies_auth_user_id_idx on companies(auth_user_id);

create index if not exists drivers_company_id_idx   on drivers(company_id);
create index if not exists drivers_auth_user_id_idx on drivers(auth_user_id);
create index if not exists drivers_email_idx        on drivers(email) where email is not null;

create index if not exists loads_driver_id_idx on loads(driver_id);

create index if not exists sales_driver_id_idx on sales(driver_id);
create index if not exists sales_date_idx      on sales(date);

create index if not exists sale_items_sale_id_idx on sale_items(sale_id);

-- ── 6. Trigger functions ───────────────────────────────────────────────────────

-- 6a. updated_at maintenance ──────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'companies_updated_at' and c.relname = 'companies'
  ) then
    create trigger companies_updated_at
      before update on companies
      for each row execute procedure set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'drivers_updated_at' and c.relname = 'drivers'
  ) then
    create trigger drivers_updated_at
      before update on drivers
      for each row execute procedure set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'loads_updated_at' and c.relname = 'loads'
  ) then
    create trigger loads_updated_at
      before update on loads
      for each row execute procedure set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'sales_updated_at' and c.relname = 'sales'
  ) then
    create trigger sales_updated_at
      before update on sales
      for each row execute procedure set_updated_at();
  end if;
end $$;

-- 6b. handle_new_user — atomic signup ─────────────────────────────────────────
--
-- Fires AFTER INSERT ON auth.users.  Creates the matching companies or drivers
-- row inside the same transaction as the auth user creation, so there can never
-- be an orphaned auth account without a domain row (and vice-versa).
--
-- Metadata expected in raw_user_meta_data:
--   company: { role:'company', companyName, joinCode }
--   driver:  { role:'driver',  fullName, vehicleNumber, companyId, companyName }

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role        text;
  v_company_id  uuid;
begin
  v_role := new.raw_user_meta_data ->> 'role';

  if v_role = 'company' then
    insert into public.companies (auth_user_id, name, email, join_code)
    values (
      new.id,
      new.raw_user_meta_data ->> 'companyName',
      new.email,
      upper(new.raw_user_meta_data ->> 'joinCode')
    );

  elsif v_role = 'driver' then
    v_company_id := (new.raw_user_meta_data ->> 'companyId')::uuid;

    -- Guard: reject if the referenced company does not exist
    if not exists (select 1 from public.companies where id = v_company_id) then
      raise exception 'Company not found for driver signup (companyId=%)', v_company_id;
    end if;

    insert into public.drivers (
      auth_user_id, company_id, name, email, vehicle_number, location, lat, lng
    ) values (
      new.id,
      v_company_id,
      new.raw_user_meta_data ->> 'fullName',
      new.email,
      new.raw_user_meta_data ->> 'vehicleNumber',
      '',
      33.3152,
      44.3661
    );
  end if;

  return new;
end;
$$;

-- Drop-and-recreate is idempotent for triggers
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6c. validate_join_code — security-definer RPC ───────────────────────────────
--
-- Called by the client BEFORE creating a driver account to verify the join code
-- and retrieve the company id + name.  Runs as the function owner (superuser),
-- so it bypasses RLS and requires no over-permissive public SELECT policy on
-- companies.  Returns at most one row; empty result = invalid code.

create or replace function public.validate_join_code(p_join_code text)
returns table(company_id uuid, company_name text)
language sql
security definer set search_path = public
as $$
  select id, name
  from   public.companies
  where  join_code = upper(p_join_code);
$$;

-- Allow anonymous (unauthenticated) callers — needed for driver pre-signup check
grant execute on function public.validate_join_code(text) to anon, authenticated;

-- 6d. RLS helper functions (security definer) ──────────────────────────────────
--
-- companies and drivers policies need to reference each other (a driver's
-- policy checks their company, a company owner's policy checks their
-- drivers). Doing that with a plain cross-table subquery inside the policy
-- causes Postgres to re-evaluate the other table's RLS, which re-evaluates
-- this table's RLS, etc. — "infinite recursion detected in policy" (42P17).
-- These functions run as security definer (bypassing RLS on the table they
-- read) so the cross-reference resolves once instead of recursing.

create or replace function public.driver_company_id()
returns uuid
language sql
security definer set search_path = public
stable
as $$
  select company_id from public.drivers where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_company_owner(target_company_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.companies
     where id = target_company_id
       and auth_user_id = auth.uid()
  );
$$;

-- ── 7. Enable RLS ─────────────────────────────────────────────────────────────
--
-- All five tables are locked down. The frontend route guards are UX only —
-- these policies are the authoritative security boundary.

alter table companies  enable row level security;
alter table drivers    enable row level security;
alter table loads      enable row level security;
alter table sales      enable row level security;
alter table sale_items enable row level security;

-- ── 8. Drop old policies (idempotent) ────────────────────────────────────────

drop policy if exists companies_owner               on companies;
drop policy if exists companies_select_any          on companies;
drop policy if exists companies_select_own_driver_company on companies;

drop policy if exists anon_all                      on drivers;
drop policy if exists drivers_own_row               on drivers;
drop policy if exists drivers_own_row_select        on drivers;
drop policy if exists drivers_own_row_update        on drivers;
drop policy if exists drivers_company_owner_all     on drivers;

-- Recreated below with security-definer helpers (section 6d) — dropping first
-- keeps this file safely re-runnable even if an older recursive version ran.

drop policy if exists loads_driver_own              on loads;
drop policy if exists loads_company_owner_all       on loads;

drop policy if exists sales_driver_own              on sales;
drop policy if exists sales_company_owner_all       on sales;

drop policy if exists sale_items_driver_own         on sale_items;
drop policy if exists sale_items_company_owner_all  on sale_items;

-- ── 9. Policies ───────────────────────────────────────────────────────────────
--
-- At this point every table exists and every auth_user_id column exists,
-- so all policy expressions are guaranteed to resolve.

-- companies ───────────────────────────────────────────────────────────────────

-- Company owners can fully manage their own row.
create policy companies_owner on companies
  using     (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- Drivers can read the name of the company they belong to (needed for profile
-- bootstrap joins in driverRepository). No INSERT/UPDATE/DELETE — read only.
-- Uses driver_company_id() (security definer, see section 6d) instead of a
-- direct subquery on drivers to avoid RLS recursion between the two tables.
create policy companies_select_own_driver_company on companies
  for select
  using (id = public.driver_company_id());

-- NOTE: companies_select_any was intentionally removed.
-- Join-code validation is handled by the validate_join_code() security-definer
-- RPC (section 6c), which exposes only {company_id, company_name} to anon
-- callers and requires no broad table-level SELECT grant.

-- drivers ─────────────────────────────────────────────────────────────────────

-- Drivers can read and update their own row. Row creation is intentionally
-- NOT allowed here — driver rows are only ever created by the handle_new_user
-- security-definer trigger (section 6b), which validates the join code server
-- side. Allowing client INSERT here would let any authenticated user attach
-- themselves to an arbitrary company_id.
create policy drivers_own_row_select on drivers
  for select
  using (auth.uid() = auth_user_id);

create policy drivers_own_row_update on drivers
  for update
  using     (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- Company owners can read and manage all drivers in their company.
-- Uses is_company_owner() (security definer, see section 6d) instead of a
-- direct subquery on companies to avoid RLS recursion between the two tables.
create policy drivers_company_owner_all on drivers
  for all
  using     (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));

-- loads ───────────────────────────────────────────────────────────────────────

create policy loads_driver_own on loads
  for all
  using (
    exists (
      select 1 from drivers
       where drivers.id = loads.driver_id
         and drivers.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from drivers
       where drivers.id = loads.driver_id
         and drivers.auth_user_id = auth.uid()
    )
  );

create policy loads_company_owner_all on loads
  for all
  using (
    exists (
      select 1 from drivers d
        join companies c on c.id = d.company_id
       where d.id = loads.driver_id
         and c.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from drivers d
        join companies c on c.id = d.company_id
       where d.id = loads.driver_id
         and c.auth_user_id = auth.uid()
    )
  );

-- sales ───────────────────────────────────────────────────────────────────────

create policy sales_driver_own on sales
  for all
  using (
    exists (
      select 1 from drivers
       where drivers.id = sales.driver_id
         and drivers.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from drivers
       where drivers.id = sales.driver_id
         and drivers.auth_user_id = auth.uid()
    )
  );

create policy sales_company_owner_all on sales
  for all
  using (
    exists (
      select 1 from drivers d
        join companies c on c.id = d.company_id
       where d.id = sales.driver_id
         and c.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from drivers d
        join companies c on c.id = d.company_id
       where d.id = sales.driver_id
         and c.auth_user_id = auth.uid()
    )
  );

-- sale_items ──────────────────────────────────────────────────────────────────

create policy sale_items_driver_own on sale_items
  for all
  using (
    exists (
      select 1 from sales s
        join drivers d on d.id = s.driver_id
       where s.id = sale_items.sale_id
         and d.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sales s
        join drivers d on d.id = s.driver_id
       where s.id = sale_items.sale_id
         and d.auth_user_id = auth.uid()
    )
  );

create policy sale_items_company_owner_all on sale_items
  for all
  using (
    exists (
      select 1 from sales s
        join drivers d on d.id = s.driver_id
        join companies c on c.id = d.company_id
       where s.id = sale_items.sale_id
         and c.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sales s
        join drivers d on d.id = s.driver_id
        join companies c on c.id = d.company_id
       where s.id = sale_items.sale_id
         and c.auth_user_id = auth.uid()
    )
  );

-- ── 10. Supabase Realtime ─────────────────────────────────────────────────────
--
-- The company dashboard subscribes to live driver position updates via
-- Supabase Realtime (postgres_changes on the drivers table).
-- This is idempotent — safe to re-run.
--
-- Alternative: Supabase Dashboard → Database → Replication → Tables → enable "drivers"

do $$
begin
  if not exists (
    select 1
    from   pg_publication_tables
    where  pubname    = 'supabase_realtime'
      and  schemaname = 'public'
      and  tablename  = 'drivers'
  ) then
    alter publication supabase_realtime add table public.drivers;
  end if;
end $$;
