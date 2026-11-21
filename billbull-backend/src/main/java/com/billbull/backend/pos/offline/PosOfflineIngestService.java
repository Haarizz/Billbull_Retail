package com.billbull.backend.pos.offline;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.checkout.PosCheckoutController;
import com.billbull.backend.pos.checkout.PosCheckoutRequest;
import com.billbull.backend.pos.checkout.PosPaymentAllocation;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Two-stage handling of signed offline sales (M3).
 *
 * <p><b>Receive.</b> In its own short transaction, with the lease row locked: the record is
 * canonicalised (RFC 8785 subset, {@link OfflineJcs}), its ECDSA P-256 signature is verified against
 * the enrolled terminal key, and every binding is taken from the <i>server's</i> lease row (tenant,
 * branch, terminal, session, operator, business date, key, sequence window, count and value caps,
 * expiry and grace), never from the request. A record that verifies is stored, even if it may not
 * post (held for review); one that does not verify is refused and audited, never stored.
 *
 * <p><b>Post.</b> A stored record is re-checked against today's catalogue rules (eligible product,
 * branch list price, tax rate, cash tender arithmetic) and then sent through the ordinary
 * {@link PosCheckoutController#checkout} under the record's own stable checkout key, so every
 * online control (till permission, session guard and claim, Business Day gate, salesperson rules,
 * the M2 attempt journal, stock and GL posting) applies unchanged, as the user who is syncing. A
 * resend reaches the same key: the journal answers with the invoice already recorded, so retries
 * and restarts never create a second invoice. Nothing is ever deleted or posted around review.
 */
@Service
public class PosOfflineIngestService {

    private static final Logger log = LoggerFactory.getLogger(PosOfflineIngestService.class);
    static final String RECORD_TYPE = "bb.pos.offline.sale";
    static final int RECORD_VERSION = 1;

    private final PosOfflineRepository repo;
    private final PosOfflineSigningKeyStore keyStore;
    private final PosOfflineSettings settings;
    private final PosOfflineLeaseService leaseService;
    private final PosOfflineCatalogService catalogService;
    private final PosCheckoutController checkoutController;
    private final PosAuditService auditService;
    private final ObjectMapper mapper;
    private final TransactionTemplate tx;

    public PosOfflineIngestService(PosOfflineRepository repo, PosOfflineSigningKeyStore keyStore,
                                   PosOfflineSettings settings, PosOfflineLeaseService leaseService,
                                   PosOfflineCatalogService catalogService, PosCheckoutController checkoutController,
                                   PosAuditService auditService, ObjectMapper mapper,
                                   PlatformTransactionManager transactionManager) {
        this.repo = repo;
        this.keyStore = keyStore;
        this.settings = settings;
        this.leaseService = leaseService;
        this.catalogService = catalogService;
        this.checkoutController = checkoutController;
        this.auditService = auditService;
        this.mapper = mapper;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** One record's answer to the till. */
    public record Result(String recordId, Long seq, String status, String code, String message,
                         Long invoiceId, String invoiceNumber) {
        Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("recordId", recordId);
            m.put("seq", seq);
            m.put("status", status);
            m.put("code", code);
            m.put("message", message);
            m.put("invoiceId", invoiceId);
            m.put("invoiceNumber", invoiceNumber);
            return m;
        }
    }

    /** Receives then posts each record in the order given (the till sends them in sequence order). */
    public List<Map<String, Object>> ingest(List<JsonNode> envelopes) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode env : envelopes) {
            Result r;
            try {
                r = receiveAndPost(env.path("record"), env.path("sig").asText(null));
            } catch (RuntimeException ex) {
                log.error("Offline record ingest failed unexpectedly", ex);
                r = new Result(env.path("record").path("rid").asText(null), null, "RETRY", "SERVER_ERROR",
                        ex.getClass().getSimpleName() + ": " + ex.getMessage(), null, null);
            }
            out.add(r.toMap());
        }
        return out;
    }

    Result receiveAndPost(JsonNode record, String signature) {
        Result received = tx.execute(status -> receive(record, signature));
        if (received == null || !"RECEIVED".equals(received.status()) && !"BLOCKED".equals(received.status())) {
            return received;
        }
        return post(UUID.fromString(received.recordId()));
    }

    // ------------------------------------------------------------------ receive

    private Result receive(JsonNode r, String signature) {
        String rid = r.path("rid").asText(null);
        Long seqForAnswer = r.path("seq").canConvertToLong() ? r.path("seq").asLong() : null;
        if (!r.isObject() || !RECORD_TYPE.equals(r.path("typ").asText()) || r.path("v").asInt() != RECORD_VERSION
                || rid == null || signature == null) {
            return reject(r, "RECORD_INVALID", "Not a version " + RECORD_VERSION + " offline sale record.");
        }
        byte[] canonical;
        UUID recordId, leaseId, keyId;
        try {
            canonical = OfflineJcs.canonicalBytes(r);
            recordId = UUID.fromString(rid);
            leaseId = UUID.fromString(r.path("lid").asText());
            keyId = UUID.fromString(r.path("kid").asText());
        } catch (IllegalArgumentException e) {
            return reject(r, "RECORD_INVALID", e.getMessage());
        }
        String sha = PosOfflineCrypto.sha256Hex(canonical);

        var key = repo.findKey(keyId).orElse(null);
        if (key == null) return reject(r, "KEY_UNKNOWN", "The signing key is not enrolled on this server.");
        boolean verified;
        try {
            verified = PosOfflineCrypto.verify(PosOfflineCrypto.parseP256Spki(key.spki()), canonical,
                    PosOfflineCrypto.base64UrlDecode(signature));
        } catch (IllegalArgumentException e) {
            verified = false;
        }
        if (!verified) return reject(r, "SIGNATURE_INVALID", "The record's signature does not verify with the terminal's key.");

        if (!keyStore.tenant().equals(r.path("ten").asText())) {
            return reject(r, "WRONG_TENANT", "This record belongs to another tenant.");
        }
        var lease = repo.lockLease(leaseId).orElse(null);
        if (lease == null) return reject(r, "LEASE_UNKNOWN", "No such offline lease on this server.");
        String mismatch = leaseMismatch(r, lease, keyId, key);
        if (mismatch != null) return reject(r, "LEASE_MISMATCH", "The record does not match its lease: " + mismatch);
        Long contextBranch;
        try {
            contextBranch = leaseService.currentBranchId();
        } catch (PosOfflineRefusal e) {
            contextBranch = null;
        }
        if (!lease.branchId().equals(contextBranch)) {
            return new Result(rid, seqForAnswer, "RETRY", "BRANCH_CONTEXT",
                    "Synchronise this record with branch " + lease.branchId() + " selected.", null, null);
        }

        long seq = r.path("seq").asLong();
        String checkoutKey = r.path("ck").asText();
        Optional<PosOfflineRepository.OfflineSale> existing = repo.findSale(recordId)
                .or(() -> repo.findSaleByKeySeq(keyId, seq))
                .or(() -> repo.findSaleByCheckoutKey(checkoutKey));
        if (existing.isPresent()) {
            var e = existing.get();
            if (e.payloadSha256().equals(sha) && e.id().equals(recordId)) {
                return new Result(rid, seq, e.state(), e.reasonCode() != null ? e.reasonCode() : "DUPLICATE_SAME",
                        e.reasonDetail(), e.invoiceId(), e.invoiceNumber());
            }
            return reject(r, "DUPLICATE_CONFLICT", "A different record already holds this id, sequence or checkout key.");
        }
        if (!checkoutKey.startsWith("off-") || checkoutKey.length() > 100) {
            return reject(r, "RECORD_INVALID", "Offline checkout keys start with off-.");
        }

        long total = r.path("totalMinor").asLong(-1);
        Instant capturedAt = parseInstant(r.path("at").asText(null));
        String state = "RECEIVED";
        String code = null;
        String detail = null;
        long[] usage = repo.leaseUsage(leaseId);
        Instant now = repo.dbNow();
        if (seq < lease.seqStart() || seq >= lease.seqEnd()) {
            state = "HELD"; code = "SEQ_OUTSIDE_LEASE";
            detail = "Sequence " + seq + " is outside the lease window [" + lease.seqStart() + "," + lease.seqEnd() + ").";
        } else if (!"ACTIVE".equals(lease.status())) {
            state = "HELD"; code = "LEASE_" + lease.status();
            detail = "The lease is " + lease.status() + "; a supervisor must review this sale.";
        } else if (usage[0] + 1 > lease.maxSales() || usage[1] + total > lease.maxValueMinor()) {
            state = "HELD"; code = "CAP_EXCEEDED";
            detail = "The lease allows " + lease.maxSales() + " sales / " + lease.maxValueMinor() + " minor units; already "
                    + usage[0] + " / " + usage[1] + ".";
        } else if (capturedAt == null
                || capturedAt.isAfter(lease.notAfter().plus(Duration.ofSeconds(settings.clockSkewSeconds())))) {
            state = "HELD"; code = "CAPTURED_AFTER_EXPIRY";
            detail = "The sale's device time " + capturedAt + " is after the lease expired at " + lease.notAfter() + ".";
        } else if (now.isAfter(lease.graceUntil())) {
            state = "HELD"; code = "ARRIVED_AFTER_GRACE";
            detail = "The sale reached the server after the reconciliation grace ended at " + lease.graceUntil() + ".";
        } else {
            String prev = r.path("prev").asText("");
            if (seq > lease.seqStart()) {
                var previous = repo.findSaleByKeySeq(keyId, seq - 1);
                if (previous.isEmpty()) {
                    code = "GAP_BEFORE";
                    detail = "Sequence " + (seq - 1) + " has not reached the server yet.";
                } else if (!previous.get().payloadSha256().equals(prev)) {
                    state = "HELD"; code = "CHAIN_MISMATCH";
                    detail = "The record's previous-hash does not match the stored sequence " + (seq - 1) + ".";
                }
            }
        }

        repo.insertSale(recordId, leaseId, keyId, seq, checkoutKey, sha, OfflineJcs.canonicalize(r), signature,
                lease.branchId(), lease.terminalId(), lease.sessionId(), total, capturedAt,
                PosOfflineLeaseService.currentUser(), state, code, detail);
        auditService.logSessionEvent(lease.sessionId(), lease.terminalId(), lease.branchId(),
                "HELD".equals(state) ? "OFFLINE_SALE_HELD" : "OFFLINE_SALE_RECEIVED",
                "recordId=" + recordId + " leaseId=" + leaseId + " seq=" + seq + " totalMinor=" + total
                        + (code != null ? " code=" + code : "") + " by=" + PosOfflineLeaseService.currentUser());
        return new Result(rid, seq, state, code, detail, null, null);
    }

    private String leaseMismatch(JsonNode r, PosOfflineRepository.Lease lease, UUID keyId,
                                 PosOfflineRepository.TerminalKey key) {
        if (!lease.keyId().equals(keyId)) return "signing key";
        if (!lease.tenant().equals(r.path("ten").asText())) return "tenant";
        if (!lease.branchId().equals(r.path("br").asLong(-1)) || !lease.branchId().equals(key.branchId())) return "branch";
        if (!lease.terminalId().equals(r.path("term").asText()) || !lease.terminalId().equals(key.terminalId())) return "terminal";
        if (!lease.sessionId().equals(r.path("sid").asLong(-1))) return "session";
        if (!lease.operatorUsername().equals(r.path("op").asText())) return "operator";
        if (!String.valueOf(lease.businessDate()).equals(r.path("bd").asText())) return "business date";
        return null;
    }

    private Result reject(JsonNode r, String code, String message) {
        String rid = r.path("rid").asText(null);
        Long seq = r.path("seq").canConvertToLong() ? r.path("seq").asLong() : null;
        log.warn("Offline record {} (seq {}) refused: {} {}", rid, seq, code, message);
        auditService.logSessionEvent(r.path("sid").canConvertToLong() ? r.path("sid").asLong() : null,
                r.path("term").asText(null), r.path("br").canConvertToLong() ? r.path("br").asLong() : null,
                "OFFLINE_SALE_REJECTED", "recordId=" + rid + " seq=" + seq + " code=" + code + " by="
                        + PosOfflineLeaseService.currentUser());
        return new Result(rid, seq, "REJECTED", code, message, null, null);
    }

    // ------------------------------------------------------------------ post

    Result post(UUID recordId) {
        var sale = repo.findSale(recordId).orElseThrow();
        if ("POSTED".equals(sale.state())) {
            return new Result(recordId.toString(), sale.localSeq(), "POSTED", sale.reasonCode(), null,
                    sale.invoiceId(), sale.invoiceNumber());
        }
        if (!"RECEIVED".equals(sale.state()) && !"BLOCKED".equals(sale.state())) {
            return new Result(recordId.toString(), sale.localSeq(), sale.state(), sale.reasonCode(), sale.reasonDetail(), null, null);
        }
        JsonNode r;
        try {
            r = mapper.readTree(sale.payload());
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        String flag = "GAP_BEFORE".equals(sale.reasonCode()) ? "GAP_BEFORE" : null;

        String invalid = businessCheck(r, sale.branchId());
        if (invalid != null) {
            String code = invalid.substring(0, invalid.indexOf(':'));
            return block(sale, code, invalid.substring(invalid.indexOf(':') + 1).trim());
        }

        PosCheckoutRequest request = toCheckoutRequest(r, sale);
        ResponseEntity<?> answer;
        try {
            answer = checkoutController.checkout(request);
        } catch (ResponseStatusException ex) {
            return block(sale, "CHECKOUT_REFUSED", ex.getStatusCode().value() + " " + ex.getReason());
        } catch (RuntimeException ex) {
            log.warn("Offline record {} posting failed: {}", recordId, ex.toString());
            repo.markState(recordId, "RECEIVED", "POSTING_FAILED", ex.getClass().getSimpleName() + ": " + ex.getMessage(), true);
            return new Result(recordId.toString(), sale.localSeq(), "RECEIVED", "POSTING_FAILED", ex.getMessage(), null, null);
        }
        if (answer.getStatusCode().is2xxSuccessful() && answer.getBody() instanceof SalesInvoice invoice) {
            BigDecimal posted = invoice.getInvoiceTotal() != null ? invoice.getInvoiceTotal() : BigDecimal.ZERO;
            long postedMinor = posted.movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
            if (postedMinor != sale.totalMinor()) flag = "TOTAL_DRIFT";
            repo.markPosted(recordId, invoice.getId(), invoice.getInvoiceNumber(), flag);
            auditService.logSessionEvent(sale.sessionId(), sale.terminalId(), sale.branchId(), "OFFLINE_SALE_POSTED",
                    "recordId=" + recordId + " seq=" + sale.localSeq() + " invoice=" + invoice.getInvoiceNumber()
                            + (flag != null ? " flag=" + flag : "") + " by=" + PosOfflineLeaseService.currentUser());
            return new Result(recordId.toString(), sale.localSeq(), "POSTED", flag, null, invoice.getId(),
                    invoice.getInvoiceNumber());
        }
        String code = "CHECKOUT_REFUSED";
        String message = String.valueOf(answer.getBody());
        if (answer.getBody() instanceof Map<?, ?> body) {
            if (body.get("code") != null) code = String.valueOf(body.get("code"));
            if (body.get("message") != null) message = String.valueOf(body.get("message"));
        }
        if ("CHECKOUT_IN_PROGRESS".equals(code)) {
            repo.markState(recordId, "RECEIVED", code, message, true);
            return new Result(recordId.toString(), sale.localSeq(), "RECEIVED", code, message, null, null);
        }
        return block(sale, code, answer.getStatusCode().value() + " " + message);
    }

    private Result block(PosOfflineRepository.OfflineSale sale, String code, String detail) {
        repo.markState(sale.id(), "BLOCKED", code, detail, true);
        auditService.logSessionEvent(sale.sessionId(), sale.terminalId(), sale.branchId(), "OFFLINE_SALE_HELD",
                "recordId=" + sale.id() + " seq=" + sale.localSeq() + " code=" + code + " detail=" + detail);
        return new Result(sale.id().toString(), sale.localSeq(), "BLOCKED", code, detail, null, null);
    }

    /**
     * Today's rules for what may be sold offline, re-checked before posting. Returns
     * {@code "CODE: detail"} or null.
     */
    String businessCheck(JsonNode r, Long branchId) {
        JsonNode tender = r.path("tender");
        if (!"CASH".equals(tender.path("type").asText())) return "TENDER_NOT_ALLOWED: only cash is accepted offline.";
        long total = r.path("totalMinor").asLong(-1);
        long tendered = tender.path("tenderedMinor").asLong(-1);
        long change = tender.path("changeMinor").asLong(-1);
        if (total <= 0 || tendered < total || change != tendered - total) {
            return "TENDER_INVALID: cash tendered " + tendered + ", change " + change + " do not settle total " + total + ".";
        }
        JsonNode lines = r.path("lines");
        if (!lines.isArray() || lines.isEmpty()) return "RECORD_INVALID: no lines.";
        boolean inclusive = r.path("taxInc").asBoolean(false);
        long expected = 0;
        long tolerance = 0;
        for (JsonNode line : lines) {
            String code = line.path("code").asText();
            long qty = line.path("qty").asLong(0);
            long price = line.path("priceMinor").asLong(-1);
            long taxBp = line.path("taxBp").asLong(-1);
            if (qty <= 0 || price <= 0) return "RECORD_INVALID: line " + code + " has no quantity or price.";
            var current = catalogService.currentLine(code, branchId);
            if (current.isEmpty()) return "PRODUCT_NOT_ELIGIBLE: " + code + " may not be sold offline (inactive, batch, serial or expiry controlled).";
            long listMinor = current.get().retailPrice().movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
            if (listMinor != price) return "PRICE_DRIFT: " + code + " was sold at " + price + " but lists at " + listMinor + ".";
            long rateBp = current.get().taxRate().movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
            if (rateBp != taxBp) return "TAX_DRIFT: " + code + " was taxed at " + taxBp + " bp, the branch rate is " + rateBp + " bp.";
            long gross = price * qty;
            expected += inclusive ? gross : gross + Math.round(gross * taxBp / 10000.0);
            tolerance += inclusive ? 0 : 1;
        }
        if (Math.abs(expected - total) > tolerance) {
            return "TOTAL_MISMATCH: the lines add up to " + expected + " but the record says " + total + ".";
        }
        return null;
    }

    private PosCheckoutRequest toCheckoutRequest(JsonNode r, PosOfflineRepository.OfflineSale sale) {
        PosCheckoutRequest req = new PosCheckoutRequest();
        req.setCheckoutKey(sale.checkoutKey());
        req.setCustomerCode("WALK-IN");
        req.setCustomerName("Walk-in Customer");
        req.setPaymentMode("Cash");
        req.setCombinedPaymentMode("Cash");
        req.setBranchId(sale.branchId());
        req.setSessionId(sale.sessionId());
        req.setTerminalId(sale.terminalId());
        req.setBillDiscountAmount(0.0);
        req.setTaxInclusive(r.path("taxInc").asBoolean(false));
        req.setNotes("Offline sale " + r.path("ref").asText() + " (record " + sale.id() + ", lease " + sale.leaseId()
                + ", seq " + sale.localSeq() + "), captured " + r.path("at").asText() + " on " + sale.terminalId() + ".");
        JsonNode sp = r.path("sp");
        if (sp.isObject()) {
            if (sp.path("id").canConvertToLong()) req.setSalespersonEmployeeId(sp.path("id").asLong());
            if (sp.hasNonNull("code")) req.setSalespersonEmployeeCode(sp.path("code").asText());
        }
        List<PosCheckoutRequest.PosCheckoutItem> items = new ArrayList<>();
        for (JsonNode line : r.path("lines")) {
            PosCheckoutRequest.PosCheckoutItem item = new PosCheckoutRequest.PosCheckoutItem();
            item.setItemCode(line.path("code").asText());
            item.setItemName(line.path("name").asText());
            item.setQuantity((int) line.path("qty").asLong());
            item.setUnit(line.path("unit").asText("Each"));
            item.setPrice(BigDecimal.valueOf(line.path("priceMinor").asLong(), 2).doubleValue());
            item.setDiscount(0.0);
            item.setTaxRate(BigDecimal.valueOf(line.path("taxBp").asLong(), 2).doubleValue());
            item.setVoided(false);
            items.add(item);
        }
        req.setItems(items);
        PosPaymentAllocation cash = new PosPaymentAllocation();
        cash.setType("CASH");
        cash.setAmount(BigDecimal.valueOf(r.path("tender").path("tenderedMinor").asLong(), 2).doubleValue());
        req.setPaymentAllocations(List.of(cash));
        return req;
    }

    private static Instant parseInstant(String s) {
        if (s == null) return null;
        try {
            return Instant.parse(s);
        } catch (RuntimeException e) {
            return null;
        }
    }
}
