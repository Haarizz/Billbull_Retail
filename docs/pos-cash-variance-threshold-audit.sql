-- POS cash-variance threshold audit — READ ONLY.
--
-- Run before rolling out the Phase 5 variance gate. Nothing here writes: it reports which
-- branches would require supervisor authorization for every discrepancy under the current
-- configuration, so the policy decision stays with the business.
--
-- WHY THIS MATTERS
--
-- pos_settings.cash_variance_threshold used to be read as:
--
--     if (threshold.signum() > 0 && variance > threshold)  -> require approval
--
-- so a threshold of 0 — the value every branch ships with — DISABLED the check entirely. The
-- strictest-looking setting was the one that never fired, and any variance closed unchallenged.
--
-- It now means what it says:
--
--     threshold = 0   -> ZERO TOLERANCE: any non-zero variance needs supervisor authorization
--     threshold > 0   -> |variance| <= threshold closes unaided; beyond it needs authorization
--     threshold NULL  -> unconfigured, treated as 0
--
-- There is deliberately no "disabled" state and no invented default. A branch that genuinely
-- wants a tolerance must state one, which is at least visible in configuration.
--
-- MULTI-TENANT NOTE
--
-- Each client runs its own PostgreSQL database (one Spring profile per client — see
-- application-{client}.properties). Run this once per tenant database; there is no cross-tenant
-- view. The profile name is not stored in the data, so label the output with the tenant you ran
-- it against.

-- ── 1. Every branch, and what its threshold now means ────────────────────────────────────
SELECT
    b.id                                AS branch_id,
    b.code                              AS branch_code,
    b.name                              AS branch_name,
    ps.cash_variance_threshold          AS threshold,
    CASE
        WHEN ps.branch_id IS NULL               THEN 'NO SETTINGS ROW - treated as ZERO TOLERANCE'
        WHEN ps.cash_variance_threshold IS NULL THEN 'NULL - treated as ZERO TOLERANCE'
        WHEN ps.cash_variance_threshold = 0     THEN 'ZERO TOLERANCE - every variance needs approval'
        ELSE 'TOLERANCE ' || ps.cash_variance_threshold::text
    END                                 AS effective_policy,
    ps.require_cash_movement_category   AS requires_movement_category
FROM branches b
LEFT JOIN pos_settings ps ON ps.branch_id = b.id
ORDER BY
    -- Branches that will start demanding authorization first.
    CASE WHEN COALESCE(ps.cash_variance_threshold, 0) = 0 THEN 0 ELSE 1 END,
    b.code;

-- ── 2. Just the count, for a go/no-go decision ───────────────────────────────────────────
SELECT
    COUNT(*) FILTER (WHERE COALESCE(ps.cash_variance_threshold, 0) = 0) AS branches_at_zero_tolerance,
    COUNT(*) FILTER (WHERE COALESCE(ps.cash_variance_threshold, 0) > 0) AS branches_with_tolerance,
    COUNT(*)                                                            AS branches_total
FROM branches b
LEFT JOIN pos_settings ps ON ps.branch_id = b.id;

-- ── 3. What zero tolerance would actually have cost, historically ────────────────────────
--
-- How many already-closed sessions carried a variance that WOULD have required authorization
-- under each branch's current threshold. A large number here means the gate will be hit often
-- and the threshold probably needs a deliberate value rather than the default.
--
-- Counted sessions only: an uncounted drawer has no variance to judge.
SELECT
    s.branch_id,
    b.code                                                   AS branch_code,
    COALESCE(ps.cash_variance_threshold, 0)                  AS threshold,
    COUNT(*)                                                 AS closed_counted_sessions,
    COUNT(*) FILTER (WHERE ABS(s.cash_difference) > 0.025)   AS sessions_with_variance,
    COUNT(*) FILTER (
        WHERE ABS(s.cash_difference) > GREATEST(COALESCE(ps.cash_variance_threshold, 0), 0.025)
    )                                                        AS would_require_approval,
    ROUND(MAX(ABS(s.cash_difference)), 2)                    AS largest_variance
FROM pos_sessions s
JOIN branches b       ON b.id = s.branch_id
LEFT JOIN pos_settings ps ON ps.branch_id = s.branch_id
WHERE s.status = 'CLOSED'
  AND s.cash_difference IS NOT NULL          -- NULL means the drawer was never counted
GROUP BY s.branch_id, b.code, ps.cash_variance_threshold
ORDER BY would_require_approval DESC, b.code;
