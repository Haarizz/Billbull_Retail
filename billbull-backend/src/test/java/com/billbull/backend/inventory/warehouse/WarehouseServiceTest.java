package com.billbull.backend.inventory.warehouse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.settings.branch.BranchRepository;

@ExtendWith(MockitoExtension.class)
class WarehouseServiceTest {

    @Mock
    private WarehouseRepository repository;

    @Mock
    private ZoneRepository zoneRepository;

    @Mock
    private LocatorRepository locatorRepository;

    @Mock
    private BinRepository binRepository;

    @Mock
    private BranchRepository branchRepository;

    @Mock
    private BranchAccessService branchAccessService;

    @Mock
    private com.billbull.backend.inventory.scope.InventoryBranchScopeResolver branchScopeResolver;

    private WarehouseService warehouseService;

    @BeforeEach
    void setUp() {
        warehouseService = new WarehouseService(
                repository,
                zoneRepository,
                locatorRepository,
                binRepository,
                branchRepository,
                branchAccessService,
                branchScopeResolver);
    }

    @Test
    void createUsesCurrentUserBranchWhenBranchIdIsOmittedForBranchScopedUser() {
        Branch branch = branch(11L, "North Branch");
        WarehouseRequestDto request = warehouseRequest();

        when(branchAccessService.currentUserHasRole("ADMIN", "BRANCH_ADMIN")).thenReturn(false);
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch);
        when(repository.save(any(Warehouse.class))).thenAnswer(invocation -> {
            Warehouse warehouse = invocation.getArgument(0);
            warehouse.setId(7L);
            return warehouse;
        });
        stubCounts(7L);

        WarehouseResponse response = warehouseService.create(request);

        ArgumentCaptor<Warehouse> captor = ArgumentCaptor.forClass(Warehouse.class);
        verify(repository).save(captor.capture());
        assertEquals(branch, captor.getValue().getBranch());
        assertEquals(branch.getId(), response.getBranchId());
        assertEquals("Main Warehouse", response.getName());
    }

    @Test
    void createRejectsAnotherBranchForBranchScopedUser() {
        Branch currentBranch = branch(11L, "North Branch");
        WarehouseRequestDto request = warehouseRequest();
        request.setBranchId(22L);

        when(branchAccessService.currentUserHasRole("ADMIN", "BRANCH_ADMIN")).thenReturn(false);
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(currentBranch);

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> warehouseService.create(request));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertEquals("You can only assign warehouses to your own branch.", ex.getReason());
        verify(repository, never()).save(any(Warehouse.class));
    }

    @Test
    void createFallsBackToDefaultBranchForAdminWhenBranchIdIsOmitted() {
        Branch defaultBranch = branch(3L, "Default Branch");
        WarehouseRequestDto request = warehouseRequest();

        when(branchAccessService.currentUserHasRole("ADMIN", "BRANCH_ADMIN")).thenReturn(true);
        when(branchAccessService.getCurrentUserBranchOrNull()).thenReturn(null);
        when(branchRepository.findByIsDefaultTrue()).thenReturn(Optional.of(defaultBranch));
        when(repository.save(any(Warehouse.class))).thenAnswer(invocation -> {
            Warehouse warehouse = invocation.getArgument(0);
            warehouse.setId(9L);
            return warehouse;
        });
        stubCounts(9L);

        WarehouseResponse response = warehouseService.create(request);

        assertEquals(defaultBranch.getId(), response.getBranchId());
        assertEquals(defaultBranch.getName(), response.getBranchName());
    }

    @Test
    void updateRejectsWarehouseOutsideAssignedBranchForBranchScopedUser() {
        Branch currentBranch = branch(11L, "North Branch");
        Branch otherBranch = branch(22L, "South Branch");
        Warehouse warehouse = new Warehouse();
        warehouse.setId(7L);
        warehouse.setBranch(otherBranch);
        warehouse.setName("Existing");
        warehouse.setType("Warehouse");
        warehouse.setAddress("Industrial Area");
        warehouse.setStatus("Active");

        when(repository.findById(7L)).thenReturn(Optional.of(warehouse));
        when(branchAccessService.currentUserHasRole("ADMIN", "BRANCH_ADMIN")).thenReturn(false);
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(currentBranch);

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> warehouseService.update(7L, warehouseRequest()));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertEquals("You can only modify warehouses in your assigned branch.", ex.getReason());
        verify(repository, never()).save(any(Warehouse.class));
    }

    // ---------- Phase 5: branch-scoped list behaviour ----------

    @Test
    void listBranchUserToggleOffUsesOwnBranchOnly() {
        // Toggle off (resolver empty) → today's exact behaviour: own branch only, globals excluded.
        Warehouse wh = warehouseEntity(1L, branch(11L, "North"));
        stubCountsLenient(1L);
        when(branchAccessService.currentUserHasRole("ADMIN", "BRANCH_ADMIN")).thenReturn(false);
        when(branchAccessService.getCurrentUserBranchId()).thenReturn(11L);
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.empty());
        when(repository.findByBranch_Id(11L)).thenReturn(List.of(wh));

        List<WarehouseResponse> result = warehouseService.list(null);

        assertEquals(1, result.size());
        verify(repository).findByBranch_Id(11L);
        verify(repository, never()).findByBranchIdInOrGlobal(any());
    }

    @Test
    void listBranchUserToggleOnIncludesGlobals() {
        // Toggle on + active branch → own branch PLUS global (null-branch) warehouses.
        var scope = new BranchAccessService.ListScope(false, java.util.Set.of(11L));
        Warehouse own = warehouseEntity(1L, branch(11L, "North"));
        Warehouse global = warehouseEntity(2L, null); // a global (null-branch) warehouse
        stubCountsLenient(1L);
        stubCountsLenient(2L);
        when(branchAccessService.currentUserHasRole("ADMIN", "BRANCH_ADMIN")).thenReturn(false);
        when(branchAccessService.getCurrentUserBranchId()).thenReturn(11L);
        when(branchScopeResolver.activeListScope()).thenReturn(Optional.of(scope));
        when(repository.findByBranchIdInOrGlobal(scope.branchIds())).thenReturn(List.of(own, global));

        List<WarehouseResponse> result = warehouseService.list(null);

        assertEquals(2, result.size());
        verify(repository).findByBranchIdInOrGlobal(scope.branchIds());
        verify(repository, never()).findByBranch_Id(any());
    }

    @Test
    void listAdminNoBranchReturnsAllAndIgnoresResolver() {
        // Admin authority unchanged: sees everything; resolver is not consulted on the admin path.
        Warehouse wh = warehouseEntity(1L, branch(11L, "North"));
        stubCountsLenient(1L);
        when(branchAccessService.currentUserHasRole("ADMIN", "BRANCH_ADMIN")).thenReturn(true);
        when(repository.findAll()).thenReturn(List.of(wh));

        List<WarehouseResponse> result = warehouseService.list(null);

        assertEquals(1, result.size());
        verify(repository).findAll();
        verify(branchScopeResolver, never()).activeListScope();
    }

    @Test
    void listAdminWithRequestedBranchFiltersToThatBranch() {
        Warehouse wh = warehouseEntity(3L, branch(22L, "South"));
        stubCountsLenient(3L);
        when(branchAccessService.currentUserHasRole("ADMIN", "BRANCH_ADMIN")).thenReturn(true);
        when(repository.findByBranch_Id(22L)).thenReturn(List.of(wh));

        List<WarehouseResponse> result = warehouseService.list(22L);

        assertEquals(1, result.size());
        verify(repository).findByBranch_Id(22L);
        verify(branchScopeResolver, never()).activeListScope();
    }

    private Warehouse warehouseEntity(Long id, Branch branch) {
        Warehouse w = new Warehouse();
        w.setId(id);
        w.setName("WH-" + id);
        w.setType("Warehouse");
        w.setAddress("Area");
        w.setStatus("Active");
        w.setBranch(branch);
        return w;
    }

    /** list() → mapToResponse() calls the count repos per warehouse; stub them leniently. */
    private void stubCountsLenient(Long warehouseId) {
        org.mockito.Mockito.lenient().when(zoneRepository.findByWarehouseId(warehouseId)).thenReturn(List.of());
        org.mockito.Mockito.lenient().when(locatorRepository.countByWarehouseId(warehouseId)).thenReturn(0L);
        org.mockito.Mockito.lenient().when(binRepository.countByWarehouseId(warehouseId)).thenReturn(0L);
    }

    private WarehouseRequestDto warehouseRequest() {
        WarehouseRequestDto request = new WarehouseRequestDto();
        request.setName("Main Warehouse");
        request.setType("Warehouse");
        request.setAddress("Industrial Area");
        request.setStatus("Active");
        request.setCapacity(1000);
        request.setUtilization(0);
        return request;
    }

    private Branch branch(Long id, String name) {
        Branch branch = new Branch();
        branch.setId(id);
        branch.setName(name);
        branch.setCode(name.substring(0, 2).toUpperCase());
        return branch;
    }

    private void stubCounts(Long warehouseId) {
        when(zoneRepository.findByWarehouseId(warehouseId)).thenReturn(List.of());
        when(locatorRepository.countByWarehouseId(warehouseId)).thenReturn(0L);
        when(binRepository.countByWarehouseId(warehouseId)).thenReturn(0L);
    }
}
