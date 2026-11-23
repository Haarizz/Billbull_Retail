package com.billbull.backend.pos.offline;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/**
 * SQL for the M3 offline tables (V140). Like the M2 attempt repository, every method runs in the
 * caller's transaction and every time comparison uses the database clock.
 */
@Repository
public class PosOfflineRepository {

    private final JdbcTemplate jdbc;

    public PosOfflineRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------------ rows

    public record TerminalKey(UUID id, String terminalId, Long terminalPk, Long branchId, String spki,
                              String publicKeySha256, String status, Long seqAtRevocation) {}

    public record Lease(UUID id, String tenant, Long branchId, String terminalId, Long terminalPk, Long sessionId,
                        UUID keyId, String operatorUsername, LocalDate businessDate, Instant issuedAt,
                        Instant notAfter, Instant graceUntil, int maxSales, long maxValueMinor, long seqStart,
                        long seqEnd, String tenderTypes, String productPolicy, String catalogVersion,
                        int policyVersion, String signingKeyId, String jws, String status,
                        boolean expired, boolean graceOver) {}

    public record OfflineSale(UUID id, UUID leaseId, UUID keyId, long localSeq, String checkoutKey,
                              String payloadSha256, String payload, String signature, Long branchId,
                              String terminalId, Long sessionId, long totalMinor, Instant capturedAtDevice,
                              Instant receivedAt, String state, String reasonCode, String reasonDetail,
                              Long invoiceId, String invoiceNumber, int postAttempts) {}

    // ------------------------------------------------------------------ terminal keys

    private static final String KEY_COLUMNS =
            "id, terminal_id, terminal_pk, branch_id, public_key_spki, public_key_sha256, status, seq_at_revocation";

    private static final RowMapper<TerminalKey> KEY_MAPPER = (rs, n) -> new TerminalKey(
            rs.getObject("id", UUID.class), rs.getString("terminal_id"), nullableLong(rs, "terminal_pk"),
            rs.getLong("branch_id"), rs.getString("public_key_spki"), rs.getString("public_key_sha256"),
            rs.getString("status"), nullableLong(rs, "seq_at_revocation"));

    public Optional<TerminalKey> findKey(UUID keyId) {
        return one(jdbc.query("SELECT " + KEY_COLUMNS + " FROM pos_offline_terminal_keys WHERE id = ?", KEY_MAPPER, keyId));
    }

    public Optional<TerminalKey> findActiveKeyForTerminal(String terminalId) {
        return one(jdbc.query("SELECT " + KEY_COLUMNS + " FROM pos_offline_terminal_keys WHERE terminal_id = ? AND status = 'ACTIVE'",
                KEY_MAPPER, terminalId));
    }

    public Optional<TerminalKey> findKeyByPublicKeyHash(String sha256) {
        return one(jdbc.query("SELECT " + KEY_COLUMNS + " FROM pos_offline_terminal_keys WHERE public_key_sha256 = ?",
                KEY_MAPPER, sha256));
    }

    public int retireActiveKeys(String terminalId) {
        return jdbc.update("UPDATE pos_offline_terminal_keys SET status = 'RETIRED' WHERE terminal_id = ? AND status = 'ACTIVE'",
                terminalId);
    }

    public void insertKey(UUID id, String terminalId, Long terminalPk, Long branchId, String spki, String sha256,
                          String enrolledBy) {
        jdbc.update("INSERT INTO pos_offline_terminal_keys (id, terminal_id, terminal_pk, branch_id, public_key_spki, "
                        + "public_key_sha256, status, enrolled_by) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)",
                id, terminalId, terminalPk, branchId, spki, sha256, enrolledBy);
    }

    // ------------------------------------------------------------------ leases

    private static final String LEASE_COLUMNS = "id, tenant_db, branch_id, terminal_id, terminal_pk, session_id, key_id, "
            + "operator_username, business_date, issued_at, not_after, grace_until, max_sales, max_value_minor, seq_start, "
            + "seq_end, tender_types, product_policy, catalog_version, policy_version, signing_key_id, jws, status, "
            + "(not_after < now()) AS expired, (grace_until < now()) AS grace_over";

    private static final RowMapper<Lease> LEASE_MAPPER = (rs, n) -> new Lease(
            rs.getObject("id", UUID.class), rs.getString("tenant_db"), rs.getLong("branch_id"),
            rs.getString("terminal_id"), nullableLong(rs, "terminal_pk"), rs.getLong("session_id"),
            rs.getObject("key_id", UUID.class), rs.getString("operator_username"),
            rs.getObject("business_date", LocalDate.class), instant(rs, "issued_at"), instant(rs, "not_after"),
            instant(rs, "grace_until"), rs.getInt("max_sales"), rs.getLong("max_value_minor"),
            rs.getLong("seq_start"), rs.getLong("seq_end"), rs.getString("tender_types"),
            rs.getString("product_policy"), rs.getString("catalog_version"), rs.getInt("policy_version"),
            rs.getString("signing_key_id"), rs.getString("jws"), rs.getString("status"),
            rs.getBoolean("expired"), rs.getBoolean("grace_over"));

    public Optional<Lease> findLease(UUID id) {
        return one(jdbc.query("SELECT " + LEASE_COLUMNS + " FROM pos_offline_leases WHERE id = ?", LEASE_MAPPER, id));
    }

    public Optional<Lease> lockLease(UUID id) {
        return one(jdbc.query("SELECT " + LEASE_COLUMNS + " FROM pos_offline_leases WHERE id = ? FOR UPDATE", LEASE_MAPPER, id));
    }

    public Optional<Lease> findActiveLeaseForTerminal(String terminalId) {
        return one(jdbc.query("SELECT " + LEASE_COLUMNS + " FROM pos_offline_leases WHERE terminal_id = ? AND status = 'ACTIVE'",
                LEASE_MAPPER, terminalId));
    }

    public List<Lease> findActiveLeasesForSession(Long sessionId) {
        return jdbc.query("SELECT " + LEASE_COLUMNS + " FROM pos_offline_leases WHERE session_id = ? AND status = 'ACTIVE'",
                LEASE_MAPPER, sessionId);
    }

    /** Leases of a branch's business date that are not settled: the Day Close gate. */
    public List<Lease> findUnsettledLeasesForBranchDate(Long branchId, LocalDate businessDate) {
        return jdbc.query("SELECT " + LEASE_COLUMNS + " FROM pos_offline_leases WHERE branch_id = ? AND business_date = ? "
                + "AND status = 'ACTIVE'", LEASE_MAPPER, branchId, businessDate);
    }

    /** Value already authorised to ACTIVE leases of the branch that have not expired yet. */
    public long outstandingAuthorisedValue(Long branchId) {
        Long v = jdbc.queryForObject("SELECT COALESCE(SUM(max_value_minor), 0) FROM pos_offline_leases "
                + "WHERE branch_id = ? AND status = 'ACTIVE' AND not_after > now()", Long.class, branchId);
        return v == null ? 0 : v;
    }

    /** Next free sequence number for a key: sequences never overlap between that key's leases. */
    public long nextSeqStart(UUID keyId) {
        Long v = jdbc.queryForObject("SELECT COALESCE(MAX(seq_end), 1) FROM pos_offline_leases WHERE key_id = ?",
                Long.class, keyId);
        return v == null ? 1 : v;
    }

    public Instant dbNow() {
        return jdbc.queryForObject("SELECT now()", (rs, n) -> instant(rs, "now"));
    }

    public void insertLease(UUID id, Long branchId, String terminalId, Long terminalPk, Long sessionId, UUID keyId,
                            String operator, LocalDate businessDate, Instant issuedAt, Instant notAfter,
                            Instant graceUntil, int maxSales, long maxValueMinor, long seqStart, long seqEnd,
                            String tenderTypes, String productPolicy, String catalogVersion, int policyVersion,
                            String signingKeyId, String jws, String issuedBy) {
        jdbc.update("INSERT INTO pos_offline_leases (id, branch_id, terminal_id, terminal_pk, session_id, key_id, "
                        + "operator_username, business_date, issued_at, not_after, grace_until, max_sales, max_value_minor, "
                        + "seq_start, seq_end, tender_types, product_policy, catalog_version, policy_version, signing_key_id, "
                        + "jws, status, issued_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?)",
                id, branchId, terminalId, terminalPk, sessionId, keyId, operator, businessDate, ts(issuedAt),
                ts(notAfter), ts(graceUntil), maxSales, maxValueMinor, seqStart, seqEnd, tenderTypes, productPolicy,
                catalogVersion, policyVersion, signingKeyId, jws, issuedBy);
    }

    public int closeLease(UUID id, String status, String by, String reason, String summary) {
        return jdbc.update("UPDATE pos_offline_leases SET status = ?, closed_at = now(), closed_by = ?, close_reason = ?, "
                + "close_summary = ?, updated_at = now() WHERE id = ? AND status = 'ACTIVE'", status, by, reason, summary, id);
    }

    // ------------------------------------------------------------------ offline sales

    private static final String SALE_COLUMNS = "id, lease_id, key_id, local_seq, checkout_key, payload_sha256, payload, "
            + "signature, branch_id, terminal_id, session_id, total_minor, captured_at_device, received_at, state, "
            + "reason_code, reason_detail, invoice_id, invoice_number, post_attempts";

    private static final RowMapper<OfflineSale> SALE_MAPPER = (rs, n) -> new OfflineSale(
            rs.getObject("id", UUID.class), rs.getObject("lease_id", UUID.class), rs.getObject("key_id", UUID.class),
            rs.getLong("local_seq"), rs.getString("checkout_key"), rs.getString("payload_sha256"),
            rs.getString("payload"), rs.getString("signature"), rs.getLong("branch_id"), rs.getString("terminal_id"),
            rs.getLong("session_id"), rs.getLong("total_minor"), instant(rs, "captured_at_device"),
            instant(rs, "received_at"), rs.getString("state"), rs.getString("reason_code"),
            rs.getString("reason_detail"), nullableLong(rs, "invoice_id"), rs.getString("invoice_number"),
            rs.getInt("post_attempts"));

    public Optional<OfflineSale> findSale(UUID id) {
        return one(jdbc.query("SELECT " + SALE_COLUMNS + " FROM pos_offline_sales WHERE id = ?", SALE_MAPPER, id));
    }

    public Optional<OfflineSale> lockSale(UUID id) {
        return one(jdbc.query("SELECT " + SALE_COLUMNS + " FROM pos_offline_sales WHERE id = ? FOR UPDATE", SALE_MAPPER, id));
    }

    public Optional<OfflineSale> findSaleByKeySeq(UUID keyId, long seq) {
        return one(jdbc.query("SELECT " + SALE_COLUMNS + " FROM pos_offline_sales WHERE key_id = ? AND local_seq = ?",
                SALE_MAPPER, keyId, seq));
    }

    public Optional<OfflineSale> findSaleByCheckoutKey(String checkoutKey) {
        return one(jdbc.query("SELECT " + SALE_COLUMNS + " FROM pos_offline_sales WHERE checkout_key = ?",
                SALE_MAPPER, checkoutKey));
    }

    public List<OfflineSale> findSalesForLease(UUID leaseId) {
        return jdbc.query("SELECT " + SALE_COLUMNS + " FROM pos_offline_sales WHERE lease_id = ? ORDER BY local_seq",
                SALE_MAPPER, leaseId);
    }

    public List<OfflineSale> findReviewQueue(Long branchId) {
        return jdbc.query("SELECT " + SALE_COLUMNS + " FROM pos_offline_sales WHERE branch_id = ? "
                + "AND state IN ('HELD','BLOCKED','RECEIVED') ORDER BY received_at", SALE_MAPPER, branchId);
    }

    /** Count and value of a lease's records already received (any state): the server-side caps. */
    public long[] leaseUsage(UUID leaseId) {
        return jdbc.queryForObject("SELECT COUNT(*), COALESCE(SUM(total_minor), 0) FROM pos_offline_sales WHERE lease_id = ?",
                (rs, n) -> new long[] { rs.getLong(1), rs.getLong(2) }, leaseId);
    }

    public void insertSale(UUID id, UUID leaseId, UUID keyId, long seq, String checkoutKey, String sha256,
                           String payload, String signature, Long branchId, String terminalId, Long sessionId,
                           long totalMinor, Instant capturedAt, String receivedBy, String state, String reasonCode,
                           String reasonDetail) {
        jdbc.update("INSERT INTO pos_offline_sales (id, lease_id, key_id, local_seq, checkout_key, payload_sha256, payload, "
                        + "signature, branch_id, terminal_id, session_id, total_minor, captured_at_device, received_by, state, "
                        + "reason_code, reason_detail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                id, leaseId, keyId, seq, checkoutKey, sha256, payload, signature, branchId, terminalId, sessionId,
                totalMinor, ts(capturedAt), receivedBy, state, reasonCode, truncate(reasonDetail));
    }

    public void markPosted(UUID id, Long invoiceId, String invoiceNumber, String reasonCode) {
        jdbc.update("UPDATE pos_offline_sales SET state = 'POSTED', invoice_id = ?, invoice_number = ?, reason_code = ?, "
                + "reason_detail = NULL, posted_at = now(), post_attempts = post_attempts + 1, updated_at = now() WHERE id = ?",
                invoiceId, invoiceNumber, reasonCode, id);
    }

    public void markState(UUID id, String state, String reasonCode, String reasonDetail, boolean countAttempt) {
        jdbc.update("UPDATE pos_offline_sales SET state = ?, reason_code = ?, reason_detail = ?, "
                        + "post_attempts = post_attempts + ?, updated_at = now() WHERE id = ?",
                state, reasonCode, truncate(reasonDetail), countAttempt ? 1 : 0, id);
    }

    // ------------------------------------------------------------------ helpers

    private static String truncate(String s) {
        return s == null || s.length() <= 1000 ? s : s.substring(0, 997) + "...";
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }

    private static Instant instant(ResultSet rs, String col) throws SQLException {
        OffsetDateTime t = rs.getObject(col, OffsetDateTime.class);
        return t == null ? null : t.toInstant();
    }

    private static Long nullableLong(ResultSet rs, String col) throws SQLException {
        long v = rs.getLong(col);
        return rs.wasNull() ? null : v;
    }

    private static <T> Optional<T> one(List<T> rows) {
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }
}
