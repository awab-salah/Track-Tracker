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

-- ── 6. updated_at trigger ─────────────────────────────────────────────────────

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

drop policy if exists drivers_own_row               on drivers;
drop policy if exists drivers_company_owner_all     on drivers;

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

-- Anyone (including unauthenticated callers) can SELECT companies.
-- Required: driverSignUp validates a join code before the driver has an account.
create policy companies_select_any on companies
  for select
  using (true);

-- drivers ─────────────────────────────────────────────────────────────────────

-- Drivers can fully manage their own row (INSERT during signup, SELECT, UPDATE).
create policy drivers_own_row on drivers
  for all
  using     (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- Company owners can read and manage all drivers in their company.
create policy drivers_company_owner_all on drivers
  for all
  using (
    exists (
      select 1 from companies
       where companies.id = drivers.company_id
         and companies.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from companies
       where companies.id = drivers.company_id
         and companies.auth_user_id = auth.uid()
    )
  );

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
