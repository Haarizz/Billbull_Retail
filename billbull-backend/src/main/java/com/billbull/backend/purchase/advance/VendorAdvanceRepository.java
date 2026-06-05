package com.billbull.backend.purchase.advance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface VendorAdvanceRepository extends JpaRepository<VendorAdvance, Long> {

    List<VendorAdvance> findByVendorId(Long vendorId);

    List<VendorAdvance> findByVendorIdAndStatus(Long vendorId, String status);

    @Query("SELECT COALESCE(SUM(va.amount), 0) FROM VendorAdvance va WHERE va.vendorId = :vendorId AND va.status = 'OPEN'")
    BigDecimal sumOpenByVendorId(@Param("vendorId") Long vendorId);
}
