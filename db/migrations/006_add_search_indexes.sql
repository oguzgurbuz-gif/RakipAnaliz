-- Intentionally no-op. Migration ran in production but never had SQL
-- side effects (optional FULLTEXT indexes can be added manually per
-- deployment). DO NOT DELETE — removing this file would leave an
-- unknown entry in the schema_migrations table on existing production
-- databases. Future schema changes belong in a new 024+ migration.
SELECT 1;
