package com.billbull.backend.inventory.batch;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.Bin;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.sales.delivery.DeliveryNote;
import com.billbull.backend.sales.delivery.DeliveryNoteItem;
import com.billbull.backend.security.RolePermissionService;

@ExtendWith(MockitoExtension.class)
class BatchSelectionServiceTest {

    @Mock private BatchMasterRepository batchRepository;
    @Mock private BatchAllocationRepository allocationRepository;
    @Mock private ProductRepository productRepository;
    @Mock private BinRepository binRepository;
    @Mock private RolePermissionService permissionService;

    private BatchSelectionService service;

    @BeforeEach
    void setUp() {
        service = new BatchSelectionService(
                batchRepository,
                allocationRepository,
                productRepository,
                binRepository,
                permissionService);

        lenient().when(productRepository.findByCodeAndIsActiveTrue("ITEM-1"))
                .thenReturn(Optional.of(product()));
        lenient().when(binRepository.findAllByCode("BIN-A"))
                .thenReturn(List.of(bin()));
        lenient().when(binRepository.findByIdEager(7L))
                .thenReturn(Optional.of(bin()));
        lenient().when(allocationRepository.saveAll(any())).thenAnswer(invocation -> toList(invocation.getArgument(0)));
    }

    @Test
    void fefoOptionsExcludeBelowMinimumShelfLifeAndReportShortage() {
        Product product = product();
        product.setMinExpiryDaysForSale(10);
        when(productRepository.findByCodeAndIsActiveTrue("ITEM-1")).thenReturn(Optional.of(product));

        BatchMaster nearExpiry = batch(1L, "B-NEAR", LocalDate.now().plusDays(5), 1);
        BatchMaster eligible = batch(2L, "B-OK", LocalDate.now().plusDays(20), 2);
        when(batchRepository.findAvailableForSelection("ITEM-1", 7L))
                .thenReturn(List.of(nearExpiry, eligible));

        BatchSelectionOptionsResponse response = service.getSelectionOptions("ITEM-1", "BIN-A", 2);

        assertEquals(2, response.availableBatches.size());
        assertEquals(1, response.fefoSelection.size());
        assertEquals("B-OK", response.fefoSelection.get(0).batchNumber);
        assertEquals(1, response.shortageQuantity);
        assertTrue(response.availableBatches.get(0).blockedReason.contains("minimum shelf life"));
    }

    @Test
    void manualSelectionFailsWithoutPermission() {
        when(permissionService.currentUserCanEdit(BatchSelectionService.MANUAL_PERMISSION)).thenReturn(false);

        BatchSelectionRequest request = new BatchSelectionRequest();
        request.mode = BatchAllocationMethod.MANUAL;
        request.locationCode = "BIN-A";
        request.requiredQuantity = 1;
        request.batchMasterIds = List.of(10L);

        assertThrows(ResponseStatusException.class,
                () -> service.saveDeliveryLineSelection(deliveryNote(), deliveryItem(), request, 1));
    }

    @Test
    void manualSelectionReleasesOldReservationsAndCreatesNewRows() {
        when(permissionService.currentUserCanEdit(BatchSelectionService.MANUAL_PERMISSION)).thenReturn(true);

        BatchMaster oldBatch = batch(5L, "B-OLD", LocalDate.now().plusDays(40), 5);
        oldBatch.setStatus(BatchStatus.RESERVED);
        BatchAllocation oldAllocation = new BatchAllocation();
        oldAllocation.setBatchMaster(oldBatch);
        oldAllocation.setStatus(BatchAllocationStatus.RESERVED);

        BatchMaster first = batch(10L, "B-10", LocalDate.now().plusDays(15), 1);
        BatchMaster second = batch(11L, "B-11", LocalDate.now().plusDays(16), 2);

        when(allocationRepository.findBySourceDocumentTypeAndSourceDocumentIdAndSourceLineIdAndStatus(
                BatchSelectionService.DOC_TYPE_DELIVERY_NOTE, 50L, 60L, BatchAllocationStatus.RESERVED))
                .thenReturn(List.of(oldAllocation));
        when(batchRepository.findByIdInForUpdate(List.of(10L, 11L))).thenReturn(List.of(first, second));

        BatchSelectionRequest request = new BatchSelectionRequest();
        request.mode = BatchAllocationMethod.MANUAL;
        request.locationCode = "BIN-A";
        request.requiredQuantity = 2;
        request.batchMasterIds = List.of(10L, 11L);

        service.saveDeliveryLineSelection(deliveryNote(), deliveryItem(), request, 2);

        assertEquals(BatchAllocationStatus.RELEASED, oldAllocation.getStatus());
        assertEquals(BatchStatus.AVAILABLE, oldBatch.getStatus());
        assertEquals(BatchStatus.RESERVED, first.getStatus());
        assertEquals(BatchStatus.RESERVED, second.getStatus());

        @SuppressWarnings({ "unchecked", "rawtypes" })
        ArgumentCaptor<Iterable<BatchAllocation>> captor = (ArgumentCaptor) ArgumentCaptor.forClass(Iterable.class);
        verify(allocationRepository, times(2)).saveAll(captor.capture());
        List<BatchAllocation> saved = toList(captor.getAllValues().get(1));
        assertEquals(2, saved.size());
        saved.forEach(allocation -> assertEquals(BatchAllocationMethod.MANUAL, allocation.getAllocationMethod()));
    }

    private Product product() {
        Product product = new Product();
        product.setId(10L);
        product.setCode("ITEM-1");
        product.setName("Tracked Item");
        product.setBatch(true);
        product.setExpiryEnabled(true);
        product.setFefoEnabled(true);
        product.setMinExpiryDaysForSale(0);
        return product;
    }

    private Bin bin() {
        Bin bin = new Bin();
        bin.setId(7L);
        bin.setCode("BIN-A");
        bin.setName("Bin A");
        return bin;
    }

    private BatchMaster batch(Long id, String batchNumber, LocalDate expiryDate, int unitNo) {
        BatchMaster batch = new BatchMaster();
        batch.setId(id);
        batch.setBatchNumber(batchNumber);
        batch.setProductId(10L);
        batch.setProductCode("ITEM-1");
        batch.setBinId(7L);
        batch.setQuantity(1);
        batch.setExpiryDate(expiryDate);
        batch.setEntryDate(LocalDate.now().minusDays(unitNo));
        batch.setUnitIndex(unitNo);
        batch.setQtyUnitNo(unitNo);
        batch.setStatus(BatchStatus.AVAILABLE);
        return batch;
    }

    private DeliveryNote deliveryNote() {
        DeliveryNote note = new DeliveryNote();
        note.setId(50L);
        note.setDnNumber("DN-1");
        return note;
    }

    private DeliveryNoteItem deliveryItem() {
        DeliveryNoteItem item = new DeliveryNoteItem();
        item.setId(60L);
        item.setItemCode("ITEM-1");
        item.setProduct(product());
        item.setBinId(7L);
        return item;
    }

    private static <T> List<T> toList(Object value) {
        if (value instanceof Collection<?> collection) {
            @SuppressWarnings("unchecked")
            List<T> list = collection.stream().map(item -> (T) item).toList();
            return list;
        }
        @SuppressWarnings("unchecked")
        Iterable<T> iterable = (Iterable<T>) value;
        java.util.ArrayList<T> list = new java.util.ArrayList<>();
        iterable.forEach(list::add);
        return list;
    }
}
