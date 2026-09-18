-- Correction overlays for POS administration.
--
-- IF NOT EXISTS per the repo convention — see V62 for why (Hibernate-built schemas being
-- baselined replay this script against an existing table).
CREATE TABLE IF NOT EXISTS pos_correction_overlays (
    id BIGSERIAL PRIMARY KEY,
    target_type VARCHAR(50) NOT NULL,
    target_id BIGINT NOT NULL,
    original_snapshot_json TEXT,
    corrected_snapshot_json TEXT,
    version INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_correction_overlays_target ON pos_correction_overlays (target_type, target_id);
