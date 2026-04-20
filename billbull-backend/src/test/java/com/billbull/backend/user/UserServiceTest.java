package com.billbull.backend.user;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeLoginAccessRequest;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.role.Role;
import com.billbull.backend.role.RoleRepository;
import com.billbull.backend.security.AdminSafeguardService;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private RoleRepository roleRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private AdminSafeguardService adminSafeguardService;

    @Mock
    private EmployeeRepository employeeRepository;

    private UserService userService;

    @BeforeEach
    void setUp() {
        userService = new UserService(
                userRepository,
                roleRepository,
                passwordEncoder,
                adminSafeguardService,
                employeeRepository);
    }

    @Test
    void createPendingEmployeeAccessCreatesInactiveLinkedUser() {
        Employee employee = new Employee();
        employee.setId(15L);
        employee.setFirstName("Jane");
        employee.setLastName("Doe");
        employee.setEmail("jane@example.com");
        employee.setPhone("9999999999");

        EmployeeLoginAccessRequest request = new EmployeeLoginAccessRequest();
        request.setCreateAccess(true);
        request.setLoginUsername("jane.login");
        request.setTemporaryPassword("Temp123");
        request.setRoleId(3L);

        Role role = new Role();
        role.setName("HR");

        when(userRepository.findByLinkedEmployee_Id(15L)).thenReturn(Optional.empty());
        when(userRepository.findByUsername("jane.login")).thenReturn(Optional.empty());
        when(roleRepository.findById(3L)).thenReturn(Optional.of(role));
        when(passwordEncoder.encode("Temp123")).thenReturn("encoded-password");

        userService.createPendingEmployeeAccess(employee, request);

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());

        User savedUser = userCaptor.getValue();
        assertEquals("jane.login", savedUser.getUsername());
        assertEquals("encoded-password", savedUser.getPassword());
        assertEquals("Jane Doe", savedUser.getFullName());
        assertEquals("jane@example.com", savedUser.getEmail());
        assertEquals("9999999999", savedUser.getPhone());
        assertFalse(savedUser.isActive());
        assertTrue(savedUser.isPendingEmployeeActivation());
        assertEquals(employee, savedUser.getLinkedEmployee());
        assertTrue(savedUser.getRoles().contains(role));
    }

    @Test
    void createPendingEmployeeAccessRejectsDuplicateUsername() {
        Employee employee = new Employee();
        employee.setId(22L);

        EmployeeLoginAccessRequest request = new EmployeeLoginAccessRequest();
        request.setCreateAccess(true);
        request.setLoginUsername("existing.user");
        request.setTemporaryPassword("Temp123");
        request.setRoleId(4L);

        when(userRepository.findByLinkedEmployee_Id(22L)).thenReturn(Optional.empty());
        when(userRepository.findByUsername("existing.user")).thenReturn(Optional.of(new User()));

        RuntimeException ex = assertThrows(
                RuntimeException.class,
                () -> userService.createPendingEmployeeAccess(employee, request));

        assertEquals("Username already exists: existing.user", ex.getMessage());
    }

    @Test
    void activatePendingEmployeeAccessForEmployeeOnlyActivatesPendingUser() {
        User user = new User();
        user.setActive(false);
        user.setPendingEmployeeActivation(true);

        when(userRepository.findByLinkedEmployee_Id(15L)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        userService.activatePendingEmployeeAccessForEmployee(15L);

        assertTrue(user.isActive());
        assertFalse(user.isPendingEmployeeActivation());
        verify(userRepository).save(user);
    }
}
