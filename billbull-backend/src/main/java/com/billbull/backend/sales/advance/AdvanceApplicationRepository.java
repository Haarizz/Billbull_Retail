package com.billbull.backend.sales.advance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;

public interface AdvanceApplicationRepository extends JpaRepository<AdvanceApplication, Long> {

    List<AdvanceApplication> findByAdvanceReceiptId(Long advanceReceiptId);

    List<AdvanceApplication> findByInvoiceNumber(String invoiceNumber);

    @Query("SELECT COALESCE(SUM(a.appliedAmount), 0) FROM AdvanceApplication a WHERE a.advanceReceiptId = :receiptId AND a.status IN ('APPLIED', 'REFUNDED')")
    BigDecimal sumAppliedByReceiptId(@Param("receiptId") Long receiptId);

    /**
     * Sum of advance applications settled against a given invoice — folded into
     * SalesInvoice.amountPaid/balance by ReceiptVoucherService.syncLinkedInvoice,
     * since applying an advance posts a GL journal but (unlike a ReceiptVoucher
     * linked via salesInvoiceId) never touches the invoice row directly.
     */
    @Query("SELECT COALESCE(SUM(a.appliedAmount), 0) FROM AdvanceApplication a WHERE a.invoiceNumber = :invoiceNumber AND a.status = 'APPLIED'")
    BigDecimal sumAppliedByInvoiceNumber(@Param("invoiceNumber") String invoiceNumber);

    /**
     * The same sum across a set of invoices, in one query.
     *
     * <p>Read by the POS Day Close sales reconciliation: an advance applied to an invoice sold
     * inside the closing range settles it without producing tender in that range (the money was
     * collected when the advance was taken, possibly on another day), so the sales identity has
     * to add the allocation back.
     */
    @Query("SELECT COALESCE(SUM(a.appliedAmount), 0) FROM AdvanceApplication a WHERE a.invoiceNumber IN :invoiceNumbers AND a.status = 'APPLIED'")
    BigDecimal sumAppliedByInvoiceNumbers(@Param("invoiceNumbers") Collection<String> invoiceNumbers);
}
