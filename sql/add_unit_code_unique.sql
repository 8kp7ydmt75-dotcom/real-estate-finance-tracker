-- Multi-project data integrity migration.
-- Keeps display unit codes unique only inside a project; transaction links still use units.id UUIDs.
-- Run the duplicate check below first if you want to inspect conflicts manually:
--
-- SELECT project_id, COALESCE(unit_code, tower || flat_no) AS unit_code, COUNT(*)
-- FROM units
-- WHERE deleted_at IS NULL
-- GROUP BY project_id, COALESCE(unit_code, tower || flat_no)
-- HAVING COUNT(*) > 1;

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS unit_code text;

UPDATE units
SET unit_code = tower || flat_no
WHERE unit_code IS NULL OR unit_code = '';

ALTER TABLE units
  ALTER COLUMN unit_code SET NOT NULL;

ALTER TABLE units
  DROP CONSTRAINT IF EXISTS units_project_id_tower_flat_no_key;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM units
    WHERE deleted_at IS NULL
    GROUP BY project_id, unit_code
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active unit_code values exist within a project. Resolve duplicates before adding units_project_unit_code_unique.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS units_project_unit_code_unique
  ON units(project_id, unit_code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS units_project_tower_flat_active_unique
  ON units(project_id, tower, flat_no)
  WHERE deleted_at IS NULL;
