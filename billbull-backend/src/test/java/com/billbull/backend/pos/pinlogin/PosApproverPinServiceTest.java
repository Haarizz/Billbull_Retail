package com.billbull.backend.pos.pinlogin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.billbull.backend.config.JwtUtil;
import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.role.Role;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@ExtendWith(MockitoExtension.class)
class PosApproverPinServiceTest {

    private static final long BRANCH = 1L;

    @Mock private PosPinDeviceRepository deviceRepository;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private UserRepository userRepository;
    @Mock private BranchRepository branchRepository;
    @Mock private JwtUtil jwtUtil;
    @Mock private PosSessionRepository sessionRepository;

    private final PosPinPolicy policy = new PosPinPolicy(new BCryptPasswordEncoder(4));
    private PosApproverPinService service;

    @BeforeEach
    void setUp() {
        PosPinAttemptLimiter limiter = new PosPinAttemptLimiter();
        PosPinLoginService pinLogin = new PosPinLoginService(deviceRepository, employeeRepository, userRepository,
                branchRepository, policy, limiter, jwtUtil, sessionRepository);
        service = new PosApproverPinService(employeeRepository, pinLogin, policy, limiter);
    }

    @Test
    void listsOnlySupervisorsWhoCouldSignInAtTheBranch() {
        Employee supervisor = employee(10L, "Sam", "Lee", "2580");
        Employee cashier = employee(11L, "Aisha", "Khan", "3691");
        Employee otherBranchManager = employee(12L, "Chen", "Li", "4702");
        Employee admin = employee(13L, "Omar", "Admin", "5813");
        when(employeeRepository.findByPosPinHashIsNotNullAndStatus("Active"))
                .thenReturn(List.of(supervisor, cashier, otherBranchManager, admin));
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user("sam", BRANCH, "SUPERVISOR")));
        when(userRepository.findByLinkedEmployee_Id(11L)).thenReturn(Optional.of(user("aisha", BRANCH, "CASHIER")));
        when(userRepository.findByLinkedEmployee_Id(12L)).thenReturn(Optional.of(user("chen", 2L, "MANAGER")));
        when(userRepository.findByLinkedEmployee_Id(13L)).thenReturn(Optional.of(user("omar", 9L, "ADMIN")));

        List<String> names = service.approversFor(BRANCH).stream().map(PosPinLoginService.StaffMember::name).toList();

        // Admin reaches every branch; the cashier is no supervisor; Chen's login is elsewhere.
        assertEquals(List.of("Omar Admin", "Sam Lee"), names);
    }

    @Test
    void rightPinReturnsTheLinkedUser() {
        Employee supervisor = employee(10L, "Sam", "Lee", "2580");
        when(employeeRepository.findById(10L)).thenReturn(Optional.of(supervisor));
        User sam = user("sam", BRANCH, "SUPERVISOR");
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(sam));

        PosApproverPinService.Result result = service.verify(BRANCH, 10L, "2580");

        assertTrue(result.valid());
        assertEquals(sam, result.user());
        assertNull(result.message());
    }

    @Test
    void wrongPinAndIneligiblePersonGetTheSameAnswer() {
        Employee supervisor = employee(10L, "Sam", "Lee", "2580");
        Employee noPosAccess = employee(11L, "Bilal", "Noor", "3691");
        noPosAccess.setPosAccess(false);
        when(employeeRepository.findById(10L)).thenReturn(Optional.of(supervisor));
        when(employeeRepository.findById(11L)).thenReturn(Optional.of(noPosAccess));
        lenient().when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user("sam", BRANCH, "SUPERVISOR")));

        PosApproverPinService.Result wrong = service.verify(BRANCH, 10L, "9999");
        PosApproverPinService.Result ineligible = service.verify(BRANCH, 11L, "3691");

        assertFalse(wrong.valid());
        assertEquals("Wrong PIN. Try again.", wrong.message());
        assertEquals(wrong.message(), ineligible.message());
    }

    @Test
    void fiveWrongPinsLockThatApproverEvenForTheRightPin() {
        Employee supervisor = employee(10L, "Sam", "Lee", "2580");
        lenient().when(employeeRepository.findById(10L)).thenReturn(Optional.of(supervisor));
        lenient().when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user("sam", BRANCH, "SUPERVISOR")));

        for (int i = 0; i < 5; i++) {
            assertFalse(service.verify(BRANCH, 10L, "0000").valid());
        }
        PosApproverPinService.Result locked = service.verify(BRANCH, 10L, "2580");

        assertFalse(locked.valid());
        assertTrue(locked.message().startsWith("Too many wrong PINs."), locked.message());
        // Another branch is a separate scope.
        lenient().when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user("sam", 2L, "SUPERVISOR")));
        assertTrue(service.verify(2L, 10L, "2580").valid());
    }

    @Test
    void missingInputsAreRefusedWithoutCountingAgainstAnyone() {
        assertEquals("Choose who is approving.", service.verify(BRANCH, null, "2580").message());
        assertEquals("Enter the PIN.", service.verify(BRANCH, 10L, " ").message());
        assertEquals("No branch is selected.", service.verify(null, 10L, "2580").message());
    }

    private Employee employee(Long id, String first, String last, String pin) {
        Employee e = new Employee();
        e.setId(id);
        e.setFirstName(first);
        e.setLastName(last);
        e.setStatus("Active");
        e.setPosAccess(true);
        e.setPosPinHash(policy.hash(pin));
        e.setPosPinLength(pin.length());
        return e;
    }

    private static User user(String username, Long branchId, String roleName) {
        User u = new User();
        u.setUsername(username);
        u.setActive(true);
        Branch b = new Branch();
        b.setId(branchId);
        u.setBranch(b);
        Role role = new Role();
        role.setName(roleName);
        u.setRoles(Set.of(role));
        return u;
    }
}
