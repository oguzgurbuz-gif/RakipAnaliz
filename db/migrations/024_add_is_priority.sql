-- Adds an `is_priority` flag to `sites` so the dashboard can sort/highlight
-- the user's own sites (bitalih, hipodrom, atyarisi) without hardcoding
-- the list in the frontend. The existing `priority SMALLINT` column is the
-- scraper's importance score (controls scrape ordering); `is_priority` is
-- a separate "this is one of our brands" flag used for UI grouping and
-- color assignment.
ALTER TABLE sites
  ADD COLUMN is_priority TINYINT(1) NOT NULL DEFAULT 0;

UPDATE sites
   SET is_priority = 1
 WHERE code IN ('bitalih', 'hipodrom', 'atyarisi');
