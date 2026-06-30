package com.billbull.backend.pos.devicemanager;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PosDeviceEventLogRepository extends JpaRepository<PosDeviceEventLog, Long> {

    List<PosDeviceEventLog> findTop50ByDeviceIdOrderByCreatedAtDesc(Long deviceId);

    /** Phase F dashboard — recent events across every device in a branch, not just one. */
    List<PosDeviceEventLog> findTop20ByBranchIdOrderByCreatedAtDesc(Long branchId);
}
