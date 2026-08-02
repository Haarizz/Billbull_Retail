CREATE TABLE pos_correction_overlays (
    id BIGSERIAL PRIMARY KEY,
    target_type VARCHAR(50) NOT NULL,
    target_id BIGINT NOT NULL,
    original_snapshot_json TEXT,
    corrected_snapshot_json TEXT,
    version INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL
);

CREATE INDEX idx_pos_correction_overlays_target ON pos_correction_overlays (target_type, target_id);
