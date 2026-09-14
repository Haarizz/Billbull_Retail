package com.billbull.backend.hr.employees;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
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

    @Mock
    private com.billbull.backend.settings.branch.BranchRepository branchRepository;

    private EmployeeServiceImpl employeeService;

    @BeforeEach
    void setUp() {
        employeeService = new EmployeeServiceImpl(
                repository,
                userRepository,
                adminSafeguardService,
                userService,
                branchRepository);
    }

    @Test
    void createEmployeeProvisioningCreatesPendingLinkedAccess() {
        EmployeeUpsertRequest request = new EmployeeUpsertRequest();
        request.setFirstName("John");
        request.setLastName("Smith");
        request.setEmployeeCode("EMP-0031");
        request.setPhone("+971500000000");
        request.setEmail("john.smith@example.com");

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
    void createEmployeeRejectsMissingRequiredFieldsByName() {
        EmployeeUpsertRequest request = new EmployeeUpsertRequest();
        request.setFirstName("John");

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> employeeService.createEmployee(request, null));

        assertEquals(
                "Required fields are missing: Employee Code, Last Name, Phone, Email.",
                ex.getMessage());
        verify(repository, never()).save(any(Employee.class));
    }

    @Test
    void createEmployeeRejectsFutureDateOfBirth() {
        EmployeeUpsertRequest request = validCreateRequest();
        request.setDateOfBirth(java.time.LocalDate.now().plusYears(24));

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> employeeService.createEmployee(request, null));

        assertEquals("Date of Birth cannot be in the future.", ex.getMessage());
        verify(repository, never()).save(any(Employee.class));
    }

    @Test
    void createEmployeeRejectsImplausiblyOldDateOfBirth() {
        EmployeeUpsertRequest request = validCreateRequest();
        request.setDateOfBirth(java.time.LocalDate.now().minusYears(120));

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> employeeService.createEmployee(request, null));

        assertEquals("Date of Birth cannot be more than 100 years ago.", ex.getMessage());
        verify(repository, never()).save(any(Employee.class));
    }

    @Test
    void createEmployeeRejectsUnderageDateOfBirth() {
        EmployeeUpsertRequest request = validCreateRequest();
        request.setDateOfBirth(java.time.LocalDate.now().minusYears(15));

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> employeeService.createEmployee(request, null));

        assertEquals("Date of Birth must make the employee at least 18 years old.", ex.getMessage());
        verify(repository, never()).save(any(Employee.class));
    }

    private EmployeeUpsertRequest validCreateRequest() {
        EmployeeUpsertRequest request = new EmployeeUpsertRequest();
        request.setEmployeeCode("EMP1234");
        request.setFirstName("John");
        request.setLastName("Smith");
        request.setPhone("+971500000000");
        request.setEmail("john.smith@example.com");
        return request;
    }

    @Test
    void createEmployeeRejectsDuplicateEmployeeCode() {
        EmployeeUpsertRequest request = new EmployeeUpsertRequest();
        request.setEmployeeCode("EMP1234");
        request.setFirstName("John");
        request.setLastName("Smith");
        request.setPhone("+971500000000");
        request.setEmail("john.smith@example.com");

        Employee existing = new Employee();
        existing.setId(9L);
        existing.setFirstName("Jane");
        existing.setLastName("Doe");
        when(repository.findByEmployeeCodeIgnoreCase("EMP1234")).thenReturn(Optional.of(existing));

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> employeeService.createEmployee(request, null));

        assertTrue(ex.getMessage().contains("EMP1234"), ex.getMessage());
        assertTrue(ex.getMessage().contains("Jane Doe"), ex.getMessage());
        verify(repository, never()).save(any(Employee.class));
    }

    @Test
    void approveAdvancesOneStagePerCall() {
        Employee employee = new Employee();
        employee.setId(7L);
        employee.setStatus("Pending");
        employee.setWorkflowStage("HR Review");

        when(repository.findById(7L)).thenReturn(Optional.of(employee));
        when(repository.save(any(Employee.class))).thenAnswer(invocation -> invocation.getArgument(0));

        assertEquals("Manager Approval", employeeService.approve(7L).getWorkflowStage());
        assertEquals("Accounts Approval", employeeService.approve(7L).getWorkflowStage());

        Employee finalState = employeeService.approve(7L);
        assertEquals("Completed", finalState.getWorkflowStage());
        assertEquals("Active", finalState.getStatus());
        verify(userService).activatePendingEmployeeAccessForEmployee(7L);
    }

    @Test
    void approveRejectsAnEmployeeThatIsNoLongerPending() {
        Employee employee = new Employee();
        employee.setId(8L);
        employee.setStatus("Active");
        employee.setWorkflowStage("Completed");

        when(repository.findById(8L)).thenReturn(Optional.of(employee));

        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> employeeService.approve(8L));

        assertTrue(ex.getMessage().contains("no longer awaiting approval"), ex.getMessage());
        verify(repository, never()).save(any(Employee.class));
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
