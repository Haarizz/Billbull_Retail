package com.billbull.backend.pos.devicemanager;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PosHardwareProfileRepository extends JpaRepository<PosHardwareProfile, Long> {

    List<PosHardwareProfile> findByBranchIdOrderByProfileNameAsc(Long branchId);

    /** Global templates (branch_id IS NULL) plus a specific branch's own profiles. */
    List<PosHardwareProfile> findByBranchIdIsNullOrBranchIdOrderByProfileNameAsc(Long branchId);

    Optional<PosHardwareProfile> findByIdAndIsActiveTrue(Long id);
}
