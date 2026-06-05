package com.billbull.backend.settings.outlet;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OutletRepository extends JpaRepository<Outlet, Long> {

    List<Outlet> findByBranchIdAndIsActiveTrue(Long branchId);

    List<Outlet> findByIsActiveTrue();

    Optional<Outlet> findByCode(String code);

    boolean existsByCode(String code);
}
