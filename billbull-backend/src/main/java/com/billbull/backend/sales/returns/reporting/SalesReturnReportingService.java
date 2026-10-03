package com.billbull.backend.sales.returns.reporting;

import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnItem;
import com.billbull.backend.sales.returns.SalesReturnRefundMethod;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.returns.SalesReturnStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * The single place approved Sales Returns are turned into report figures.
 *
 * <p>Before this existed, the Back Office Sales Report, the POS X-Report and the POS Z-Report
 * each aggregated {@code sales_returns} their own way, and the three disagreed: on which rows
 * counted (one treated a null status as approved, another counted DRAFT), on which column
 * classified the settlement, and on whether returns touched Net Sales at all. Every report now
 * calls this, so the same approved return produces the same figures wherever it is read.
 *
 * <h2>Inclusion rule</h2>
 *
 * <p>{@link SalesReturnStatus#APPROVED} only. A DRAFT return has moved no stock, posted no
 * journal and settled nothing, and a CANCELLED one never will — reporting either as a return
 * states value left the business when it did not. There is deliberately no legacy tolerance for
 * a null status: nothing can create such a row ({@code saveReturn} always stamps one), and
 * accepting null is how DRAFT returns reached the Sales Report's Returns column.
 *
 * <h2>Date rule</h2>
 *
 * <p>Scopes are keyed on {@code returnDate}, which {@code SalesReturnService} stamps equal to
 * {@code tradingDate} from the one authoritative business-date resolver. Nothing here resolves
 * a date of its own, so a return approved either side of midnight lands on the same reporting
 * day in every report.
 */
@Service
public class SalesReturnReportingService {

    private final SalesReturnRepository returnRepository;

    public SalesReturnReportingService(SalesReturnRepository returnRepository) {
        this.returnRepository = returnRepository;
    }

    /** One business day, one branch — the Z-Report / Day Close scope. */
    @Transactional(readOnly = true)
    public SalesReturnReportingTotals forBranchAndDate(Long branchId, LocalDate date) {
        if (date == null) return SalesReturnReportingTotals.empty();
        return totalsOf(returnRepository.findByReturnDateAndBranchWithItems(date, branchId));
    }

    /**
     * Totals over an already-loaded, already-filtered list of returns.
     *
     * <p>Used where the caller owns the scoping — the Sales Report applies branch, customer,
     * item and search filters of its own, and the X-Report restricts to the invoices belonging
     * to one session. Status filtering is still done here, so no caller can opt out of it.
     */
    public SalesReturnReportingTotals totalsOf(List<SalesReturn> returns) {
        SalesReturnReportingTotals totals = SalesReturnReportingTotals.empty();
        if (returns == null) return totals;

        for (SalesReturn r : returns) {
            if (!isReportable(r)) continue;

            totals.addHeader(r.getTotalAmount(), r.getSubTotal(), r.getTaxAmount());

            // The settled figure is the server-derived paid portion, which is what a drawer or
            // a bank statement reconciles against. It is NOT the document total: on a part-paid
            // invoice most of a return is an AR allocation that moves no money.
            BigDecimal settled = r.getRefundAmount() != null ? r.getRefundAmount() : nz(r.getTotalAmount());

            SalesReturnRefundMethod method = resolveRefundMethod(r);
            if (method != null) {
                totals.addRefund(method, settled);
            } else if (r.getReturnAction() == null || r.getReturnAction().isBlank()) {
                totals.addUnclassified(settled);
            } else if (r.settlesOutsideReceivable()) {
                // A pre-V78 row whose action is a bare "Refund": the instrument is gone, but the
                // fact that money left is not, and dropping it would under-report the payouts.
                totals.addLegacyPaidOut(settled);
            } else {
                totals.addLegacyLedgerCredit(settled);
            }

            if ("Replacement".equalsIgnoreCase(r.getReturnAction() != null ? r.getReturnAction() : "")) {
                totals.addExchange(r.getTotalAmount());
            }

            if (r.getItems() != null) {
                for (SalesReturnItem it : r.getItems()) {
                    totals.addQuantity(it.getReturnQty() != null ? it.getReturnQty() : 0);
                }
            }
        }
        return totals;
    }

    /**
     * Whether one return belongs in any report of returns.
     *
     * <p>Public and static so a caller that filters its own dataset (the Sales Report) applies
     * exactly this rule rather than a second reading of it.
     */
    public static boolean isReportable(SalesReturn r) {
        return r != null && r.getStatus() == SalesReturnStatus.APPROVED;
    }

    /** {@code refund_method}, or the legacy free-text label for rows written before it existed. */
    public static SalesReturnRefundMethod resolveRefundMethod(SalesReturn r) {
        if (r.getRefundMethod() != null) return r.getRefundMethod();
        return SalesReturnRefundMethod.fromLegacyLabel(r.getReturnAction());
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
