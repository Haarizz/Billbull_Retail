package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.sales.customerledger.Customer;

/** Read queries behind the Price Levels workspace. */
public interface PricingWorkspaceRepository extends Repository<Product, Long> {

    /**
     * Active products for the price matrix. {@code filter}:
     * <ul>
     *   <li>{@code ALL} — every product;</li>
     *   <li>{@code PRICED} / {@code UNPRICED} — with / without any price-level price;</li>
     *   <li>{@code LOW_MARGIN} — known cost and a retail or active level price whose gross margin is
     *       below {@code threshold} % (global pricing; branch overrides are not considered here).</li>
     * </ul>
     * {@code productIds} narrows to a list when {@code useIds} is true.
     */
    String PRODUCT_WHERE = " WHERE p.isActive = true"
            + " AND (:allBranches = true OR p.branch IS NULL OR p.branch.id IN :branchIds)"
            + " AND (:useIds = false OR p.id IN :productIds)"
            + " AND (:pattern = '%' OR LOWER(p.name) LIKE :pattern OR LOWER(p.code) LIKE :pattern"
            + "      OR LOWER(p.sku) LIKE :pattern"
            + "      OR EXISTS (SELECT 1 FROM ProductBarcode pb WHERE pb.product = p AND LOWER(pb.barcode) LIKE :pattern))"
            + " AND (:departmentId IS NULL OR p.department.id = :departmentId)"
            + " AND (:brandId IS NULL OR p.brand.id = :brandId)"
            + " AND (:filter <> 'PRICED' OR EXISTS (SELECT 1 FROM ProductLevelPrice lp"
            + "      WHERE lp.productId = p.id AND lp.isActive = true))"
            + " AND (:filter <> 'UNPRICED' OR NOT EXISTS (SELECT 1 FROM ProductLevelPrice lp"
            + "      WHERE lp.productId = p.id AND lp.isActive = true))"
            + " AND (:filter <> 'LOW_MARGIN' OR EXISTS (SELECT 1 FROM ProductPricing pp WHERE pp.product = p"
            + "      AND pp.cost > 0 AND ("
            + "        (pp.retailPrice > 0 AND (pp.retailPrice - pp.cost) * 100 < :threshold * pp.retailPrice)"
            + "        OR EXISTS (SELECT 1 FROM ProductLevelPrice lp2, PriceLevel l WHERE lp2.productId = p.id"
            + "          AND l.id = lp2.priceLevelId AND l.isActive = true AND lp2.isActive = true"
            + "          AND (lp2.price - pp.cost) * 100 < :threshold * lp2.price))))";

    @Query(value = "SELECT p FROM Product p" + PRODUCT_WHERE,
            countQuery = "SELECT COUNT(p) FROM Product p" + PRODUCT_WHERE)
    Page<Product> products(@Param("allBranches") boolean allBranches,
                           @Param("branchIds") Collection<Long> branchIds,
                           @Param("useIds") boolean useIds,
                           @Param("productIds") Collection<Long> productIds,
                           @Param("pattern") String pattern,
                           @Param("departmentId") Long departmentId,
                           @Param("brandId") Long brandId,
                           @Param("filter") String filter,
                           @Param("threshold") BigDecimal threshold,
                           Pageable pageable);

    /** Customers per default price level: rows of [priceLevelId, count]. */
    @Query("SELECT c.priceLevelId, COUNT(c) FROM Customer c WHERE c.priceLevelId IS NOT NULL GROUP BY c.priceLevelId")
    List<Object[]> customerCountsByLevel();

    /** Customers on a level (or, with levelId -1, every customer), matching code / name / mobile / group. */
    @Query(value = "SELECT c FROM Customer c WHERE (:levelId = -1L OR c.priceLevelId = :levelId)"
            + " AND (:pattern = '%' OR LOWER(c.name) LIKE :pattern OR LOWER(c.code) LIKE :pattern"
            + "      OR LOWER(c.mobile) LIKE :pattern)"
            + " AND (:customerGroup = '' OR LOWER(c.groupType) = :customerGroup)",
            countQuery = "SELECT COUNT(c) FROM Customer c WHERE (:levelId = -1L OR c.priceLevelId = :levelId)"
            + " AND (:pattern = '%' OR LOWER(c.name) LIKE :pattern OR LOWER(c.code) LIKE :pattern"
            + "      OR LOWER(c.mobile) LIKE :pattern)"
            + " AND (:customerGroup = '' OR LOWER(c.groupType) = :customerGroup)")
    Page<Customer> customers(@Param("levelId") long levelId,
                             @Param("pattern") String pattern,
                             @Param("customerGroup") String customerGroup,
                             Pageable pageable);

    @Query("SELECT c FROM Customer c WHERE c.id IN :ids")
    List<Customer> customersByIds(@Param("ids") Collection<Long> ids);

    @Query("SELECT c FROM Customer c WHERE LOWER(c.groupType) = :customerGroup")
    List<Customer> customersInGroup(@Param("customerGroup") String customerGroup);

    @Query("SELECT DISTINCT c.groupType FROM Customer c WHERE c.groupType IS NOT NULL AND c.groupType <> '' ORDER BY c.groupType")
    List<String> customerGroups();
}
