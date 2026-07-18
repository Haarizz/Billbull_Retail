package com.billbull.backend.inventory.subdepartment;

import com.billbull.backend.inventory.department.Department;
import com.billbull.backend.inventory.department.DepartmentRepository;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@Transactional
public class SubDepartmentService {

    private final SubDepartmentRepository repo;
    private final DepartmentRepository departmentRepo;
    private final com.billbull.backend.inventory.product.ProductRepository productRepo;
    private final com.billbull.backend.inventory.scope.InventoryBranchScopeResolver scopeResolver;
    private final com.billbull.backend.inventory.scope.MasterDataBranchService masterBranch;

    public SubDepartmentService(SubDepartmentRepository repo,
            DepartmentRepository departmentRepo,
            com.billbull.backend.inventory.product.ProductRepository productRepo,
            com.billbull.backend.inventory.scope.InventoryBranchScopeResolver scopeResolver,
            com.billbull.backend.inventory.scope.MasterDataBranchService masterBranch) {
        this.repo = repo;
        this.departmentRepo = departmentRepo;
        this.productRepo = productRepo;
        this.scopeResolver = scopeResolver;
        this.masterBranch = masterBranch;
    }

    private java.util.Collection<Long> activeScope() {
        return scopeResolver.activeListScope()
                .map(com.billbull.backend.settings.branch.BranchAccessService.ListScope::branchIds)
                .orElse(null);
    }

    // ---------------------------
    // LIST
    // ---------------------------
    public List<SubDepartmentResponse> list() {
        java.util.Collection<Long> scope = activeScope();
        List<SubDepartment> rows = scope != null
                ? repo.findActiveInBranchScope(scope)
                : repo.findAll();
        return rows.stream().map(this::map).toList();
    }

    // ---------------------------
    // CREATE
    // ---------------------------
    public SubDepartmentResponse create(SubDepartmentRequest req) {

        Department dept = departmentRepo.findById(req.departmentId)
                .orElseThrow(() -> new RuntimeException("Department not found"));

        // Phase 6B: resolve this row's branch (governance-gated; null = global / toggle off).
        com.billbull.backend.settings.branch.Branch branch = masterBranch.resolveBranchForCreate();
        // §16 reference validation: a sub-department may reference own-branch or global Department only.
        masterBranch.assertMasterReferenceAccessible(
                com.billbull.backend.inventory.scope.MasterDataBranchService.branchIdOf(dept.getBranch()),
                com.billbull.backend.inventory.scope.MasterDataBranchService.branchIdOf(branch),
                "Department");

        java.util.Collection<Long> scope = activeScope();

        if (nameInDeptExists(req.name, dept.getId(), scope)) {
            throw new RuntimeException("Sub-Department already exists in this department");
        }

        // QA-001: auto-generate code from name when not provided by quick-add
        if (req.code == null || req.code.isBlank()) {
            String raw = req.name.toUpperCase().replaceAll("[^A-Z0-9]", "");
            String base = raw.isEmpty() ? "SD" : raw.substring(0, Math.min(raw.length(), 10));
            String candidate = base;
            int suffix = 1;
            while (codeExists(candidate, scope)) {
                String s = String.valueOf(suffix++);
                candidate = base.substring(0, Math.min(base.length(), 10 - s.length())) + s;
            }
            req.code = candidate;
        } else if (codeExists(req.code, scope)) {
            throw new RuntimeException("Sub-Department code already exists");
        }

        SubDepartment sd = new SubDepartment();
        sd.setName(req.name);
        sd.setCode(req.code);
        sd.setDepartment(dept);
        sd.setBranch(branch); // Phase 6B stamp (null = global / toggle off)
        sd.setDescription(req.description);
        // QA-001: default to active=true when not explicitly set (Boolean null check)
        sd.setActive(req.active == null ? true : req.active);
        sd.setAllowOverride(req.allowOverride);
        sd.setAutoCreateGroups(req.autoCreateGroups);
        sd.setRestrictTerminals(req.restrictTerminals);

        return map(repo.save(sd));
    }

    private boolean codeExists(String code, java.util.Collection<Long> scope) {
        return scope != null
                ? repo.existsActiveByCodeInBranchScope(code, scope)
                : repo.existsByCodeAndActiveTrue(code);
    }

    private boolean nameInDeptExists(String name, Long deptId, java.util.Collection<Long> scope) {
        return scope != null
                ? repo.existsActiveByNameAndDepartmentInBranchScope(name, deptId, scope)
                : repo.existsByNameAndDepartmentIdAndActiveTrue(name, deptId);
    }

    // ---------------------------
    // UPDATE
    // ---------------------------
    public SubDepartmentResponse update(Long id, SubDepartmentRequest req) {

        SubDepartment sd = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Sub-Department not found"));

        Department dept = departmentRepo.findById(req.departmentId)
                .orElseThrow(() -> new RuntimeException("Department not found"));

        // §16: the (re)referenced Department must be own-branch or global relative to this sub-dept.
        masterBranch.assertMasterReferenceAccessible(
                com.billbull.backend.inventory.scope.MasterDataBranchService.branchIdOf(dept.getBranch()),
                com.billbull.backend.inventory.scope.MasterDataBranchService.branchIdOf(sd.getBranch()),
                "Department");

        sd.setName(req.name);
        sd.setCode(req.code);
        sd.setDepartment(dept);
        sd.setDescription(req.description);
        sd.setActive(req.active == null ? sd.isActive() : req.active);
        sd.setAllowOverride(req.allowOverride);
        sd.setAutoCreateGroups(req.autoCreateGroups);
        sd.setRestrictTerminals(req.restrictTerminals);

        return map(repo.save(sd));
    }

    // ---------------------------
    // SOFT DELETE
    // ---------------------------
    public void delete(Long id) {
        SubDepartment sd = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Sub-Department not found"));

        long count = productRepo.countBySubDepartmentIdAndIsActiveTrue(id);
        if (count > 0) {
            throw new IllegalStateException(
                    "Cannot delete sub-department. It is currently in use by " + count + " products.");
        }

        sd.setActive(false);
        repo.save(sd);
    }

    // ---------------------------
    // MAPPER
    // ---------------------------
    private SubDepartmentResponse map(SubDepartment sd) {
        SubDepartmentResponse r = new SubDepartmentResponse();
        r.id = sd.getId();
        r.name = sd.getName();
        r.code = sd.getCode();
        r.departmentId = sd.getDepartment().getId();
        r.departmentName = sd.getDepartment().getName();
        r.departmentCode = sd.getDepartment().getCode();
        r.description = sd.getDescription();
        r.items = (int) productRepo.countBySubDepartmentIdAndIsActiveTrue(sd.getId());
        r.brands = (int) productRepo.countDistinctBrandBySubDepartmentIdAndIsActiveTrue(sd.getId());
        r.noBarcode = sd.getNoBarcodeCount();
        r.active = sd.isActive();
        // Phase 11: owning branch (null = shared/global) for the SPA's Global badge.
        r.branchId = sd.getBranch() != null ? sd.getBranch().getId() : null;
        r.branchName = sd.getBranch() != null ? sd.getBranch().getName() : null;
        return r;
    }
}
