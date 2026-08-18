package com.billbull.backend.purchase.stockmovement;

import org.springframework.data.jpa.domain.Specification;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.purchase.stockmovement.StockMovement;

public class StockMovementSpecifications {

    public static Specification<StockMovement> withFilters(
            java.util.Collection<Long> branchScope,
            Long warehouseId,
            LocalDate dateFrom,
            LocalDate dateTo,
            java.util.Collection<Long> allowedProductIds) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (branchScope != null) {
                predicates.add(root.get("branchId").in(branchScope));
            }
            if (warehouseId != null) {
                predicates.add(cb.equal(root.get("warehouseId"), warehouseId));
            }
            if (dateFrom != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("movementDate"), dateFrom.atStartOfDay()));
            }
            if (dateTo != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("movementDate"), dateTo.atTime(LocalTime.MAX)));
            }
            if (allowedProductIds != null) {
                if (allowedProductIds.isEmpty()) {
                    predicates.add(cb.disjunction()); // always false if filters matched no products
                } else {
                    predicates.add(root.get("productId").in(allowedProductIds));
                }
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
