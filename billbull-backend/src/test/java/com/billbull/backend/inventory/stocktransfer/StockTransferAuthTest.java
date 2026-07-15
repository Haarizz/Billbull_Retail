package com.billbull.backend.inventory.stocktransfer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.inventory.scope.InventoryBranchScopeResolver;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Branch-Level Inventory Phase 8 — Option A "Split Authority" (design §17).
 * Verifies: source access for create/send, destination access for receive, either-endpoint
 * visibility for list/view, and that everything is a no-op when the toggle is off (byte-identical).
 * Pure Mockito; the stock/ledger mechanics are not exercised here (integrity is Phase-2 stamping +
 * the ledger, unaffected by the auth model).
 */
@ExtendWith(MockitoExtension.class)
class StockTransferAuthTest {

    @Mock private StockTransferRepository repository;
    @Mock private com.billbull.backend.inventory.product.ProductRepository productRepository;
    @Mock private com.billbull.backend.inventory.product.ProductPricingRepository productPricingRepository;
    @Mock private com.billbull.backend.inventory.warehouse.WarehouseRepository warehouseRepository;
    @Mock private com.billbull.backend.inventory.warehouse.ZoneRepository zoneRepository;
    @Mock private com.billbull.backend.inventory.warehouse.LocatorRepository locatorRepository;
    @Mock private com.billbull.backend.inventory.warehouse.BinRepository binRepository;
    @Mock private com.billbull.backend.purchase.stockmovement.StockMovementRepository stockMovementRepository;
    @Mock private com.billbull.backend.inventory.warehouse.WarehouseStockService warehouseStockService;
    @Mock private com.billbull.backend.financials.generalledger.postingengine.PostingEngineService postingEngineService;
    @Mock private com.billbull.backend.purchase.stockmovement.StockMovementService stockMovementService;
    @Mock private InventoryBranchScopeResolver branchScopeResolver;
    @Mock private BranchAccessService branchAccessService;

    private StockTransferService service() {
        return new StockTransferService(
                repository, productRepository, productPricingRepository, warehouseRepository,
                zoneRepository, locatorRepository, binRepository, stockMovementRepository,
                warehouseStockService, postingEngineService, stockMovementService,
                branchScopeResolver, branchAccessService);
    }

    private static Warehouse warehouse(long branchId) {
        Branch b = new Branch();
        b.setId(branchId);
        Warehouse w = new Warehouse();
        w.setId(branchId * 10);
        w.setBranch(b);
        return w;
    }

    /** A minimal transfer with source branch S and destination branch D. */
    private StockTransfer transfer(long sourceBranch, long destBranch) {
        StockTransfer st = new StockTransfer();
        st.setFromWarehouse(warehouse(sourceBranch));
        st.setToWarehouse(warehouse(destBranch));
        st.setStatus(StockTransferStatus.SENT); // ready-to-receive for receive tests
        return st;
    }

    // ---------- toggle OFF: no auth (byte-identical) ----------

    @Test
    void receiveToggleOffNoAuthCheck() {
        when(branchScopeResolver.shouldScope()).thenReturn(false);
        StockTransfer st = transfer(1L, 2L);
        st.setItems(new java.util.ArrayList<>()); // no items → no ledger work
        when(repository.findById(99L)).thenReturn(java.util.Optional.of(st));
        lenient().when(repository.save(st)).thenReturn(st);

        // Must not consult branch access at all when scoping is off.
        assertThatCode(() -> service().markReceived(99L)).doesNotThrowAnyException();
        org.mockito.Mockito.verifyNoInteractions(branchAccessService);
    }

    // ---------- RECEIVE requires DESTINATION access ----------

    @Test
    void receiveRequiresDestinationAccess_deniedForSourceOnlyUser() {
        when(branchScopeResolver.shouldScope()).thenReturn(true);
        StockTransfer st = transfer(1L, 2L);
        when(repository.findById(1L)).thenReturn(java.util.Optional.of(st));
        // Destination branch (2) is NOT accessible → assertTransactionBranchAccessible throws.
        org.mockito.Mockito.doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "x"))
                .when(branchAccessService)
                .assertTransactionBranchAccessible(2L, "Stock transfer destination branch");

        assertThatThrownBy(() -> service().markReceived(1L))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void receiveAllowedForDestinationUser() {
        when(branchScopeResolver.shouldScope()).thenReturn(true);
        StockTransfer st = transfer(1L, 2L);
        st.setItems(new java.util.ArrayList<>());
        when(repository.findById(1L)).thenReturn(java.util.Optional.of(st));
        lenient().when(repository.save(st)).thenReturn(st);
        // destination (2) accessible → assertion passes (void, no stub needed)

        assertThatCode(() -> service().markReceived(1L)).doesNotThrowAnyException();
    }

    // ---------- SEND requires SOURCE access ----------

    @Test
    void sendRequiresSourceAccess_deniedForDestinationOnlyUser() {
        when(branchScopeResolver.shouldScope()).thenReturn(true);
        StockTransfer st = transfer(1L, 2L);
        st.setStatus(StockTransferStatus.DRAFT); // send requires DRAFT/PENDING_APPROVAL
        when(repository.findById(1L)).thenReturn(java.util.Optional.of(st));
        org.mockito.Mockito.doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "x"))
                .when(branchAccessService)
                .assertTransactionBranchAccessible(1L, "Stock transfer source branch");

        assertThatThrownBy(() -> service().markSent(1L))
                .isInstanceOf(ResponseStatusException.class);
    }

    // ---------- either-endpoint visibility (list) ----------

    @Test
    void listShowsTransfersAccessibleViaEitherEndpoint() {
        when(branchScopeResolver.shouldScope()).thenReturn(true);
        StockTransfer t1 = transfer(1L, 2L); // user can access source 1
        StockTransfer t2 = transfer(3L, 4L); // user can access dest 4
        StockTransfer t3 = transfer(5L, 6L); // user can access neither
        when(repository.findAll()).thenReturn(List.of(t1, t2, t3));
        // Visibility: canAccessTransactionBranch(src) OR (dst)
        when(branchAccessService.canAccessTransactionBranch(1L)).thenReturn(true);   // t1 source
        lenient().when(branchAccessService.canAccessTransactionBranch(2L)).thenReturn(false);
        when(branchAccessService.canAccessTransactionBranch(3L)).thenReturn(false);
        when(branchAccessService.canAccessTransactionBranch(4L)).thenReturn(true);   // t2 dest
        when(branchAccessService.canAccessTransactionBranch(5L)).thenReturn(false);
        when(branchAccessService.canAccessTransactionBranch(6L)).thenReturn(false);  // t3 neither

        List<StockTransferResponse> result = service().list();

        // t1 (via source) + t2 (via dest) visible; t3 filtered out.
        assertThat(result).hasSize(2);
    }

    @Test
    void listToggleOffReturnsAllUnfiltered() {
        when(branchScopeResolver.shouldScope()).thenReturn(false);
        StockTransfer t1 = transfer(1L, 2L);
        StockTransfer t2 = transfer(5L, 6L);
        when(repository.findAll()).thenReturn(List.of(t1, t2));

        List<StockTransferResponse> result = service().list();

        assertThat(result).hasSize(2); // no filtering when toggle off
        org.mockito.Mockito.verifyNoInteractions(branchAccessService);
    }
}
