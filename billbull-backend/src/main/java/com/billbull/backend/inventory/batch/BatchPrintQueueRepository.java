package com.billbull.backend.inventory.batch;

import java.util.Collection;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface BatchPrintQueueRepository extends JpaRepository<BatchPrintQueue, Long> {

    boolean existsByBatch(BatchMaster batch);

    void deleteByBatchIn(Collection<BatchMaster> batches);
}
