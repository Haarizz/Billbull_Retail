package com.billbull.backend.pos.admin;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CorrectionOverlayRepository extends JpaRepository<CorrectionOverlay, Long> {

    @Query("SELECT o FROM CorrectionOverlay o WHERE o.targetType = :targetType AND o.targetId = :targetId AND o.status = 'APPLIED' ORDER BY o.version DESC")
    List<CorrectionOverlay> findAppliedForTargetOrderByVersionDesc(@org.springframework.data.repository.query.Param("targetType") CorrectionTargetType targetType, @org.springframework.data.repository.query.Param("targetId") Long targetId);

    @Query("SELECT o FROM CorrectionOverlay o WHERE o.targetType = :targetType AND o.targetId IN :targetIds AND o.status = 'APPLIED' ORDER BY o.targetId ASC, o.version DESC")
    List<CorrectionOverlay> findAppliedForTargetsOrderByVersionDesc(@org.springframework.data.repository.query.Param("targetType") CorrectionTargetType targetType, @org.springframework.data.repository.query.Param("targetIds") java.util.Collection<Long> targetIds);
}
