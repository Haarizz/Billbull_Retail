package com.billbull.backend.inventory.batch;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

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
}
