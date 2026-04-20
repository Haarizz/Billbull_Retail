package com.billbull.backend.settings.branch;

import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@Transactional
public class BranchService {

    private final BranchRepository repo;
    private final WarehouseRepository warehouseRepo;

    public BranchService(BranchRepository repo, WarehouseRepository warehouseRepo) {
        this.repo = repo;
        this.warehouseRepo = warehouseRepo;
    }

    public List<BranchResponse> listAll() {
        return repo.findAll().stream().map(BranchResponse::from).toList();
    }

    public BranchResponse getDefault() {
        return repo.findByIsDefaultTrue()
                .map(BranchResponse::from)
                .orElse(null);
    }

    public BranchResponse create(BranchRequest req) {
        validateName(req.getName());
        validateCode(req.getCode(), null);

        Branch branch = new Branch();
        applyRequest(branch, req);

        // First branch created becomes default automatically
        if (repo.count() == 0) {
            branch.setDefault(true);
        }

        return BranchResponse.from(repo.save(branch));
    }

    public BranchResponse update(Long id, BranchRequest req) {
        Branch branch = getEntity(id);
        validateName(req.getName());
        validateCode(req.getCode(), id);
        applyRequest(branch, req);
        return BranchResponse.from(repo.save(branch));
    }

    public BranchResponse setDefault(Long id) {
        // Clear existing default
        repo.findByIsDefaultTrue().ifPresent(existing -> {
            existing.setDefault(false);
            repo.save(existing);
        });

        Branch branch = getEntity(id);
        branch.setDefault(true);
        return BranchResponse.from(repo.save(branch));
    }

    public void delete(Long id) {
        Branch branch = getEntity(id);
        if (branch.isDefault()) {
            throw new IllegalStateException("Cannot delete the default branch. Set another branch as default first.");
        }
        repo.delete(branch);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private void applyRequest(Branch branch, BranchRequest req) {
        branch.setName(req.getName().trim());
        branch.setCode(req.getCode() != null ? req.getCode().trim() : null);
        branch.setAddress(req.getAddress());
        branch.setPhone(req.getPhone());

        if (req.getDefaultWarehouseId() != null) {
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
