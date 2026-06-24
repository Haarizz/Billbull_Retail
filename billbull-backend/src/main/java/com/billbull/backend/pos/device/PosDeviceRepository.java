package com.billbull.backend.pos.device;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface PosDeviceRepository extends JpaRepository<PosDevice, Long> {

    Optional<PosDevice> findByDeviceCode(String deviceCode);

    List<PosDevice> findByBranchIdAndStatus(Long branchId, PosDeviceStatus status);

    List<PosDevice> findAllByStatus(PosDeviceStatus status);

    boolean existsByDeviceCode(String deviceCode);
}
