-- Intentionally no-op. Migration ran in production but never had SQL
-- side effects (logic was merged into 001_initial_schema.sql before
-- this file was authored). DO NOT DELETE — removing this file would
-- leave an unknown entry in the schema_migrations table on existing
-- production databases. Future schema changes belong in a new 024+
-- migration.
SELECT 1;
