-- Run this once if the app shows:
-- "new row violates row-level security policy"
--
-- This app currently runs as a local/internal Vite admin tool using the public
-- anon key, so Row Level Security blocks inserts unless explicit policies are
-- created. For this local setup, disabling RLS is the simplest practical fix.

alter table projects disable row level security;
alter table units disable row level security;
alter table transactions disable row level security;
alter table transaction_audit_log disable row level security;
