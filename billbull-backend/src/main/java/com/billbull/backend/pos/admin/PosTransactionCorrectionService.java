package com.billbull.backend.pos.admin;

import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.period.AccountingPeriodService;
import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.pos.session.PosCashMovement;
import com.billbull.backend.pos.session.PosCashMovementRepository;
import com.billbull.backend.pos.session.PosCashMovementStatus;
import com.billbull.backend.pos.session.PosCashMovementType;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.sales.advance.AdvanceApplication;
import com.billbull.backend.sales.advance.AdvanceApplicationRepository;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.util.PageResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Enterprise Console &gt; POS Administration &gt; Transaction Corrections (Phase 4 — highest
 * financial risk of the module). Drives the generic {@link CorrectionRequestService} state
 * machine for {@code RECEIPT_VOUCHER}/{@code CUSTOMER_ADVANCE}/{@code CASH_MOVEMENT} targets,
 * keeping {@link PosTransactionCorrection}'s mirrored status/actor columns in lockstep.
 *
 * <p><b>Scope note</b>: payment-mode, receipt-amount, and customer corrections all target a
 * {@code ReceiptVoucher} row (the settlement record — the entity that actually carries {@code
 * paymentMode}/{@code amount}/{@code customerCode} and has a real GL posting method to mirror).
 * {@code SalesInvoice} is deliberately not a correction target in this phase: its own {@code
 * paymentMode} field is a display-only re-stamp with no independent GL entry (confirmed by
 * reading {@code SalesInvoiceService.recordPayment}), and the brief explicitly forbids updating
 * {@code SalesInvoice} directly — so there is nothing on the invoice side for this phase to
 * correct that isn't already covered by correcting the receipt voucher.
 *
 * <p>Every correction is a brand-new pair of GL entries via {@code PostingEngineService.
 * postCorrectionEntry} — never a same-row edit, never a rewritten journal, never a stock
 * movement. Advance-allocation corrections deliberately do NOT re-run {@code SalesInvoice}
 * balance sync (that would require mutating {@code SalesInvoice} fields, forbidden by this
 * phase's own architecture principles) — only the GL misallocation is corrected; invoice
 * balance display catching up to the correction is explicitly deferred to a later reporting
 * phase, consistent with "no report overlay engine beyond transaction presentation" being out
 * of scope here.
 */
@Service
public class PosTransactionCorrectionService {

    private static final String ENTITY_TYPE = "POS_TRANSACTION_CORRECTION";

    private final PosTransactionCorrectionRepository repo;
    private final CorrectionRequestRepository correctionRequestRepo;
    private final CorrectionRequestService correctionRequestService;
    private final ReceiptVoucherRepository receiptVoucherRepository;
    private final AdvanceApplicationRepository advanceApplicationRepository;
    private final PosCashMovementRepository cashMovementRepository;
    private final PosCashMovementCategoryService cashMovementCategoryService;
    private final CustomerRepository customerRepository;
    private final PosSessionRepository posSessionRepository;
    private final PostingEngineService postingEngine;
    private final AccountingPeriodService accountingPeriodService;
    private final FinancialAuditService auditService;
    private final ObjectMapper objectMapper;

    public PosTransactionCorrectionService(PosTransactionCorrectionRepository repo,
                                            CorrectionRequestRepository correctionRequestRepo,
                                            CorrectionRequestService correctionRequestService,
                                            ReceiptVoucherRepository receiptVoucherRepository,
                                            AdvanceApplicationRepository advanceApplicationRepository,
                                            PosCashMovementRepository cashMovementRepository,
                                            PosCashMovementCategoryService cashMovementCategoryService,
                                            CustomerRepository customerRepository,
                                            PosSessionRepository posSessionRepository,
                                            PostingEngineService postingEngine,
                                            AccountingPeriodService accountingPeriodService,
                                            FinancialAuditService auditService,
                                            ObjectMapper objectMapper) {
        this.repo = repo;
        this.correctionRequestRepo = correctionRequestRepo;
        this.correctionRequestService = correctionRequestService;
        this.receiptVoucherRepository = receiptVoucherRepository;
        this.advanceApplicationRepository = advanceApplicationRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.cashMovementCategoryService = cashMovementCategoryService;
        this.customerRepository = customerRepository;
        this.posSessionRepository = posSessionRepository;
        this.postingEngine = postingEngine;
        this.accountingPeriodService = accountingPeriodService;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    private String toJson(Map<String, Object> map) {
        try {
            return objectMapper.writeValueAsString(map);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize correction data.");
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseJson(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to parse correction data.");
        }
    }

    // ── Read ──────────────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<PosTransactionCorrectionResponse> list(Long branchId, CorrectionTargetType targetType,
                                                                CorrectionType correctionType, Long targetId,
                                                                CorrectionRequestStatus status, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), size <= 0 ? 20 : size);
        Page<PosTransactionCorrection> result = repo.search(branchId, targetType, correctionType, targetId, status, pageable);
        var content = result.getContent().stream().map(this::toResponse).toList();
        return new PageResponse<>(content, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public PosTransactionCorrectionResponse getById(Long id) {
        return toResponse(getEntity(id));
    }

    private PosTransactionCorrection getEntity(Long id) {
        return repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction correction not found: " + id));
    }

    private PosTransactionCorrectionResponse toResponse(PosTransactionCorrection c) {
        String requestNumber = correctionRequestRepo.findById(c.getCorrectionRequestId())
                .map(CorrectionRequest::getRequestNumber).orElse(null);
        return PosTransactionCorrectionResponse.from(c, requestNumber);
    }

    /** Original / corrected (if applied) / effective snapshot for a target — presentation only.
     *  Never touches the original ReceiptVoucher/AdvanceApplication/PosCashMovement row. */
    @Transactional(readOnly = true)
    public Map<String, Object> getEffective(CorrectionTargetType targetType, Long targetId) {
        var applied = repo.findAppliedForTargetOrderByAppliedAtDesc(targetType, targetId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("targetType", targetType);
        result.put("targetId", targetId);
        result.put("corrected", !applied.isEmpty());
        if (!applied.isEmpty()) {
            PosTransactionCorrection effective = applied.get(0);
            result.put("correctionId", effective.getId());
            result.put("original", parseJson(effective.getOriginalSnapshotJson()));
            result.put("effective", parseJson(effective.getCorrectedSnapshotJson()));
            result.put("appliedBy", effective.getAppliedBy());
            result.put("appliedAt", effective.getAppliedAt());
        }
        return result;
    }

    // ── Write: request lifecycle ─────────────────────────────────────────────────────────

    public static class CorrectionInput {
        public String correctedCustomerCode;
        public String correctedPaymentMode;
        public BigDecimal correctedAmount;
        public String correctedInvoiceNumber;
        public Long correctedCategoryId;
    }

    @Transactional
    public PosTransactionCorrectionResponse request(CorrectionTargetType targetType, Long targetId,
                                                     CorrectionType correctionType, CorrectionInput input, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A correction reason is required.");
        }
        if (!repo.findActiveForTarget(targetType, targetId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A correction is already pending resolution for this transaction.");
        }

        Snapshot snapshot = switch (targetType) {
            case RECEIPT_VOUCHER -> buildReceiptVoucherSnapshot(targetId, correctionType, input);
            case CUSTOMER_ADVANCE -> buildAdvanceSnapshot(targetId, correctionType, input);
            case CASH_MOVEMENT -> buildCashMovementSnapshot(targetId, correctionType, input);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Transaction corrections are not supported for target type: " + targetType);
        };

        String originalJson = toJson(snapshot.original);
        String correctedJson = toJson(snapshot.corrected);
        String diffJson = toJson(snapshot.difference);

        var correctionRequest = correctionRequestService.create(
                targetType, targetId, correctionType, originalJson, correctedJson, reason,
                snapshot.branchId, snapshot.businessDate);

        int version = repo.findMaxVersionForTarget(targetType, targetId) + 1;

        PosTransactionCorrection c = new PosTransactionCorrection();
        c.setCorrectionRequestId(correctionRequest.getId());
        c.setTargetType(targetType);
        c.setTargetId(targetId);
        c.setCorrectionType(correctionType);
        c.setBranchId(snapshot.branchId);
        c.setOriginalSnapshotJson(originalJson);
        c.setCorrectedSnapshotJson(correctedJson);
        c.setDifferenceSummaryJson(diffJson);
        c.setReason(reason);
        c.setVersion(version);
        c.setStatus(CorrectionRequestStatus.REQUESTED);
        c.setRequestedBy(correctionRequest.getRequestedBy());
        c.setRequestedAt(correctionRequest.getRequestedAt());
        PosTransactionCorrection saved = repo.save(c);

        auditService.logEvent(ENTITY_TYPE, correctionRequest.getRequestNumber(), "REQUESTED", currentUser(),
                "Transaction correction requested: " + targetType + " #" + targetId + " (" + correctionType
                        + ", v" + version + "). Reason: " + reason);
        return toResponse(saved);
    }

    private record Snapshot(Map<String, Object> original, Map<String, Object> corrected,
                             Map<String, Object> difference, Long branchId, LocalDate businessDate) {}

    // ── Per-target-type validation + snapshot construction (request-time only; never mutates
    // the source row) ────────────────────────────────────────────────────────────────────────

    private Snapshot buildReceiptVoucherSnapshot(Long receiptId, CorrectionType correctionType, CorrectionInput input) {
        ReceiptVoucher receipt = receiptVoucherRepository.findById(receiptId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt voucher not found: " + receiptId));

        if (receipt.getStatus() != null
                && (receipt.getStatus().equalsIgnoreCase("Cancelled") || receipt.getStatus().equalsIgnoreCase("Voided"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This receipt voucher is " + receipt.getStatus() + " and cannot be corrected.");
        }
        assertNotOpenSession(receipt.getPosSessionId());
        accountingPeriodService.assertOpen(receipt.getDate());

        boolean isAdvance = receipt.getPurpose() == ReceiptPurpose.ADVANCE_RECEIVED;
        Map<String, Object> original = new LinkedHashMap<>();
        original.put("customerCode", receipt.getCustomerCode());
        original.put("paymentMode", receipt.getPaymentMode());
        original.put("amount", receipt.getAmount());
        original.put("isAdvance", isAdvance);

        Map<String, Object> corrected = new LinkedHashMap<>(original);
        Map<String, Object> difference = new LinkedHashMap<>();

        switch (correctionType) {
            case CUSTOMER -> {
                if (input.correctedCustomerCode != null && !input.correctedCustomerCode.isBlank()
                        && !customerRepository.existsByCode(input.correctedCustomerCode)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Unknown customer reference: " + input.correctedCustomerCode);
                }
                if (java.util.Objects.equals(input.correctedCustomerCode, receipt.getCustomerCode())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Corrected customer is the same as the original.");
                }
                corrected.put("customerCode", input.correctedCustomerCode);
                difference.put("customerChanged", true);
            }
            case PAYMENT_MODE -> {
                if (input.correctedPaymentMode == null || input.correctedPaymentMode.isBlank()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Corrected payment mode is required.");
                }
                if (input.correctedPaymentMode.equalsIgnoreCase(receipt.getPaymentMode())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Corrected payment mode is the same as the original.");
                }
                corrected.put("paymentMode", input.correctedPaymentMode);
                difference.put("paymentModeChanged", true);
            }
            case RECEIPT_AMOUNT -> {
                if (input.correctedAmount == null || input.correctedAmount.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A positive corrected amount is required.");
                }
                if (input.correctedAmount.compareTo(receipt.getAmount()) == 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Corrected amount is the same as the original.");
                }
                corrected.put("amount", input.correctedAmount);
                difference.put("amountDifference", input.correctedAmount.subtract(receipt.getAmount()));
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unsupported correction type for a receipt voucher: " + correctionType);
        }

        return new Snapshot(original, corrected, difference, receipt.getBranchEntityId(), receipt.getDate());
    }

    private Snapshot buildAdvanceSnapshot(Long applicationId, CorrectionType correctionType, CorrectionInput input) {
        if (correctionType != CorrectionType.ADVANCE_PAYMENT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unsupported correction type for a customer advance allocation: " + correctionType);
        }
        AdvanceApplication application = advanceApplicationRepository.findById(applicationId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Advance application not found: " + applicationId));
        if (!"APPLIED".equalsIgnoreCase(application.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This advance allocation is " + application.getStatus() + " and cannot be corrected.");
        }
        accountingPeriodService.assertOpen(application.getAppliedDate());

        if (input.correctedAmount == null || input.correctedAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A positive corrected amount is required.");
        }
        String correctedInvoiceNumber = (input.correctedInvoiceNumber != null && !input.correctedInvoiceNumber.isBlank())
                ? input.correctedInvoiceNumber : application.getInvoiceNumber();
        if (correctedInvoiceNumber.equals(application.getInvoiceNumber())
                && input.correctedAmount.compareTo(application.getAppliedAmount()) == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Corrected allocation is the same as the original.");
        }

        Map<String, Object> original = new LinkedHashMap<>();
        original.put("invoiceNumber", application.getInvoiceNumber());
        original.put("amount", application.getAppliedAmount());

        Map<String, Object> corrected = new LinkedHashMap<>();
        corrected.put("invoiceNumber", correctedInvoiceNumber);
        corrected.put("amount", input.correctedAmount);

        Map<String, Object> difference = new LinkedHashMap<>();
        difference.put("invoiceChanged", !correctedInvoiceNumber.equals(application.getInvoiceNumber()));
        difference.put("amountDifference", input.correctedAmount.subtract(application.getAppliedAmount()));

        return new Snapshot(original, corrected, difference, null, application.getAppliedDate());
    }

    private Snapshot buildCashMovementSnapshot(Long movementId, CorrectionType correctionType, CorrectionInput input) {
        if (correctionType != CorrectionType.CASH_MOVEMENT_CATEGORY) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unsupported correction type for a cash movement: " + correctionType);
        }
        PosCashMovement movement = cashMovementRepository.findById(movementId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Cash movement not found: " + movementId));
        if (movement.getStatus() == PosCashMovementStatus.VOIDED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This cash movement is voided and cannot be corrected.");
        }
        if (movement.getPosSession() != null && movement.getPosSession().getStatus() == PosSessionStatus.OPEN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cannot correct a cash movement while its session is still open.");
        }
        if (input.correctedCategoryId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A corrected category is required.");
        }
        if (java.util.Objects.equals(input.correctedCategoryId, movement.getCategoryId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Corrected category is the same as the original.");
        }
        var newCategory = cashMovementCategoryService.getActiveEntityOrThrow(input.correctedCategoryId);
        cashMovementCategoryService.assertCompatible(newCategory, movement.getMovementType());
        accountingPeriodService.assertOpen(movement.getBusinessDate());

        var newAccount = cashMovementCategoryService.resolveGlAccount(newCategory);
        String defaultCode = movement.getMovementType() == PosCashMovementType.DROP_IN
                ? PostingEngineService.ACC_PETTY_CASH : PostingEngineService.ACC_EXPENSE_GENERAL;
        String defaultName = movement.getMovementType() == PosCashMovementType.DROP_IN ? "Petty Cash" : "General Expense";
        String correctedAccountCode = newAccount != null ? newAccount.getCode() : defaultCode;
        String correctedAccountName = newAccount != null ? newAccount.getName() : defaultName;

        Map<String, Object> original = new LinkedHashMap<>();
        original.put("categoryId", movement.getCategoryId());
        original.put("postedAccountCode", movement.getPostedAccountCode());
        original.put("postedAccountName", movement.getPostedAccountName());

        Map<String, Object> corrected = new LinkedHashMap<>();
        corrected.put("categoryId", input.correctedCategoryId);
        corrected.put("postedAccountCode", correctedAccountCode);
        corrected.put("postedAccountName", correctedAccountName);

        Map<String, Object> difference = new LinkedHashMap<>();
        difference.put("categoryChanged", true);
        difference.put("glAccountChanged", !correctedAccountCode.equals(movement.getPostedAccountCode()));

        return new Snapshot(original, corrected, difference, movement.getBranchId(), movement.getBusinessDate());
    }

    /** Most back-office receipts have no POS session at all — only check when one is linked. */
    private void assertNotOpenSession(Long posSessionId) {
        if (posSessionId == null) return;
        posSessionRepository.findById(posSessionId).ifPresent(session -> {
            if (session.getStatus() == PosSessionStatus.OPEN) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Cannot correct a transaction while its POS session is still open.");
            }
        });
    }

    // ── Approval lifecycle (thin wrappers mirroring Phase 3 exactly) ─────────────────────

    @Transactional
    public PosTransactionCorrectionResponse submitForApproval(Long id) {
        PosTransactionCorrection c = getEntity(id);
        var updated = correctionRequestService.submitForApproval(c.getCorrectionRequestId());
        c.setStatus(updated.getStatus());
        PosTransactionCorrection saved = repo.save(c);
        auditService.logEvent(ENTITY_TYPE, updated.getRequestNumber(), "SUBMITTED", currentUser(),
                "Transaction correction submitted for approval.");
        return toResponse(saved);
    }

    @Transactional
    public PosTransactionCorrectionResponse approve(Long id, String notes) {
        PosTransactionCorrection c = getEntity(id);
        var updated = correctionRequestService.approve(c.getCorrectionRequestId(), notes);
        c.setStatus(updated.getStatus());
        c.setApprovedBy(updated.getApprovedBy());
        c.setApprovedAt(updated.getApprovedAt());
        PosTransactionCorrection saved = repo.save(c);
        auditService.logEvent(ENTITY_TYPE, updated.getRequestNumber(), "APPROVED", saved.getApprovedBy(),
                "Transaction correction approved.");
        return toResponse(saved);
    }

    @Transactional
    public PosTransactionCorrectionResponse reject(Long id, String reason) {
        PosTransactionCorrection c = getEntity(id);
        var updated = correctionRequestService.reject(c.getCorrectionRequestId(), reason);
        c.setStatus(updated.getStatus());
        c.setRejectedBy(updated.getRejectedBy());
        c.setRejectedAt(updated.getRejectedAt());
        c.setRejectionReason(updated.getRejectionReason());
        PosTransactionCorrection saved = repo.save(c);
        auditService.logEvent(ENTITY_TYPE, updated.getRequestNumber(), "REJECTED", saved.getRejectedBy(),
                "Transaction correction rejected. Reason: " + reason);
        return toResponse(saved);
    }

    @Transactional
    public PosTransactionCorrectionResponse cancel(Long id) {
        PosTransactionCorrection c = getEntity(id);
        var updated = correctionRequestService.cancel(c.getCorrectionRequestId());
        c.setStatus(updated.getStatus());
        PosTransactionCorrection saved = repo.save(c);
        auditService.logEvent(ENTITY_TYPE, updated.getRequestNumber(), "CANCELLED", currentUser(),
                "Transaction correction request cancelled.");
        return toResponse(saved);
    }

    // ── Execution ─────────────────────────────────────────────────────────────────────────

    /**
     * Applies an APPROVED correction: marks EXECUTING, performs the append-only GL
     * reverse+repost (or, for a customer correction, nothing at all — there is no GL
     * dimension to correct), then marks APPLIED. Any failure marks FAILED via {@code
     * markFailed} and preserves every approval stamp already recorded — execution failing
     * never loses approval history, and never partially mutates a historical record, since
     * every posting call here is idempotent-or-nothing (findDuplicate-guarded) and none of
     * them touch the original source row.
     */
    @Transactional
    public PosTransactionCorrectionResponse apply(Long id) {
        PosTransactionCorrection c = getEntity(id);
        if (c.getStatus() != CorrectionRequestStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only APPROVED corrections can be applied. Current: " + c.getStatus());
        }
        correctionRequestService.markExecuting(c.getCorrectionRequestId());
        c.setStatus(CorrectionRequestStatus.EXECUTING);
        repo.save(c);

        try {
            executeCorrection(c);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            var failed = correctionRequestService.markFailed(c.getCorrectionRequestId(), e.getMessage());
            c.setStatus(failed.getStatus());
            c.setExecutionError(e.getMessage());
            repo.save(c);
            auditService.logEvent(ENTITY_TYPE, failed.getRequestNumber(), "FAILED", currentUser(),
                    "Transaction correction execution failed: " + e.getMessage());
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Correction execution failed: " + e.getMessage());
        }

        var applied = correctionRequestService.markApplied(c.getCorrectionRequestId());
        c.setStatus(applied.getStatus());
        c.setAppliedBy(applied.getExecutedBy());
        c.setAppliedAt(applied.getExecutedAt());
        PosTransactionCorrection saved = repo.save(c);
        auditService.logEvent(ENTITY_TYPE, applied.getRequestNumber(), "APPLIED", saved.getAppliedBy(),
                "Transaction correction applied for " + saved.getTargetType() + " #" + saved.getTargetId()
                        + ". Original financial records were not modified — a new offsetting GL event was posted.");
        return toResponse(saved);
    }

    private void executeCorrection(PosTransactionCorrection c) {
        Map<String, Object> original = parseJson(c.getOriginalSnapshotJson());
        Map<String, Object> corrected = parseJson(c.getCorrectedSnapshotJson());
        String revRef = "TXNCORR-REV-" + c.getId();
        String applyRef = "TXNCORR-APPLY-" + c.getId();
        LocalDate date = LocalDate.now();

        switch (c.getTargetType()) {
            case RECEIPT_VOUCHER -> {
                if (c.getCorrectionType() == CorrectionType.CUSTOMER) {
                    return; // no GL dimension for customer ownership in this schema — overlay only
                }
                boolean isAdvance = Boolean.TRUE.equals(original.get("isAdvance"));
                String creditAccount = isAdvance ? PostingEngineService.ACC_CUSTOMER_ADVANCE : PostingEngineService.ACC_ACCOUNTS_RECEIVABLE;
                String creditName = isAdvance ? "Customer Advance" : "Accounts Receivable";

                BigDecimal originalAmount = new BigDecimal(original.get("amount").toString());
                String originalPaymentMode = (String) original.get("paymentMode");
                BigDecimal correctedAmount = new BigDecimal(corrected.get("amount").toString());
                String correctedPaymentMode = (String) corrected.get("paymentMode");

                String originalAccountCode = postingEngine.resolveSettlementAccountCode(originalPaymentMode);
                String originalAccountName = postingEngine.resolveSettlementAccountName(originalPaymentMode);
                String correctedAccountCode = postingEngine.resolveSettlementAccountCode(correctedPaymentMode);
                String correctedAccountName = postingEngine.resolveSettlementAccountName(correctedPaymentMode);

                postingEngine.postCorrectionEntry(revRef, "Correction reversal of receipt #" + c.getTargetId(),
                        "RVCORR", null, date, creditName, creditAccount, originalAccountName, originalAccountCode, originalAmount);
                postingEngine.postCorrectionEntry(applyRef, "Correction of receipt #" + c.getTargetId(),
                        "RVCORR", null, date, correctedAccountName, correctedAccountCode, creditName, creditAccount, correctedAmount);
            }
            case CUSTOMER_ADVANCE -> {
                BigDecimal originalAmount = new BigDecimal(original.get("amount").toString());
                BigDecimal correctedAmount = new BigDecimal(corrected.get("amount").toString());
                postingEngine.postCorrectionEntry(revRef, "Correction reversal of advance allocation #" + c.getTargetId(),
                        "ADVACORR", null, date, "Accounts Receivable", PostingEngineService.ACC_ACCOUNTS_RECEIVABLE,
                        "Customer Advance", PostingEngineService.ACC_CUSTOMER_ADVANCE, originalAmount);
                postingEngine.postCorrectionEntry(applyRef, "Correction of advance allocation #" + c.getTargetId(),
                        "ADVACORR", null, date, "Customer Advance", PostingEngineService.ACC_CUSTOMER_ADVANCE,
                        "Accounts Receivable", PostingEngineService.ACC_ACCOUNTS_RECEIVABLE, correctedAmount);
            }
            case CASH_MOVEMENT -> {
                PosCashMovement movement = cashMovementRepository.findById(c.getTargetId()).orElseThrow(() ->
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "Cash movement not found: " + c.getTargetId()));
                String originalAccountCode = (String) original.get("postedAccountCode");
                String originalAccountName = (String) original.get("postedAccountName");
                String correctedAccountCode = (String) corrected.get("postedAccountCode");
                String correctedAccountName = (String) corrected.get("postedAccountName");
                if (originalAccountCode != null && originalAccountCode.equals(correctedAccountCode)) {
                    return; // same GL account either way — category changed, nothing to re-post
                }
                boolean isDropIn = movement.getMovementType() == PosCashMovementType.DROP_IN;
                String cashName = "Cash in Hand";
                String cashCode = PostingEngineService.ACC_CASH;
                // Branch dimension omitted here — the same simplification already accepted for
                // advance-allocation corrections above; these are small correction entries, not
                // full transaction postings, and branch is optional on postCorrectionEntry.
                com.billbull.backend.settings.branch.Branch branch = null;

                if (isDropIn) {
                    // Original: Dr Cash / Cr originalAccount. Reverse: Dr originalAccount / Cr Cash.
                    postingEngine.postCorrectionEntry(revRef, "Correction reversal of cash movement #" + c.getTargetId(),
                            "CMDCORR", branch, date, originalAccountName, originalAccountCode, cashName, cashCode, movement.getAmount());
                    postingEngine.postCorrectionEntry(applyRef, "Correction of cash movement #" + c.getTargetId(),
                            "CMDCORR", branch, date, cashName, cashCode, correctedAccountName, correctedAccountCode, movement.getAmount());
                } else {
                    // Original: Dr originalAccount / Cr Cash. Reverse: Dr Cash / Cr originalAccount.
                    postingEngine.postCorrectionEntry(revRef, "Correction reversal of cash movement #" + c.getTargetId(),
                            "CMDCORR", branch, date, cashName, cashCode, originalAccountName, originalAccountCode, movement.getAmount());
                    postingEngine.postCorrectionEntry(applyRef, "Correction of cash movement #" + c.getTargetId(),
                            "CMDCORR", branch, date, correctedAccountName, correctedAccountCode, cashName, cashCode, movement.getAmount());
                }
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unsupported target type for execution: " + c.getTargetType());
        }
    }
}
