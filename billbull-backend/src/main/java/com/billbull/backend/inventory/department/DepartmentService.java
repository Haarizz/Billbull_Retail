package com.billbull.backend.inventory.department;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class DepartmentService {

    private final DepartmentRepository repository;
    private final com.billbull.backend.inventory.product.ProductRepository productRepo;
    // Branch-Level Inventory Phase 6B — branch scoping/governance (dormant while toggle off).
    private final com.billbull.backend.inventory.scope.InventoryBranchScopeResolver scopeResolver;
    private final com.billbull.backend.inventory.scope.MasterDataBranchService masterBranch;

    public DepartmentService(DepartmentRepository repository,
            com.billbull.backend.inventory.product.ProductRepository productRepo,
            com.billbull.backend.inventory.scope.InventoryBranchScopeResolver scopeResolver,
            com.billbull.backend.inventory.scope.MasterDataBranchService masterBranch) {
        this.repository = repository;
        this.productRepo = productRepo;
        this.scopeResolver = scopeResolver;
        this.masterBranch = masterBranch;
    }

    // ================= READ =================

    public List<DepartmentResponse> getAll() {
        // Toggle on + active branch → own branch + global; else today's full active list.
        List<Department> rows = scopeResolver.activeListScope()
                .map(scope -> repository.findActiveInBranchScope(scope.branchIds()))
                .orElseGet(repository::findByIsActiveTrue);
        return rows.stream().map(this::toResponse).toList();
    }

    // ================= CREATE =================

    public DepartmentResponse create(DepartmentRequest request) {

        // Phase 6B: resolve the branch for this new row (null = global; null when toggle off →
        // unchanged behaviour). Governance is enforced inside resolveBranchForCreate.
        com.billbull.backend.settings.branch.Branch branch = masterBranch.resolveBranchForCreate();
        java.util.Collection<Long> scope = scopeResolver.activeListScope()
                .map(com.billbull.backend.settings.branch.BranchAccessService.ListScope::branchIds)
                .orElse(null);

        // QA-001: auto-generate code from name when not provided by quick-add. Uniqueness is checked
        // within the active branch scope when scoping is on, else globally (today's behaviour).
        if (request.getCode() == null || request.getCode().isBlank()) {
            String raw = request.getName().toUpperCase().replaceAll("[^A-Z0-9]", "");
            String base = raw.isEmpty() ? "DEPT" : raw.substring(0, Math.min(raw.length(), 10));
            String candidate = base;
            int suffix = 1;
            while (codeExists(candidate, scope)) {
                String s = String.valueOf(suffix++);
                candidate = base.substring(0, Math.min(base.length(), 10 - s.length())) + s;
            }
            request.setCode(candidate);
        }

        // Inactive-restore: look up an existing row with this code WITHIN scope (branch + global).
        java.util.Optional<Department> existingOpt = findByCodeInScope(request.getCode(), scope);
        if (existingOpt.isPresent()) {
            Department existing = existingOpt.get();
            if (existing.isActive()) {
                throw new IllegalStateException("Department code already exists");
            } else {
                existing.setActive(true);
                mapRequestToEntity(request, existing);
                // Preserve the restored row's existing branch (do not reassign on restore).
                return toResponse(repository.save(existing));
            }
        }

        Department department = new Department();
        mapRequestToEntity(request, department);
        department.setBranch(branch); // Phase 6B stamp (null = global / toggle off)

        return toResponse(repository.save(department));
    }

    /** Code-existence check: branch-scoped (active branch + global) when scoping on, else global. */
    private boolean codeExists(String code, java.util.Collection<Long> scope) {
        return scope != null
                ? repository.existsByCodeInBranchScope(code, scope)
                : repository.existsByCode(code);
    }

    /** Find-by-code within scope (branch + global) when scoping on, else global (first match). */
    private java.util.Optional<Department> findByCodeInScope(String code, java.util.Collection<Long> scope) {
        if (scope == null) {
            return repository.findByCode(code);
        }
        return repository.findByCodeInBranchScope(code, scope).stream().findFirst();
    }

    // ================= UPDATE =================

    public DepartmentResponse update(Long id, DepartmentRequest request) {

        Department department = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Department not found"));

        java.util.Collection<Long> scope = scopeResolver.activeListScope()
                .map(com.billbull.backend.settings.branch.BranchAccessService.ListScope::branchIds)
                .orElse(null);

        if (!department.getCode().equals(request.getCode())
                && codeExists(request.getCode(), scope)) {
            throw new IllegalStateException(scope != null
                    ? "Department code already exists in this branch"
                    : "Department code already exists (globally unique)");
        }

        mapRequestToEntity(request, department);

        return toResponse(repository.save(department));
    }

    // ================= DELETE (SOFT) =================

    public void delete(Long id) {

        Department department = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Department not found"));

        long count = productRepo.countByDepartmentIdAndIsActiveTrue(id);
        if (count > 0) {
            throw new IllegalStateException(
                    "Cannot delete department. It is currently in use by " + count + " products.");
        }

        department.setActive(false);
        repository.save(department);
    }

    // ================= BULK DELETE (SOFT) =================

    public void bulkDelete(List<Long> ids) {
        for (Long id : ids) {
            Department department = repository.findById(id)
                    .orElseThrow(() -> new RuntimeException("Department not found: " + id));
            department.setActive(false);
        }
        repository.flush();
    }

    // ================= HELPERS =================

    private void mapRequestToEntity(DepartmentRequest r, Department d) {

        d.setName(r.getName());
        d.setCode(r.getCode());
        d.setDescription(r.getDesc());
    }

    private DepartmentResponse toResponse(Department d) {

        Long productCount = productRepo.countByDepartmentIdAndIsActiveTrue(d.getId());

        DepartmentResponse res = new DepartmentResponse();
        res.setId(d.getId());
        res.setName(d.getName());
        res.setDesc(d.getDescription());
        res.setCode(d.getCode());
        res.setCount(productCount);
        // Phase 11: owning branch (null = shared/global) for the SPA's Global badge.
        res.setBranchId(d.getBranch() != null ? d.getBranch().getId() : null);
        res.setBranchName(d.getBranch() != null ? d.getBranch().getName() : null);

        return res;
    }
}