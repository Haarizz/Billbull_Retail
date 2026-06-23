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
    private final BranchRepository branchRepository;

    public BranchAccessService(UserRepository userRepository, BranchRepository branchRepository) {
        this.userRepository = userRepository;
        this.branchRepository = branchRepository;
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
        // If the Branch Selector has narrowed to a specific branch, new
        // transactions should be stamped with THAT branch — not the user's
        // primary. Without this, an admin who switched to Dubai and created
        // an invoice would have it stamped with HQ instead.
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        if (ctx != null && ctx.activeBranchId() != null) {
            Branch primary = getCurrentUserBranchOrNull();
            if (primary != null && primary.getId() != null
                    && primary.getId().equals(ctx.activeBranchId())) {
                return primary; // hydrate with full primary record (warehouse etc.)
            }
            // Load the active branch by id (admin switched away from primary,
            // or multi-branch restricted user switched within their allowed set).
            return branchRepository.findById(ctx.activeBranchId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Active branch no longer exists. Refresh and try again."));
        }

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

    public Branch findBranchByName(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        return branchRepository.findByNameIgnoreCase(name).orElse(null);
    }

    public boolean currentUserHasRole(String... roleNames) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return false;
        }
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> {
                    for (String roleName : roleNames) {
                        if (("ROLE_" + roleName).equals(authority.getAuthority())) return true;
                    }
                    return false;
                });
    }

    /**
     * Access check for a single record (GET-by-id, PUT, DELETE, link-by-FK).
     * Admins can always touch any branch's records — their power is universal.
     * Restricted users are confined to their primary + additional branches.
     *
     * This is intentionally permissive for admin so that switching the Branch
     * Selector to Dubai doesn't lock them out of opening an HQ document. The
     * narrowing happens in {@link #filterBranchScoped} which drives list views.
     */
    public boolean canAccessTransactionBranch(Long branchId) {
        if (branchId == null) {
            return true; // legacy rows with no branch
        }
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        if (ctx == null) {
            return Objects.equals(branchId, getCurrentUserBranchId());
        }
        if (ctx.isAllBranches()) {
            return true; // admin — universal access
        }
        return ctx.allowedBranchIds().contains(branchId)
                || Objects.equals(branchId, getCurrentUserBranchId());
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
                .anyMatch(role -> "ADMIN".equals(role.getName()) || "SUPER_ADMIN".equals(role.getName())
                        || "BRANCH_ADMIN".equals(role.getName()));
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

        // Global (branch-unassigned) warehouses are accessible to any branch
        if (warehouse.getBranch() == null) {
            return;
        }
        if (!Objects.equals(warehouse.getBranch().getId(), branchId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    fieldLabel + " warehouse does not belong to the selected branch.");
        }
    }

    /**
     * Predicate used by list endpoints. Differs from {@link #canAccessTransactionBranch}
     * by also honouring the active Branch Selector — when admin switches to Dubai,
     * the list view filters to Dubai even though admin technically has access to all.
     * Single-record access (assert*) still uses the permissive method.
     */
    private boolean matchesActiveListScope(Long rowBranchId) {
        if (rowBranchId == null) return true; // legacy rows
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        Long active = ctx != null ? ctx.activeBranchId() : null;
        if (active != null) {
            // PDF §6.3 — Branch Selector narrows the view for everyone, admin included.
            return Objects.equals(rowBranchId, active);
        }
        // No active selector → fall back to base access rule.
        return canAccessTransactionBranch(rowBranchId);
    }

    /**
     * SQL-friendly description of the branch scope for the current request, so
     * list/pagination queries can push branch filtering down into the database
     * instead of loading everything and filtering in Java via
     * {@link #filterBranchScoped}.
     *
     * <p>{@code allBranches == true} means no branch predicate should be applied.
     * Otherwise rows must satisfy {@code branchId IN branchIds OR branchId IS NULL}
     * (legacy null-branch rows are always visible, matching
     * {@link #matchesActiveListScope}). {@code branchIds} is never empty — a
     * sentinel {@code -1L} is used when the user has no branches so an SQL
     * {@code IN ()} is never generated.
     */
    public record ListScope(boolean allBranches, java.util.Set<Long> branchIds) {}

    public ListScope currentListScope() {
        BranchContextHolder.BranchContext ctx = BranchContextHolder.get();
        Long active = ctx != null ? ctx.activeBranchId() : null;
        if (active != null) {
            // Branch Selector narrows the view for everyone, admin included.
            return scoped(java.util.Set.of(active));
        }
        if (ctx != null && ctx.isAllBranches()) {
            return new ListScope(true, java.util.Set.of(-1L));
        }
        if (ctx == null) {
            Long current = getCurrentUserBranchId();
            return scoped(current != null ? java.util.Set.of(current) : java.util.Set.of());
        }
        // ctx present, not all-branches, no active selector → allowed set + primary.
        java.util.Set<Long> ids = new java.util.HashSet<>(ctx.allowedBranchIds());
        Long current = getCurrentUserBranchId();
        if (current != null) {
            ids.add(current);
        }
        return scoped(ids);
    }

    private ListScope scoped(java.util.Set<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return new ListScope(false, java.util.Set.of(-1L));
        }
        return new ListScope(false, java.util.Set.copyOf(ids));
    }

    public <T> List<T> filterBranchScoped(List<T> items, java.util.function.Function<T, Long> branchIdExtractor) {
        return items.stream()
                .filter(item -> matchesActiveListScope(branchIdExtractor.apply(item)))
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
                    return matchesActiveListScope(b != null ? b.getId() : null);
                })
                .toList();
    }
}
