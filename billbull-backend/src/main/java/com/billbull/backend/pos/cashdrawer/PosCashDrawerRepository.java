package com.billbull.backend.pos.cashdrawer;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PosCashDrawerRepository extends JpaRepository<PosCashDrawer, Long> {

    List<PosCashDrawer> findByBranchIdAndIsActiveTrueOrderByDeviceNameAsc(Long branchId);

    Optional<PosCashDrawer> findByIdAndIsActiveTrue(Long id);

    boolean existsByDeviceCode(String deviceCode);

    boolean existsByDeviceCodeAndIdNot(String deviceCode, Long id);

    Optional<PosCashDrawer> findByDeviceId(Long deviceId);
}
