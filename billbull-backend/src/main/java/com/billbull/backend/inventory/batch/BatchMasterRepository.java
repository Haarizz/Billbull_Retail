package com.billbull.backend.inventory.batch;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

@Repository
public interface BatchMasterRepository extends JpaRepository<BatchMaster, Long> {

    boolean existsByBatchNumber(String batchNumber);

    boolean existsBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdAndUnitIndex(
            String sourceDocumentType,
            Long sourceDocumentId,
            Long sourceLineId,
            Integer unitIndex);

    List<BatchMaster> findBySourceDocumentTypeAndSourceDocumentId(
            String sourceDocumentType,
            Long sourceDocumentId);

    List<BatchMaster> findBySourceDocumentTypeAndSourceDocumentIdAndPrintedFalse(
            String sourceDocumentType,
            Long sourceDocumentId);

    List<BatchMaster> findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdOrderByUnitIndexAsc(
            String sourceDocumentType,
            Long sourceDocumentId,
            Long sourceLineId);

    List<BatchMaster> findBySourceTypeAndProductCodeAndGeneratedDate(
            String sourceType,
            String productCode,
            LocalDate generatedDate);

    List<BatchMaster> findByIdIn(Collection<Long> ids);

    @Query("""
            SELECT b
            FROM BatchMaster b
            WHERE b.productCode = :productCode
              AND b.binId = :binId
              AND b.status = com.billbull.backend.inventory.batch.BatchStatus.AVAILABLE
            ORDER BY
              CASE WHEN b.expiryDate IS NULL THEN 1 ELSE 0 END,
              b.expiryDate ASC,
              CASE WHEN b.entryDate IS NULL THEN 1 ELSE 0 END,
              b.entryDate ASC,
              b.qtyUnitNo ASC
            """)
    List<BatchMaster> findAvailableForSelection(
            @Param("productCode") String productCode,
            @Param("binId") Long binId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT b
            FROM BatchMaster b
            WHERE b.id IN :ids
            """)
    List<BatchMaster> findByIdInForUpdate(@Param("ids") Collection<Long> ids);
}
