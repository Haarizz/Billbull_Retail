package com.billbull.backend.hr.employees;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.security.AdminSafeguardService;
import com.billbull.backend.user.UserRepository;
import com.billbull.backend.user.UserService;

@ExtendWith(MockitoExtension.class)
class EmployeeServiceImplTest {

    @Mock
    private EmployeeRepository repository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private AdminSafeguardService adminSafeguardService;

    @Mock
    private UserService userService;

    private EmployeeServiceImpl employeeService;

    @BeforeEach
    void setUp() {
        employeeService = new EmployeeServiceImpl(
                repository,
                userRepository,
                adminSafeguardService,
                userService);
    }

    @Test
    void createEmployeeProvisioningCreatesPendingLinkedAccess() {
        EmployeeUpsertRequest request = new EmployeeUpsertRequest();
        request.setFirstName("John");
        request.setLastName("Smith");

        EmployeeLoginAccessRequest loginAccessRequest = new EmployeeLoginAccessRequest();
        loginAccessRequest.setCreateAccess(true);
        loginAccessRequest.setLoginUsername("john.smith");
        loginAccessRequest.setTemporaryPassword("Temp123");
        loginAccessRequest.setRoleId(2L);
        request.setLoginAccess(loginAccessRequest);

        when(repository.save(any(Employee.class))).thenAnswer(invocation -> {
            Employee employee = invocation.getArgument(0);
            employee.setId(31L);
            return employee;
        });

        employeeService.createEmployee(request, null);

        ArgumentCaptor<Employee> employeeCaptor = ArgumentCaptor.forClass(Employee.class);
        verify(repository).save(employeeCaptor.capture());
        verify(userService).createPendingEmployeeAccess(any(Employee.class), eq(loginAccessRequest));

        Employee savedEmployee = employeeCaptor.getValue();
        assertEquals("Pending", savedEmployee.getStatus());
        assertEquals("HR Review", savedEmployee.getWorkflowStage());
    }

    @Test
    void activateEmployeeActivatesProvisionedAccessOnceEmployeeIsActive() {
        Employee employee = new Employee();
        employee.setId(42L);
        employee.setStatus("Inactive");
        employee.setWorkflowStage("Deactivated");

        when(repository.findById(42L)).thenReturn(Optional.of(employee));
        when(repository.save(any(Employee.class))).thenAnswer(invocation -> invocation.getArgument(0));

        employeeService.activateEmployee(42L);

        assertEquals("Active", employee.getStatus());
        assertEquals("Completed", employee.getWorkflowStage());
        verify(userService).activatePendingEmployeeAccessForEmployee(42L);
    }

    @Test
    void approveFinalStepActivatesProvisionedAccess() {
        Employee employee = new Employee();
        employee.setId(57L);
        employee.setStatus("Pending");
        employee.setWorkflowStage("Accounts Approval");

        when(repository.findById(57L)).thenReturn(Optional.of(employee));
        when(repository.save(any(Employee.class))).thenAnswer(invocation -> invocation.getArgument(0));

        employeeService.approve(57L);

        assertEquals("Active", employee.getStatus());
        assertEquals("Completed", employee.getWorkflowStage());
        verify(userService).activatePendingEmployeeAccessForEmployee(57L);
    }
}
