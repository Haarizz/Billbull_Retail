package com.billbull.backend.pos.settings;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface PosSettingsRepository extends JpaRepository<PosSettings, Long> {
    Optional<PosSettings> findByBranchId(Long branchId);
}
