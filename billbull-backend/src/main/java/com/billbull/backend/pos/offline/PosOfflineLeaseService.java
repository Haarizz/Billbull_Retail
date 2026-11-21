package com.billbull.backend.pos.offline;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.common.UuidV7;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.pos.terminal.PosTerminalStatus;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * M3 offline authorisation: terminal key enrolment, lease issuance and lease settlement, plus the
 * session and Day Close gates that keep reconciliation safe while a lease is outstanding.
 *
 * <h2>Lease rules</h2>
 * <ul>
 *   <li>Issued only to the owner of an OPEN session, on the session's own terminal and branch, on a
 *       FAST_SALE tenant, to a terminal with an ACTIVE enrolled key. At most one ACTIVE lease per
 *       terminal; the branch's total authorised value is capped too.</li>
 *   <li>The till sells offline only until {@code notAfter} (device clock, honest mode). Records
 *       created up to then are accepted and posted normally until {@code graceUntil}; after that,
 *       or if captured after {@code notAfter} + skew, they are stored and held for review.</li>
 *   <li>While a lease is ACTIVE its session cannot be closed, start closing, be suspended
 *       (manually or by the idle scheduler), transferred, taken over or handed over, and the
 *       branch's Day Close for that date is refused. Expiry does not lift this: only a matched,
 *       signed close summary from the till (every record received and posted) or an audited
 *       supervisor abandonment ends a lease.</li>
 * </ul>
 */
@Service
public class PosOfflineLeaseService {

    private static final Logger log = LoggerFactory.getLogger(PosOfflineLeaseService.class);
    static final String[] ADMIN_ROLES = { "ADMIN", "SUPER_ADMIN", "BRANCH_ADMIN" };

    private final PosOfflineRepository repo;
    private final PosOfflineSigningKeyStore keyStore;
    private final PosOfflineSettings settings;
    private final PosSessionService sessionService;
    private final PosTerminalRepository terminalRepository;
    private final BranchAccessService branchAccessService;
    private final PosAuditService auditService;
    private final ObjectMapper mapper;
    private final com.billbull.backend.pos.businessdate.BusinessDayCheckoutGate businessDayCheckoutGate;
    private final com.billbull.backend.pos.businessdate.BusinessDayContinuationGate continuationGate;
    private final com.billbull.backend.pos.session.PosSessionClosureWorkflowGate closureWorkflowGate;
    private final com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService;

    public PosOfflineLeaseService(PosOfflineRepository repo, PosOfflineSigningKeyStore keyStore,
                                  PosOfflineSettings settings, PosSessionService sessionService,
                                  PosTerminalRepository terminalRepository, BranchAccessService branchAccessService,
                                  PosAuditService auditService, ObjectMapper mapper,
                                  com.billbull.backend.pos.businessdate.BusinessDayCheckoutGate businessDayCheckoutGate,
                                  com.billbull.backend.pos.businessdate.BusinessDayContinuationGate continuationGate,
                                  com.billbull.backend.pos.session.PosSessionClosureWorkflowGate closureWorkflowGate,
                                  com.billbull.backend.sales.settings.SalesSettingsService salesSettingsService) {
        this.repo = repo;
        this.keyStore = keyStore;
        this.settings = settings;
        this.sessionService = sessionService;
        this.terminalRepository = terminalRepository;
        this.branchAccessService = branchAccessService;
        this.auditService = auditService;
        this.mapper = mapper;
        this.businessDayCheckoutGate = businessDayCheckoutGate;
        this.continuationGate = continuationGate;
        this.closureWorkflowGate = closureWorkflowGate;
        this.salesSettingsService = salesSettingsService;
    }

    // ------------------------------------------------------------------ enrolment

    /**
     * Binds a till-generated P-256 public key to a terminal. Administrator only (the enrolment is
     * the approval step); the private key never leaves the till.
     */
    @Transactional
    public Map<String, Object> enroll(String terminalId, String spkiBase64) {
        Long branchId = currentBranchId();
        requireEnabled(branchId);
        if (!branchAccessService.currentUserHasRole(ADMIN_ROLES)) {
            throw new PosOfflineRefusal(HttpStatus.FORBIDDEN, "OFFLINE_ENROLL_ADMIN_ONLY",
                    "Only an administrator or branch administrator can enable offline selling on a till.");
        }
        PosTerminal terminal = requireTerminal(terminalId, branchId);
        java.security.PublicKey key;
        try {
            key = PosOfflineCrypto.parseP256Spki(spkiBase64);
        } catch (IllegalArgumentException e) {
            throw new PosOfflineRefusal(HttpStatus.BAD_REQUEST, "OFFLINE_KEY_INVALID", e.getMessage());
        }
        String canonicalSpki = Base64.getEncoder().encodeToString(key.getEncoded());
        String sha = PosOfflineCrypto.sha256Hex(key.getEncoded());
        var existing = repo.findKeyByPublicKeyHash(sha);
        UUID keyId;
        if (existing.isPresent()) {
            var k = existing.get();
            if (!k.terminalId().equals(terminal.getTerminalId()) || !"ACTIVE".equals(k.status())) {
                throw new PosOfflineRefusal(HttpStatus.CONFLICT, "OFFLINE_KEY_REUSED",
                        "This signing key is already registered to another terminal or was retired.");
            }
            keyId = k.id();
        } else {
            var outstanding = repo.findActiveLeaseForTerminal(terminal.getTerminalId());
            if (outstanding.isPresent()) {
                throw new PosOfflineRefusal(HttpStatus.CONFLICT, "OFFLINE_LEASE_OUTSTANDING",
                        "The terminal holds an offline lease that is not settled; settle it before replacing its key.",
                        Map.of("leaseId", outstanding.get().id()));
            }
            repo.retireActiveKeys(terminal.getTerminalId());
            keyId = UUID.fromString(UuidV7.generate());
            repo.insertKey(keyId, terminal.getTerminalId(), terminal.getId(), terminal.getBranchId(), canonicalSpki, sha,
                    currentUser());
            auditService.logSessionEvent(null, terminal.getTerminalId(), terminal.getBranchId(), "OFFLINE_KEY_ENROLLED",
                    "keyId=" + keyId + " publicKeySha256=" + sha + " by=" + currentUser());
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("keyId", keyId);
        body.put("terminalId", terminal.getTerminalId());
        body.put("tenant", keyStore.tenant());
        body.put("serverKey", serverKey());
        return body;
    }

    public Map<String, Object> serverKey() {
        var k = keyStore.current();
        return Map.of("kid", k.keyId(), "spki", k.spkiBase64(), "alg", "ES256");
    }

    // ------------------------------------------------------------------ issuance

    /**
     * Issues (or returns the caller's own still-valid) lease for the session. The session row is
     * locked first, the same lock close/suspend/transfer take, so a lease can never be issued to a
     * session that is being closed.
     */
    @Transactional
    public Map<String, Object> issue(String terminalId, Long sessionId, String catalogVersion) {
        Long branchId = currentBranchId();
        requireEnabled(branchId);
        if (sessionId == null || terminalId == null || terminalId.isBlank()) {
            throw new PosOfflineRefusal(HttpStatus.BAD_REQUEST, "OFFLINE_LEASE_REQUEST_INVALID", "terminalId and sessionId are required.");
        }
        PosTerminal terminal = requireTerminal(terminalId, branchId);
        PosSession session = sessionService.lockById(sessionId);
        if (session.getStatus() != PosSessionStatus.OPEN) {
            throw new PosOfflineRefusal(HttpStatus.CONFLICT, "SESSION_NOT_OPEN", "Offline selling needs an OPEN session.");
        }
        if (!branchId.equals(session.getBranchId())) {
            throw new PosOfflineRefusal(HttpStatus.FORBIDDEN, "SESSION_MISMATCH", "The session belongs to another branch.");
        }
        if (session.getTerminalId() == null || !session.getTerminalId().trim().equals(terminal.getTerminalId())) {
            throw new PosOfflineRefusal(HttpStatus.CONFLICT, "SESSION_MISMATCH", "The session is not open on this terminal.");
        }
        String operator = currentUser();
        if (!operator.equals(session.getOpenedBy())) {
            throw new PosOfflineRefusal(HttpStatus.FORBIDDEN, "OFFLINE_OPERATOR_NOT_SESSION_OWNER",
                    "Only the cashier who owns the open session can take this till offline.");
        }
        continuationGate.assertMayContinue(session);
        closureWorkflowGate.assertMayOperate(session);
        try {
            businessDayCheckoutGate.assertCheckoutAllowed(branchId);
        } catch (com.billbull.backend.pos.businessdate.BusinessDayClosedException ex) {
            throw new PosOfflineRefusal(HttpStatus.LOCKED, "BUSINESS_DAY_CLOSED", "The business day is closed.");
        }
        var mode = salesSettingsService.getSettings().getSalesMode();
        if (mode != com.billbull.backend.sales.settings.SalesMode.FAST_SALE) {
            throw new PosOfflineRefusal(HttpStatus.CONFLICT, "OFFLINE_SALES_MODE_UNSUPPORTED",
                    "Offline selling is only piloted in Fast Sale mode (this tenant uses " + mode + ").");
        }
        var key = repo.findActiveKeyForTerminal(terminal.getTerminalId()).orElseThrow(() -> new PosOfflineRefusal(
                HttpStatus.CONFLICT, "OFFLINE_KEY_NOT_ENROLLED",
                "This till is not enrolled for offline selling. An administrator must enable it first."));

        var outstanding = repo.findActiveLeaseForTerminal(terminal.getTerminalId());
        if (outstanding.isPresent()) {
            var l = outstanding.get();
            boolean reusable = l.sessionId().equals(sessionId) && l.keyId().equals(key.id())
                    && l.operatorUsername().equals(operator) && !l.expired();
            if (reusable) return leaseResponse(l, repo.dbNow());
            throw new PosOfflineRefusal(HttpStatus.CONFLICT, "OFFLINE_LEASE_OUTSTANDING",
                    "This terminal still holds an offline lease that is not settled. Synchronise and settle it first.",
                    Map.of("leaseId", l.id(), "leaseExpired", l.expired()));
        }
        long outstandingValue = repo.outstandingAuthorisedValue(branchId);
        if (outstandingValue + settings.maxValueMinor() > settings.branchMaxValueMinor()) {
            throw new PosOfflineRefusal(HttpStatus.CONFLICT, "OFFLINE_BRANCH_LIMIT_REACHED",
                    "The branch already has the maximum offline value authorised to other tills.",
                    Map.of("outstandingMinor", outstandingValue, "branchMaxMinor", settings.branchMaxValueMinor()));
        }

        Instant now = repo.dbNow();
        Instant notAfter = now.plus(Duration.ofMinutes(settings.leaseMinutes()));
        Instant graceUntil = notAfter.plus(Duration.ofHours(settings.graceHours()));
        long seqStart = repo.nextSeqStart(key.id());
        long seqEnd = seqStart + settings.maxSales();
        LocalDate businessDate = session.getTradingDate() != null ? session.getTradingDate() : session.getSessionDate();
        UUID leaseId = UUID.fromString(UuidV7.generate());
        var signing = keyStore.current();

        ObjectNode claims = mapper.createObjectNode();
        claims.put("typ", "bb.pos.offline.lease");
        claims.put("pv", PosOfflineSettings.POLICY_VERSION);
        claims.put("lid", leaseId.toString());
        claims.put("ten", signing.tenant());
        claims.put("br", branchId);
        claims.put("term", terminal.getTerminalId());
        claims.put("sid", sessionId);
        claims.put("kid", key.id().toString());
        claims.put("op", operator);
        claims.put("bd", String.valueOf(businessDate));
        claims.put("iat", now.getEpochSecond());
        claims.put("exp", notAfter.getEpochSecond());
        claims.put("grace", graceUntil.getEpochSecond());
        claims.put("maxSales", settings.maxSales());
        claims.put("maxValue", settings.maxValueMinor());
        claims.put("seqStart", seqStart);
        claims.put("seqEnd", seqEnd);
        claims.putArray("tenders").add(PosOfflineSettings.TENDER_TYPES);
        claims.put("policy", PosOfflineSettings.PRODUCT_POLICY);
        if (catalogVersion != null) claims.put("cat", catalogVersion);
        String jws = signJws(claims, signing);

        repo.insertLease(leaseId, branchId, terminal.getTerminalId(), terminal.getId(), sessionId, key.id(), operator,
                businessDate, now, notAfter, graceUntil, settings.maxSales(), settings.maxValueMinor(), seqStart, seqEnd,
                PosOfflineSettings.TENDER_TYPES, PosOfflineSettings.PRODUCT_POLICY, catalogVersion,
                PosOfflineSettings.POLICY_VERSION, signing.keyId(), jws, operator);
        auditService.logSessionEvent(sessionId, terminal.getTerminalId(), branchId, "OFFLINE_LEASE_ISSUED",
                "leaseId=" + leaseId + " keyId=" + key.id() + " seq=[" + seqStart + "," + seqEnd + ") maxValueMinor="
                        + settings.maxValueMinor() + " notAfter=" + notAfter + " graceUntil=" + graceUntil);
        log.info("Offline lease {} issued to terminal {} session {} until {}", leaseId, terminalId, sessionId, notAfter);
        return leaseResponse(repo.findLease(leaseId).orElseThrow(), now);
    }

    private Map<String, Object> leaseResponse(PosOfflineRepository.Lease l, Instant now) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("leaseId", l.id());
        body.put("jws", l.jws());
        body.put("serverKey", serverKey());
        body.put("serverTime", now.toString());
        body.put("notAfter", l.notAfter().toString());
        body.put("graceUntil", l.graceUntil().toString());
        long[] usage = repo.leaseUsage(l.id());
        body.put("receivedCount", usage[0]);
        body.put("receivedValueMinor", usage[1]);
        return body;
    }

    static String signJws(JsonNode claims, PosOfflineSigningKeyStore.Loaded signing) {
        String header = "{\"alg\":\"ES256\",\"kid\":\"" + signing.keyId() + "\",\"typ\":\"JWT\"}";
        String input = PosOfflineCrypto.base64Url(header.getBytes(StandardCharsets.UTF_8)) + "."
                + PosOfflineCrypto.base64Url(claims.toString().getBytes(StandardCharsets.UTF_8));
        byte[] sig = PosOfflineCrypto.sign(signing.privateKey(), input.getBytes(StandardCharsets.US_ASCII));
        return input + "." + PosOfflineCrypto.base64Url(sig);
    }

    // ------------------------------------------------------------------ settlement

    /**
     * Ends a lease on the till's signed summary. Succeeds only when the server holds exactly the
     * records the till says it made (same count, the contiguous sequence range and the same total)
     * and every one of them is posted or resolved. Anything else leaves the lease ACTIVE, so the
     * session stays protected.
     */
    @Transactional
    public Map<String, Object> close(UUID leaseId, JsonNode summary, String signature) {
        var lease = repo.lockLease(leaseId).orElseThrow(() -> new PosOfflineRefusal(HttpStatus.NOT_FOUND,
                "LEASE_UNKNOWN", "No such offline lease on this server."));
        requireLeaseBranch(lease);
        if (!"ACTIVE".equals(lease.status())) {
            return Map.of("leaseId", leaseId, "status", lease.status());
        }
        var key = repo.findKey(lease.keyId()).orElseThrow();
        if (summary == null || !"bb.pos.offline.lease-close".equals(summary.path("typ").asText())
                || !leaseId.toString().equals(summary.path("lid").asText())) {
            throw new PosOfflineRefusal(HttpStatus.BAD_REQUEST, "OFFLINE_CLOSE_INVALID", "Malformed lease close summary.");
        }
        byte[] canonical;
        try {
            canonical = OfflineJcs.canonicalBytes(summary);
        } catch (IllegalArgumentException e) {
            throw new PosOfflineRefusal(HttpStatus.BAD_REQUEST, "OFFLINE_CLOSE_INVALID", e.getMessage());
        }
        if (signature == null || !PosOfflineCrypto.verify(PosOfflineCrypto.parseP256Spki(key.spki()), canonical,
                PosOfflineCrypto.base64UrlDecode(signature))) {
            throw new PosOfflineRefusal(HttpStatus.UNPROCESSABLE_ENTITY, "SIGNATURE_INVALID",
                    "The lease close summary is not signed by this terminal's key.");
        }
        long count = summary.path("count").asLong(-1);
        long lastSeq = summary.path("lastSeq").asLong(-1);
        long value = summary.path("valueMinor").asLong(-1);
        List<PosOfflineRepository.OfflineSale> sales = repo.findSalesForLease(leaseId);
        long serverValue = sales.stream().mapToLong(PosOfflineRepository.OfflineSale::totalMinor).sum();
        boolean contiguous = sales.size() == count && (count == 0 ? lastSeq == lease.seqStart() - 1
                : lastSeq == lease.seqStart() + count - 1
                  && sales.get(0).localSeq() == lease.seqStart() && sales.get(sales.size() - 1).localSeq() == lastSeq);
        if (!contiguous || serverValue != value) {
            throw new PosOfflineRefusal(HttpStatus.CONFLICT, "OFFLINE_RECORDS_MISSING",
                    "The server does not hold every offline sale this till reports. Keep the till online so it can send them.",
                    Map.of("tillCount", count, "serverCount", sales.size(), "tillValueMinor", value,
                            "serverValueMinor", serverValue));
        }
        List<String> unresolved = sales.stream()
                .filter(s -> !"POSTED".equals(s.state()) && !"RESOLVED".equals(s.state()))
                .map(s -> s.localSeq() + ":" + s.state() + (s.reasonCode() != null ? "/" + s.reasonCode() : ""))
                .collect(Collectors.toList());
        if (!unresolved.isEmpty()) {
            throw new PosOfflineRefusal(HttpStatus.CONFLICT, "OFFLINE_RECORDS_UNRESOLVED",
                    "Some offline sales of this lease need supervisor review before the lease can be settled.",
                    Map.of("records", unresolved));
        }
        repo.closeLease(leaseId, "CLOSED", currentUser(), "CLOSE_SUMMARY_MATCHED", OfflineJcs.canonicalize(summary));
        auditService.logSessionEvent(lease.sessionId(), lease.terminalId(), lease.branchId(), "OFFLINE_LEASE_CLOSED",
                "leaseId=" + leaseId + " count=" + count + " valueMinor=" + value + " by=" + currentUser());
        return Map.of("leaseId", leaseId, "status", "CLOSED");
    }

    /** A supervisor gives up on a lease whose till may never return. Later records are held. */
    @Transactional
    public Map<String, Object> abandon(UUID leaseId, String reason) {
        if (!branchAccessService.currentUserHasRole(ADMIN_ROLES)) {
            throw new PosOfflineRefusal(HttpStatus.FORBIDDEN, "OFFLINE_ABANDON_ADMIN_ONLY",
                    "Only an administrator or branch administrator can abandon an offline lease.");
        }
        if (reason == null || reason.isBlank()) {
            throw new PosOfflineRefusal(HttpStatus.BAD_REQUEST, "REASON_REQUIRED", "A reason is required.");
        }
        var lease = repo.lockLease(leaseId).orElseThrow(() -> new PosOfflineRefusal(HttpStatus.NOT_FOUND,
                "LEASE_UNKNOWN", "No such offline lease on this server."));
        requireLeaseBranch(lease);
        if (!"ACTIVE".equals(lease.status())) return Map.of("leaseId", leaseId, "status", lease.status());
        long[] usage = repo.leaseUsage(leaseId);
        repo.closeLease(leaseId, "ABANDONED", currentUser(), reason.trim(),
                "{\"receivedCount\":" + usage[0] + ",\"receivedValueMinor\":" + usage[1] + "}");
        auditService.logSessionEvent(lease.sessionId(), lease.terminalId(), lease.branchId(), "OFFLINE_LEASE_ABANDONED",
                "leaseId=" + leaseId + " receivedCount=" + usage[0] + " by=" + currentUser() + " reason=" + reason.trim());
        return Map.of("leaseId", leaseId, "status", "ABANDONED");
    }

    @Transactional(readOnly = true)
    public Map<String, Object> status(String terminalId) {
        Map<String, Object> body = new LinkedHashMap<>();
        Long branchId = currentBranchId();
        body.put("enabled", settings.enabledFor(branchId));
        body.put("tenant", keyStore.tenant());
        body.put("serverKey", serverKey());
        body.put("serverTime", repo.dbNow().toString());
        repo.findActiveKeyForTerminal(terminalId).ifPresent(k -> body.put("keyId", k.id()));
        repo.findActiveLeaseForTerminal(terminalId).ifPresent(l -> {
            long[] usage = repo.leaseUsage(l.id());
            body.put("lease", Map.of("leaseId", l.id(), "sessionId", l.sessionId(), "notAfter", l.notAfter().toString(),
                    "expired", l.expired(), "receivedCount", usage[0], "receivedValueMinor", usage[1]));
        });
        body.put("reviewCount", repo.findReviewQueue(branchId).size());
        return body;
    }

    // ------------------------------------------------------------------ helpers

    void requireLeaseBranch(PosOfflineRepository.Lease lease) {
        Long branchId = currentBranchId();
        if (!lease.branchId().equals(branchId)) {
            throw new PosOfflineRefusal(HttpStatus.FORBIDDEN, "BRANCH_CONTEXT",
                    "This offline lease belongs to another branch than the one this request is for.");
        }
    }

    private void requireEnabled(Long branchId) {
        if (!settings.enabledFor(branchId)) {
            throw new PosOfflineRefusal(HttpStatus.CONFLICT, "OFFLINE_DISABLED", "Offline selling is not enabled for this branch.");
        }
    }

    private PosTerminal requireTerminal(String terminalId, Long branchId) {
        PosTerminal terminal = terminalRepository.findByTerminalId(terminalId == null ? "" : terminalId.trim())
                .orElseThrow(() -> new PosOfflineRefusal(HttpStatus.NOT_FOUND, "TERMINAL_UNKNOWN", "Unknown terminal."));
        if (!branchId.equals(terminal.getBranchId())) {
            throw new PosOfflineRefusal(HttpStatus.FORBIDDEN, "BRANCH_CONTEXT", "The terminal belongs to another branch.");
        }
        if (terminal.getStatus() != PosTerminalStatus.ACTIVE) {
            throw new PosOfflineRefusal(HttpStatus.CONFLICT, "TERMINAL_NOT_ACTIVE", "The terminal is " + terminal.getStatus() + ".");
        }
        return terminal;
    }

    Long currentBranchId() {
        var branch = branchAccessService.getRequiredCurrentUserBranch();
        if (branch == null) throw new PosOfflineRefusal(HttpStatus.FORBIDDEN, "BRANCH_CONTEXT", "No branch selected.");
        return branch.getId();
    }

    static String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }
}
