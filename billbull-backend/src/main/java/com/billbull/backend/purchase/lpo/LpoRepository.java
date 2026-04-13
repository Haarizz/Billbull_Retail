package com.billbull.backend.purchase.lpo;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LpoRepository extends JpaRepository<Lpo, Long> {

    Optional<Lpo> findByLpoNumber(String lpoNumber);

    List<Lpo> findByStatus(LpoStatus status);

    boolean existsByIdAndStockPostedTrue(Long id);

    boolean existsByVendorCode(String vendorCode);
}
