package com.billbull.backend.inventory.department;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class DepartmentService {

    private final DepartmentRepository repository;
    private final com.billbull.backend.inventory.product.ProductRepository productRepo;

    public DepartmentService(DepartmentRepository repository,
            com.billbull.backend.inventory.product.ProductRepository productRepo) {
        this.repository = repository;
        this.productRepo = productRepo;
    }

    // ================= READ =================

    public List<DepartmentResponse> getAll() {
        return repository.findByIsActiveTrue()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    // ================= CREATE =================

    public DepartmentResponse create(DepartmentRequest request) {

        // QA-001: auto-generate code from name when not provided by quick-add
        if (request.getCode() == null || request.getCode().isBlank()) {
            String raw = request.getName().toUpperCase().replaceAll("[^A-Z0-9]", "");
            String base = raw.isEmpty() ? "DEPT" : raw.substring(0, Math.min(raw.length(), 10));
            // Ensure uniqueness by appending a counter if needed
            String candidate = base;
            int suffix = 1;
            while (repository.existsByCode(candidate)) {
                String s = String.valueOf(suffix++);
                candidate = base.substring(0, Math.min(base.length(), 10 - s.length())) + s;
            }
            request.setCode(candidate);
        }

        java.util.Optional<Department> existingOpt = repository.findByCode(request.getCode());
        if (existingOpt.isPresent()) {
            Department existing = existingOpt.get();
            if (existing.isActive()) {
                throw new IllegalStateException("Department code already exists");
            } else {
                // Restore the inactive department instead of inserting a new one
                // to avoid the unique constraint violation on 'code'
                existing.setActive(true);
                mapRequestToEntity(request, existing);
                return toResponse(repository.save(existing));
            }
        }

        Department department = new Department();
        mapRequestToEntity(request, department);

        return toResponse(repository.save(department));
    }

    // ================= UPDATE =================

    public DepartmentResponse update(Long id, DepartmentRequest request) {

        Department department = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Department not found"));

        if (!department.getCode().equals(request.getCode())
                && repository.existsByCode(request.getCode())) {
            throw new IllegalStateException("Department code already exists (globally unique)");
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

        return res;
    }
}