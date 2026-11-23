package com.billbull.backend.pos.pinlogin;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.user.User;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Supervisor approval with the approver's own till PIN (Approval Credential = Personal PIN).
 *
 * <p>The approver is chosen first (a PIN alone is not unique enough to say who it is), then their
 * PIN is checked. Eligibility is exactly PIN sign-in's — Active employee, POS access on, PIN set,
 * an active login that reaches the branch — so a person who could not sign in to this till cannot
 * approve on it either. Whether the person may approve <i>this</i> action (supervisor role,
 * session owner, …) stays with each caller, which receives the verified {@link User}.
 *
 * <p>Wrong PINs share {@link PosPinAttemptLimiter}'s limits under a per-branch approval scope:
 * 5 wrong for one approver locks that approver for 5 minutes, 20 wrong across the branch lock
 * approvals by PIN there for 15 minutes.
 */
@Service
public class PosApproverPinService {

    /** Kept in step with PosSessionAuthorizationService and PosSettingsService. */
    public static final Set<String> SUPERVISOR_ROLES = Set.of("ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR");

    private final EmployeeRepository employeeRepository;
    private final PosPinLoginService pinLoginService;
    private final PosPinPolicy pinPolicy;
    private final PosPinAttemptLimiter limiter;

    public PosApproverPinService(EmployeeRepository employeeRepository,
                                 PosPinLoginService pinLoginService,
                                 PosPinPolicy pinPolicy,
                                 PosPinAttemptLimiter limiter) {
        this.employeeRepository = employeeRepository;
        this.pinLoginService = pinLoginService;
        this.pinPolicy = pinPolicy;
        this.limiter = limiter;
    }

    /** People who can approve with their PIN at {@code branchId}: eligible for PIN sign-in there and a supervisor role. */
    @Transactional(readOnly = true)
    public List<PosPinLoginService.StaffMember> approversFor(Long branchId) {
        if (branchId == null) {
            return List.of();
        }
        return employeeRepository.findByPosPinHashIsNotNullAndStatus("Active").stream()
                .filter(e -> pinLoginService.eligibleUser(e, branchId).filter(PosApproverPinService::isSupervisor).isPresent())
                .map(PosPinLoginService.StaffMember::of)
                .sorted(Comparator.comparing(PosPinLoginService.StaffMember::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /**
     * Checks {@code employeeId}'s PIN for an approval at {@code branchId}. Ineligible and wrong
     * PIN give the same answer and both count against the limits, so this cannot be used to
     * probe who exists or has a PIN.
     */
    @Transactional(readOnly = true)
    public Result verify(Long branchId, Long employeeId, String pin) {
        if (branchId == null) {
            return Result.denied("No branch is selected.");
        }
        if (employeeId == null) {
            return Result.denied("Choose who is approving.");
        }
        if (pin == null || pin.isBlank()) {
            return Result.denied("Enter the PIN.");
        }
        String scope = "approval:b" + branchId;
        long wait = limiter.secondsUntilAllowed(scope, employeeId);
        if (wait > 0) {
            return Result.denied("Too many wrong PINs. Try again in " + describeWait(wait) + ".");
        }
        Employee employee = employeeRepository.findById(employeeId).orElse(null);
        Optional<User> user = employee == null || !"Active".equals(employee.getStatus())
                ? Optional.empty()
                : pinLoginService.eligibleUser(employee, branchId);
        if (user.isEmpty() || !pinPolicy.matches(pin.trim(), employee.getPosPinHash())) {
            limiter.recordFailure(scope, employeeId);
            return Result.denied("Wrong PIN. Try again.");
        }
        limiter.recordSuccess(scope, employeeId);
        return new Result(user.get(), null);
    }

    public static boolean isSupervisor(User user) {
        return user != null && user.getRoles() != null
                && user.getRoles().stream().anyMatch(r -> SUPERVISOR_ROLES.contains(r.getName()));
    }

    private static String describeWait(long seconds) {
        long minutes = (seconds + 59) / 60;
        return seconds < 60 ? seconds + " seconds" : minutes + (minutes == 1 ? " minute" : " minutes");
    }

    /** {@code user} is set only when the PIN was right; {@code message} only when it was not. */
    public record Result(User user, String message) {
        static Result denied(String message) {
            return new Result(null, message);
        }

        public boolean valid() {
            return user != null;
        }
    }
}
