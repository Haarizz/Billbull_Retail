package com.billbull.backend.sales.customerledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OpeningInvoiceRepository extends JpaRepository<OpeningInvoice, Long> {

    /** Returns all opening invoices for a customer identified by customer code. */
    List<OpeningInvoice> findByCustomer_Code(String customerCode);
}
