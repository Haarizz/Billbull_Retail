package com.billbull.backend.pos.scanner;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PosScannerRepository extends JpaRepository<PosScanner, Long> {

    List<PosScanner> findByBranchIdAndIsActiveTrueOrderByDeviceNameAsc(Long branchId);

    Optional<PosScanner> findByIdAndIsActiveTrue(Long id);

    boolean existsByDeviceCode(String deviceCode);

    boolean existsByDeviceCodeAndIdNot(String deviceCode, Long id);

    Optional<PosScanner> findByDeviceId(Long deviceId);
}
