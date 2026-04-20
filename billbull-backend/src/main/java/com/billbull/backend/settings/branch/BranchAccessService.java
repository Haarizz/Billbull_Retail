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
        Long currentBranchId = getCurrentUserBranchId();
        return branchId == null || Objects.equals(branchId, currentBranchId);
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
}
