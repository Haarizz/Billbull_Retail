package com.billbull.backend.pos.pinlogin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.billbull.backend.config.JwtUtil;
import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.ratelimit.RateLimitExceededException;
import com.billbull.backend.role.Role;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class PosPinLoginServiceTest {

    private static final String DEVICE_TOKEN = "till-token";
    private static final long TILL_BRANCH = 1L;

    @Mock private PosPinDeviceRepository deviceRepository;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private UserRepository userRepository;
    @Mock private BranchRepository branchRepository;
    @Mock private JwtUtil jwtUtil;
    @Mock private PosSessionRepository sessionRepository;

    private final PosPinPolicy policy = new PosPinPolicy(new BCryptPasswordEncoder(4));
    private PosPinAttemptLimiter limiter;
    private PosPinLoginService service;
    private PosPinDevice device;

    @BeforeEach
    void setUp() {
        limiter = new PosPinAttemptLimiter();
        service = new PosPinLoginService(deviceRepository, employeeRepository, userRepository,
                branchRepository, policy, limiter, jwtUtil, sessionRepository);
        device = device(7L, TILL_BRANCH);
        lenient().when(deviceRepository.findByTokenHashAndRevokedAtIsNull(PosPinLoginService.sha256(DEVICE_TOKEN)))
                .thenReturn(Optional.of(device));
        lenient().when(branchRepository.findById(TILL_BRANCH)).thenReturn(Optional.of(branch(TILL_BRANCH, "Dubai Mall")));
        lenient().when(jwtUtil.generateToken(any(User.class), anyLong())).thenReturn("jwt");
    }

    @Test
    void listsOnlyStaffWhoCanUseThisTill() {
        Employee cashier = employee(10L, "Aisha", "Khan", "2580");
        Employee noPosAccess = employee(11L, "Bilal", "Noor", "2580");
        noPosAccess.setPosAccess(false);
        Employee otherBranch = employee(12L, "Chen", "Li", "2580");
        Employee noLogin = employee(13L, "Dana", "Ray", "2580");
        Employee admin = employee(14L, "Omar", "Admin", "2580");
        when(employeeRepository.findByPosPinHashIsNotNullAndStatus("Active"))
                .thenReturn(List.of(otherBranch, cashier, noPosAccess, noLogin, admin));
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user("aisha", TILL_BRANCH, "CASHIER")));
        when(userRepository.findByLinkedEmployee_Id(12L)).thenReturn(Optional.of(user("chen", 2L, "CASHIER")));
        when(userRepository.findByLinkedEmployee_Id(13L)).thenReturn(Optional.empty());
        when(userRepository.findByLinkedEmployee_Id(14L)).thenReturn(Optional.of(user("omar", 9L, "ADMIN")));

        PosPinLoginService.TillStaff result = service.staffFor(DEVICE_TOKEN);

        assertEquals("Dubai Mall", result.branchName());
        assertEquals(List.of("Aisha Khan", "Omar Admin"),
                result.staff().stream().map(PosPinLoginService.StaffMember::name).toList());
        assertEquals("AK", result.staff().get(0).initials());
        assertEquals(4, result.staff().get(0).pinLength());
    }

    @Test
    void listsTheEmployeeCodeAndNoOpenSessionWhenTheTillHasNone() {
        Employee cashier = employee(10L, "Aisha", "Khan", "2580");
        cashier.setEmployeeCode("EMP-010");
        when(employeeRepository.findByPosPinHashIsNotNullAndStatus("Active")).thenReturn(List.of(cashier));
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user("aisha", TILL_BRANCH, "CASHIER")));

        PosPinLoginService.TillStaff result = service.staffFor(DEVICE_TOKEN, null);

        assertEquals("EMP-010", result.staff().get(0).employeeCode());
        assertNull(result.openSession());
        verify(sessionRepository, never()).findByBranchIdAndTerminalIdAndStatus(any(), any(), any());
    }

    @Test
    void namesWhoseDrawerIsOpenOnTheEnrolledTerminal() {
        device.setTerminalId("T-01");
        Employee aisha = employee(10L, "Aisha", "Khan", "2580");
        Employee bilal = employee(11L, "Bilal", "Noor", "2580");
        when(employeeRepository.findByPosPinHashIsNotNullAndStatus("Active")).thenReturn(List.of(aisha, bilal));
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user(20L, "aisha", TILL_BRANCH, "CASHIER")));
        when(userRepository.findByLinkedEmployee_Id(11L)).thenReturn(Optional.of(user(21L, "bilal", TILL_BRANCH, "CASHIER")));
        PosSession open = session(21L, "bilal", LocalDateTime.of(2026, 11, 6, 8, 15));
        when(sessionRepository.findByBranchIdAndTerminalIdAndStatus(TILL_BRANCH, "T-01", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(open));

        // The till's enrolled terminal wins over whatever the browser says.
        PosPinLoginService.TillStaff result = service.staffFor(DEVICE_TOKEN, "T-99");

        assertEquals(11L, result.openSession().employeeId());
        assertEquals(LocalDateTime.of(2026, 11, 6, 8, 15), result.openSession().openedAt());
    }

    @Test
    void aTillEnrolledWithoutATerminalUsesTheOneItReportsWithinItsOwnBranch() {
        Employee aisha = employee(10L, "Aisha", "Khan", "2580");
        when(employeeRepository.findByPosPinHashIsNotNullAndStatus("Active")).thenReturn(List.of(aisha));
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user(20L, "aisha", TILL_BRANCH, "CASHIER")));
        // A session opened before owner ids were stored: matched on the username.
        PosSession legacy = session(null, "AISHA", LocalDateTime.of(2026, 11, 6, 9, 0));
        when(sessionRepository.findByBranchIdAndTerminalIdAndStatus(TILL_BRANCH, "T-02", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(legacy));

        assertEquals(10L, service.staffFor(DEVICE_TOKEN, " T-02 ").openSession().employeeId());
    }

    @Test
    void anOpenDrawerOwnedBySomeoneNotOnTheListIsNotShown() {
        device.setTerminalId("T-01");
        Employee aisha = employee(10L, "Aisha", "Khan", "2580");
        when(employeeRepository.findByPosPinHashIsNotNullAndStatus("Active")).thenReturn(List.of(aisha));
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user(20L, "aisha", TILL_BRANCH, "CASHIER")));
        when(sessionRepository.findByBranchIdAndTerminalIdAndStatus(TILL_BRANCH, "T-01", PosSessionStatus.OPEN))
                .thenReturn(Optional.of(session(99L, "someone", LocalDateTime.now())));

        assertNull(service.staffFor(DEVICE_TOKEN, null).openSession());
    }

    @Test
    void aFailingSessionLookupNeverBlocksTheStaffList() {
        device.setTerminalId("T-01");
        Employee aisha = employee(10L, "Aisha", "Khan", "2580");
        when(employeeRepository.findByPosPinHashIsNotNullAndStatus("Active")).thenReturn(List.of(aisha));
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user(20L, "aisha", TILL_BRANCH, "CASHIER")));
        when(sessionRepository.findByBranchIdAndTerminalIdAndStatus(any(), any(), any()))
                .thenThrow(new IllegalStateException("two open sessions"));

        PosPinLoginService.TillStaff result = service.staffFor(DEVICE_TOKEN, null);

        assertEquals(1, result.staff().size());
        assertNull(result.openSession());
    }

    @Test
    void anUnknownOrRevokedTillIsRejected() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.staffFor("nope"));
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
        assertThrows(ResponseStatusException.class, () -> service.login(null, 10L, "2580"));
    }

    @Test
    void theRightPinSignsInOnTheTillsBranch() {
        Employee cashier = employee(10L, "Aisha", "Khan", "2580");
        User aisha = user("aisha", TILL_BRANCH, "CASHIER");
        when(employeeRepository.findById(10L)).thenReturn(Optional.of(cashier));
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(aisha));

        PosPinLoginService.PinLoginResult result = service.login(DEVICE_TOKEN, 10L, "2580");

        assertEquals("jwt", result.login().getToken());
        assertEquals("aisha", result.login().getUsername());
        assertEquals(TILL_BRANCH, result.tillBranchId());
        verify(jwtUtil).generateToken(aisha, TILL_BRANCH);
        assertNotNull(device.getLastUsedAt());
    }

    @Test
    void aPinSetBeforeTheLengthWasStoredLearnsItOnTheNextSignIn() {
        Employee cashier = employee(10L, "Aisha", "Khan", "258013");
        cashier.setPosPinLength(null);
        when(employeeRepository.findById(10L)).thenReturn(Optional.of(cashier));
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user("aisha", TILL_BRANCH, "CASHIER")));

        assertThrows(ResponseStatusException.class, () -> service.login(DEVICE_TOKEN, 10L, "2580"));
        assertEquals(null, cashier.getPosPinLength()); // a wrong PIN teaches nothing

        service.login(DEVICE_TOKEN, 10L, "258013");
        assertEquals(6, cashier.getPosPinLength());
    }

    @Test
    void aWrongPinAndAnIneligibleEmployeeGetTheSameAnswer() {
        Employee cashier = employee(10L, "Aisha", "Khan", "2580");
        Employee blocked = employee(11L, "Bilal", "Noor", "2580");
        blocked.setPosAccess(false);
        when(employeeRepository.findById(10L)).thenReturn(Optional.of(cashier));
        when(employeeRepository.findById(11L)).thenReturn(Optional.of(blocked));
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user("aisha", TILL_BRANCH, "CASHIER")));

        ResponseStatusException wrong = assertThrows(ResponseStatusException.class,
                () -> service.login(DEVICE_TOKEN, 10L, "9999"));
        ResponseStatusException ineligible = assertThrows(ResponseStatusException.class,
                () -> service.login(DEVICE_TOKEN, 11L, "2580"));

        assertEquals(HttpStatus.UNAUTHORIZED, wrong.getStatusCode());
        assertEquals(wrong.getReason(), ineligible.getReason());
        verify(jwtUtil, never()).generateToken(any(User.class), anyLong());
    }

    @Test
    void fiveWrongPinsLockEvenTheRightPin() {
        when(employeeRepository.findById(10L)).thenReturn(Optional.of(employee(10L, "Aisha", "Khan", "2580")));
        when(userRepository.findByLinkedEmployee_Id(10L)).thenReturn(Optional.of(user("aisha", TILL_BRANCH, "CASHIER")));
        for (int i = 0; i < PosPinAttemptLimiter.EMPLOYEE_MAX_FAILURES; i++) {
            assertThrows(ResponseStatusException.class, () -> service.login(DEVICE_TOKEN, 10L, "9999"));
        }

        RateLimitExceededException locked = assertThrows(RateLimitExceededException.class,
                () -> service.login(DEVICE_TOKEN, 10L, "2580"));
        assertNotEquals(0, locked.getRetryAfterSeconds());
    }

    @Test
    void enrollingStoresOnlyTheTokenHash() {
        when(deviceRepository.save(any(PosPinDevice.class))).thenAnswer(inv -> {
            PosPinDevice d = inv.getArgument(0);
            d.setId(42L);
            return d;
        });

        PosPinLoginService.EnrolledDevice enrolled = service.enroll(TILL_BRANCH, " Front till ", "T-01", "admin");

        ArgumentCaptor<PosPinDevice> saved = ArgumentCaptor.forClass(PosPinDevice.class);
        verify(deviceRepository).save(saved.capture());
        assertEquals(PosPinLoginService.sha256(enrolled.token()), saved.getValue().getTokenHash());
        assertNotEquals(enrolled.token(), saved.getValue().getTokenHash());
        assertEquals("Front till", enrolled.label());
        assertEquals(42L, enrolled.deviceId());
        assertEquals(43, enrolled.token().length(), "32 random bytes, base64url");
    }

    @Test
    void revokingStampsTheDeviceOnce() {
        when(deviceRepository.findById(7L)).thenReturn(Optional.of(device));
        service.revoke(7L, "admin");
        var first = device.getRevokedAt();
        service.revoke(7L, "someone-else");

        assertEquals(first, device.getRevokedAt());
        assertEquals("admin", device.getRevokedBy());
    }

    // ---- fixtures ----------------------------------------------------------

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
        u.setBranch(branch(branchId, "B" + branchId));
        Role role = new Role();
        role.setName(roleName);
        u.setRoles(Set.of(role));
        return u;
    }

    private static User user(Long id, String username, Long branchId, String roleName) {
        User u = user(username, branchId, roleName);
        ReflectionTestUtils.setField(u, "id", id);
        return u;
    }

    private static PosSession session(Long ownerUserId, String openedBy, LocalDateTime openedAt) {
        PosSession s = new PosSession();
        s.setOwnerUserId(ownerUserId);
        s.setOpenedBy(openedBy);
        s.setOpenedAt(openedAt);
        s.setStatus(PosSessionStatus.OPEN);
        return s;
    }

    private static Branch branch(Long id, String name) {
        Branch b = new Branch();
        b.setId(id);
        b.setName(name);
        return b;
    }

    private static PosPinDevice device(Long id, Long branchId) {
        PosPinDevice d = new PosPinDevice();
        d.setId(id);
        d.setBranchId(branchId);
        d.setTokenHash(PosPinLoginService.sha256(DEVICE_TOKEN));
        return d;
    }
}
