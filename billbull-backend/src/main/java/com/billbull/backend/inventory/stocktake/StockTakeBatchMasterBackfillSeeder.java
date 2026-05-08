package com.billbull.backend.inventory.stocktake;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.batch.BatchMaster;
import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.inventory.batch.BatchStatus;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;

@Component
public class StockTakeBatchMasterBackfillSeeder {

    private static final Logger log = LoggerFactory.getLogger(StockTakeBatchMasterBackfillSeeder.class);

    private final StockTakeItemBatchRepository itemBatchRepo;
    private final BatchMasterRepository batchMasterRepo;
    private final StockMovementRepository stockMovementRepo;

    public StockTakeBatchMasterBackfillSeeder(
            StockTakeItemBatchRepository itemBatchRepo,
            BatchMasterRepository batchMasterRepo,
            StockMovementRepository stockMovementRepo) {
        this.itemBatchRepo = itemBatchRepo;
        this.batchMasterRepo = batchMasterRepo;
        this.stockMovementRepo = stockMovementRepo;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void backfill() {
        int reapedAll = reapPhantomAvailableBatches();
        List<StockTakeItemBatch> rows = itemBatchRepo.findAll();
        int created = 0;
        int reaped = 0;
        for (StockTakeItemBatch row : rows) {
            String batchNumber = row.getBatchNumber();
            if (batchNumber == null || batchNumber.isBlank()) continue;

            StockTakeItem item = row.getItem();
            if (item == null) continue;
            StockTakeSession session = item.getSession();
            if (session == null || session.getStatus() != StockTakeSession.StockTakeStatus.COMPLETED) continue;
            if (item.getBinId() == null) continue;
            if (row.getId() == null) continue;

            BigDecimal onHand = stockMovementRepo.getOnHandForBatchNumber(
                    item.getProductId(), item.getBinId(), batchNumber);
            boolean stillOnHand = onHand != null && onHand.signum() > 0;

            int unitIndex = row.getId().intValue();
            boolean exists = batchMasterRepo.existsBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdAndUnitIndex(
                    "STOCK_TAKE", session.getId(), item.getId(), unitIndex);

            if (!stillOnHand) {
                if (exists) {
                    batchMasterRepo
                            .findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdOrderByUnitIndexAsc(
                                    "STOCK_TAKE", session.getId(), item.getId())
                            .stream()
                            .filter(m -> m.getUnitIndex() != null && m.getUnitIndex() == unitIndex)
                            .filter(m -> m.getStatus() == BatchStatus.AVAILABLE)
                            .forEach(m -> {
                                m.setStatus(BatchStatus.CONSUMED);
                                batchMasterRepo.save(m);
                            });
                    reaped++;
                }
                continue;
            }

            if (exists) continue;

            LocalDate generatedDate = session.getReconciledAt() != null
                    ? session.getReconciledAt().toLocalDate()
                    : LocalDate.now();

            BatchMaster master = new BatchMaster();
            master.setBatchNumber(batchNumber);
            master.setSourceType(session.getType() == StockTakeSession.StockTakeType.OPENING_INVENTORY ? "OS" : "ST");
            master.setSourceRefNo(session.getSessionId() != null ? session.getSessionId() : String.valueOf(session.getId()));
            master.setSourceDocumentType("STOCK_TAKE");
            master.setSourceDocumentId(session.getId());
            master.setSourceLineId(item.getId());
            master.setProductId(item.getProductId());
            master.setProductCode(item.getSku());
            master.setProductName(item.getProductName());
            master.setWarehouseId(session.getWarehouseId());
            master.setZoneId(item.getZoneId());
            master.setLocatorId(item.getLocatorId());
            master.setBinId(item.getBinId());
            master.setUnitIndex(unitIndex);
            master.setQuantity(1);
            master.setGeneratedDate(generatedDate);
            master.setEntryDate(generatedDate);
            master.setExpiryDate(row.getExpiryDate());
            master.setStatus(BatchStatus.AVAILABLE);
            batchMasterRepo.save(master);
            created++;
        }
        if (created > 0 || reaped > 0 || reapedAll > 0) {
            log.info("Stock-take BatchMaster sync: created={}, stocktake-consumed={}, phantom-consumed={}",
                    created, reaped, reapedAll);
        }
    }

    private int reapPhantomAvailableBatches() {
        int count = 0;
        for (BatchMaster m : batchMasterRepo.findAll()) {
            if (m.getStatus() != BatchStatus.AVAILABLE) continue;
            if (m.getBatchNumber() == null || m.getBinId() == null || m.getProductId() == null) continue;

            BigDecimal onHand = stockMovementRepo.getOnHandForBatchNumber(
                    m.getProductId(), m.getBinId(), m.getBatchNumber());
            if (onHand == null || onHand.signum() <= 0) {
                m.setStatus(BatchStatus.CONSUMED);
                batchMasterRepo.save(m);
                count++;
            }
        }
        return count;
    }
}
