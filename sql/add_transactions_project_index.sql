-- Speeds project-scoped transaction reads and soft-delete filtering.
CREATE INDEX IF NOT EXISTS transactions_project_deleted_idx
  ON transactions(project_id, deleted_at);
