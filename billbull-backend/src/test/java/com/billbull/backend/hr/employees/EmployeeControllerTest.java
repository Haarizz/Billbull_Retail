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
}
