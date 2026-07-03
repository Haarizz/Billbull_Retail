package com.billbull.backend.sales.advance;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

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
    private final SalesInvoiceRepository salesInvoiceRepo;
    private final PostingEngineService postingEngine;
    private final ReceiptVoucherService receiptVoucherService;

    public AdvanceApplicationService(
            AdvanceApplicationRepository applicationRepo,
            ReceiptVoucherRepository receiptRepo,
            SalesInvoiceRepository salesInvoiceRepo,
            PostingEngineService postingEngine,
            ReceiptVoucherService receiptVoucherService) {
        this.applicationRepo = applicationRepo;
        this.receiptRepo     = receiptRepo;
        this.salesInvoiceRepo = salesInvoiceRepo;
        this.postingEngine   = postingEngine;
        this.receiptVoucherService = receiptVoucherService;
    }

    /**
     * Returns all advance receipts for the customer with their remaining open balance.
     */
    public List<AdvanceBalance> findOpenAdvances(String customerCode) {
        List<ReceiptVoucher> advances = receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
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
     *
     * Validates the invoice and both balances so this is safe to call from a
     * manual/user-supplied request as well as internal auto-apply flows —
     * never trust the caller to have already checked these.
     */
    @Transactional
    public AdvanceApplication apply(Long advanceReceiptId, String invoiceNumber,
                                    BigDecimal amount, LocalDate appliedDate) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Applied amount must be greater than zero");
        }

        // Row-locked for the rest of this transaction: closes the race where two
        // concurrent applications against the same advance could both read a
        // stale open balance and jointly over-apply it.
        ReceiptVoucher rv = receiptRepo.findByIdForUpdate(advanceReceiptId)
                .orElseThrow(() -> new RuntimeException("Advance receipt not found: " + advanceReceiptId));

        SalesInvoice invoice = salesInvoiceRepo.findByInvoiceNumber(invoiceNumber)
                .orElseThrow(() -> new IllegalArgumentException("Invoice not found: " + invoiceNumber));

        if (rv.getCustomerCode() != null && invoice.getCustomerCode() != null
                && !rv.getCustomerCode().equals(invoice.getCustomerCode())) {
            throw new IllegalArgumentException(
                    "Invoice " + invoiceNumber + " does not belong to the advance's customer");
        }

        BigDecimal invoiceBalance = invoice.getBalance() != null ? invoice.getBalance() : BigDecimal.ZERO;
        if (invoiceBalance.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Invoice " + invoiceNumber + " has no outstanding balance");
        }
        if (amount.compareTo(invoiceBalance) > 0) {
            throw new IllegalArgumentException(
                    "Applied amount " + amount + " exceeds invoice outstanding balance " + invoiceBalance);
        }

        // Re-read the open balance now that the row is locked — must happen after
        // acquiring the lock, not before, or the check-then-act race is still open.
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

        // This is the only place that keeps SalesInvoice.amountPaid/balance/status in
        // sync with an applied advance — applying only posts a GL journal + this
        // AdvanceApplication row, it never touches the invoice row directly.
        receiptVoucherService.syncInvoiceAfterAdvanceApplication(invoice.getId());

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

    /**
     * Applies one specific advance receipt FIFO against the customer's own
     * oldest outstanding invoices first, up to the receipt's open balance.
     *
     * Used right after a general "Customer Receipt" (no invoice link) is
     * recorded: such a receipt is stored as an ADVANCE_RECEIVED ReceiptVoucher
     * (see PaymentService.upsertReceiptVoucher) and — unlike a receipt linked
     * to one specific invoice — otherwise sits unapplied until some future
     * invoice save happens to sweep it up (SalesInvoiceService.save()). If the
     * customer already has an outstanding balance, that's wrong: the payment
     * should settle it immediately so Customer Statement / Dashboard reflect
     * it right away. Any amount left over after all outstanding invoices are
     * covered simply remains as the receipt's open (unapplied) advance
     * balance, to be used by a future invoice.
     */
    @Transactional
    public BigDecimal applyAgainstOutstandingInvoices(String customerCode, Long advanceReceiptId) {
        if (customerCode == null || customerCode.isBlank() || advanceReceiptId == null) {
            return BigDecimal.ZERO;
        }

        List<AdvanceBalance> openAdvances = findOpenAdvances(customerCode);
        BigDecimal openBalance = openAdvances.stream()
                .filter(a -> a.receiptId().equals(advanceReceiptId))
                .map(AdvanceBalance::openBalance)
                .findFirst()
                .orElse(BigDecimal.ZERO);
        if (openBalance.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }

        List<SalesInvoice> outstandingInvoices =
                salesInvoiceRepo.findOutstandingByCustomerCodeOrderByInvoiceDateAsc(customerCode);

        BigDecimal remaining = openBalance;
        BigDecimal totalApplied = BigDecimal.ZERO;
        for (SalesInvoice invoice : outstandingInvoices) {
            if (remaining.compareTo(new BigDecimal("0.01")) <= 0) break;

            BigDecimal invoiceBalance = invoice.getBalance() != null ? invoice.getBalance() : BigDecimal.ZERO;
            if (invoiceBalance.compareTo(BigDecimal.ZERO) <= 0) continue;

            BigDecimal toApply = invoiceBalance.min(remaining);
            apply(advanceReceiptId, invoice.getInvoiceNumber(), toApply, LocalDate.now());
            remaining = remaining.subtract(toApply);
            totalApplied = totalApplied.add(toApply);
        }
        return totalApplied;
    }

    /** Simple open-balance projection DTO. */
    public record AdvanceBalance(
        Long receiptId, String voucherId,
        BigDecimal totalAmount, BigDecimal appliedAmount, BigDecimal openBalance
    ) {}
}
