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

    public SubDepartmentService(SubDepartmentRepository repo,
            DepartmentRepository departmentRepo,
            com.billbull.backend.inventory.product.ProductRepository productRepo) {
        this.repo = repo;
        this.departmentRepo = departmentRepo;
        this.productRepo = productRepo;
    }

    // ---------------------------
    // LIST
    // ---------------------------
    public List<SubDepartmentResponse> list() {
        return repo.findByActiveTrue().stream().map(this::map).toList();
    }

    // ---------------------------
    // CREATE
    // ---------------------------
    public SubDepartmentResponse create(SubDepartmentRequest req) {

        if (repo.existsByCodeAndActiveTrue(req.code)) {
            throw new RuntimeException("Sub-Department code already exists");
        }

        Department dept = departmentRepo.findById(req.departmentId)
                .orElseThrow(() -> new RuntimeException("Department not found"));

        if (repo.existsByNameAndDepartmentIdAndActiveTrue(req.name, dept.getId())) {
            throw new RuntimeException("Sub-Department already exists in this department");
        }

        SubDepartment sd = new SubDepartment();
        sd.setName(req.name);
        sd.setCode(req.code);
        sd.setDepartment(dept);
        sd.setDescription(req.description);
        sd.setActive(req.active);
        sd.setAllowOverride(req.allowOverride);
        sd.setAutoCreateGroups(req.autoCreateGroups);
        sd.setRestrictTerminals(req.restrictTerminals);

        return map(repo.save(sd));
    }

    // ---------------------------
    // UPDATE
    // ---------------------------
    public SubDepartmentResponse update(Long id, SubDepartmentRequest req) {

        SubDepartment sd = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Sub-Department not found"));

        Department dept = departmentRepo.findById(req.departmentId)
                .orElseThrow(() -> new RuntimeException("Department not found"));

        sd.setName(req.name);
        sd.setCode(req.code);
        sd.setDepartment(dept);
        sd.setDescription(req.description);
        sd.setActive(req.active);
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
        return r;
    }
}
