package com.billbull.backend.sales.advance;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
@Slf4j
public class AdvanceApplicationService {

    private final AdvanceApplicationRepository applicationRepo;
    private final ReceiptVoucherRepository receiptRepo;
    private final PostingEngineService postingEngine;

    public AdvanceApplicationService(
            AdvanceApplicationRepository applicationRepo,
            ReceiptVoucherRepository receiptRepo,
            PostingEngineService postingEngine) {
        this.applicationRepo = applicationRepo;
        this.receiptRepo     = receiptRepo;
        this.postingEngine   = postingEngine;
    }

    /**
     * Returns all advance receipts for the customer with their remaining open balance.
     */
    public List<AdvanceBalance> findOpenAdvances(String customerCode) {
        List<ReceiptVoucher> advances = receiptRepo.findByCustomerCodeAndPurpose(
                customerCode, ReceiptPurpose.ADVANCE_RECEIVED);

        List<AdvanceBalance> result = new ArrayList<>();
        for (ReceiptVoucher rv : advances) {
            BigDecimal totalAmount  = rv.getAmount() != null ? rv.getAmount() : BigDecimal.ZERO;
            BigDecimal applied      = applicationRepo.sumAppliedByReceiptId(rv.getId());
            BigDecimal openBalance  = totalAmount.subtract(applied);
            if (openBalance.compareTo(BigDecimal.ZERO) > 0) {
                result.add(new AdvanceBalance(rv.getId(), rv.getVoucherId(), totalAmount, applied, openBalance));
            }
        }
        return result;
    }

    /**
     * Applies an advance receipt against a sales invoice.
     * Posts: Dr Customer Advance (2104) / Cr Accounts Receivable (1110)
     */
    @Transactional
    public AdvanceApplication apply(Long advanceReceiptId, String invoiceNumber,
                                    BigDecimal amount, LocalDate appliedDate) {
        ReceiptVoucher rv = receiptRepo.findById(advanceReceiptId)
                .orElseThrow(() -> new RuntimeException("Advance receipt not found: " + advanceReceiptId));

        BigDecimal openBalance = rv.getAmount().subtract(
                applicationRepo.sumAppliedByReceiptId(advanceReceiptId));

        if (amount.compareTo(openBalance) > 0) {
            throw new IllegalArgumentException(
                    "Applied amount " + amount + " exceeds open advance balance " + openBalance);
        }

        AdvanceApplication app = new AdvanceApplication();
        app.setAdvanceReceiptId(advanceReceiptId);
        app.setInvoiceNumber(invoiceNumber);
        app.setAppliedAmount(amount);
        app.setAppliedDate(appliedDate != null ? appliedDate : LocalDate.now());
        AdvanceApplication saved = applicationRepo.save(app);

        postingEngine.createJournalFromAdvanceApplication(advanceReceiptId, invoiceNumber, amount, appliedDate);
        log.info("[AdvanceApplication] Applied {} of advance {} to invoice {}", amount, rv.getVoucherId(), invoiceNumber);
        return saved;
    }

    /**
     * Refunds an open customer advance back to bank/cash.
     * Posts: Dr Customer Advance (2104) / Cr Bank (1102)
     */
    @Transactional
    public AdvanceApplication refund(Long advanceReceiptId, BigDecimal amount, String paymentMode) {
        ReceiptVoucher rv = receiptRepo.findById(advanceReceiptId)
                .orElseThrow(() -> new RuntimeException("Advance receipt not found: " + advanceReceiptId));

        BigDecimal openBalance = rv.getAmount().subtract(
                applicationRepo.sumAppliedByReceiptId(advanceReceiptId));

        if (amount.compareTo(openBalance) > 0) {
            throw new IllegalArgumentException(
                    "Refund amount " + amount + " exceeds open advance balance " + openBalance);
        }

        AdvanceApplication app = new AdvanceApplication();
        app.setAdvanceReceiptId(advanceReceiptId);
        app.setInvoiceNumber("REFUND");
        app.setAppliedAmount(amount);
        app.setAppliedDate(LocalDate.now());
        app.setStatus("REFUNDED");
        AdvanceApplication saved = applicationRepo.save(app);

        postingEngine.createJournalFromAdvanceRefund(advanceReceiptId, amount, paymentMode);
        log.info("[AdvanceApplication] Refunded {} of advance {}", amount, rv.getVoucherId());
        return saved;
    }

    /** Simple open-balance projection DTO. */
    public record AdvanceBalance(
        Long receiptId, String voucherId,
        BigDecimal totalAmount, BigDecimal appliedAmount, BigDecimal openBalance
    ) {}
}
