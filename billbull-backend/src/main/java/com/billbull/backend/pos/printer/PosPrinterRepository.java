package com.billbull.backend.pos.printer;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PosPrinterRepository extends JpaRepository<PosPrinter, Long> {

    List<PosPrinter> findByBranchIdAndIsActiveTrueOrderByDeviceTypeAscDeviceNameAsc(Long branchId);

    Optional<PosPrinter> findByIdAndIsActiveTrue(Long id);

    boolean existsByDeviceCode(String deviceCode);

    boolean existsByDeviceCodeAndIdNot(String deviceCode, Long id);

    /** Legacy rows predating the Device Manager (Phase A) that haven't been linked to a
     *  pos_devices parent row yet. Deliberately not filtered by isActive — decommissioned
     *  printers should still get a parent record for historical/event-log continuity. */
    List<PosPrinter> findByDeviceIdIsNull();

    /** Reverse lookup from the shared Device Manager parent row back to its printer-specific
     *  row — used by HardwareProfileAssignmentEngine to materialize a profile assignment onto
     *  the printer's existing terminalId/branchId/counterName fields (Phase D §"runtime refresh"). */
    Optional<PosPrinter> findByDeviceId(Long deviceId);
}
