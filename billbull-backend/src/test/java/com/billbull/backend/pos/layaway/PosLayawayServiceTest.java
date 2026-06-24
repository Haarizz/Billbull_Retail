package com.billbull.backend.pos.layaway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.batch.BatchSelectionService;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.security.RolePermissionService;
import com.billbull.backend.settings.branch.BranchRepository;

@ExtendWith(MockitoExtension.class)
class PosLayawayServiceTest {

    @Mock private PosLayawayRepository repo;
    @Mock private PosLayawayPaymentRepository paymentRepo;
    @Mock private ProductRepository productRepository;
    @Mock private BatchSelectionService batchSelectionService;
    @Mock private RolePermissionService permissionService;
    @Mock private PostingEngineService postingEngine;
    @Mock private BranchRepository branchRepository;
    @Mock private PosAuditService auditService;

    private PosLayawayService service;

    @BeforeEach
    void setUp() {
        service = new PosLayawayService(repo, paymentRepo, productRepository, batchSelectionService, permissionService,
                postingEngine, branchRepository, auditService);
        // save() returns the same entity with ids assigned, so the reserve loop can run.
        lenient().when(repo.save(any(PosLayaway.class))).thenAnswer(inv -> {
            PosLayaway l = inv.getArgument(0);
            if (l.getId() == null) l.setId(100L);
            long lineId = 1;
            for (PosLayawayItem it : l.getItems()) {
                if (it.getId() == null) it.setId(lineId++);
            }
            return l;
        });
        lenient().when(repo.findMaxLayawayNumber()).thenReturn(null);
    }

    @Test
    void createReservesBatchLinesAndSkipsNormalLines() {
        when(productRepository.findByCode("BATCH-ITEM")).thenReturn(Optional.of(batchProduct("BATCH-ITEM")));
        when(productRepository.findByCode("NORMAL-ITEM")).thenReturn(Optional.of(normalProduct("NORMAL-ITEM")));

        PosLayawayCreateRequest req = baseRequest();
        req.setItems(List.of(
                line("BATCH-ITEM", 1, 100.0, "BATCH-A-1"),
                line("NORMAL-ITEM", 2, 50.0, null)));

        PosLayaway saved = service.create(req);

        // Batch line reserves its scanned unit; normal line reserves nothing.
        verify(batchSelectionService).reserveBatchForLayawayLine(eq(100L), anyLong(), eq("BATCH-ITEM"), eq("BATCH-A-1"));
        verify(batchSelectionService, never())
                .reserveBatchForLayawayLine(anyLong(), anyLong(), eq("NORMAL-ITEM"), any());
        assertEquals(2, saved.getItems().size());
        assertTrue(saved.getLayawayNumber().startsWith("LAY-"));
    }

    @Test
    void createComputesTotalsAndStatusFromDeposit() {
        when(productRepository.findByCode("NORMAL-ITEM")).thenReturn(Optional.of(normalProduct("NORMAL-ITEM")));

        PosLayawayCreateRequest req = baseRequest();
        req.setDepositAmount(50.0);
        req.setItems(List.of(line("NORMAL-ITEM", 2, 100.0, null))); // 200 + 5% tax = 210

        PosLayaway saved = service.create(req);

        assertMoney("210.0", saved.getSaleTotal());
        assertMoney("10.0", saved.getTaxTotal());
        assertMoney("50.0", saved.getDepositAmount());
        assertMoney("160.0", saved.getBalanceAmount());
        assertEquals(PosLayawayStatus.PARTIALLY_PAID, saved.getStatus());
    }

    @Test
    void createWithFullDepositIsReadyToConvert() {
        when(productRepository.findByCode("NORMAL-ITEM")).thenReturn(Optional.of(normalProduct("NORMAL-ITEM")));
        PosLayawayCreateRequest req = baseRequest();
        req.setDepositAmount(1000.0); // capped at sale total
        req.setItems(List.of(line("NORMAL-ITEM", 1, 100.0, null)));

        PosLayaway saved = service.create(req);

        assertMoney("105.0", saved.getSaleTotal());
        assertMoney("105.0", saved.getDepositAmount());
        assertMoney("0.0", saved.getBalanceAmount());
        assertEquals(PosLayawayStatus.READY_TO_CONVERT, saved.getStatus());
    }

    @Test
    void createRejectsWalkInCustomer() {
        PosLayawayCreateRequest req = baseRequest();
        req.setCustomerCode("WALK-IN");
        req.setItems(List.of(line("NORMAL-ITEM", 1, 10.0, null)));

        assertThrows(ResponseStatusException.class, () -> service.create(req));
        verify(repo, never()).save(any());
    }

    @Test
    void createRejectsNonFefoBatchLineWithoutScannedBatch() {
        // Batch-controlled but FEFO disabled → a specific batch must be chosen,
        // so the cashier still has to scan one.
        when(productRepository.findByCode("BATCH-ITEM")).thenReturn(Optional.of(batchProduct("BATCH-ITEM")));
        PosLayawayCreateRequest req = baseRequest();
        req.setItems(List.of(line("BATCH-ITEM", 1, 10.0, null))); // no batch number

        assertThrows(ResponseStatusException.class, () -> service.create(req));
        verify(batchSelectionService, never())
                .autoReserveFefoForLayawayLine(anyLong(), anyLong(), any(), anyInt());
    }

    @Test
    void createAutoReservesFefoBatchLineWhenNotScanned() {
        // Batch-controlled AND FEFO enabled → no scan needed; batches are
        // auto-picked first-expiry-first-out for the whole line quantity.
        when(productRepository.findByCode("FEFO-ITEM")).thenReturn(Optional.of(fefoProduct("FEFO-ITEM")));
        PosLayawayCreateRequest req = baseRequest();
        req.setItems(List.of(line("FEFO-ITEM", 3, 20.0, null))); // qty 3, no batch number

        PosLayaway saved = service.create(req);

        verify(batchSelectionService)
                .autoReserveFefoForLayawayLine(eq(100L), anyLong(), eq("FEFO-ITEM"), eq(3));
        verify(batchSelectionService, never())
                .reserveBatchForLayawayLine(anyLong(), anyLong(), eq("FEFO-ITEM"), any());
        assertEquals(1, saved.getItems().size());
    }

    @Test
    void createPrefersScannedBatchOverFefoEvenWhenFefoEnabled() {
        // A scanned batch always pins the exact unit, even on a FEFO product.
        when(productRepository.findByCode("FEFO-ITEM")).thenReturn(Optional.of(fefoProduct("FEFO-ITEM")));
        PosLayawayCreateRequest req = baseRequest();
        req.setItems(List.of(line("FEFO-ITEM", 1, 20.0, "FEFO-BATCH-7")));

        service.create(req);

        verify(batchSelectionService)
                .reserveBatchForLayawayLine(eq(100L), anyLong(), eq("FEFO-ITEM"), eq("FEFO-BATCH-7"));
        verify(batchSelectionService, never())
                .autoReserveFefoForLayawayLine(anyLong(), anyLong(), any(), anyInt());
    }

    @Test
    void cancelWithoutDeletePermissionIsForbidden() {
        when(permissionService.currentUserCanDelete("sales")).thenReturn(false);
        assertThrows(ResponseStatusException.class, () -> service.cancel(5L));
        verify(repo, never()).findById(anyLong());
        verify(batchSelectionService, never()).releaseLayaway(anyLong());
    }

    @Test
    void cancelReleasesReservationsAndStampsCancelled() {
        when(permissionService.currentUserCanDelete("sales")).thenReturn(true);
        PosLayaway layaway = openLayaway(7L);
        when(repo.findById(7L)).thenReturn(Optional.of(layaway));

        PosLayaway result = service.cancel(7L);

        verify(batchSelectionService).releaseLayaway(7L);
        assertEquals(PosLayawayStatus.CANCELLED, result.getStatus());
    }

    @Test
    void markConvertedReleasesReservationsAndStampsInvoice() {
        PosLayaway layaway = openLayaway(9L);
        when(repo.findById(9L)).thenReturn(Optional.of(layaway));

        PosLayaway result = service.markConverted(9L, 555L, "SI-POS-0009");

        verify(batchSelectionService).releaseLayaway(9L);
        assertEquals(PosLayawayStatus.CONVERTED, result.getStatus());
        assertEquals(555L, result.getConvertedInvoiceId());
        assertEquals("SI-POS-0009", result.getConvertedInvoiceNumber());
    }

    // ── fixtures ──────────────────────────────────────────────────────────────

    /** Assert money equality by numeric value, scale-independent (210 == 210.00). */
    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> "expected " + expected + " but was " + actual);
    }

    private PosLayawayCreateRequest baseRequest() {
        PosLayawayCreateRequest req = new PosLayawayCreateRequest();
        req.setCustomerCode("CUST-1");
        req.setCustomerName("Test Customer");
        req.setDueDate(LocalDate.now().plusDays(7));
        return req;
    }

    private PosLayawayCreateRequest.PosLayawayItemRequest line(
            String code, int qty, double price, String batchNumber) {
        PosLayawayCreateRequest.PosLayawayItemRequest i = new PosLayawayCreateRequest.PosLayawayItemRequest();
        i.setItemCode(code);
        i.setItemName(code);
        i.setQuantity(qty);
        i.setPrice(price);
        i.setTaxRate(5.0);
        i.setBatchNumber(batchNumber);
        return i;
    }

    /** Batch-controlled but FEFO disabled: a specific batch must be chosen. */
    private Product batchProduct(String code) {
        Product p = new Product();
        p.setCode(code);
        p.setBatch(true);
        p.setFefoEnabled(false);
        return p;
    }

    private Product normalProduct(String code) {
        Product p = new Product();
        p.setCode(code);
        p.setBatch(false);
        return p;
    }

    /** Batch-controlled AND FEFO-enabled: layaway can auto-pick batches. */
    private Product fefoProduct(String code) {
        Product p = new Product();
        p.setCode(code);
        p.setBatch(true);
        p.setFefoEnabled(true);
        return p;
    }

    private PosLayaway openLayaway(Long id) {
        PosLayaway l = new PosLayaway();
        l.setId(id);
        l.setStatus(PosLayawayStatus.ACTIVE);
        return l;
    }
}
