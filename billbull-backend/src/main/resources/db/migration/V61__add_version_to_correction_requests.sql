-- STORY-101 (ADR-002) - Add optimistic locking to CorrectionRequest
ALTER TABLE pos_correction_requests 
ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
