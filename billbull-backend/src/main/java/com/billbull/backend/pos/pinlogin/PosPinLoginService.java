package com.billbull.backend.pos.pinlogin;

import com.billbull.backend.auth.LoginResponse;
import com.billbull.backend.auth.LoginResponses;
import com.billbull.backend.config.JwtUtil;
import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.ratelimit.RateLimitExceededException;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Till PIN sign-in. A PIN alone proves little (10,000 values for 4 digits), so it is only
 * accepted together with the token of a till an admin enabled ({@link PosPinDevice}), for an
 * employee who
 * <ul>
 *   <li>is Active, has POS access switched on and has a PIN set, and</li>
 *   <li>has an active BillBull login whose branches include the till's branch.</li>
 * </ul>
 * The session issued is that login's ordinary JWT, so roles, permissions and branch scope are
 * exactly what a password sign-in would give.
 */
@Service
public class PosPinLoginService {

    /** Roles that reach every branch; kept in step with JwtUtil.ALL_BRANCH_ROLES. */
    private static final Set<String> ALL_BRANCH_ROLES = Set.of("ADMIN", "SUPER_ADMIN");
    private static final String WRONG_PIN = "Wrong PIN. Try again.";

    private final PosPinDeviceRepository deviceRepository;
    private final EmployeeRepository employeeRepository;
    private final UserRepository userRepository;
    private final BranchRepository branchRepository;
    private final PosPinPolicy pinPolicy;
    private final PosPinAttemptLimiter limiter;
    private final JwtUtil jwtUtil;
    private final SecureRandom random = new SecureRandom();

    public PosPinLoginService(
            PosPinDeviceRepository deviceRepository,
            EmployeeRepository employeeRepository,
            UserRepository userRepository,
            BranchRepository branchRepository,
            PosPinPolicy pinPolicy,
            PosPinAttemptLimiter limiter,
            JwtUtil jwtUtil) {
        this.deviceRepository = deviceRepository;
        this.employeeRepository = employeeRepository;
        this.userRepository = userRepository;
        this.branchRepository = branchRepository;
        this.pinPolicy = pinPolicy;
        this.limiter = limiter;
        this.jwtUtil = jwtUtil;
    }

    // ------------------------------------------------------------------
    // Enabling / disabling a till (authenticated admin calls)
    // ------------------------------------------------------------------

    /** Enables PIN sign-in on a till. The returned token is shown once and never stored in clear. */
    @Transactional
    public EnrolledDevice enroll(Long branchId, String label, String terminalId, String actor) {
        Branch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown branch."));
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        PosPinDevice device = new PosPinDevice();
        device.setTokenHash(sha256(token));
        device.setBranchId(branch.getId());
        device.setLabel(trimTo(label, 100));
        device.setTerminalId(trimTo(terminalId, 50));
        device.setCreatedBy(actor);
        device.setCreatedAt(LocalDateTime.now());
        device = deviceRepository.save(device);
        return new EnrolledDevice(device.getId(), token, branch.getId(), branch.getName(), device.getLabel());
    }

    @Transactional
    public PosPinDevice revoke(Long deviceId, String actor) {
        PosPinDevice device = deviceRepository.findById(deviceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Till not found."));
        if (!device.isRevoked()) {
            device.setRevokedAt(LocalDateTime.now());
            device.setRevokedBy(actor);
        }
        return device;
    }

    @Transactional(readOnly = true)
    public Optional<PosPinDevice> findDevice(Long deviceId) {
        return deviceRepository.findById(deviceId);
    }

    // ------------------------------------------------------------------
    // Sign-in (public, token-gated)
    // ------------------------------------------------------------------

    /** Who can sign in on this till. 401 when the token is unknown or revoked. */
    @Transactional(readOnly = true)
    public TillStaff staffFor(String deviceToken) {
        PosPinDevice device = requireDevice(deviceToken);
        String branchName = branchRepository.findById(device.getBranchId()).map(Branch::getName).orElse(null);
        List<StaffMember> staff = employeeRepository.findByPosPinHashIsNotNullAndStatus("Active").stream()
                .filter(e -> eligibleUser(e, device.getBranchId()).isPresent())
                .map(StaffMember::of)
                .sorted(Comparator.comparing(StaffMember::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
        return new TillStaff(device.getId(), device.getBranchId(), branchName, device.getLabel(), staff);
    }

    @Transactional
    public PinLoginResult login(String deviceToken, Long employeeId, String pin) {
        PosPinDevice device = requireDevice(deviceToken);
        if (employeeId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose who is signing in.");
        }

        long wait = limiter.secondsUntilAllowed(device.getId(), employeeId);
        if (wait > 0) {
            throw new RateLimitExceededException("pos-pin", wait,
                    "Too many wrong PINs. Try again in " + describeWait(wait) + ", or sign in with your password.");
        }

        Employee employee = employeeRepository.findById(employeeId).orElse(null);
        Optional<User> user = employee == null || !"Active".equals(employee.getStatus())
                ? Optional.empty()
                : eligibleUser(employee, device.getBranchId());

        // Same answer whether the person is ineligible or the PIN is wrong, and the failure is
        // counted either way, so the endpoint can't be used to probe who exists or has a PIN.
        if (user.isEmpty() || !pinPolicy.matches(pin, employee.getPosPinHash())) {
            limiter.recordFailure(device.getId(), employeeId);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, WRONG_PIN);
        }

        limiter.recordSuccess(device.getId(), employeeId);
        if (employee.getPosPinLength() == null) {
            employee.setPosPinLength(pin.trim().length()); // PINs hashed before V134: learn the length now
        }
        device.setLastUsedAt(LocalDateTime.now());

        User signedIn = user.get();
        String token = jwtUtil.generateToken(signedIn, device.getBranchId());
        return new PinLoginResult(LoginResponses.of(signedIn, token), device.getBranchId());
    }

    // ------------------------------------------------------------------

    private PosPinDevice requireDevice(String deviceToken) {
        if (deviceToken == null || deviceToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "PIN sign-in is not enabled on this till.");
        }
        return deviceRepository.findByTokenHashAndRevokedAtIsNull(sha256(deviceToken.trim()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "PIN sign-in is not enabled on this till."));
    }

    /** The employee's active login, if PIN sign-in on a till in {@code branchId} is allowed. */
    Optional<User> eligibleUser(Employee employee, Long branchId) {
        if (!employee.isPosAccessAllowed() || !employee.getHasPosPin()) {
            return Optional.empty();
        }
        return userRepository.findByLinkedEmployee_Id(employee.getId())
                .filter(User::isActive)
                .filter(u -> canAccessBranch(u, branchId));
    }

    static boolean canAccessBranch(User user, Long branchId) {
        if (user.getRoles().stream().anyMatch(r -> ALL_BRANCH_ROLES.contains(r.getName()))) {
            return true;
        }
        if (user.getBranch() != null && branchId.equals(user.getBranch().getId())) {
            return true;
        }
        return user.getAdditionalBranches() != null
                && user.getAdditionalBranches().stream().anyMatch(b -> b != null && branchId.equals(b.getId()));
    }

    static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String describeWait(long seconds) {
        long minutes = (seconds + 59) / 60;
        return seconds < 60 ? seconds + " seconds" : minutes + (minutes == 1 ? " minute" : " minutes");
    }

    private static String trimTo(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
    }

    // ------------------------------------------------------------------

    public record EnrolledDevice(Long deviceId, String token, Long branchId, String branchName, String label) {
    }

    /** pinLength is null when unknown (PIN set before V134 and not used since); the till then waits for Enter. */
    public record StaffMember(Long employeeId, String name, String initials, String role, String avatarUrl,
                              Integer pinLength) {
        static StaffMember of(Employee e) {
            String first = e.getFirstName() == null ? "" : e.getFirstName().trim();
            String last = e.getLastName() == null ? "" : e.getLastName().trim();
            String initials = ((first.isEmpty() ? "" : first.substring(0, 1))
                    + (last.isEmpty() ? "" : last.substring(0, 1))).toUpperCase();
            return new StaffMember(e.getId(), (first + " " + last).trim(), initials, e.getRole(), e.getAvatarUrl(),
                    e.getPosPinLength());
        }
    }

    public record TillStaff(Long deviceId, Long branchId, String branchName, String label, List<StaffMember> staff) {
    }

    public record PinLoginResult(LoginResponse login, Long tillBranchId) {
    }
}
