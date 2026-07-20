package com.billbull.backend.inventory.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.brand.BrandRepository;
import com.billbull.backend.inventory.department.DepartmentRepository;
import com.billbull.backend.inventory.scope.InventoryBranchScopeResolver;
import com.billbull.backend.inventory.scope.MasterDataBranchService;
import com.billbull.backend.inventory.subdepartment.SubDepartmentRepository;
import com.billbull.backend.inventory.units.UnitRepository;
import com.billbull.backend.inventory.warehouse.BinRepository;
import com.billbull.backend.inventory.warehouse.LocatorRepository;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.inventory.warehouse.ZoneRepository;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService.ListScope;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.UserRepository;

/**
 * Branch-Level Inventory Phase 6 — proves the product CATALOG IDENTITY is branch-scoped only when
 * a scope is present (toggle on + active branch) and byte-identical otherwise, and that exact
 * code/SKU resolution follows the branch-first, global-fallback precedence (mirroring Phase 9A
 * barcode resolution).
 */
@ExtendWith(MockitoExtension.class)
class ProductServiceBranchScopeTest {

    @Mock private ProductRepository productRepo;
    @Mock private ProductPricingRepository pricingRepo;
    @Mock private ProductBranchPricingRepository branchPricingRepo;
    @Mock private ProductTaxRepository taxRepo;
    @Mock private ProductInventoryPolicyRepository inventoryRepo;
    @Mock private ProductMediaRepository mediaRepo;
    @Mock private ProductPackingRepository packingRepo;
    @Mock private ProductBarcodeRepository barcodeRepo;
    @Mock private BrandRepository brandRepo;
    @Mock private DepartmentRepository departmentRepo;
    @Mock private SubDepartmentRepository subDepartmentRepo;
    @Mock private UnitRepository unitRepo;
    @Mock private WarehouseRepository warehouseRepo;
    @Mock private ZoneRepository zoneRepo;
    @Mock private LocatorRepository locatorRepo;
    @Mock private BinRepository binRepo;
    @Mock private ProductImageStorageService imageStorage;
    @Mock private StockMovementRepository stockMovementRepo;
    @Mock private BranchRepository branchRepo;
    @Mock private AuditLogService auditLogService;
    @Mock private ModulePermissionService modulePermissionService;
    @Mock private UserFavouriteProductRepository favouriteRepo;
    @Mock private UserRepository userRepository;
    @Mock private InventoryBranchScopeResolver branchScopeResolver;
    @Mock private MasterDataBranchService masterBranch;

    private ProductService service() {
        return new ProductService(productRepo, pricingRepo, branchPricingRepo, taxRepo,
                inventoryRepo, mediaRepo, packingRepo, barcodeRepo, brandRepo, departmentRepo,
                subDepartmentRepo, unitRepo, warehouseRepo, zoneRepo, locatorRepo, binRepo,
                imageStorage, stockMovementRepo, branchRepo, auditLogService,
                modulePermissionService, favouriteRepo, userRepository, branchScopeResolver,
                masterBranch);
    }

    private static ListScope scopeOf(Long branchId) {
        return new ListScope(false, Set.of(branchId));
    }

    // ───────────────────────── catalog identity ─────────────────────────

    @Test
    void getAllToggleOffUsesUnscopedQuery() {
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(productRepo.findAllByIsActiveTrue()).thenReturn(List.of());

        service().getAll();

        verify(productRepo).findAllByIsActiveTrue();
        verify(productRepo, never()).findAllActiveInBranchScope(any());
    }

    @Test
    void getAllToggleOnUsesBranchScopedQuery() {
        ListScope scope = scopeOf(3L);
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.of(scope));
        when(productRepo.findAllActiveInBranchScope(scope.branchIds())).thenReturn(List.of());

        service().getAll();

        verify(productRepo).findAllActiveInBranchScope(scope.branchIds());
        verify(productRepo, never()).findAllByIsActiveTrue();
    }

    // ─────────────────── branch-first code/SKU resolution ───────────────────

    @Test
    void resolveByCodeToggleOffUsesGlobalLookups() {
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        Product global = new Product();
        when(productRepo.findFirstByCodeIgnoreCaseAndIsActiveTrue("P1")).thenReturn(Optional.of(global));

        Optional<Product> hit = service().resolveActiveByCodeOrSku("P1");

        assertThat(hit).containsSame(global);
        verify(productRepo, never()).findActiveByCodeInBranches(any(), any());
    }

    @Test
    void resolveByCodeToggleOnBranchProductWins() {
        ListScope scope = scopeOf(3L);
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.of(scope));
        Product branchOwned = new Product();
        when(productRepo.findActiveByCodeInBranches("P1", scope.branchIds()))
                .thenReturn(List.of(branchOwned));

        Optional<Product> hit = service().resolveActiveByCodeOrSku("P1");

        assertThat(hit).containsSame(branchOwned);
        verify(productRepo, never()).findActiveGlobalByCode(any());
        verify(productRepo, never()).findFirstByCodeIgnoreCaseAndIsActiveTrue(any());
    }

    @Test
    void resolveByCodeToggleOnFallsBackToGlobal() {
        ListScope scope = scopeOf(3L);
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.of(scope));
        Product global = new Product();
        when(productRepo.findActiveByCodeInBranches("P1", scope.branchIds())).thenReturn(List.of());
        when(productRepo.findActiveBySkuInBranches("P1", scope.branchIds())).thenReturn(List.of());
        when(productRepo.findActiveGlobalByCode("P1")).thenReturn(List.of(global));

        Optional<Product> hit = service().resolveActiveByCodeOrSku("P1");

        assertThat(hit).containsSame(global);
    }

    @Test
    void resolveByCodeToggleOnNoMatchAnywhereIsEmpty() {
        ListScope scope = scopeOf(3L);
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.of(scope));
        when(productRepo.findActiveByCodeInBranches("P1", scope.branchIds())).thenReturn(List.of());
        when(productRepo.findActiveBySkuInBranches("P1", scope.branchIds())).thenReturn(List.of());
        when(productRepo.findActiveGlobalByCode("P1")).thenReturn(List.of());
        when(productRepo.findActiveGlobalBySku("P1")).thenReturn(List.of());

        assertThat(service().resolveActiveByCodeOrSku("P1")).isEmpty();
    }
}
