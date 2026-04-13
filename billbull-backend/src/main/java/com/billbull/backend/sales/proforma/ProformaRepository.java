package com.billbull.backend.sales.proforma;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ProformaRepository extends JpaRepository<ProformaInvoice, Long> {
    List<ProformaInvoice> findByStatus(ProformaStatus status);
}
