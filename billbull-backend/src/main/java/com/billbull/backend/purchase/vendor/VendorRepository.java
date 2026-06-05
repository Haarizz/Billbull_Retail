package com.billbull.backend.purchase.vendor;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface VendorRepository extends JpaRepository<Vendor, Long> {

    List<Vendor> findByIsActiveTrue();

    Optional<Vendor> findByName(String name);

    Optional<Vendor> findByCode(String code);
}
