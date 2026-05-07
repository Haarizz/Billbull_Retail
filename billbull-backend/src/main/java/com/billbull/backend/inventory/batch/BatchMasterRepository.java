package com.billbull.backend.inventory.batch;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

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
}
