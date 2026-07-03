package com.billbull.backend.sales.advance;

import com.billbull.backend.financials.receiptvoucher.ReceiptVoucherRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * One-off reconciliation for advances recorded before the auto/manual-apply
 * flow existed (AdvanceApplicationService.apply() was previously unreachable
 * for general advances — see StatementService's excludeFromBalance gap).
 * Walks every customer with an open general-advance balance and applies it
 * FIFO against their oldest outstanding invoices, via the same
 * AdvanceApplicationService.apply() path new invoices use going forward, so
 * historical data ends up in the identical, correctly-audited state.
 *
 * Idempotent: an invoice/advance pair already applied is skipped by
 * AdvanceApplicationService's own open-balance accounting, so running this
 * more than once is safe and a no-op once everything is caught up.
 */
@Service
@Slf4j
public class AdvanceBackfillService {

    private final ReceiptVoucherRepository receiptVoucherRepo;
    private final SalesInvoiceRepository salesInvoiceRepo;
    private final AdvanceApplicationService advanceApplicationService;

    public AdvanceBackfillService(ReceiptVoucherRepository receiptVoucherRepo,
            SalesInvoiceRepository salesInvoiceRepo,
            AdvanceApplicationService advanceApplicationService) {
        this.receiptVoucherRepo = receiptVoucherRepo;
        this.salesInvoiceRepo = salesInvoiceRepo;
        this.advanceApplicationService = advanceApplicationService;
    }

    public record CustomerBackfillResult(
            String customerCode, BigDecimal totalApplied, int applicationsCreated, List<String> errors) {
    }

    public record BackfillSummary(
            int customersScanned, int customersWithApplications,
            BigDecimal totalApplied, List<CustomerBackfillResult> details) {
    }

    /**
     * Runs the backfill across every customer with a recorded general advance.
     * Each customer is reconciled in its own transaction so one customer's
     * failure doesn't roll back progress already made on others.
     */
    public BackfillSummary runForAllCustomers() {
        List<String> customerCodes = receiptVoucherRepo.findDistinctCustomerCodesWithAdvances();
        List<CustomerBackfillResult> details = new ArrayList<>();
        BigDecimal totalApplied = BigDecimal.ZERO;
        int withApplications = 0;

        for (String customerCode : customerCodes) {
            CustomerBackfillResult result = runForCustomerSafely(customerCode);
            if (result.applicationsCreated() > 0) {
                withApplications++;
            }
            totalApplied = totalApplied.add(result.totalApplied());
            details.add(result);
        }

        log.info("[AdvanceBackfill] Scanned {} customers, {} had applications created, total applied {}",
                customerCodes.size(), withApplications, totalApplied);
        return new BackfillSummary(customerCodes.size(), withApplications, totalApplied, details);
    }

    /** Reconciles a single customer's open advances against their outstanding invoices. */
    public CustomerBackfillResult runForCustomerSafely(String customerCode) {
        try {
            return runForCustomer(customerCode);
        } catch (Exception ex) {
            log.warn("[AdvanceBackfill] Failed to backfill customer {}: {}", customerCode, ex.getMessage());
            return new CustomerBackfillResult(customerCode, BigDecimal.ZERO, 0, List.of(ex.getMessage()));
        }
    }

    @Transactional
    public CustomerBackfillResult runForCustomer(String customerCode) {
        List<String> errors = new ArrayList<>();
        BigDecimal totalApplied = BigDecimal.ZERO;
        int applicationsCreated = 0;

        List<AdvanceApplicationService.AdvanceBalance> openAdvances =
                advanceApplicationService.findOpenAdvances(customerCode);
        if (openAdvances.isEmpty()) {
            return new CustomerBackfillResult(customerCode, BigDecimal.ZERO, 0, errors);
        }

        List<SalesInvoice> outstandingInvoices =
                salesInvoiceRepo.findOutstandingByCustomerCodeOrderByInvoiceDateAsc(customerCode);
        if (outstandingInvoices.isEmpty()) {
            return new CustomerBackfillResult(customerCode, BigDecimal.ZERO, 0, errors);
        }

        int advanceIdx = 0;
        BigDecimal advanceRemaining = openAdvances.isEmpty()
                ? BigDecimal.ZERO
                : openAdvances.get(0).openBalance();

        for (SalesInvoice invoice : outstandingInvoices) {
            BigDecimal invoiceRemaining = invoice.getBalance() != null ? invoice.getBalance() : BigDecimal.ZERO;

            while (invoiceRemaining.compareTo(new BigDecimal("0.01")) > 0 && advanceIdx < openAdvances.size()) {
                if (advanceRemaining.compareTo(new BigDecimal("0.01")) <= 0) {
                    advanceIdx++;
                    if (advanceIdx < openAdvances.size()) {
                        advanceRemaining = openAdvances.get(advanceIdx).openBalance();
                    }
                    continue;
                }

                BigDecimal toApply = advanceRemaining.min(invoiceRemaining);
                try {
                    advanceApplicationService.apply(
                            openAdvances.get(advanceIdx).receiptId(),
                            invoice.getInvoiceNumber(),
                            toApply,
                            LocalDate.now());
                    totalApplied = totalApplied.add(toApply);
                    applicationsCreated++;
                    invoiceRemaining = invoiceRemaining.subtract(toApply);
                    advanceRemaining = advanceRemaining.subtract(toApply);
                } catch (Exception ex) {
                    errors.add("Advance " + openAdvances.get(advanceIdx).voucherId()
                            + " -> invoice " + invoice.getInvoiceNumber() + ": " + ex.getMessage());
                    // Skip this advance/invoice pairing on failure rather than aborting the
                    // whole customer's backfill; move to the next advance.
                    advanceIdx++;
                    if (advanceIdx < openAdvances.size()) {
                        advanceRemaining = openAdvances.get(advanceIdx).openBalance();
                    }
                }
            }

            if (advanceIdx >= openAdvances.size()) {
                break;
            }
        }

        return new CustomerBackfillResult(customerCode, totalApplied, applicationsCreated, errors);
    }
}
