package com.billbull.backend.pos.admin;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Enterprise Console &gt; POS Administration — the single reusable entry point for "what is the
 * effective value of this record right now, given any applied corrections" (Phase 5 §1).
 *
 * <p>This is deliberately a thin dispatcher, not a new overlay calculator: the actual original/
 * corrected/effective computation already lives correctly in {@link
 * PosSessionDenominationCorrectionService#getEffectiveDenomination} (Phase 3) and {@link
 * PosTransactionCorrectionService#getEffective} (Phase 4). Duplicating that math here would
 * violate the "avoid duplicated overlay calculations" requirement; instead, every screen that
 * needs corrected information — dashboard drill-ins, the Audit View, the History detail
 * drawer — calls this one method instead of hand-rolling target-type-specific logic.
 *
 * <p>Never modifies {@code PosSession}, any report snapshot, {@code ReceiptVoucher}, {@code
 * AdvanceApplication}, or {@code PosCashMovement} — purely reads through to the two existing
 * read-only overlay methods.
 */
@Service
public class EffectiveCorrectionViewService {

    private final PosSessionDenominationCorrectionService denominationCorrectionService;
    private final PosTransactionCorrectionService transactionCorrectionService;

    public EffectiveCorrectionViewService(PosSessionDenominationCorrectionService denominationCorrectionService,
                                           PosTransactionCorrectionService transactionCorrectionService) {
        this.denominationCorrectionService = denominationCorrectionService;
        this.transactionCorrectionService = transactionCorrectionService;
    }

    /**
     * Routes to the correct existing overlay computation for the given target. {@code
     * POS_SESSION} (session denomination corrections) is handled by Phase 3's service;
     * {@code RECEIPT_VOUCHER}/{@code CUSTOMER_ADVANCE}/{@code CASH_MOVEMENT} (transaction
     * corrections) by Phase 4's. Any other target type simply has no correction concept —
     * returns an uncorrected shell rather than throwing, since callers (e.g. a dashboard
     * drill-in iterating over mixed target types) shouldn't need a try/catch per record.
     */
    public Map<String, Object> getEffectiveView(CorrectionTargetType targetType, Long targetId) {
        if (targetType == null || targetId == null) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("corrected", false);
            return empty;
        }
        return switch (targetType) {
            case POS_SESSION -> denominationCorrectionService.getEffectiveDenomination(targetId);
            case RECEIPT_VOUCHER, CUSTOMER_ADVANCE, CASH_MOVEMENT -> transactionCorrectionService.getEffective(targetType, targetId);
            default -> {
                Map<String, Object> uncorrected = new LinkedHashMap<>();
                uncorrected.put("targetType", targetType);
                uncorrected.put("targetId", targetId);
                uncorrected.put("corrected", false);
                yield uncorrected;
            }
        };
    }
}
