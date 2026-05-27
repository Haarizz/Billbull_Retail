package com.billbull.backend.settings.branch;

import java.util.List;
import java.util.Objects;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.BranchScope;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;

@Service
@Transactional(readOnly = true)
public class BranchAccessService {

    private final UserRepository userRepository;

    public BranchAccessService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public Branch getCurrentUserBranchOrNull() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null || authentication.getName().isBlank()) {
            return null;
        }

        User user = userRepository.findByUsername(authentication.getName()).orElse(null);
        return user != null ? user.getBranch() : null;
    }

    public Branch getRequiredCurrentUserBranch() {
        Branch branch = getCurrentUserBranchOrNull();
        if (branch == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No branch is assigned to this user. Ask an administrator to assign a branch before creating branch-based transactions.");
        }
        return branch;
    }

    public Long getCurrentUserBranchId() {
        Branch branch = getCurrentUserBranchOrNull();
        return branch != null ? branch.getId() : null;
    }

    public boolean currentUserHasRole(String roleName) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return false;
        }

        String expected = "ROLE_" + roleName;
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> expected.equals(authority.getAuthority()));
    }

    public boolean canAccessTransactionBranch(Long branchId) {
        if (branchId == null) {
            return true;
        }
        // Admins viewing "All Branches" can touch every branch.
        if (BranchScope.isAllBranches()) {
            return true;
        }
        // Honour the per-request allowed list from JWT first; fall back to the
        // user's primary branch if no request context (e.g. background jobs).
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        if (ctx != null && ctx.allowedBranchIds().contains(branchId)) {
            return true;
        }
        return Objects.equals(branchId, getCurrentUserBranchId());
    }

    /**
     * Access check used by the branch-scope plumbing. Admin/Super Admin users
     * may touch every branch; everyone else is restricted to their primary
     * branch plus any branches assigned via the {@code user_branches} junction
     * (PDF §2.3 — multi-branch user support).
     */
    public boolean canAccessBranch(Long userId, Long branchId) {
        if (branchId == null) {
            return true;
        }
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return false;
        }
        boolean isAdmin = user.getRoles() != null && user.getRoles().stream()
                .anyMatch(role -> "ADMIN".equals(role.getName()) || "SUPER_ADMIN".equals(role.getName()));
        if (isAdmin) {
            return true;
        }
        if (user.getBranch() != null && Objects.equals(user.getBranch().getId(), branchId)) {
            return true;
        }
        return user.getAdditionalBranches() != null && user.getAdditionalBranches().stream()
                .anyMatch(b -> Objects.equals(b.getId(), branchId));
    }

    /**
     * Returns every branch ID the user is permitted to act on (primary +
     * additional). Empty for admins (treat as "All branches" upstream).
     */
    public java.util.Set<Long> getAllowedBranchIds(Long userId) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return java.util.Set.of();
        }
        java.util.Set<Long> ids = new java.util.HashSet<>();
        if (user.getBranch() != null && user.getBranch().getId() != null) {
            ids.add(user.getBranch().getId());
        }
        if (user.getAdditionalBranches() != null) {
            user.getAdditionalBranches().stream()
                    .filter(b -> b != null && b.getId() != null)
                    .forEach(b -> ids.add(b.getId()));
        }
        return ids;
    }

    public void assertTransactionBranchAccessible(Long branchId, String documentLabel) {
        if (!canAccessTransactionBranch(branchId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    documentLabel + " belongs to another branch and is not available in this session.");
        }
    }

    public void assertWarehouseMatchesBranch(Warehouse warehouse, Long branchId, String fieldLabel) {
        if (warehouse == null) {
            return;
        }

        if (branchId == null) {
            if (warehouse.getBranch() != null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        fieldLabel + " cannot use a branch-owned warehouse when the document is legacy/unassigned.");
            }
            return;
        }

        if (warehouse.getBranch() == null || !Objects.equals(warehouse.getBranch().getId(), branchId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    fieldLabel + " warehouse does not belong to the selected branch.");
        }
    }

    public <T> List<T> filterBranchScoped(List<T> items, java.util.function.Function<T, Long> branchIdExtractor) {
        return items.stream()
                .filter(item -> canAccessTransactionBranch(branchIdExtractor.apply(item)))
                .toList();
    }

    /**
     * Group B convenience overload: takes a {@code Function<T, Branch>} so callers
     * working with the new {@code @ManyToOne Branch branch} field don't have to
     * write {@code x -> x.getBranch() != null ? x.getBranch().getId() : null}.
     */
    public <T> List<T> filterBranchScopedByBranch(List<T> items, java.util.function.Function<T, Branch> branchExtractor) {
        return items.stream()
                .filter(item -> {
                    Branch b = branchExtractor.apply(item);
                    return canAccessTransactionBranch(b != null ? b.getId() : null);
                })
                .toList();
    }
}
