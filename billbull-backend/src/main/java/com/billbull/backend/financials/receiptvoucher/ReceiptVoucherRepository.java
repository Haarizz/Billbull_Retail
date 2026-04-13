package com.billbull.backend.financials.receiptvoucher;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ReceiptVoucherRepository extends JpaRepository<ReceiptVoucher, Long> {
    List<ReceiptVoucher> findAllByOrderByDateDesc();
    List<ReceiptVoucher> findBySalesInvoiceId(Long salesInvoiceId);
}
