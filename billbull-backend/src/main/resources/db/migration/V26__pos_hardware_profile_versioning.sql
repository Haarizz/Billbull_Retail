-- V26 POS Device Manager — Phase D enhancement: Hardware Profile versioning
-- See docs/pos-device-architecture-specification-v2-2026-06-30.md §5 (Phase D follow-up)
--
-- Lets a terminal determine whether the profile it was assigned is still the latest
-- configuration, or has since been edited (devices added/removed/changed, name/description
-- changed) without that terminal being re-synced. Foundation for agent-side config refresh,
-- dashboard staleness indicators, and audit — see HardwareProfileService/AssignmentEngine.

ALTER TABLE pos_hardware_profile
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE pos_terminals
    ADD COLUMN IF NOT EXISTS assigned_profile_version INT;
