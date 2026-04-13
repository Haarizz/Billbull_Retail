package com.billbull.backend.purchase.vendor;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface VendorRepository extends JpaRepository<Vendor, Long> {

    List<Vendor> findByIsActiveTrue();
}
