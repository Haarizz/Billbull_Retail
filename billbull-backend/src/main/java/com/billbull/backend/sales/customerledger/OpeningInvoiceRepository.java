package com.billbull.backend.sales.customerledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OpeningInvoiceRepository extends JpaRepository<OpeningInvoice, Long> {

    /** Returns all opening invoices for a customer identified by customer code. */
    List<OpeningInvoice> findByCustomer_Code(String customerCode);

    /**
     * Bulk sum of outstanding opening balances per customer: returns [customerCode, outstandingSum].
     * Uses COALESCE(outstanding, amount) to handle rows where outstanding was not explicitly set.
     */
    @Query("SELECT oi.customer.code, COALESCE(SUM(COALESCE(oi.outstanding, oi.amount)), 0) " +
           "FROM OpeningInvoice oi WHERE oi.customer.code IS NOT NULL " +
           "GROUP BY oi.customer.code")
    List<Object[]> sumOutstandingByCustomerCode();
}
