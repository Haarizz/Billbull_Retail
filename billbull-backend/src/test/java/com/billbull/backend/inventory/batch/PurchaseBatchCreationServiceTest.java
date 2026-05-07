package com.billbull.backend.inventory.batch;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.settings.InventorySettings;
import com.billbull.backend.inventory.settings.InventorySettingsService;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.purchase.grn.GrnEntity;
import com.billbull.backend.purchase.grn.GrnItemEntity;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceItem;

@ExtendWith(MockitoExtension.class)
class PurchaseBatchCreationServiceTest {

    @Mock private BatchMasterRepository batchRepository;
    @Mock private BatchPrintQueueRepository printQueueRepository;
    @Mock private InventorySettingsService inventorySettingsService;
    @Mock private com.billbull.backend.inventory.product.ProductRepository productRepository;
    @Mock private ProductPackingRepository packingRepository;

    private PurchaseBatchCreationService service;

    @BeforeEach
    void setUp() {
        service = new PurchaseBatchCreationService(
                batchRepository,
                printQueueRepository,
                inventorySettingsService,
                productRepository,
                packingRepository);

        lenient().when(batchRepository.findBySourceDocumentTypeAndSourceDocumentIdAndPrintedFalse(anyString(), any(Long.class)))
                .thenReturn(List.of());
        lenient().when(batchRepository.findBySourceTypeAndProductCodeAndGeneratedDate(anyString(), anyString(), any(LocalDate.class)))
                .thenReturn(List.of());
        lenient().when(batchRepository.saveAll(any())).thenAnswer(invocation -> toList(invocation.getArgument(0)));
        lenient().when(inventorySettingsService.getSettings()).thenReturn(settings(false));
    }

    @Test
    void purchaseInvoiceBatchEnabledLineCreatesOnePuBatchPerUnit() {
        Product product = product(10L, true);
        when(productRepository.findByCodeAndIsActiveTrue("CODE-10")).thenReturn(Optional.of(product));

        PurchaseInvoice invoice = invoice("PINV-1");
        invoice.getItems().add(invoiceItem(100L, "CODE-10", 3));

        List<BatchMaster> batches = service.replaceForPurchaseInvoice(invoice);

        assertEquals(3, batches.size());
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("ddMMyy"));
        for (int i = 0; i < batches.size(); i++) {
            BatchMaster batch = batches.get(i);
            assertEquals("PU", batch.getSourceType());
            assertEquals("PINV-1", batch.getSourceRefNo());
            assertEquals(PurchaseBatchCreationService.DOC_TYPE_PURCHASE_INVOICE, batch.getSourceDocumentType());
            assertEquals(1, batch.getQuantity());
            assertEquals(i + 1, batch.getUnitIndex());
            assertEquals("PU-" + today + "-L01-CODE10-" + (i + 1), batch.getBatchNumber());
        }
    }

    @Test
    void nonBatchInvoiceItemsAreIgnored() {
        Product product = product(10L, false);
        when(productRepository.findByCodeAndIsActiveTrue("CODE-10")).thenReturn(Optional.of(product));

        PurchaseInvoice invoice = invoice("PINV-2");
        invoice.getItems().add(invoiceItem(101L, "CODE-10", 5));

        List<BatchMaster> batches = service.replaceForPurchaseInvoice(invoice);

        assertTrue(batches.isEmpty());
        verify(batchRepository, never()).saveAll(any());
    }

    @Test
    void againstGrnInvoiceDoesNotCreatePurchaseBatches() {
        PurchaseInvoice invoice = invoice("PINV-3");
        invoice.setSourceType("AGAINST_GRN");
        invoice.setGrnId(50L);
        invoice.getItems().add(invoiceItem(102L, "CODE-10", 2));

        List<BatchMaster> batches = service.replaceForPurchaseInvoice(invoice);

        assertTrue(batches.isEmpty());
        verify(batchRepository, never()).saveAll(any());
    }

    @Test
    void invoiceRegenerationRemovesExistingUnprintedRowsBeforeInsert() {
        Product product = product(10L, true);
        when(productRepository.findByCodeAndIsActiveTrue("CODE-10")).thenReturn(Optional.of(product));

        BatchMaster existing = new BatchMaster();
        existing.setId(1L);
        existing.setBatchNumber("PU-OLD");
        when(batchRepository.findBySourceDocumentTypeAndSourceDocumentIdAndPrintedFalse(
                PurchaseBatchCreationService.DOC_TYPE_PURCHASE_INVOICE, 1L))
                .thenReturn(List.of(existing));

        PurchaseInvoice invoice = invoice("PINV-4");
        invoice.getItems().add(invoiceItem(103L, "CODE-10", 1));

        service.replaceForPurchaseInvoice(invoice);

        verify(printQueueRepository).deleteByBatchIn(List.of(existing));
        verify(batchRepository).deleteAll(List.of(existing));
    }

    @Test
    void printQueueRowsAreCreatedWhenInventorySettingIsEnabled() {
        Product product = product(10L, true);
        when(productRepository.findByCodeAndIsActiveTrue("CODE-10")).thenReturn(Optional.of(product));
        when(inventorySettingsService.getSettings()).thenReturn(settings(true));

        PurchaseInvoice invoice = invoice("PINV-5");
        invoice.getItems().add(invoiceItem(104L, "CODE-10", 2));

        service.replaceForPurchaseInvoice(invoice);

        @SuppressWarnings({ "unchecked", "rawtypes" })
        ArgumentCaptor<Iterable<BatchPrintQueue>> captor = (ArgumentCaptor) ArgumentCaptor.forClass(Iterable.class);
        verify(printQueueRepository).saveAll(captor.capture());
        List<BatchPrintQueue> rows = toList(captor.getValue());
        assertEquals(2, rows.size());
        rows.forEach(row -> {
            assertEquals(BatchPrintQueueStatus.PENDING, row.getStatus());
            assertEquals("PU", row.getSourceType());
            assertEquals("PINV-5", row.getSourceRefNo());
        });
    }

    @Test
    void grnBatchCreationUsesAcceptedPlusFocQuantity() {
        Product product = product(10L, true);
        GrnEntity grn = grn("GRN-1");
        grn.getItems().add(grnItem(200L, grn, product, 2, 1));

        List<BatchMaster> batches = service.createForGrnPost(grn, java.util.Map.of());

        assertEquals(3, batches.size());
        for (BatchMaster batch : batches) {
            assertEquals(PurchaseBatchCreationService.DOC_TYPE_GRN, batch.getSourceDocumentType());
            assertEquals("GRN-1", batch.getSourceRefNo());
            assertEquals(7L, batch.getWarehouseId());
            assertEquals(1, batch.getQuantity());
        }
    }

    private PurchaseInvoice invoice(String invoiceNumber) {
        PurchaseInvoice invoice = new PurchaseInvoice();
        invoice.setId(1L);
        invoice.setInvoiceNumber(invoiceNumber);
        invoice.setSourceType("DIRECT");
        Warehouse warehouse = new Warehouse();
        warehouse.setId(7L);
        invoice.setWarehouse(warehouse);
        return invoice;
    }

    private PurchaseInvoiceItem invoiceItem(Long id, String itemCode, int qty) {
        PurchaseInvoiceItem item = new PurchaseInvoiceItem();
        item.setId(id);
        item.setItemCode(itemCode);
        item.setItemName("Tracked Item");
        item.setQty(qty);
        item.setUom("PCS");
        return item;
    }

    private GrnEntity grn(String grnNo) {
        GrnEntity grn = new GrnEntity();
        grn.setId(9L);
        grn.setGrnNo(grnNo);
        Warehouse warehouse = new Warehouse();
        warehouse.setId(7L);
        grn.setWarehouse(warehouse);
        return grn;
    }

    private GrnItemEntity grnItem(Long id, GrnEntity grn, Product product, int acceptedQty, int focQty) {
        GrnItemEntity item = new GrnItemEntity();
        item.setId(id);
        item.setGrn(grn);
        item.setProduct(product);
        item.setProductCode(product.getCode());
        item.setProductName(product.getName());
        item.setAcceptedQty(acceptedQty);
        item.setFocQty(focQty);
        item.setUom("PCS");
        item.setFocUnit("PCS");
        return item;
    }

    private Product product(Long id, boolean batchEnabled) {
        Product product = new Product();
        product.setId(id);
        product.setCode("CODE-10");
        product.setName("Tracked Item");
        product.setBatch(batchEnabled);
        return product;
    }

    private InventorySettings settings(boolean printOnCreate) {
        InventorySettings settings = new InventorySettings();
        settings.setBarcodePrintOnBatchCreate(printOnCreate);
        return settings;
    }

    private <T> List<T> toList(Iterable<T> iterable) {
        List<T> result = new ArrayList<>();
        if (iterable != null) {
            for (T item : iterable) {
                result.add(item);
            }
        }
        return result;
    }
}
