package com.billbull.backend.purchase.grn;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface GrnRepository extends JpaRepository<GrnEntity, Long> {

        Optional<GrnEntity> findByGrnNo(String grnNo);

        // 🔢 For generating next number safely
        Optional<GrnEntity> findTopByGrnNoStartingWithOrderByGrnNoDesc(String prefix);

        /*
         * =========================================================
         * 🔒 AUTHORITATIVE GRN EXISTENCE CHECKS
         * =========================================================
         */

        // 🔑 Core check: GRN exists for a reference (LPO / DP)
        boolean existsByReferenceIdAndSourceTypeIn(
                        Long referenceId,
                        List<GrnSourceType> sourceTypes);

        // 🔍 Find GRNs by reference (for partial receiving calculation)
        List<GrnEntity> findByReferenceIdAndSourceTypeIn(
                        Long referenceId,
                        List<GrnSourceType> sourceTypes);

        /* ================= CONVENIENCE METHODS ================= */

        // LPO → SYSTEM_AUTO GRN
        default boolean existsForLpo(Long lpoId) {
                return existsByReferenceIdAndSourceTypeIn(
                                lpoId,
                                List.of(GrnSourceType.SYSTEM_AUTO));
        }

        // Direct Purchase → DIRECT_PURCHASE GRN
        default boolean existsForDirectPurchase(Long dpId) {
                return existsByReferenceIdAndSourceTypeIn(
                                dpId,
                                List.of(GrnSourceType.DIRECT_PURCHASE));
        }
}
