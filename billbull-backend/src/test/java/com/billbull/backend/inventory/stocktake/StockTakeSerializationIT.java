package com.billbull.backend.inventory.stocktake;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * ARCHFIX §1.6/§1.9 — proves that after flipping StockTakeSession.items and StockTakeItem.batches
 * to LAZY, a session returned by the service can still be JSON-serialized OUTSIDE the transaction
 * (open-in-view=false) without a LazyInitializationException — including the @Transient
 * getLotGroups() projection, which iterates batches during serialization.
 *
 * Deliberately bypasses the HTTP/RBAC layer (orthogonal to the lazy-loading concern) and reproduces
 * exactly what Jackson does when the controller returns the entity. Not @Transactional: the seed is
 * committed so the subsequent service read + serialization happen in a separate session, which is
 * the real LazyInit scenario.
 */
@SpringBootTest
class StockTakeSerializationIT {

    @Autowired private StockTakeService service;
    @Autowired private StockTakeSessionRepository sessionRepo;
    @Autowired private StockTakeItemRepository itemRepo;
    @Autowired private StockTakeItemBatchRepository batchRepo;
    @Autowired private ObjectMapper objectMapper;

    @Test
    void serializesSessionWithLazyBatchesAndLotGroups() throws Exception {
        Long sessionPk = null;
        try {
            // --- seed (committed) ---
            StockTakeSession session = new StockTakeSession();
            session.setSessionId("ST-IT-" + System.nanoTime());
            session.setStatus(StockTakeSession.StockTakeStatus.IN_PROGRESS);
            session.setActive(true);
            session.setWarehouseId(1L);
            session = sessionRepo.save(session);
            sessionPk = session.getId();

            StockTakeItem item = new StockTakeItem();
            item.setSession(session);
            item.setProductId(77L);
            item.setProductName("Batch Product");
            item.setSku("SKU-77");
            item.setBatchEnabled(true);
            item.setStatus(StockTakeItem.ItemStatus.MATCHED);
            item = itemRepo.save(item);

            StockTakeItemBatch b1 = new StockTakeItemBatch();
            b1.setItem(item);
            b1.setBatchNumber("ST-IT-L01-SKU77-1");
            b1.setQuantity(1);
            StockTakeItemBatch b2 = new StockTakeItemBatch();
            b2.setItem(item);
            b2.setBatchNumber("ST-IT-L01-SKU77-2");
            b2.setQuantity(1);
            batchRepo.saveAll(java.util.List.of(b1, b2));

            // --- read via service, then serialize OUTSIDE the txn (what the controller + Jackson do) ---
            StockTakeSession loaded = service.getSession(session.getSessionId());
            String json = objectMapper.writeValueAsString(loaded);

            assertTrue(json.contains("\"items\""), "items serialized");
            assertTrue(json.contains("\"batches\""), "batches serialized");
            assertTrue(json.contains("\"lotGroups\""), "@Transient lotGroups serialized (iterates batches)");
            assertTrue(json.contains("SKU77"), "batch data present");
        } finally {
            if (sessionPk != null) {
                // cascade-deletes items + batches
                Long pk = sessionPk;
                sessionRepo.findById(pk).ifPresent(sessionRepo::delete);
            }
        }
    }
}
