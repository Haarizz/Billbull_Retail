package com.billbull.backend.pos.admin;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.generalledger.postingengine.PostingException;
import com.billbull.backend.financials.generalledger.postingengine.PostingErrorCode;
import com.billbull.backend.financials.period.AccountingPeriodService;
import com.billbull.backend.pos.session.PosCashMovement;
import com.billbull.backend.pos.session.PosCashMovementRepository;
import com.billbull.backend.pos.session.PosCashMovementType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Enterprise Console > POS Administration > GL Execution Integration (Phase 4).
 * Executes approved transaction corrections by posting reversal and corrected entries.
 * Runs in a dedicated REQUIRES_NEW transaction to ensure execution failure does not rollback
 * the outer state machine transaction (which must record the FAILED state and audit log).
 */
@Service
public class PosTransactionExecutionService {

    private final PostingEngineService postingEngine;
    private final PosCashMovementRepository cashMovementRepository;
    private final AccountingPeriodService accountingPeriodService;
    private final ObjectMapper objectMapper;
    /** A correction posts into the Business Day it is executed in, so the period check and
     *  the posting date come from the Business Day clock, not the JVM calendar date. */
    private final com.billbull.backend.pos.businessdate.BusinessDayClock clock;

    public PosTransactionExecutionService(PostingEngineService postingEngine,
                                          PosCashMovementRepository cashMovementRepository,
                                          AccountingPeriodService accountingPeriodService,
                                          ObjectMapper objectMapper,
                                          com.billbull.backend.pos.businessdate.BusinessDayClock clock) {
        this.postingEngine = postingEngine;
        this.cashMovementRepository = cashMovementRepository;
        this.accountingPeriodService = accountingPeriodService;
        this.objectMapper = objectMapper;
        this.clock = clock;
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

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void executeCorrection(PosTransactionCorrection c) {
        LocalDate date = clock.now().toLocalDate();

        try {
            accountingPeriodService.assertOpen(date);
        } catch (PostingException e) {
            if (e.getCode() == PostingErrorCode.PERIOD_LOCKED) {
                throw new ResponseStatusException(HttpStatus.PRECONDITION_FAILED, "Accounting period is closed for date " + date);
            }
            throw e;
        }

        Map<String, Object> original = parseJson(c.getOriginalSnapshotJson());
        Map<String, Object> corrected = parseJson(c.getCorrectedSnapshotJson());
        String revRef = "TXNCORR-REV-" + c.getId();
        String applyRef = "TXNCORR-APPLY-" + c.getId();

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
                com.billbull.backend.settings.branch.Branch branch = null;

                if (isDropIn) {
                    postingEngine.postCorrectionEntry(revRef, "Correction reversal of cash movement #" + c.getTargetId(),
                            "CMDCORR", branch, date, originalAccountName, originalAccountCode, cashName, cashCode, movement.getAmount());
                    postingEngine.postCorrectionEntry(applyRef, "Correction of cash movement #" + c.getTargetId(),
                            "CMDCORR", branch, date, cashName, cashCode, correctedAccountName, correctedAccountCode, movement.getAmount());
                } else {
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
