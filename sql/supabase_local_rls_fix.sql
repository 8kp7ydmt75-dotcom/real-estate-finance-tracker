-- Run this once if the app shows:
-- "new row violates row-level security policy"
--
-- WARNING:
-- This file is for local/private testing only.
--
-- Disabling RLS is never acceptable for a public Supabase-backed deployment.
-- If you deploy this app beyond your own machine, keep RLS enabled and create
-- tenant-aware policies for projects, units, transactions, and audit logs.
-- Never expose service_role or secret keys in the frontend.
--
-- For local setup, disabling RLS can be useful while you are evaluating the
-- schema with a private Supabase project and non-production data.

alter table projects disable row level security;
alter table units disable row level security;
alter table transactions disable row level security;
alter table transaction_audit_log disable row level security;
