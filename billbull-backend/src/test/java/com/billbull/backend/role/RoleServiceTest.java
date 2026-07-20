package com.billbull.backend.role;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.billbull.backend.security.RolePermission;
import com.billbull.backend.security.RolePermissionRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;

@ExtendWith(MockitoExtension.class)
class RoleServiceTest {

    @Mock private RoleRepository roleRepository;
    @Mock private UserRepository userRepository;
    @Mock private RolePermissionRepository rolePermissionRepository;

    private RoleService service;

    @BeforeEach
    void setUp() {
        service = new RoleService(roleRepository, userRepository, rolePermissionRepository);
    }

    // ── Create ──────────────────────────────────────────────────────────────

    @Test
    void createRejectsInvalidName() {
        assertThrows(RuntimeException.class, () -> service.createRole(role("lower_case", null)));
        assertThrows(RuntimeException.class, () -> service.createRole(role("A", null)));
        assertThrows(RuntimeException.class, () -> service.createRole(role("HAS SPACE", null)));
        verify(roleRepository, never()).save(any());
    }

    @Test
    void createRejectsDuplicateName() {
        when(roleRepository.findByName("REGIONAL")).thenReturn(Optional.of(role("REGIONAL", 5L)));
        assertThrows(RuntimeException.class, () -> service.createRole(role("REGIONAL", null)));
    }

    @Test
    void createAcceptsValidName() {
        when(roleRepository.findByName("REGIONAL_MANAGER")).thenReturn(Optional.empty());
        when(roleRepository.save(any(Role.class))).thenAnswer(inv -> inv.getArgument(0));
        Role created = service.createRole(role("REGIONAL_MANAGER", null));
        assertEquals("REGIONAL_MANAGER", created.getName());
    }

    // ── Update ──────────────────────────────────────────────────────────────

    @Test
    void updateDescriptionOnlyChangesDescription() {
        Role existing = role("SUPERVISOR", 3L);
        when(roleRepository.findById(3L)).thenReturn(Optional.of(existing));
        when(roleRepository.save(any(Role.class))).thenAnswer(inv -> inv.getArgument(0));

        Role updated = service.updateDescription(3L, "POS floor oversight");

        assertEquals("SUPERVISOR", updated.getName());
        assertEquals("POS floor oversight", updated.getDescription());
    }

    // ── Delete ──────────────────────────────────────────────────────────────

    @Test
    void deleteBlocksEverySystemRoleIncludingSupervisor() {
        for (String name : List.of("ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR",
                "SALES", "INVENTORY_MANAGER", "ACCOUNTANT", "HR", "DELIVERY_PERSON")) {
            Role systemRole = role(name, 1L);
            when(roleRepository.findById(1L)).thenReturn(Optional.of(systemRole));
            assertThrows(RuntimeException.class, () -> service.deleteRole(1L),
                    "System role " + name + " must not be deletable");
        }
        verify(roleRepository, never()).delete(any());
    }

    @Test
    void deleteBlocksRoleStillAssignedToActiveUsers() {
        Role custom = role("REGIONAL", 7L);
        when(roleRepository.findById(7L)).thenReturn(Optional.of(custom));
        when(userRepository.findAll()).thenReturn(List.of(activeUserWith(custom)));

        assertThrows(RuntimeException.class, () -> service.deleteRole(7L));
        verify(roleRepository, never()).delete(any());
    }

    @Test
    void deleteRemovesPermissionRowsThenRole() {
        Role custom = role("REGIONAL", 7L);
        when(roleRepository.findById(7L)).thenReturn(Optional.of(custom));
        when(userRepository.findAll()).thenReturn(List.of());
        RolePermission rp = new RolePermission();
        rp.setRole(custom);
        rp.setModule("sales");
        when(rolePermissionRepository.findByRole_Name("REGIONAL")).thenReturn(List.of(rp));

        service.deleteRole(7L);

        verify(rolePermissionRepository).delete(rp);
        verify(roleRepository).delete(custom);
    }

    // ── Fixtures ────────────────────────────────────────────────────────────

    private Role role(String name, Long id) {
        Role role = new Role();
        role.setName(name);
        if (id != null) {
            ReflectionTestUtils.setField(role, "id", id);
        }
        return role;
    }

    private User activeUserWith(Role role) {
        User user = new User();
        user.setActive(true);
        user.getRoles().addAll(Set.of(role));
        return user;
    }
}
