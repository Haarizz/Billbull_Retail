package com.billbull.backend.hr.employees;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class EmployeeControllerTest {

    @Mock
    private EmployeeService employeeService;

    @Mock
    private AuditLogService auditLogService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ModulePermissionService modulePermissionService;

    private EmployeeController employeeController;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper()
                .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        employeeController = new EmployeeController(
                employeeService,
                objectMapper,
                auditLogService,
                userRepository,
                modulePermissionService);
    }

    @Test
    void createRejectsLoginProvisioningForNonAdmin() throws Exception {
        EmployeeUpsertRequest request = new EmployeeUpsertRequest();
        request.setFirstName("Mary");
        request.setLastName("Jones");

        EmployeeLoginAccessRequest loginAccess = new EmployeeLoginAccessRequest();
        loginAccess.setCreateAccess(true);
        loginAccess.setLoginUsername("mary.jones");
        loginAccess.setTemporaryPassword("Temp123");
        loginAccess.setRoleId(5L);
        request.setLoginAccess(loginAccess);

        Authentication authentication = new UsernamePasswordAuthenticationToken(
                "hr-user",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_HR")));

        assertThrows(
                AccessDeniedException.class,
                () -> employeeController.create(objectMapper.writeValueAsString(request), null, authentication));

        verifyNoInteractions(employeeService);
    }

    @Test
    void updateRejectsLoginProvisioningPayload() throws Exception {
        EmployeeUpsertRequest request = new EmployeeUpsertRequest();
        request.setFirstName("Mary");
        request.setLastName("Jones");

        EmployeeLoginAccessRequest loginAccess = new EmployeeLoginAccessRequest();
        loginAccess.setCreateAccess(true);
        loginAccess.setLoginUsername("mary.jones");
        loginAccess.setTemporaryPassword("Temp123");
        loginAccess.setRoleId(5L);
        request.setLoginAccess(loginAccess);

        assertThrows(
                RuntimeException.class,
                () -> employeeController.update(10L, objectMapper.writeValueAsString(request), null));

        verifyNoInteractions(employeeService);
    }

    // ── /salespersons (POS salesperson picker feed) ─────────────────────────

    private static Employee salesperson(long id, String code, String first, String last, String status) {
        Employee e = new Employee();
        e.setId(id);
        e.setEmployeeCode(code);
        e.setFirstName(first);
        e.setLastName(last);
        e.setPhone("050-1234567");
        e.setEmail(code.toLowerCase() + "@example.test");
        e.setStatus(status);
        return e;
    }

    @Test
    void salespersonsExposesOnlyIdCodeAndNameNoPersonalData() {
        org.mockito.Mockito.when(employeeService.getActiveSalespersons())
                .thenReturn(List.of(salesperson(7L, "EMP-007", "Manager", "One", "Active")));

        java.util.Map<String, Object> body = employeeController.getSalespersons(null);

        @SuppressWarnings("unchecked")
        List<java.util.Map<String, Object>> options = (List<java.util.Map<String, Object>>) body.get("options");
        org.junit.jupiter.api.Assertions.assertEquals(1, options.size());
        // Exactly these three keys: this feed is readable by every authenticated user.
        org.junit.jupiter.api.Assertions.assertEquals(
                java.util.Set.of("id", "employeeCode", "name"), options.get(0).keySet());
        org.junit.jupiter.api.Assertions.assertEquals("Manager One", options.get(0).get("name"));
        org.junit.jupiter.api.Assertions.assertFalse(options.get(0).containsKey("phone"));
        org.junit.jupiter.api.Assertions.assertFalse(options.get(0).containsKey("email"));
    }

    @Test
    void salespersonsDefaultsToTheCallersActiveLinkedEmployee() {
        Employee linked = salesperson(7L, "EMP-007", "Manager", "One", "Active");
        org.mockito.Mockito.when(employeeService.getActiveSalespersons()).thenReturn(List.of(linked));
        org.mockito.Mockito.when(userRepository.findLinkedEmployeeIdByUsername("cashier1"))
                .thenReturn(java.util.Optional.of(7L));

        java.util.Map<String, Object> body = employeeController.getSalespersons(
                new UsernamePasswordAuthenticationToken("cashier1", null, List.of()));

        org.junit.jupiter.api.Assertions.assertEquals(7L, body.get("defaultEmployeeId"));
    }

    @Test
    void salespersonsHasNoDefaultWhenTheCallerHasNoLinkedEmployee() {
        org.mockito.Mockito.when(employeeService.getActiveSalespersons())
                .thenReturn(List.of(salesperson(7L, "EMP-007", "Manager", "One", "Active")));
        org.mockito.Mockito.when(userRepository.findLinkedEmployeeIdByUsername("backoffice"))
                .thenReturn(java.util.Optional.empty());

        java.util.Map<String, Object> body = employeeController.getSalespersons(
                new UsernamePasswordAuthenticationToken("backoffice", null, List.of()));

        org.junit.jupiter.api.Assertions.assertNull(body.get("defaultEmployeeId"));
        org.mockito.Mockito.verify(userRepository, org.mockito.Mockito.never()).findByUsername(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void salespersonsHasNoDefaultWhenTheLinkedEmployeeIsInactive() {
        // Linked to employee 9, who is Inactive and therefore not in the Active roster.
        org.mockito.Mockito.when(employeeService.getActiveSalespersons())
                .thenReturn(List.of(salesperson(7L, "EMP-007", "Manager", "One", "Active")));
        org.mockito.Mockito.when(userRepository.findLinkedEmployeeIdByUsername("cashier2"))
                .thenReturn(java.util.Optional.of(9L));

        java.util.Map<String, Object> body = employeeController.getSalespersons(
                new UsernamePasswordAuthenticationToken("cashier2", null, List.of()));

        org.junit.jupiter.api.Assertions.assertNull(body.get("defaultEmployeeId"));
    }
}
