# Deployment and migration

Use Node 24 (minimum 22.12) and `npm ci`. `npm run check` runs strict TypeScript, the regression/database tests and the production build. `npm run test:e2e` runs the browser workflows after `npx playwright install chromium`.

## Demo

Set `VITE_DEMO_MODE=true`. Each project has its own in-memory units and transactions. Reloading resets all demo changes. No Supabase requests are made. Demo mode is for fictional data only and does not retain audit history.

## New Supabase database

1. Run `sql/supabase_setup.sql` once in the Supabase SQL Editor. It includes the complete security migration in one transaction.
2. Create confirmed users with passwords under Authentication → Users. This version uses administrator-provisioned email/password accounts; self-registration is not exposed.
3. Set the frontend environment:

   ```env
   VITE_DEMO_MODE=false
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your_public_anon_or_publishable_key
   ```

4. Build and deploy `dist/` over HTTPS. Never use a service-role/secret key in a `VITE_` variable. The public key identifies the app; a signed-in user session authorizes its requests.
5. Sign in and create a project. Its creator automatically receives the owner role, atomically with the project creation.

## Existing database upgrade

The old anonymous frontend is incompatible with the secured schema. Coordinate the database and frontend release; stop old clients during the upgrade.

1. Back up the database and verify the backup can be restored.
2. Run `sql/preflight_finance_hardening.sql`. Review flagged records against source documents. In particular, resolve zero/invalid amounts, cross-project unit links, transactions attached to previously archived units, buyer receipts on unsold/landowner units, and missing vendor names. Restore an archived unit with history rather than deleting its transactions. Do not guess a vendor or silently drop records to pass the checks.
3. Run **only** `sql/20261016_finance_hardening.sql` for the upgrade. It preserves rows and legacy audit records, backfills stable vendor IDs, enables RLS, replaces prior policies, and installs atomic audit/validation triggers. A validation failure rolls back the entire migration. If the SQL Editor leaves an aborted transaction open, run `ROLLBACK` before correcting data and retrying.
4. Assign the intended users to each existing project. Existing projects are deliberately not assigned to whichever user happens to sign in first:

   ```sql
   -- Replace both UUIDs with verified values from Projects and Authentication → Users.
   insert into public.project_members(project_id, user_id, role)
   values ('PROJECT_UUID'::uuid, 'USER_UUID'::uuid, 'owner')
   on conflict (project_id,user_id) do update set role=excluded.role;
   ```

5. Deploy the frontend with demo mode disabled and sign in as the assigned owner.
6. Review vendor matches: unlinked payments are applied oldest-invoice-first within the same vendor across all scopes. Use the payment's invoice selector when a different allocation is required. Vendor names are normalized by case and whitespace within each project. Correct ambiguous legacy vendor names before migration.
7. Reconcile cleared receipts/payments with the bank and verify invoice outstanding amounts. Old invoice `Completed` flags do **not** prove payment; invoices are settled by cleared payment entries. Do not add another payment if the cash was already recorded.
8. Run `npm run check:supabase` with `SUPABASE_USER_JWT` set to a short-lived signed-in user's access token. This is a shell-only variable, never a `VITE_` variable or committed file. The checker fails on HTTP errors, wrong schema versions or anonymous table access. An empty visible project list can be valid for a user with no memberships; the checker is not a substitute for checking membership assignments.

Both schema entry points are covered by upgrade/fresh-install PostgreSQL tests. The retired RLS scripts deliberately fail instead of disabling security. Do not execute historical additive migration files after this migration; use the documented entry points.

## Roles and audit

| Role                   | Read project data and audit | Create/edit/void financial records |
| ---------------------- | --------------------------- | ---------------------------------- |
| owner                  | Yes                         | Yes                                |
| accountant             | Yes                         | Yes                                |
| viewer                 | Yes                         | No                                 |
| non-member / anonymous | No                          | No                                 |

Membership provisioning is an administrator operation in the SQL Editor. Use `project_members` to assign or revoke access. The application cannot promote itself or change membership rows. Any authenticated account can create its own new project; invitations to existing projects remain administrator-controlled.

Every project, unit and transaction insert/update/void records a server timestamp, authenticated actor and complete before/after values in `audit_events`, in the same database transaction. The Audit history page reads these records. Application roles cannot insert, alter or delete audit records. Old `transaction_audit_log` rows are retained for historical inspection. Do not expose database-owner credentials to clients.

The UI uses version comparisons to reject stale edits. Units with any financial history cannot be archived or reclassified. Transactions are voided with a reason; physical deletion is not granted. Void linked payments before voiding an invoice. A transaction submission UUID prevents a network retry from duplicating the same posting.

## Financial interpretation

Cash metrics use cleared transactions only. Invoice obligations and landowner charges are recognized independently of their old settlement checkbox. A payment linked to a specific invoice applies there first; its excess remains a vendor advance. Unlinked payments use deterministic FIFO within the vendor. Matched cash follows the invoice's scope; unapplied cash keeps the payment's scope.

Amounts are validated to two decimal places and reconciliation/allocation uses integer paise. Rounding is distributed deterministically so unit totals reconcile to project totals. If there are no eligible developer units, project exposure stays visible as unallocated cost.

“Contracted sales less exposure” is confirmed sale value minus recorded invoices and vendor advances. It excludes unsold inventory and unrecorded future costs and is not a forecast of final profit. Buyer overpayments are shown as credits. This application does not yet implement refunds, taxes, financing flows, installment schedules or a full double-entry general ledger; do not represent those flows as vendor payments or silently erase credits.

## Hosting and operations

The app uses hash routes and compiled local CSS; no Tailwind runtime CDN is required. Configure environment variables at build time, serve over HTTPS, and apply the SQL migration separately from a static frontend deployment. Restrict database administration, retain backups, and periodically reconcile the operational ledger to source records.

The complete project snapshot avoids PostgREST's per-request row cap and split-read inconsistencies. The table UI paginates 50 rows at a time, while calculations use the complete snapshot. Very large ledgers will eventually need server-side aggregations and keyset pagination; no claim of unlimited client-side scale is made.
