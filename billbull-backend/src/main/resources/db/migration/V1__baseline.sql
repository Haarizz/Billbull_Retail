-- V1 — Flyway baseline marker (ARCHFIX P0 §1.1).
--
-- The schema is currently owned by Hibernate (ddl-auto=update). This baseline does NOT
-- attempt to recreate that schema; it only marks the starting point so subsequent V2+
-- migrations apply on top of whatever Hibernate has produced. With
-- spring.flyway.baseline-on-migrate=true an existing tenant DB is adopted at this version
-- without replaying any history.
--
-- Intentionally a no-op.
SELECT 1;
