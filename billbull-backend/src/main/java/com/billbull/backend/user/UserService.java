package com.billbull.backend.user;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeLoginAccessRequest;
import com.billbull.backend.hr.employees.EmployeeRepository;
import com.billbull.backend.role.Role;
import com.billbull.backend.role.RoleRepository;
import com.billbull.backend.security.AdminSafeguardService;
import com.billbull.backend.security.accessaudit.AccessAuditAction;
import com.billbull.backend.security.accessaudit.AccessAuditService;
import org.springframework.beans.factory.annotation.Autowired;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.HashSet;
import java.util.stream.Stream;
import java.util.stream.Collectors;

/**
 * Service for user management operations.
 * All public methods return UserSafeDto — never exposes password.
 */
@Service
public class UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final AdminSafeguardService adminSafeguardService;
    private final EmployeeRepository employeeRepository;
    private final BranchRepository branchRepository;

    public UserService(
            UserRepository userRepository,
            RoleRepository roleRepository,
            PasswordEncoder passwordEncoder,
            AdminSafeguardService adminSafeguardService,
            EmployeeRepository employeeRepository,
            BranchRepository branchRepository) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminSafeguardService = adminSafeguardService;
        this.employeeRepository = employeeRepository;
        this.branchRepository = branchRepository;
    }

    /** Access-control audit ledger (setter-injected; constructor call sites unchanged). */
    private AccessAuditService accessAudit;

    @Autowired
    public void setAccessAuditService(AccessAuditService accessAudit) {
        this.accessAudit = accessAudit;
    }

    /** Plan limits from the control plane (setter-injected; constructor call sites unchanged). */
    private com.billbull.backend.platform.PlatformStateService platformState;

    @Autowired(required = false)
    public void setPlatformStateService(com.billbull.backend.platform.PlatformStateService platformState) {
        this.platformState = platformState;
    }

    /** 409 when one more active user would exceed the plan's maxUsers. */
    private void assertUserSeatAvailable() {
        if (platformState == null) return;
        platformState.assertWithinLimit(com.billbull.backend.platform.PlatformState.LIMIT_USERS,
                userRepository.countByIsActiveTrue(), "active users");
    }

    /**
     * Get all users as safe DTOs.
     */
    @Transactional(readOnly = true)
    public List<UserSafeDto> getAllUsers() {
        // ARCHFIX §1.6: keep the session open while UserSafeDto reads the LAZY user.branch (and the
        // roles/additionalBranches collections) — building the DTO outside a txn threw
        // LazyInitializationException on branch (a pre-existing bug, surfaced while auditing fetch).
        return userRepository.findAll().stream()
                .map(UserSafeDto::new)
                .collect(Collectors.toList());
    }

    /**
     * Get user by ID as safe DTO.
     */
    @Transactional(readOnly = true)
    public UserSafeDto getUserById(Long id) {
        User user = findUserById(id);
        return new UserSafeDto(user);
    }

    /**
     * Get user entity by username (internal use only).
     */
    public User getUserByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found with username: " + username));
    }

    /**
     * Get linked user for an employee.
     */
    public Optional<UserSafeDto> getLinkedUserByEmployeeId(Long employeeId) {
        return userRepository.findByLinkedEmployee_Id(employeeId)
                .map(UserSafeDto::new);
    }

    /**
     * Create new user with optional employee linkage.
     */
    @Transactional
    public UserSafeDto createUser(UserCreateRequest request) {
        validateUsernameAvailable(request.getUsername());
        assertUserSeatAvailable();

        Employee linkedEmployee = null;
        if (request.getLinkedEmployeeId() != null) {
            linkedEmployee = employeeRepository.findById(request.getLinkedEmployeeId())
                    .orElseThrow(() -> new RuntimeException(
                            "Employee not found with id: " + request.getLinkedEmployeeId()));
        }

        User user = new User();
        user.setUsername(request.getUsername().trim());
        user.setPassword(encodeRequiredPassword(request.getPassword(), "Password"));
        user.setFullName(request.getFullName());
        user.setEmail(request.getEmail());
        user.setPhone(request.getPhone());
        user.setBranch(resolveBranchForLinkedUserCreate(request.getBranchId(), linkedEmployee));

        user.setRoles(resolveRoles(request.getRoleIds()));

        // Link employee if provided
        if (linkedEmployee != null) {
            // Ensure employee is active (per business rule)
            if (!"Active".equals(linkedEmployee.getStatus())) {
                throw new RuntimeException(
                        "Cannot create access for employee with status: " + linkedEmployee.getStatus() +
                        ". Employee must be Active.");
            }

            // Ensure employee is not already linked to another user
            if (userRepository.findByLinkedEmployee_Id(linkedEmployee.getId()).isPresent()) {
                throw new RuntimeException(
                        "Employee is already linked to a user account.");
            }

            user.setLinkedEmployee(linkedEmployee);
        }

        User saved = userRepository.save(user);
        auditUser(AccessAuditAction.USER_ROLES_ASSIGNED, saved, null, accessValue(saved),
                "User " + saved.getUsername() + " created with roles " + roleNames(saved));
        return new UserSafeDto(saved);
    }

    /**
     * Create a linked user that remains inactive until the employee becomes Active.
     */
    @Transactional
    public void createPendingEmployeeAccess(Employee employee, EmployeeLoginAccessRequest request) {
        if (employee == null || employee.getId() == null) {
            throw new RuntimeException("Employee must be saved before provisioning login access.");
        }
        if (request == null || !request.isRequested()) {
            throw new RuntimeException("Login access request is required.");
        }
        if (userRepository.findByLinkedEmployee_Id(employee.getId()).isPresent()) {
            throw new RuntimeException("Employee is already linked to a user account.");
        }

        validateUsernameAvailable(request.getLoginUsername());
        if (request.getRoleId() == null) {
            throw new RuntimeException("System role is required when creating login access.");
        }

        User user = new User();
        user.setUsername(request.getLoginUsername().trim());
        user.setPassword(encodeRequiredPassword(request.getTemporaryPassword(), "Temporary password"));
        user.setFullName(buildEmployeeFullName(employee));
        user.setEmail(employee.getEmail());
        user.setPhone(employee.getPhone());
        user.setLinkedEmployee(employee);
        user.setRoles(resolveRoles(Set.of(request.getRoleId())));
        // If employee is already Active, activate the account immediately.
        // Otherwise keep it pending until the approval workflow reaches Active.
        boolean alreadyActive = "Active".equals(employee.getStatus());
        user.setActive(alreadyActive);
        user.setPendingEmployeeActivation(!alreadyActive);
        user.setBranch(resolveBranchForEmployeeAccess(employee, request.getBranchId()));

        java.util.Set<com.billbull.backend.settings.branch.Branch> nextAdditionalBranches = new java.util.HashSet<>();
        if (employee.getAdditionalBranchIds() != null && !employee.getAdditionalBranchIds().isEmpty()) {
            String[] parts = employee.getAdditionalBranchIds().split(",");
            for (String part : parts) {
                try {
                    Long bid = Long.parseLong(part.trim());
                    if (user.getBranch() != null && bid.equals(user.getBranch().getId())) continue;
                    branchRepository.findById(bid).ifPresent(nextAdditionalBranches::add);
                } catch (NumberFormatException ignored) {}
            }
        }
        user.setAdditionalBranches(nextAdditionalBranches);

        userRepository.save(user);
        auditUser(AccessAuditAction.USER_ROLES_ASSIGNED, user, null, accessValue(user),
                "Login access provisioned for employee " + employee.getId() + " with roles " + roleNames(user)
                        + (alreadyActive ? "" : " (pending activation)"));
    }

    /**
     * Activates provisioned employee access only once, without unfreezing later accounts.
     */
    @Transactional
    public void activatePendingEmployeeAccessForEmployee(Long employeeId) {
        userRepository.findByLinkedEmployee_Id(employeeId).ifPresent(user -> {
            if (user.isPendingEmployeeActivation()) {
                user.setActive(true);
                user.setPendingEmployeeActivation(false);
                userRepository.save(user);
            }
        });
    }

    /**
     * Update user (safe fields only).
     */
    @Transactional
    public UserSafeDto updateUser(Long id, UserUpdateRequest request) {
        User user = findUserById(id);

        if (request.getFullName() != null) {
            user.setFullName(request.getFullName());
        }
        if (request.getEmail() != null) {
            user.setEmail(request.getEmail());
        }
        if (request.getPhone() != null) {
            user.setPhone(request.getPhone());
        }
        user.setBranch(resolveRequiredBranch(request.getBranchId()));
        if (request.getPassword() != null && !request.getPassword().isEmpty()) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }

        return new UserSafeDto(userRepository.save(user));
    }

    /**
     * Assign additional branches the user may switch to (PDF §2.3 multi-branch).
     * Replaces the existing set in one call — pass the full desired list.
     * The user's primary {@link User#getBranch()} is not touched.
     */
    @Transactional
    public UserSafeDto assignAdditionalBranches(Long userId, java.util.List<Long> branchIds) {
        User user = findUserById(userId);
        java.util.Map<String, Object> before = accessValue(user);
        Set<Branch> next = new HashSet<>();
        StringBuilder branchIdsStr = new StringBuilder();
        if (branchIds != null) {
            for (Long bid : branchIds) {
                if (bid == null) continue;
                // Skip the primary branch — it's already implicit.
                if (user.getBranch() != null && bid.equals(user.getBranch().getId())) continue;
                Branch b = branchRepository.findById(bid)
                        .orElseThrow(() -> new IllegalArgumentException("Branch not found: " + bid));
                next.add(b);
                if (branchIdsStr.length() > 0) branchIdsStr.append(",");
                branchIdsStr.append(bid);
            }
        }
        user.setAdditionalBranches(next);
        
        if (user.getLinkedEmployee() != null) {
            user.getLinkedEmployee().setAdditionalBranchIds(branchIdsStr.length() > 0 ? branchIdsStr.toString() : null);
            employeeRepository.save(user.getLinkedEmployee());
        }

        User saved = userRepository.save(user);
        java.util.Map<String, Object> after = accessValue(saved);
        if (!after.equals(before)) {
            auditUser(AccessAuditAction.USER_BRANCHES_CHANGED, saved, before, after,
                    "Additional branch access for " + saved.getUsername() + " changed");
        }
        return new UserSafeDto(saved);
    }

    /**
     * Assign roles to user (prevents privilege escalation and last-admin removal).
     */
    @Transactional
    public UserSafeDto assignRoles(Long userId, Set<Long> roleIds, Long primaryRoleId) {
        User user = findUserById(userId);
        java.util.Map<String, Object> before = accessValue(user);

        boolean hadAdminRole = user.getRoles().stream()
                .anyMatch(r -> r.getName().equals("ADMIN") || r.getName().equals("BRANCH_ADMIN"));

        Set<Role> newRoles = new HashSet<>();
        for (Long roleId : roleIds) {
            Role role = roleRepository.findById(roleId)
                    .orElseThrow(() -> new RuntimeException("Role not found with id: " + roleId));
            newRoles.add(role);
        }

        boolean hasAdminRoleInNew = newRoles.stream()
                .anyMatch(r -> r.getName().equals("ADMIN") || r.getName().equals("BRANCH_ADMIN"));

        // If removing all admin roles, validate not last admin
        if (hadAdminRole && !hasAdminRoleInNew) {
            adminSafeguardService.validateRemoveAdminRole(user);
        }

        user.setRoles(newRoles);

        // Set primary role — must be one of the assigned roles
        if (primaryRoleId != null) {
            Role primary = newRoles.stream()
                    .filter(r -> r.getId().equals(primaryRoleId))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Primary role must be one of the assigned roles"));
            user.setPrimaryRole(primary);
        } else {
            user.setPrimaryRole(null);
        }

        User saved = userRepository.save(user);
        java.util.Map<String, Object> after = accessValue(saved);
        if (!after.equals(before)) {
            auditUser(AccessAuditAction.USER_ROLES_CHANGED, saved, before, after,
                    "Roles of " + saved.getUsername() + ": " + before.get("roles") + " -> " + after.get("roles"));
        }
        return new UserSafeDto(saved);
    }

    /**
     * Freeze user (set isActive=false). Blocked if last active ADMIN.
     */
    @Transactional
    public UserSafeDto freezeUser(Long id) {
        User user = findUserById(id);
        adminSafeguardService.validateFreezeUser(user);
        java.util.Map<String, Object> before = accessValue(user);
        user.setActive(false);
        User saved = userRepository.save(user);
        if (Boolean.TRUE.equals(before.get("active"))) {
            auditUser(AccessAuditAction.USER_SUSPENDED, saved, before, accessValue(saved),
                    "User " + saved.getUsername() + " frozen");
        }
        return new UserSafeDto(saved);
    }

    /**
     * Unfreeze user (set isActive=true). Always allowed.
     */
    @Transactional
    public UserSafeDto unfreezeUser(Long id) {
        User user = findUserById(id);
        java.util.Map<String, Object> before = accessValue(user);
        if (!user.isActive()) {
            assertUserSeatAvailable();
        }
        user.setActive(true);
        User saved = userRepository.save(user);
        if (!Boolean.TRUE.equals(before.get("active"))) {
            auditUser(AccessAuditAction.USER_REACTIVATED, saved, before, accessValue(saved),
                    "User " + saved.getUsername() + " unfrozen");
        }
        return new UserSafeDto(saved);
    }

    /**
     * Reset password for a user (admin action).
     */
    @Transactional
    public void resetPassword(Long id, String newRawPassword) {
        if (newRawPassword == null || newRawPassword.isBlank()) {
            throw new RuntimeException("New password must not be empty.");
        }
        User user = findUserById(id);
        user.setPassword(passwordEncoder.encode(newRawPassword));
        userRepository.save(user);
    }

    /**
     * Delete user with admin safeguard. Does NOT delete the linked employee.
     */
    @Transactional
    public void deleteUser(Long id) {
        User user = findUserById(id);
        adminSafeguardService.validateDeleteUser(user);
        // Detach employee link before delete to avoid constraint violations
        user.setLinkedEmployee(null);
        userRepository.save(user);
        userRepository.delete(user);
    }

    // ─── Access audit helpers ────────────────────────────────────────────────

    private void auditUser(AccessAuditAction action, User user,
                           java.util.Map<String, Object> before, java.util.Map<String, Object> after,
                           String summary) {
        if (accessAudit == null) return;
        accessAudit.record(AccessAuditService.Entry.of(action)
                .target(user.getId(), user.getUsername())
                .previous(before)
                .next(after)
                .summary(summary)
                .affectedUser(user.getId(), user.getUsername()));
    }

    /** The access-relevant facts of a user: roles, primary role, branch scope, active flag. */
    private static java.util.Map<String, Object> accessValue(User user) {
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("roles", roleNames(user));
        m.put("primaryRole", user.getPrimaryRole() != null ? user.getPrimaryRole().getName() : null);
        m.put("branch", user.getBranch() != null ? user.getBranch().getCode() : null);
        m.put("additionalBranches", user.getAdditionalBranches() == null ? List.of()
                : user.getAdditionalBranches().stream()
                    .map(b -> b.getCode() != null ? b.getCode() : String.valueOf(b.getId()))
                    .sorted().toList());
        m.put("active", user.isActive());
        return m;
    }

    private static List<String> roleNames(User user) {
        return user.getRoles() == null ? List.of()
                : user.getRoles().stream().map(Role::getName).sorted().toList();
    }

    // Internal helper — returns entity (not DTO)
    private User findUserById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User not found with id: " + id));
    }

    private void validateUsernameAvailable(String username) {
        if (username == null || username.isBlank()) {
            throw new RuntimeException("Username is required.");
        }
        String normalizedUsername = username.trim();
        if (userRepository.findByUsername(normalizedUsername).isPresent()) {
            throw new RuntimeException("Username already exists: " + normalizedUsername);
        }
    }

    private String encodeRequiredPassword(String rawPassword, String label) {
        if (rawPassword == null || rawPassword.isBlank()) {
            throw new RuntimeException(label + " is required.");
        }
        validatePasswordComplexity(rawPassword, label);
        return passwordEncoder.encode(rawPassword);
    }

    private void validatePasswordComplexity(String password, String label) {
        if (password.length() < 8) {
            throw new RuntimeException(label + " must be at least 8 characters.");
        }
        if (!password.matches(".*[A-Z].*")) {
            throw new RuntimeException(label + " must contain at least one uppercase letter.");
        }
        if (!password.matches(".*[0-9].*")) {
            throw new RuntimeException(label + " must contain at least one digit.");
        }
        if (!password.matches(".*[^a-zA-Z0-9].*")) {
            throw new RuntimeException(label + " must contain at least one special character.");
        }
    }

    private Set<Role> resolveRoles(Set<Long> roleIds) {
        Set<Role> roles = new HashSet<>();
        if (roleIds == null || roleIds.isEmpty()) {
            return roles;
        }

        for (Long roleId : roleIds) {
            Role role = roleRepository.findById(roleId)
                    .orElseThrow(() -> new RuntimeException("Role not found with id: " + roleId));
            roles.add(role);
        }
        return roles;
    }

    private String buildEmployeeFullName(Employee employee) {
        return Stream.of(employee.getFirstName(), employee.getMiddleName(), employee.getLastName())
                .filter(part -> part != null && !part.isBlank())
                .collect(Collectors.joining(" "));
    }

    private Branch resolveRequiredBranch(Long branchId) {
        if (branchId == null) {
            throw new RuntimeException("Branch is required for user access.");
        }

        return branchRepository.findById(branchId)
                .orElseThrow(() -> new RuntimeException("Branch not found with id: " + branchId));
    }

    private Branch resolveBranchForLinkedUserCreate(Long requestedBranchId, Employee linkedEmployee) {
        if (requestedBranchId != null) {
            return resolveRequiredBranch(requestedBranchId);
        }

        if (linkedEmployee != null) {
            return resolveBranchForEmployeeAccess(linkedEmployee, null);
        }

        return resolveRequiredBranch(null);
    }

    private Branch resolveBranchForEmployeeAccess(Employee employee, Long requestedBranchId) {
        if (requestedBranchId != null) {
            return resolveRequiredBranch(requestedBranchId);
        }

        if (employee != null && employee.getBranch() != null && !employee.getBranch().isBlank()) {
            String label = employee.getBranch().trim();
            return branchRepository.findByCodeIgnoreCase(label)
                    .or(() -> branchRepository.findByNameIgnoreCase(label))
                    .or(() -> resolveBranchFromFormattedLabel(label))
                    .orElseThrow(() -> new RuntimeException(
                            "Branch assignment is required before creating employee login access."));
        }

        throw new RuntimeException("Branch assignment is required before creating employee login access.");
    }

    private Optional<Branch> resolveBranchFromFormattedLabel(String label) {
        if (label == null || label.isBlank()) {
            return Optional.empty();
        }

        int openParenIndex = label.lastIndexOf('(');
        int closeParenIndex = label.lastIndexOf(')');

        if (openParenIndex < 0 || closeParenIndex <= openParenIndex) {
            return Optional.empty();
        }

        String code = label.substring(openParenIndex + 1, closeParenIndex).trim();
        String name = label.substring(0, openParenIndex).trim();

        if (!code.isBlank()) {
            Optional<Branch> byCode = branchRepository.findByCodeIgnoreCase(code);
            if (byCode.isPresent()) {
                return byCode;
            }
        }

        if (!name.isBlank()) {
            return branchRepository.findByNameIgnoreCase(name);
        }

        return Optional.empty();
    }
}
