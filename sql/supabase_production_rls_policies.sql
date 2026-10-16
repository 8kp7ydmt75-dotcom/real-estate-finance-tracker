-- Retired: never disable RLS to repair access.
-- Apply 20261016_finance_hardening.sql and assign authenticated project members.
do $$ begin raise exception 'Use sql/20261016_finance_hardening.sql; see docs/deployment-notes.md'; end $$;
