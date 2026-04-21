package com.billbull.backend.settings.branch;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;

@ExtendWith(MockitoExtension.class)
class BranchServiceTest {

    @Mock
    private BranchRepository branchRepository;

    @Mock
    private WarehouseRepository warehouseRepository;

    private BranchService branchService;

    @BeforeEach
    void setUp() {
        branchService = new BranchService(branchRepository, warehouseRepository);
    }

    @Test
    void createRejectsDefaultWarehouseUntilBranchExists() {
        BranchRequest request = new BranchRequest();
        request.setName("Main Branch");
        request.setDefaultWarehouseId(5L);

        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> branchService.create(request));

        assertEquals(
                "Create the branch first, then assign one of its warehouses as the default.",
                ex.getMessage());
        verify(branchRepository, never()).save(any(Branch.class));
    }

    @Test
    void updateRejectsWarehouseFromAnotherBranch() {
        Branch branch = branch(1L, "Main Branch");
        Branch otherBranch = branch(2L, "Remote Branch");
        Warehouse warehouse = warehouse(10L, "Remote Warehouse", otherBranch);
        BranchRequest request = new BranchRequest();
        request.setName("Main Branch");
        request.setDefaultWarehouseId(10L);

        when(branchRepository.findById(1L)).thenReturn(Optional.of(branch));
        when(warehouseRepository.findById(10L)).thenReturn(Optional.of(warehouse));

        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> branchService.update(1L, request));

        assertEquals("Default warehouse must belong to the selected branch.", ex.getMessage());
    }

    @Test
    void updateAssignsWarehouseFromSameBranch() {
        Branch branch = branch(1L, "Main Branch");
        Warehouse warehouse = warehouse(10L, "Main Warehouse", branch);
        BranchRequest request = new BranchRequest();
        request.setName(" Main Branch ");
        request.setCode(" BR-001 ");
        request.setAddress(" Head Office ");
        request.setPhone(" 12345 ");
        request.setDefaultWarehouseId(10L);

        when(branchRepository.findById(1L)).thenReturn(Optional.of(branch));
        when(warehouseRepository.findById(10L)).thenReturn(Optional.of(warehouse));
        when(branchRepository.save(any(Branch.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BranchResponse response = branchService.update(1L, request);

        assertEquals(10L, response.getDefaultWarehouseId());
        assertEquals("Main Warehouse", response.getDefaultWarehouseName());
        assertEquals("Main Branch", branch.getName());
        assertEquals("BR-001", branch.getCode());
        assertEquals("Head Office", branch.getAddress());
        assertEquals("12345", branch.getPhone());
    }

    private Branch branch(Long id, String name) {
        Branch branch = new Branch();
        branch.setId(id);
        branch.setName(name);
        branch.setCode(name.substring(0, 2).toUpperCase());
        return branch;
    }

    private Warehouse warehouse(Long id, String name, Branch branch) {
        Warehouse warehouse = new Warehouse();
        warehouse.setId(id);
        warehouse.setName(name);
        warehouse.setBranch(branch);
        return warehouse;
    }
}
