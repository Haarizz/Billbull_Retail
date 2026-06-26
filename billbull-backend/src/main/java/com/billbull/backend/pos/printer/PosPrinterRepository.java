package com.billbull.backend.pos.printer;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PosPrinterRepository extends JpaRepository<PosPrinter, Long> {

    List<PosPrinter> findByBranchIdAndIsActiveTrueOrderByDeviceTypeAscDeviceNameAsc(Long branchId);

    Optional<PosPrinter> findByIdAndIsActiveTrue(Long id);

    boolean existsByDeviceCode(String deviceCode);

    boolean existsByDeviceCodeAndIdNot(String deviceCode, Long id);
}
