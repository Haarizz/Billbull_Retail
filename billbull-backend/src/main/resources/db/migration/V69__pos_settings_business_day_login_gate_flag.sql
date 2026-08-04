-- Stage 3B.2B rollout switch (per-branch): controls whether openSession()'s
-- login/session-opening gate becomes authoritative via BusinessDayValidationService
-- instead of the legacy PosBusinessDateService pointer. OFF by default on every
-- existing branch and every new install — flipping it currently has zero runtime
-- effect (see docs/business-day-architecture.md, Stage 3B.2A.5): the flag exists,
-- is readable, and is not consulted anywhere yet.
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS business_day_login_gate_v2_enabled BOOLEAN NOT NULL DEFAULT FALSE;
