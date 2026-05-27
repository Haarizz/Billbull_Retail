package com.billbull.backend.settings.branch;

import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.security.AuditLogService;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

@Service
@Transactional
public class BranchService {

    private final BranchRepository repo;
    private final WarehouseRepository warehouseRepo;

    @Autowired(required = false)
    private AuditLogService auditLogService;

    public BranchService(BranchRepository repo, WarehouseRepository warehouseRepo) {
        this.repo = repo;
        this.warehouseRepo = warehouseRepo;
    }

    private void audit(String action, Branch branch, String detail) {
        if (auditLogService == null || branch == null) return;
        try {
            auditLogService.logDomainEvent(
                    "BRANCH",
                    branch.getId() != null ? String.valueOf(branch.getId()) : "-",
                    action,
                    "[" + (branch.getCode() != null ? branch.getCode() : branch.getName()) + "] " + detail);
        } catch (Exception ignored) {
            // never let audit failures break the business operation
        }
    }

    public List<BranchResponse> listAll() {
        return repo.findAll().stream()
                .sorted(Comparator
                        .comparingInt(Branch::getSortOrder)
                        .thenComparing(b -> b.getName() == null ? "" : b.getName(), String.CASE_INSENSITIVE_ORDER))
                .map(BranchResponse::from)
                .toList();
    }

    public BranchResponse getDefault() {
        return repo.findByIsDefaultTrue()
                .map(BranchResponse::from)
                .orElse(null);
    }

    public BranchResponse getHeadquarters() {
        Branch hq = repo.findByIsHeadquartersTrue().orElse(null);
        if (hq == null) {
            // Fallback to first branch by sortOrder so report headers never fail.
            hq = repo.findAll().stream()
                    .min(Comparator.comparingInt(Branch::getSortOrder).thenComparing(Branch::getId))
                    .orElse(null);
        }
        return hq != null ? BranchResponse.from(hq) : null;
    }

    public BranchResponse create(BranchRequest req) {
        validateName(req.getName());
        validateCode(req.getCode(), null);

        Branch branch = new Branch();
        applyRequest(branch, req, true);

        // First branch created becomes default + HQ automatically.
        if (repo.count() == 0) {
            branch.setDefault(true);
            branch.setHeadquarters(true);
            branch.setType(BranchType.HEADQUARTERS);
        }

        Branch saved = repo.save(branch);

        if (Boolean.TRUE.equals(req.getIsHeadquarters()) && !saved.isHeadquarters()) {
            markHeadquartersInternal(saved);
            saved = repo.save(saved);
        }

        audit("CREATE", saved, "type=" + saved.getType()
                + (saved.isHeadquarters() ? ", HQ" : "")
                + (saved.isDefault() ? ", default" : ""));
        return BranchResponse.from(saved);
    }

    public BranchResponse update(Long id, BranchRequest req) {
        Branch branch = getEntity(id);
        validateName(req.getName());
        validateCode(req.getCode(), id);
        applyRequest(branch, req, false);

        if (Boolean.TRUE.equals(req.getIsHeadquarters()) && !branch.isHeadquarters()) {
            markHeadquartersInternal(branch);
        }

        Branch saved = repo.save(branch);
        audit("UPDATE", saved, "type=" + saved.getType());
        return BranchResponse.from(saved);
    }

    public BranchResponse setDefault(Long id) {
        // Clear existing default
        repo.findByIsDefaultTrue().ifPresent(existing -> {
            existing.setDefault(false);
            repo.save(existing);
        });

        Branch branch = getEntity(id);
        branch.setDefault(true);
        Branch saved = repo.save(branch);
        audit("SET_DEFAULT", saved, "is now the default branch");
        return BranchResponse.from(saved);
    }

    public BranchResponse setHeadquarters(Long id) {
        Branch branch = getEntity(id);
        markHeadquartersInternal(branch);
        Branch saved = repo.save(branch);
        audit("SET_HQ", saved, "promoted to Headquarters");
        return BranchResponse.from(saved);
    }

    public void delete(Long id) {
        Branch branch = getEntity(id);
        if (branch.isDefault()) {
            throw new IllegalStateException("Cannot delete the default branch. Set another branch as default first.");
        }
        if (branch.isHeadquarters()) {
            throw new IllegalStateException("Cannot delete the headquarters branch. Promote another branch to headquarters first.");
        }
        audit("DELETE", branch, "branch deleted");
        repo.delete(branch);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private void markHeadquartersInternal(Branch branch) {
        repo.findByIsHeadquartersTrue().ifPresent(existing -> {
            if (!existing.getId().equals(branch.getId())) {
                existing.setHeadquarters(false);
                repo.save(existing);
            }
        });
        branch.setHeadquarters(true);
        if (branch.getType() == null) {
            branch.setType(BranchType.HEADQUARTERS);
        }
    }

    private void applyRequest(Branch branch, BranchRequest req, boolean creating) {
        branch.setName(req.getName().trim());
        branch.setCode(req.getCode() != null ? req.getCode().trim() : null);
        branch.setAddress(normalizeOptional(req.getAddress()));
        branch.setAddressLine2(normalizeOptional(req.getAddressLine2()));
        branch.setCity(normalizeOptional(req.getCity()));
        branch.setState(normalizeOptional(req.getState()));
        branch.setCountry(normalizeOptional(req.getCountry()));
        branch.setPostalCode(normalizeOptional(req.getPostalCode()));
        branch.setPhone(normalizeOptional(req.getPhone()));
        branch.setFax(normalizeOptional(req.getFax()));
        branch.setEmail(normalizeOptional(req.getEmail()));
        branch.setTrnNumber(normalizeOptional(req.getTrnNumber()));
        branch.setLogoUrl(normalizeOptional(req.getLogoUrl()));
        if (req.getSortOrder() != null) {
            branch.setSortOrder(req.getSortOrder());
        }
        if (req.getType() != null) {
            branch.setType(req.getType());
        } else if (branch.getType() == null) {
            branch.setType(BranchType.BRANCH);
        }

        if (req.getDefaultWarehouseId() != null) {
            if (creating || branch.getId() == null) {
                throw new IllegalStateException(
                        "Create the branch first, then assign one of its warehouses as the default.");
            }

            Warehouse wh = warehouseRepo.findById(req.getDefaultWarehouseId())
                    .orElseThrow(() -> new IllegalArgumentException("Warehouse not found"));
            if (wh.getBranch() == null) {
                throw new IllegalStateException(
                        "Default warehouse must be assigned to the same branch before it can be selected.");
            }
            if (branch.getId() != null && !branch.getId().equals(wh.getBranch().getId())) {
                throw new IllegalStateException("Default warehouse must belong to the selected branch.");
            }
            branch.setDefaultWarehouse(wh);
        } else {
            branch.setDefaultWarehouse(null);
        }
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private Branch getEntity(Long id) {
        return repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Branch not found: " + id));
    }

    private void validateName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Branch name is required");
        }
    }

    private void validateCode(String code, Long excludeId) {
        if (code == null || code.isBlank()) return;
        boolean duplicate = excludeId != null
                ? repo.existsByCodeAndIdNot(code.trim(), excludeId)
                : repo.existsByCode(code.trim());
        if (duplicate) {
            throw new IllegalStateException("Branch code '" + code.trim() + "' is already in use");
        }
    }
}
