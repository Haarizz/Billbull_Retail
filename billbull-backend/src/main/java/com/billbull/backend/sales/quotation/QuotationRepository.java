package com.billbull.backend.sales.quotation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.math.BigDecimal;
import java.util.List;

@Repository
public interface QuotationRepository extends JpaRepository<Quotation, Long> {
  List<Quotation> findByStatus(QuotationStatus status);

  Quotation findTopByOrderByQtnNoDesc();

  boolean existsByQtnNo(String qtnNo);

  boolean existsByCustomerContaining(String customerVal);

  @Query("""
          SELECT COALESCE(SUM(qi.quantity), 0)
          FROM Quotation q JOIN q.items qi
          WHERE qi.itemCode = :productCode
            AND q.status = 'APPROVED'
            AND (q.validTill IS NULL OR q.validTill >= CURRENT_DATE)
      """)
  BigDecimal sumReservedQuantity(@Param("productCode") String productCode);

  @Query("""
          SELECT qi.itemCode, COALESCE(SUM(qi.quantity), 0)
          FROM Quotation q JOIN q.items qi
          WHERE qi.itemCode IN :productCodes
            AND q.status = 'APPROVED'
            AND (q.validTill IS NULL OR q.validTill >= CURRENT_DATE)
          GROUP BY qi.itemCode
      """)
  List<Object[]> sumReservedQuantityForProducts(@Param("productCodes") List<String> productCodes);

  @Modifying
  @Query("UPDATE Quotation q SET q.status = :status WHERE q.qtnNo = :qtnNo")
  void updateStatusByQtnNo(@Param("qtnNo") String qtnNo, @Param("status") QuotationStatus status);

  java.util.Optional<Quotation> findByQtnNo(@Param("qtnNo") String qtnNo);

  @Query("SELECT q FROM Quotation q JOIN q.items i WHERE i.itemCode = :itemCode ORDER BY q.id DESC")
  List<Quotation> findTopByItemCodeOrderByIdDesc(@Param("itemCode") String itemCode,
      org.springframework.data.domain.Pageable pageable);

  // For Expiry Scheduler: Find approved quotations that are not CONVERTED and are
  // past their validTill date
  @Query("SELECT q FROM Quotation q WHERE q.status = 'APPROVED' AND q.validTill < CURRENT_DATE")
  List<Quotation> findExpiredQuotations();

}
