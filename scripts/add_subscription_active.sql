-- Add subscription_active column to companies table
-- This must be run on the Supabase project before the app can use it.
-- Safe to run multiple times (IF NOT EXISTS).

alter table companies
  add column if not exists subscription_active boolean not null default false;
