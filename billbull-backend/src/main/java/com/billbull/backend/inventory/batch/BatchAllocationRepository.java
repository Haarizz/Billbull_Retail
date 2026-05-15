package com.billbull.backend.inventory.batch;

import java.util.Collection;
import java.util.List;
import java.math.BigDecimal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

@Repository
public interface BatchAllocationRepository extends JpaRepository<BatchAllocation, Long> {

    List<BatchAllocation> findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineId(
            String sourceDocumentType,
            Long sourceDocumentId,
            Long sourceLineId);

    List<BatchAllocation> findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdAndStatus(
            String sourceDocumentType,
            Long sourceDocumentId,
            Long sourceLineId,
            BatchAllocationStatus status);

    List<BatchAllocation> findBySourceDocumentTypeAndSourceDocumentIdAndStatus(
            String sourceDocumentType,
            Long sourceDocumentId,
            BatchAllocationStatus status);

    List<BatchAllocation> findBySourceDocumentTypeAndSourceDocumentIdAndStatusIn(
            String sourceDocumentType,
            Long sourceDocumentId,
            Collection<BatchAllocationStatus> statuses);

    List<BatchAllocation> findByBatchMaster_IdAndStatus(Long batchMasterId, BatchAllocationStatus status);

    List<BatchAllocation> findByParentAllocationIdAndStatus(Long parentAllocationId, BatchAllocationStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM BatchAllocation a JOIN FETCH a.batchMaster WHERE a.id = :id")
    java.util.Optional<BatchAllocation> findByIdForUpdate(@Param("id") Long id);

    List<BatchAllocation> findBySourceDocumentTypeAndSourceLineIdAndStatus(
            String sourceDocumentType,
            Long sourceLineId,
            BatchAllocationStatus status);

    List<BatchAllocation> findBySourceDocumentTypeAndSourceLineIdAndStatusIn(
            String sourceDocumentType,
            Long sourceLineId,
            Collection<BatchAllocationStatus> statuses);

    List<BatchAllocation> findByDepletedByDocumentTypeAndDepletedByDocumentIdAndStatus(
            String depletedByDocumentType,
            Long depletedByDocumentId,
            BatchAllocationStatus status);

    List<BatchAllocation> findByDepletedByDocumentTypeAndDepletedByDocumentIdAndDepletedByLineIdAndStatus(
            String depletedByDocumentType,
            Long depletedByDocumentId,
            Long depletedByLineId,
            BatchAllocationStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT a
            FROM BatchAllocation a
            JOIN FETCH a.batchMaster b
            WHERE b.id IN :batchIds
              AND a.status IN :statuses
            """)
    List<BatchAllocation> findActiveByBatchIdsForUpdate(
            @Param("batchIds") Collection<Long> batchIds,
            @Param("statuses") Collection<BatchAllocationStatus> statuses);

    @Query("""
            SELECT COALESCE(SUM(a.quantity), 0)
            FROM BatchAllocation a
            JOIN a.batchMaster b
            WHERE a.productId = :productId
              AND b.warehouseId = :warehouseId
              AND a.status = com.billbull.backend.inventory.batch.BatchAllocationStatus.RESERVED
            """)
    BigDecimal sumReservedByProductAndWarehouse(
            @Param("productId") Long productId,
            @Param("warehouseId") Long warehouseId);

    @Query("""
            SELECT COALESCE(SUM(a.quantity), 0)
            FROM BatchAllocation a
            WHERE a.productId = :productId
              AND a.binId = :binId
              AND a.status = com.billbull.backend.inventory.batch.BatchAllocationStatus.RESERVED
            """)
    BigDecimal sumReservedByProductAndBin(
            @Param("productId") Long productId,
            @Param("binId") Long binId);
}
