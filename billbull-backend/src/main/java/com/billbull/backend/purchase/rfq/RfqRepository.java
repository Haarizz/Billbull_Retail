package com.billbull.backend.purchase.rfq;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RfqRepository extends JpaRepository<Rfq, Long> {

    List<Rfq> findByIsActiveTrueOrderByIdDesc();

    @Query("select v from RfqVendor v join fetch v.rfq r where v.portalToken = :token and r.isActive = true")
    java.util.Optional<RfqVendor> findVendorByPortalToken(@Param("token") String token);

    @Query("select v from RfqVendor v join fetch v.rfq r where v.id = :id and r.isActive = true")
    java.util.Optional<RfqVendor> findVendorById(@Param("id") Long id);

    /** Highest RFQ number with the given prefix (e.g. {@code RFQ-2026-%}); numbers are zero-padded so text order works. */
    @Query(value = "SELECT rfq_number FROM purchase_rfqs WHERE rfq_number LIKE :prefix ORDER BY rfq_number DESC LIMIT 1",
            nativeQuery = true)
    String findLastNumberLike(@Param("prefix") String prefix);
}
