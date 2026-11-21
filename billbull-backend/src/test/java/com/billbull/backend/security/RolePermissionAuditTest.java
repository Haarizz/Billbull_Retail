package com.billbull.backend.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.billbull.backend.role.Role;
import com.billbull.backend.role.RoleRepository;
import com.billbull.backend.security.accessaudit.AccessAuditAction;
import com.billbull.backend.security.accessaudit.AccessAuditService;
import com.billbull.backend.user.UserRepository;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/** Every permission mutation must land in the access-audit ledger with before/after values. */
@ExtendWith(MockitoExtension.class)
class RolePermissionAuditTest {

    @Mock private RolePermissionRepository rolePermissionRepository;
    @Mock private RoleRepository roleRepository;
    @Mock private UserRepository userRepository;
    @Mock private AccessAuditService accessAudit;

    private RolePermissionService service;
    private final Role sales = role("SALES", 2L);
    private final AccessAuditService.Affected holders =
            AccessAuditService.Affected.of(List.of(7L), List.of("cashier1"));

    @BeforeEach
    void setUp() {
        service = new RolePermissionService(rolePermissionRepository, roleRepository, userRepository);
        service.setAccessAuditService(accessAudit);
    }

    @Test
    void changeSetRecordsEachChangedRowAndSkipsNoOps() {
        RolePermission quotation = permission(sales, "sales.quotation", 10L, true, true);
        RolePermission invoiceUnchanged = permission(sales, "sales.invoice", 11L, true, false);

        when(roleRepository.findByName("SALES")).thenReturn(Optional.of(sales));
        when(accessAudit.affectedByRole("SALES")).thenReturn(holders);
        when(rolePermissionRepository.findByRoleAndModule(sales, "sales.quotation")).thenReturn(Optional.of(quotation));
        when(rolePermissionRepository.findByRoleAndModule(sales, "sales.invoice")).thenReturn(Optional.of(invoiceUnchanged));
        when(rolePermissionRepository.findByRoleAndModule(sales, "sales.order")).thenReturn(Optional.empty());
        when(rolePermissionRepository.save(any(RolePermission.class))).thenAnswer(inv -> {
            RolePermission rp = inv.getArgument(0);
            if (rp.getId() == null) ReflectionTestUtils.setField(rp, "id", 99L);
            return rp;
        });

        service.applyChangeSet("SALES",
                List.of(
                        Map.of("module", "sales.order", "canView", true, "canCreate", true),
                        Map.of("module", "sales.invoice", "canView", true, "canCreate", false)),
                List.of("sales.quotation"));

        ArgumentCaptor<AccessAuditService.Entry> captor = ArgumentCaptor.forClass(AccessAuditService.Entry.class);
        verify(accessAudit, times(2)).record(captor.capture());
        List<AccessAuditService.Entry> entries = captor.getAllValues();

        assertEquals(AccessAuditAction.PERMISSION_RESET, entries.get(0).getAction());
        assertEquals("sales.quotation", entries.get(0).getModule());
        assertEquals(Boolean.TRUE, ((Map<?, ?>) entries.get(0).getPrevious()).get("create"));
        assertTrue(entries.get(0).getSummary().contains("inherits from sales"));

        assertEquals(AccessAuditAction.PERMISSION_ADDED, entries.get(1).getAction());
        assertEquals("sales.order", entries.get(1).getModule());
        assertEquals("Explicit rule added: view, create", entries.get(1).getSummary());

        verify(rolePermissionRepository).delete(quotation);
        // Affected users are resolved once for the whole change set, not per row
        verify(accessAudit, times(1)).affectedByRole("SALES");
    }

    @Test
    void updateRecordsFlagDiffSummary() {
        RolePermission row = permission(sales, "sales", 5L, true, true);
        when(rolePermissionRepository.findById(5L)).thenReturn(Optional.of(row));
        when(rolePermissionRepository.save(any(RolePermission.class))).thenAnswer(inv -> inv.getArgument(0));
        when(accessAudit.affectedByRole("SALES")).thenReturn(holders);

        service.createOrUpdate(5L, null, null, null, false, true, null, null, null);

        ArgumentCaptor<AccessAuditService.Entry> captor = ArgumentCaptor.forClass(AccessAuditService.Entry.class);
        verify(accessAudit).record(captor.capture());
        assertEquals(AccessAuditAction.PERMISSION_CHANGED, captor.getValue().getAction());
        assertEquals("-create +edit", captor.getValue().getSummary());
    }

    @Test
    void rejectedAdminLockoutWritesNoAuditRow() {
        Role admin = role("ADMIN", 1L);
        RolePermission um = permission(admin, "userManagement", 3L, true, true);
        when(roleRepository.findByName("ADMIN")).thenReturn(Optional.of(admin));
        when(rolePermissionRepository.findByRoleAndModule(admin, "userManagement")).thenReturn(Optional.of(um));

        assertThrows(IllegalStateException.class,
                () -> service.applyChangeSet("ADMIN", List.of(), List.of("userManagement")));
        verify(accessAudit, never()).record(any());
        verify(rolePermissionRepository, never()).delete(any());
    }

    @Test
    void describeChangeListsGrantedFlagsForNewRule() {
        assertEquals("Explicit rule added: no access", RolePermissionService.describeChange(
                null, AccessAuditService.flags(false, false, false, false, false, false), true));
    }

    // ── Fixtures ────────────────────────────────────────────────────────────

    private static Role role(String name, Long id) {
        Role role = new Role();
        role.setName(name);
        ReflectionTestUtils.setField(role, "id", id);
        return role;
    }

    private static RolePermission permission(Role role, String module, Long id, boolean view, boolean create) {
        RolePermission rp = new RolePermission();
        rp.setRole(role);
        rp.setModule(module);
        rp.setCanView(view);
        rp.setCanCreate(create);
        ReflectionTestUtils.setField(rp, "id", id);
        return rp;
    }
}
