-- Category A control fixes
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS delete_reason text;

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS carpet_area_sqft numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saleable_area_sqft numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_sold boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_settled boolean DEFAULT false;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_scope_unit_check,
  ADD CONSTRAINT transactions_scope_unit_check CHECK (scope <> 'PerUnit' OR unit_id IS NOT NULL),
  DROP CONSTRAINT IF EXISTS transactions_project_id_fkey,
  DROP CONSTRAINT IF EXISTS transactions_project_fk,
  ADD CONSTRAINT transactions_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS transactions_unit_id_fkey,
  DROP CONSTRAINT IF EXISTS transactions_unit_fk,
  ADD CONSTRAINT transactions_unit_fk FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS transaction_audit_log (
  id bigserial PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  change_reason text NOT NULL
);
