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

    private WarehouseService warehouseService;

    @BeforeEach
    void setUp() {
        warehouseService = new WarehouseService(
                repository,
                zoneRepository,
                locatorRepository,
                binRepository,
                branchRepository,
                branchAccessService);
    }

    @Test
    void createUsesCurrentUserBranchWhenBranchIdIsOmittedForBranchScopedUser() {
        Branch branch = branch(11L, "North Branch");
        WarehouseRequestDto request = warehouseRequest();

        when(branchAccessService.currentUserHasRole("ADMIN")).thenReturn(false);
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

        when(branchAccessService.currentUserHasRole("ADMIN")).thenReturn(false);
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

        when(branchAccessService.currentUserHasRole("ADMIN")).thenReturn(true);
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
        when(branchAccessService.currentUserHasRole("ADMIN")).thenReturn(false);
        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(currentBranch);

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> warehouseService.update(7L, warehouseRequest()));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertEquals("You can only modify warehouses in your assigned branch.", ex.getReason());
        verify(repository, never()).save(any(Warehouse.class));
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
