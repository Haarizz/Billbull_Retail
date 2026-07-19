package com.billbull.backend.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.role.Role;
import com.billbull.backend.role.RoleRepository;
import com.billbull.backend.user.UserRepository;

@ExtendWith(MockitoExtension.class)
class RolePermissionServiceTest {

    @Mock private RolePermissionRepository rolePermissionRepository;
    @Mock private RoleRepository roleRepository;
    @Mock private UserRepository userRepository;

    private RolePermissionService service;

    @BeforeEach
    void setUp() {
        service = new RolePermissionService(rolePermissionRepository, roleRepository, userRepository);
    }

    // ── Partial-update semantics ────────────────────────────────────────────

    @Test
    void updatePreservesFlagsThatAreNotInThePayload() {
        RolePermission existing = permission("SALES", "sales", 5L);
        existing.setCanDelete(true);
        existing.setCanExport(true);
        when(rolePermissionRepository.findById(5L)).thenReturn(Optional.of(existing));
        when(rolePermissionRepository.save(any(RolePermission.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        // Only canView/canEdit supplied — canDelete/canExport must survive untouched
        RolePermissionDto dto = service.createOrUpdate(
                5L, null, null, true, null, true, null, null, null);

        assertTrue(dto.isCanView());
        assertTrue(dto.isCanEdit());
        assertTrue(dto.isCanDelete());
        assertTrue(dto.isCanExport());
    }

    @Test
    void upsertCanonicalizesModuleCaseSoNoDuplicateRowsAreCreated() {
        Role sales = role("SALES", 2L);
        when(roleRepository.findByName("SALES")).thenReturn(Optional.of(sales));
        when(rolePermissionRepository.findByRoleAndModule(sales, "userManagement"))
                .thenReturn(Optional.empty());
        when(rolePermissionRepository.save(any(RolePermission.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        // Lowercased key from an older client must resolve to the canonical spelling
        RolePermissionDto dto = service.createOrUpdate(
                null, "SALES", "usermanagement", true, null, null, null, null, null);

        assertEquals("userManagement", dto.getModule());
        verify(rolePermissionRepository).findByRoleAndModule(sales, "userManagement");
    }

    @Test
    void upsertRejectsUnknownModule() {
        assertThrows(IllegalArgumentException.class, () -> service.createOrUpdate(
                null, "SALES", "not-a-module", true, null, null, null, null, null));
        verify(rolePermissionRepository, never()).save(any());
    }

    // ── ADMIN lockout guard ─────────────────────────────────────────────────

    @Test
    void blocksDisablingAdminUserManagementView() {
        RolePermission adminRow = permission("ADMIN", "userManagement", 9L);
        adminRow.setCanView(true);
        when(rolePermissionRepository.findById(9L)).thenReturn(Optional.of(adminRow));

        assertThrows(IllegalStateException.class, () -> service.createOrUpdate(
                9L, null, null, false, null, null, null, null, null));
        verify(rolePermissionRepository, never()).save(any());
    }

    @Test
    void blocksDisablingAdminRolePermissionsSubResourceView() {
        RolePermission adminRow = permission("ADMIN", "userManagement.role", 10L);
        adminRow.setCanView(true);
        when(rolePermissionRepository.findById(10L)).thenReturn(Optional.of(adminRow));

        assertThrows(IllegalStateException.class, () -> service.createOrUpdate(
                10L, null, null, false, null, null, null, null, null));
    }

    @Test
    void allowsDisablingAdminViewOnOtherModules() {
        RolePermission adminRow = permission("ADMIN", "hr", 11L);
        adminRow.setCanView(true);
        when(rolePermissionRepository.findById(11L)).thenReturn(Optional.of(adminRow));
        when(rolePermissionRepository.save(any(RolePermission.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        RolePermissionDto dto = service.createOrUpdate(
                11L, null, null, false, null, null, null, null, null);
        assertFalse(dto.isCanView());
    }

    @Test
    void blocksDeletingAdminUserManagementRow() {
        RolePermission adminRow = permission("ADMIN", "userManagement", 9L);
        when(rolePermissionRepository.findById(9L)).thenReturn(Optional.of(adminRow));

        assertThrows(IllegalStateException.class, () -> service.delete(9L));
        verify(rolePermissionRepository, never()).delete(any(RolePermission.class));
    }

    @Test
    void allowsDeletingAdminSubResourceRowToRestoreInheritance() {
        RolePermission adminRow = permission("ADMIN", "userManagement.role", 10L);
        when(rolePermissionRepository.findById(10L)).thenReturn(Optional.of(adminRow));

        RolePermissionDto removed = service.delete(10L);

        assertEquals("userManagement.role", removed.getModule());
        verify(rolePermissionRepository).delete(adminRow);
    }

    // ── Copy permissions ────────────────────────────────────────────────────

    @Test
    void copyRefusesAdminAsTarget() {
        assertThrows(IllegalStateException.class,
                () -> service.copyPermissions("MANAGER", "ADMIN"));
    }

    @Test
    void copyRefusesSameSourceAndTarget() {
        assertThrows(RuntimeException.class,
                () -> service.copyPermissions("SALES", "sales"));
    }

    @Test
    void copyReplacesTargetRowsWithSourceRows() {
        Role source = role("SALES", 2L);
        Role target = role("REGIONAL", 7L);
        when(roleRepository.findByName("SALES")).thenReturn(Optional.of(source));
        when(roleRepository.findByName("REGIONAL")).thenReturn(Optional.of(target));

        RolePermission stale = permission("REGIONAL", "hr", 40L);
        RolePermission src = permission("SALES", "sales", 41L);
        src.setCanView(true);
        src.setCanCreate(true);
        when(rolePermissionRepository.findByRole_Name("REGIONAL")).thenReturn(List.of(stale));
        when(rolePermissionRepository.findByRole_Name("SALES")).thenReturn(List.of(src));
        when(rolePermissionRepository.save(any(RolePermission.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        List<RolePermissionDto> copies = service.copyPermissions("SALES", "REGIONAL");

        verify(rolePermissionRepository).delete(stale);
        assertEquals(1, copies.size());
        assertEquals("REGIONAL", copies.get(0).getRoleName());
        assertEquals("sales", copies.get(0).getModule());
        assertTrue(copies.get(0).isCanView());
        assertTrue(copies.get(0).isCanCreate());
    }

    // ── Bulk upsert ─────────────────────────────────────────────────────────

    @Test
    void bulkUpsertAppliesEveryRow() {
        Role sales = role("SALES", 2L);
        when(roleRepository.findByName("SALES")).thenReturn(Optional.of(sales));
        when(rolePermissionRepository.findByRoleAndModule(any(), any())).thenReturn(Optional.empty());
        when(rolePermissionRepository.save(any(RolePermission.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        List<RolePermissionDto> result = service.bulkUpsert("SALES", List.of(
                Map.of("module", "sales", "canView", true, "canCreate", true),
                Map.of("module", "sales.quotation", "canView", true)));

        assertEquals(2, result.size());
        assertTrue(result.get(0).isCanCreate());
        assertTrue(result.get(1).isCanView());
        assertFalse(result.get(1).isCanCreate());
    }

    // ── Fixtures ────────────────────────────────────────────────────────────

    private Role role(String name, Long id) {
        Role role = new Role();
        role.setName(name);
        ReflectionTestUtils.setField(role, "id", id);
        return role;
    }

    private RolePermission permission(String roleName, String module, Long id) {
        RolePermission rp = new RolePermission();
        rp.setRole(role(roleName, id * 100));
        rp.setModule(module);
        ReflectionTestUtils.setField(rp, "id", id);
        return rp;
    }
}
