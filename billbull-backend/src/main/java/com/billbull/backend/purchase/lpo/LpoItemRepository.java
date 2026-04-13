package com.billbull.backend.purchase.lpo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface LpoItemRepository extends JpaRepository<LpoItem, Long> {

    @Query("SELECT li FROM LpoItem li " +
            "JOIN FETCH li.lpo l " +
            "WHERE li.product.id = :productId " +
            "AND l.status IN :statuses")
    List<LpoItem> findIncomingByProductIdAndStatusIn(@Param("productId") Long productId,
            @Param("statuses") List<LpoStatus> statuses);

}
