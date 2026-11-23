package com.billbull.backend.pos.checkout.attempt;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/**
 * SQL for {@code pos_checkout_attempts} (Phase 0 / M2).
 *
 * <p>Every method runs inside the caller's Spring transaction: {@link JdbcTemplate} binds to the
 * connection the {@code JpaTransactionManager} already holds, so a row lock taken here is the
 * same lock the surrounding JPA work runs under. None of these methods opens a transaction.
 *
 * <p>Leases are always computed by the database ({@code now()}), never by the JVM.
 */
@Repository
public class PosCheckoutAttemptRepository {

    private static final String COLUMNS = "id, checkout_key, key_source, request_hash, hash_version, tenant_db, "
            + "branch_id, session_id, terminal_id, initiated_by, state, owner_token, fence, owner_instance, "
            + "lease_expires_at, (lease_expires_at < now()) AS lease_expired, attempt_count, last_step, invoice_id, "
            + "invoice_number, invoice_saved_at, invoice_posted_at, payment_legs_expected, payment_legs_recorded, "
            + "session_step_required, session_recorded_at, completed_at, outcome_detail, resolved_by, resolution_reason, "
            + "serials_step_required, serials_marked_at, sales_order_step_required, sales_order_completed_at, "
            + "sales_order_outcome, qr_archived_at, stats_recorded_at";

    private static final String BLOCKING_STATES = "('ACTIVE','STALLED')";

    private final JdbcTemplate jdbc;

    public PosCheckoutAttemptRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ reads

    public Optional<PosCheckoutAttempt> findByKey(String checkoutKey) {
        return one(jdbc.query("SELECT " + COLUMNS + " FROM pos_checkout_attempts WHERE checkout_key = ?",
                MAPPER, checkoutKey));
    }

    public Optional<PosCheckoutAttempt> findById(UUID id) {
        return one(jdbc.query("SELECT " + COLUMNS + " FROM pos_checkout_attempts WHERE id = ?", MAPPER, id));
    }

    /**
     * The attempt row, locked, or an exception if another transaction holds it. NOWAIT, so a
     * caller that already holds a session row lock can never wait on an attempt row. On
     * PostgreSQL a failed NOWAIT aborts the enclosing transaction, so callers run this in a
     * transaction of its own.
     */
    public Optional<PosCheckoutAttempt> lockByIdNowait(UUID id) {
        return one(jdbc.query("SELECT " + COLUMNS + " FROM pos_checkout_attempts WHERE id = ? FOR UPDATE NOWAIT",
                MAPPER, id));
    }

    /** Attempts that hold this session open. A plain read: the caller holds the session row lock,
     *  and attempts for a session are only created while that lock is held. */
    public List<PosCheckoutAttempt> findBlockingForSession(Long sessionId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM pos_checkout_attempts WHERE session_id = ? AND state IN "
                + BLOCKING_STATES + " ORDER BY created_at", MAPPER, sessionId);
    }

    public List<PosCheckoutAttempt> findForSession(Long sessionId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM pos_checkout_attempts WHERE session_id = ? ORDER BY created_at",
                MAPPER, sessionId);
    }

    public List<PosCheckoutAttempt> findAllBlocking(int limit) {
        return jdbc.query("SELECT " + COLUMNS + " FROM pos_checkout_attempts WHERE state IN " + BLOCKING_STATES
                + " ORDER BY created_at LIMIT ?", MAPPER, limit);
    }

    /** The invoice currently stored under a checkout key, if any (durable evidence for recovery). */
    public Optional<Long> invoiceIdForKey(String checkoutKey) {
        return one(jdbc.queryForList("SELECT id FROM sales_invoices WHERE pos_checkout_key = ?", Long.class, checkoutKey));
    }

    // ------------------------------------------------------------------ claim

    /** Inserts a fresh ACTIVE attempt. Returns 0 when another transaction already owns the key. */
    public int insertIfAbsent(UUID id, String checkoutKey, String keySource, String requestHash, int hashVersion,
                              Long branchId, Long sessionId, String terminalId, String initiatedBy,
                              Long initiatedByUserId, UUID ownerToken, String ownerInstance, long leaseSeconds) {
        return jdbc.update("INSERT INTO pos_checkout_attempts (id, checkout_key, key_source, request_hash, hash_version, "
                        + "branch_id, session_id, terminal_id, initiated_by, initiated_by_user_id, state, owner_token, fence, "
                        + "owner_instance, lease_expires_at, last_step, heartbeat_at, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 1, ?, now() + make_interval(secs => ?), "
                        + "'CLAIMED', now(), now(), now()) ON CONFLICT (checkout_key) DO NOTHING",
                id, checkoutKey, keySource, requestHash, hashVersion, branchId, sessionId, terminalId,
                truncate(initiatedBy, 150), initiatedByUserId, ownerToken, truncate(ownerInstance, 200), leaseSeconds);
    }

    /**
     * Takes over a reclaimable attempt (FAILED, RELEASED; never ABANDONED) for a new worker: new owner
     * token, fence + 1, fresh lease, step evidence reset. Conditional on the state and fence the
     * caller read, so two racing reclaims cannot both succeed.
     */
    public int reclaim(UUID id, PosCheckoutAttemptState expectedState, long expectedFence, UUID newOwnerToken,
                       String ownerInstance, long leaseSeconds, String initiatedBy, Long initiatedByUserId, String note) {
        return jdbc.update("UPDATE pos_checkout_attempts SET state = 'ACTIVE', owner_token = ?, fence = fence + 1, "
                        + "owner_instance = ?, lease_expires_at = now() + make_interval(secs => ?), attempt_count = attempt_count + 1, "
                        + "last_step = 'RECLAIMED', heartbeat_at = now(), initiated_by = ?, initiated_by_user_id = ?, "
                        + "invoice_id = NULL, invoice_number = NULL, invoice_saved_at = NULL, invoice_posted_at = NULL, "
                        + "payment_legs_expected = NULL, payment_legs_recorded = 0, session_step_required = NULL, "
                        + "serials_step_required = NULL, serials_marked_at = NULL, sales_order_step_required = NULL, "
                        + "sales_order_completed_at = NULL, sales_order_outcome = NULL, qr_archived_at = NULL, stats_recorded_at = NULL, "
                        + "session_recorded_at = NULL, completed_at = NULL, outcome_detail = ?, updated_at = now() "
                        + "WHERE id = ? AND state = ? AND fence = ?",
                newOwnerToken, truncate(ownerInstance, 200), leaseSeconds, truncate(initiatedBy, 150), initiatedByUserId,
                truncate(note, 1000), id, expectedState.name(), expectedFence);
    }

    // ------------------------------------------------------------------ fenced steps

    /**
     * The fence. Succeeds only for the current owner (token and fence both match) of an attempt
     * that is still ACTIVE, or STALLED by an observer (which the owner re-adopts here). Renews the
     * lease. The row lock it takes is held until the step's transaction ends, so recovery and
     * release, which lock the same row, cannot act while a step is in flight.
     */
    public int fence(UUID id, UUID ownerToken, long fence, String step, long leaseSeconds) {
        return jdbc.update("UPDATE pos_checkout_attempts SET state = 'ACTIVE', last_step = ?, heartbeat_at = now(), "
                        + "lease_expires_at = now() + make_interval(secs => ?), updated_at = now() "
                        + "WHERE id = ? AND owner_token = ? AND fence = ? AND state IN " + BLOCKING_STATES,
                step, leaseSeconds, id, ownerToken, fence);
    }

    public void recordInvoiceSaved(UUID id, UUID ownerToken, Long invoiceId, String invoiceNumber) {
        requireOne(jdbc.update("UPDATE pos_checkout_attempts SET invoice_id = ?, invoice_number = ?, invoice_saved_at = now(), "
                + "updated_at = now() WHERE id = ? AND owner_token = ?", invoiceId, invoiceNumber, id, ownerToken));
    }

    public void recordPosted(UUID id, UUID ownerToken, int paymentLegsExpected, boolean sessionStepRequired,
                             boolean serialsStepRequired, boolean salesOrderStepRequired) {
        requireOne(jdbc.update("UPDATE pos_checkout_attempts SET invoice_posted_at = now(), payment_legs_expected = ?, "
                        + "session_step_required = ?, serials_step_required = ?, sales_order_step_required = ?, "
                        + "updated_at = now() WHERE id = ? AND owner_token = ?",
                paymentLegsExpected, sessionStepRequired, serialsStepRequired, salesOrderStepRequired, id, ownerToken));
    }

    public void recordSerialsMarked(UUID id, UUID ownerToken) {
        requireOne(jdbc.update("UPDATE pos_checkout_attempts SET serials_marked_at = now(), updated_at = now() "
                + "WHERE id = ? AND owner_token = ?", id, ownerToken));
    }

    public void recordSalesOrderCompleted(UUID id, UUID ownerToken) {
        requireOne(jdbc.update("UPDATE pos_checkout_attempts SET sales_order_completed_at = now(), updated_at = now() "
                + "WHERE id = ? AND owner_token = ?", id, ownerToken));
    }

    public void recordSalesOrderOutcome(UUID id, UUID ownerToken, String outcome) {
        requireOne(jdbc.update("UPDATE pos_checkout_attempts SET sales_order_outcome = ?, updated_at = now() "
                + "WHERE id = ? AND owner_token = ?", truncate(outcome, 1000), id, ownerToken));
    }

    /**
     * Once-marker for a derived post-completion task. Returns 1 only for the first caller; the task's
     * own writes run in the same transaction, so the task and its marker commit together or not at
     * all. Only for COMPLETED attempts.
     */
    public int claimPostTask(UUID id, String markerColumn) {
        if (!"qr_archived_at".equals(markerColumn) && !"stats_recorded_at".equals(markerColumn)) {
            throw new IllegalArgumentException("not a post-task marker: " + markerColumn);
        }
        return jdbc.update("UPDATE pos_checkout_attempts SET " + markerColumn + " = now(), updated_at = now() "
                + "WHERE id = ? AND state = 'COMPLETED' AND " + markerColumn + " IS NULL", id);
    }

    public void recordPaymentLeg(UUID id, UUID ownerToken) {
        requireOne(jdbc.update("UPDATE pos_checkout_attempts SET payment_legs_recorded = payment_legs_recorded + 1, "
                + "updated_at = now() WHERE id = ? AND owner_token = ?", id, ownerToken));
    }

    public void recordSessionRecorded(UUID id, UUID ownerToken) {
        requireOne(jdbc.update("UPDATE pos_checkout_attempts SET session_recorded_at = now(), updated_at = now() "
                + "WHERE id = ? AND owner_token = ?", id, ownerToken));
    }

    public void markCompleted(UUID id, UUID ownerToken) {
        requireOne(jdbc.update("UPDATE pos_checkout_attempts SET state = 'COMPLETED', completed_at = now(), "
                + "last_step = 'COMPLETED', updated_at = now() WHERE id = ? AND owner_token = ?", id, ownerToken));
    }

    /** Owner-side outcome after a failure: FAILED (nothing survived) or STALLED (something did). */
    public void markOutcome(UUID id, UUID ownerToken, PosCheckoutAttemptState state, String detail) {
        requireOne(jdbc.update("UPDATE pos_checkout_attempts SET state = ?, outcome_detail = ?, updated_at = now() "
                + "WHERE id = ? AND owner_token = ?", state.name(), truncate(detail, 1000), id, ownerToken));
    }

    // ------------------------------------------------------------------ recovery / release

    /** Observer-side classification of an expired attempt. The caller holds the row lock. */
    public void markRecovered(UUID id, long expectedFence, PosCheckoutAttemptState state, String detail) {
        requireOne(jdbc.update("UPDATE pos_checkout_attempts SET state = ?, outcome_detail = ?, "
                        + "completed_at = CASE WHEN ? = 'COMPLETED' THEN now() ELSE completed_at END, updated_at = now() "
                        + "WHERE id = ? AND fence = ?",
                state.name(), truncate(detail, 1000), state.name(), id, expectedFence));
    }

    /** Administrative release. Bumps the fence so the previous owner's next step is refused. */
    public void markReleased(UUID id, long expectedFence, String resolvedBy, String reason) {
        requireOne(jdbc.update("UPDATE pos_checkout_attempts SET state = 'RELEASED', fence = fence + 1, resolved_by = ?, "
                        + "resolved_at = now(), resolution_reason = ?, updated_at = now() WHERE id = ? AND fence = ?",
                truncate(resolvedBy, 150), truncate(reason, 1000), id, expectedFence));
    }

    // ------------------------------------------------------------------ abandonment (M2.2.3)

    /**
     * The tombstone for a key that was never claimed: a terminal ABANDONED row. Competes with
     * {@link #insertIfAbsent} on the same unique index, so exactly one of a racing claim and a racing
     * abandonment inserts the row; the other gets 0 (after waiting for the winner to commit).
     * The owner token is random and never handed to anyone, and the lease is already over, so no
     * fenced step can ever match this row.
     */
    public int insertAbandonedIfAbsent(UUID id, String checkoutKey, String requestHash, int hashVersion,
                                       Long branchId, Long sessionId, String terminalId, String abandonedBy,
                                       String ownerInstance, String reason) {
        return jdbc.update("INSERT INTO pos_checkout_attempts (id, checkout_key, key_source, request_hash, hash_version, "
                        + "branch_id, session_id, terminal_id, initiated_by, state, owner_token, fence, owner_instance, "
                        + "lease_expires_at, attempt_count, last_step, resolved_by, resolved_at, resolution_reason, "
                        + "outcome_detail, created_at, updated_at) "
                        + "VALUES (?, ?, 'CLIENT', ?, ?, ?, ?, ?, ?, 'ABANDONED', ?, 1, ?, now(), 0, 'ABANDONED', ?, now(), ?, "
                        + "'abandoned before any claim: the key is reserved and was never used for a sale', now(), now()) "
                        + "ON CONFLICT (checkout_key) DO NOTHING",
                id, checkoutKey, requestHash, hashVersion, branchId, sessionId, truncate(terminalId, 100),
                truncate(abandonedBy, 150), UUID.randomUUID(), truncate(ownerInstance, 200),
                truncate(abandonedBy, 150), truncate(reason, 1000));
    }

    /**
     * FAILED or RELEASED → ABANDONED. The caller holds the row lock and has checked that no invoice
     * survives. Conditional on the state and fence it read; bumps the fence so no earlier owner token
     * can ever match again.
     */
    public int markAbandoned(UUID id, PosCheckoutAttemptState expectedState, long expectedFence,
                             String abandonedBy, String reason) {
        return jdbc.update("UPDATE pos_checkout_attempts SET state = 'ABANDONED', fence = fence + 1, last_step = 'ABANDONED', "
                        + "resolved_by = ?, resolved_at = now(), resolution_reason = ?, updated_at = now() "
                        + "WHERE id = ? AND state = ? AND fence = ?",
                truncate(abandonedBy, 150), truncate(reason, 1000), id, expectedState.name(), expectedFence);
    }

    /** A sale recorded before the journal existed (no attempt row), by its checkout key. */
    public Optional<LegacyInvoice> legacyInvoiceForKey(String checkoutKey) {
        return one(jdbc.query("SELECT id, invoice_number, branch_id, pos_session_id, created_by_user_id FROM sales_invoices "
                        + "WHERE pos_checkout_key = ?",
                (rs, n) -> new LegacyInvoice(rs.getLong("id"), rs.getString("invoice_number"),
                        (Long) rs.getObject("branch_id"), (Long) rs.getObject("pos_session_id"), (Long) rs.getObject("created_by_user_id")),
                checkoutKey));
    }

    public record LegacyInvoice(Long id, String invoiceNumber, Long branchId, Long sessionId, Long createdByUserId) {}

    // ------------------------------------------------------------------ recovery listing (M2.2.3)

    /**
     * Attempts of one branch created in the last {@code sinceHours} hours, newest first, for the till's
     * recovery after local data loss. {@code actor} non-null restricts the rows to those the actor
     * started or that belong to a session the actor currently owns (by username, or by the stable
     * owner id when {@code actorUserId} is known); null means every row of the branch (a supervisor).
     * {@code sessionId} / {@code terminalId} only narrow the result, they never widen it.
     *
     * <p>Selects only what a till may see: no request hash, owner token, fence, owner instance,
     * outcome detail (it can carry exception text) or resolution reason.
     */
    public List<RecoverableRow> findRecoverable(Long branchId, String actor, Long actorUserId, Long sessionId,
                                                String terminalId, int sinceHours, int limit) {
        StringBuilder sql = new StringBuilder("SELECT a.checkout_key, a.state, a.branch_id, a.session_id, a.terminal_id, "
                + "a.initiated_by, a.invoice_id, a.invoice_number, a.last_step, a.created_at, a.updated_at, a.completed_at, "
                + "(a.lease_expires_at < now()) AS lease_expired, "
                + "(SELECT si.id FROM sales_invoices si WHERE si.pos_checkout_key = a.checkout_key "
                + "   OR (a.invoice_id IS NOT NULL AND si.id = a.invoice_id) ORDER BY si.id LIMIT 1) AS surviving_invoice_id, "
                + "(SELECT si.invoice_number FROM sales_invoices si WHERE si.pos_checkout_key = a.checkout_key "
                + "   OR (a.invoice_id IS NOT NULL AND si.id = a.invoice_id) ORDER BY si.id LIMIT 1) AS surviving_invoice_number "
                + "FROM pos_checkout_attempts a WHERE a.branch_id = ? "
                + "AND a.created_at > now() - make_interval(hours => ?) ");
        List<Object> args = new java.util.ArrayList<>(List.of(branchId, sinceHours));
        if (sessionId != null) { sql.append("AND a.session_id = ? "); args.add(sessionId); }
        if (terminalId != null && !terminalId.isBlank()) { sql.append("AND a.terminal_id = ? "); args.add(terminalId.trim()); }
        if (actor != null) {
            sql.append("AND (lower(a.initiated_by) = lower(?) OR a.session_id IN (SELECT s.id FROM pos_sessions s "
                    + "WHERE s.branch_id = a.branch_id AND (lower(s.opened_by) = lower(?)");
            args.add(actor);
            args.add(actor);
            if (actorUserId != null) { sql.append(" OR s.owner_user_id = ?"); args.add(actorUserId); }
            sql.append("))) ");
        }
        sql.append("ORDER BY a.created_at DESC LIMIT ?");
        args.add(limit);
        return jdbc.query(sql.toString(), (rs, n) -> new RecoverableRow(
                rs.getString("checkout_key"),
                PosCheckoutAttemptState.valueOf(rs.getString("state")),
                (Long) rs.getObject("branch_id"),
                (Long) rs.getObject("session_id"),
                rs.getString("terminal_id"),
                rs.getString("initiated_by"),
                (Long) rs.getObject("invoice_id"),
                rs.getString("invoice_number"),
                (Long) rs.getObject("surviving_invoice_id"),
                rs.getString("surviving_invoice_number"),
                rs.getString("last_step"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class),
                rs.getObject("completed_at", OffsetDateTime.class),
                rs.getBoolean("lease_expired")), args.toArray());
    }

    public record RecoverableRow(String checkoutKey, PosCheckoutAttemptState state, Long branchId, Long sessionId,
                                 String terminalId, String initiatedBy, Long invoiceId, String invoiceNumber,
                                 Long survivingInvoiceId, String survivingInvoiceNumber, String lastStep,
                                 OffsetDateTime createdAt, OffsetDateTime updatedAt, OffsetDateTime completedAt,
                                 boolean leaseExpired) {}

    // ------------------------------------------------------------------ helpers

    private static void requireOne(int rows) {
        if (rows != 1) {
            throw new IllegalStateException("pos_checkout_attempts: expected to update one row, updated " + rows);
        }
    }

    private static <T> Optional<T> one(List<T> rows) {
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    private static final RowMapper<PosCheckoutAttempt> MAPPER = PosCheckoutAttemptRepository::map;

    private static PosCheckoutAttempt map(ResultSet rs, int row) throws SQLException {
        return new PosCheckoutAttempt(
                rs.getObject("id", UUID.class),
                rs.getString("checkout_key"),
                rs.getString("key_source"),
                rs.getString("request_hash"),
                rs.getInt("hash_version"),
                rs.getString("tenant_db"),
                (Long) rs.getObject("branch_id"),
                (Long) rs.getObject("session_id"),
                rs.getString("terminal_id"),
                rs.getString("initiated_by"),
                PosCheckoutAttemptState.valueOf(rs.getString("state")),
                rs.getObject("owner_token", UUID.class),
                rs.getLong("fence"),
                rs.getString("owner_instance"),
                rs.getObject("lease_expires_at", OffsetDateTime.class),
                rs.getBoolean("lease_expired"),
                rs.getInt("attempt_count"),
                rs.getString("last_step"),
                (Long) rs.getObject("invoice_id"),
                rs.getString("invoice_number"),
                rs.getObject("invoice_saved_at", OffsetDateTime.class),
                rs.getObject("invoice_posted_at", OffsetDateTime.class),
                (Integer) rs.getObject("payment_legs_expected"),
                rs.getInt("payment_legs_recorded"),
                (Boolean) rs.getObject("session_step_required"),
                rs.getObject("session_recorded_at", OffsetDateTime.class),
                rs.getObject("completed_at", OffsetDateTime.class),
                (Boolean) rs.getObject("serials_step_required"),
                rs.getObject("serials_marked_at", OffsetDateTime.class),
                (Boolean) rs.getObject("sales_order_step_required"),
                rs.getObject("sales_order_completed_at", OffsetDateTime.class),
                rs.getString("sales_order_outcome"),
                rs.getObject("qr_archived_at", OffsetDateTime.class),
                rs.getObject("stats_recorded_at", OffsetDateTime.class),
                rs.getString("outcome_detail"),
                rs.getString("resolved_by"),
                rs.getString("resolution_reason"));
    }
}
