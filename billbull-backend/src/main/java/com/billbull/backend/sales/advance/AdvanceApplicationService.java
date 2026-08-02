package com.billbull.backend.sales.advance;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.financials.receiptvoucher.ReceiptPurpose;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucher;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherService;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

import jakarta.persistence.EntityManager;
import com.billbull.backend.pos.admin.CorrectionTargetType;
import com.billbull.backend.pos.admin.EffectiveCorrectionViewService;

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
    private final com.billbull.backend.pos.session.PosSessionService posSessionService;
    private final EntityManager entityManager;
    private final EffectiveCorrectionViewService effectiveCorrectionViewService;

    public AdvanceApplicationService(
            AdvanceApplicationRepository applicationRepo,
            ReceiptVoucherRepository receiptRepo,
            SalesInvoiceRepository salesInvoiceRepo,
            PostingEngineService postingEngine,
            ReceiptVoucherService receiptVoucherService,
            com.billbull.backend.pos.session.PosSessionService posSessionService,
            EntityManager entityManager,
            EffectiveCorrectionViewService effectiveCorrectionViewService) {
        this.applicationRepo = applicationRepo;
        this.receiptRepo     = receiptRepo;
        this.salesInvoiceRepo = salesInvoiceRepo;
        this.postingEngine   = postingEngine;
        this.receiptVoucherService = receiptVoucherService;
        this.posSessionService = posSessionService;
        this.entityManager = entityManager;
        this.effectiveCorrectionViewService = effectiveCorrectionViewService;
    }

    /**
     * Returns all advance receipts for the customer with their remaining open balance.
     */
    public List<AdvanceBalance> findOpenAdvances(String customerCode) {
        List<ReceiptVoucher> advances = receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                customerCode, ReceiptPurpose.ADVANCE_RECEIVED);
        
        advances.forEach(entityManager::detach);
        advances = effectiveCorrectionViewService.resolveOverlays(
                CorrectionTargetType.CUSTOMER_ADVANCE, advances, ReceiptVoucher::getId);

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
     * Receives an advance payment, creating a ReceiptVoucher.
     * Optionally links to a POS Session if terminalId is provided.
     */
    @Transactional
    public ReceiptVoucher receiveAdvance(String customerCode, BigDecimal amount, String paymentMode, String reference, String terminalId) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Advance amount must be greater than zero");
        }

        ReceiptVoucher receipt = new ReceiptVoucher();
        receipt.setCustomerCode(customerCode);
        receipt.setAmount(amount);
        receipt.setPaymentMode(paymentMode);
        receipt.setReference(reference);
        receipt.setDate(LocalDate.now());
        receipt.setPurpose(ReceiptPurpose.ADVANCE_RECEIVED);

        if (terminalId != null && !terminalId.isBlank()) {
            posSessionService.getActiveSession(terminalId).ifPresent(session -> {
                receipt.setPosSessionId(session.getId());
                receipt.setPosTerminalId(session.getTerminalId());
                receipt.setPosCounterName(session.getCounterName());
                receipt.setBranchEntityId(session.getBranchId());
                // The receipt date can be set to the session business date if needed
                receipt.setDate(session.getSessionDate());
            });
        }

        return receiptVoucherService.createReceipt(receipt, null);
    }

    /**
     * True if this customer has ever had an ADVANCE_RECEIVED voucher, regardless of
     * whether it's still open. Lets the UI distinguish "never received an advance"
     * from "received one but it's fully applied" — both render as an empty
     * findOpenAdvances() list otherwise.
     */
    public boolean hasAdvanceHistory(String customerCode) {
        return !receiptRepo.findByCustomerCodeAndPurpose(customerCode, ReceiptPurpose.ADVANCE_RECEIVED).isEmpty();
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

    /**
     * Applies available advance balances to an invoice up to the requested amount.
     * Starts from the oldest open advance and stops when the requested amount is met.
     */
    @Transactional
    public BigDecimal applyAvailableAdvancesToInvoice(String customerCode, String invoiceNumber, BigDecimal amountToApply, LocalDate appliedDate) {
        if (customerCode == null || invoiceNumber == null || amountToApply == null || amountToApply.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }

        List<AdvanceBalance> openAdvances = findOpenAdvances(customerCode);
        BigDecimal remaining = amountToApply;
        BigDecimal totalApplied = BigDecimal.ZERO;

        for (AdvanceBalance advance : openAdvances) {
            if (remaining.compareTo(new BigDecimal("0.01")) <= 0) break;

            BigDecimal openBalance = advance.openBalance();
            if (openBalance.compareTo(BigDecimal.ZERO) <= 0) continue;

            BigDecimal toApply = openBalance.min(remaining);
            apply(advance.receiptId(), invoiceNumber, toApply, appliedDate);
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

    public record CustomerAdvanceSummary(
            BigDecimal totalReceived,
            BigDecimal totalApplied,
            BigDecimal totalRefunded,
            BigDecimal availableBalance,
            int openAdvancesCount,
            LocalDate lastAdvanceDate
    ) {}

    public record AdvanceHistoryItem(
            Long receiptId,
            String voucherId,
            LocalDate date,
            String paymentMode,
            String reference,
            BigDecimal totalAmount,
            BigDecimal appliedAmount,
            BigDecimal refundedAmount,
            BigDecimal openBalance,
            String status // OPEN, APPLIED, REFUNDED, PARTIAL
    ) {}

    @Transactional(readOnly = true)
    public CustomerAdvanceSummary getCustomerAdvanceSummary(String customerCode) {
        List<ReceiptVoucher> advances = receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                customerCode, ReceiptPurpose.ADVANCE_RECEIVED);

        advances.forEach(entityManager::detach);
        advances = effectiveCorrectionViewService.resolveOverlays(
                CorrectionTargetType.CUSTOMER_ADVANCE, advances, ReceiptVoucher::getId);

        BigDecimal totalReceived = BigDecimal.ZERO;
        BigDecimal totalApplied = BigDecimal.ZERO;
        BigDecimal totalRefunded = BigDecimal.ZERO;
        BigDecimal availableBalance = BigDecimal.ZERO;
        int openAdvancesCount = 0;
        LocalDate lastAdvanceDate = null;

        for (ReceiptVoucher rv : advances) {
            BigDecimal amount = rv.getAmount() != null ? rv.getAmount() : BigDecimal.ZERO;
            totalReceived = totalReceived.add(amount);

            if (lastAdvanceDate == null || (rv.getDate() != null && rv.getDate().isAfter(lastAdvanceDate))) {
                lastAdvanceDate = rv.getDate();
            }

            List<AdvanceApplication> applications = applicationRepo.findByAdvanceReceiptId(rv.getId());
            BigDecimal applied = BigDecimal.ZERO;
            BigDecimal refunded = BigDecimal.ZERO;

            for (AdvanceApplication app : applications) {
                if ("APPLIED".equals(app.getStatus())) {
                    applied = applied.add(app.getAppliedAmount() != null ? app.getAppliedAmount() : BigDecimal.ZERO);
                } else if ("REFUNDED".equals(app.getStatus())) {
                    refunded = refunded.add(app.getAppliedAmount() != null ? app.getAppliedAmount() : BigDecimal.ZERO);
                }
            }

            totalApplied = totalApplied.add(applied);
            totalRefunded = totalRefunded.add(refunded);
            
            BigDecimal open = amount.subtract(applied).subtract(refunded);
            if (open.compareTo(BigDecimal.ZERO) > 0) {
                availableBalance = availableBalance.add(open);
                openAdvancesCount++;
            }
        }

        return new CustomerAdvanceSummary(
                totalReceived, totalApplied, totalRefunded, availableBalance, openAdvancesCount, lastAdvanceDate
        );
    }

    @Transactional(readOnly = true)
    public com.billbull.backend.util.PageResponse<AdvanceHistoryItem> getCustomerAdvanceHistory(
            String customerCode, String filter, int page, int size) {
        List<ReceiptVoucher> advances = receiptRepo.findByCustomerCodeAndPurposeOrderByDateAsc(
                customerCode, ReceiptPurpose.ADVANCE_RECEIVED);

        advances.forEach(entityManager::detach);
        advances = effectiveCorrectionViewService.resolveOverlays(
                CorrectionTargetType.CUSTOMER_ADVANCE, advances, ReceiptVoucher::getId);

        List<AdvanceHistoryItem> items = new ArrayList<>();
        for (ReceiptVoucher rv : advances) {
            BigDecimal totalAmount = rv.getAmount() != null ? rv.getAmount() : BigDecimal.ZERO;
            List<AdvanceApplication> applications = applicationRepo.findByAdvanceReceiptId(rv.getId());
            BigDecimal appliedAmount = BigDecimal.ZERO;
            BigDecimal refundedAmount = BigDecimal.ZERO;

            for (AdvanceApplication app : applications) {
                if ("APPLIED".equals(app.getStatus())) {
                    appliedAmount = appliedAmount.add(app.getAppliedAmount() != null ? app.getAppliedAmount() : BigDecimal.ZERO);
                } else if ("REFUNDED".equals(app.getStatus())) {
                    refundedAmount = refundedAmount.add(app.getAppliedAmount() != null ? app.getAppliedAmount() : BigDecimal.ZERO);
                }
            }

            BigDecimal openBalance = totalAmount.subtract(appliedAmount).subtract(refundedAmount);
            String status;
            if (refundedAmount.compareTo(totalAmount) >= 0) {
                status = "REFUNDED";
            } else if (appliedAmount.compareTo(totalAmount) >= 0) {
                status = "APPLIED";
            } else if (openBalance.compareTo(totalAmount) < 0 && openBalance.compareTo(BigDecimal.ZERO) > 0) {
                status = "PARTIAL";
            } else {
                status = "OPEN";
            }

            // Filtering
            boolean include = true;
            if ("Open".equalsIgnoreCase(filter) && openBalance.compareTo(BigDecimal.ZERO) <= 0) include = false;
            if ("Applied".equalsIgnoreCase(filter) && !"APPLIED".equals(status)) include = false;
            if ("Refunded".equalsIgnoreCase(filter) && !"REFUNDED".equals(status)) include = false;
            
            if (include) {
                items.add(new AdvanceHistoryItem(
                        rv.getId(), rv.getVoucherId(), rv.getDate(), rv.getPaymentMode(),
                        rv.getReference(), totalAmount, appliedAmount, refundedAmount, openBalance, status
                ));
            }
        }

        // Sort by date desc
        items.sort((a, b) -> {
            if (a.date() == null && b.date() == null) return 0;
            if (a.date() == null) return 1;
            if (b.date() == null) return -1;
            return b.date().compareTo(a.date());
        });

        return com.billbull.backend.util.PaginationUtil.paginate(items, page, size, null, null);
    }
}
