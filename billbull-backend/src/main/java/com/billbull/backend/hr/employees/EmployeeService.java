package com.billbull.backend.hr.employees;

import org.springframework.web.multipart.MultipartFile;
import java.util.List;

public interface EmployeeService {

    // ===== FETCH =====
    Employee getById(Long id);

    List<Employee> getAll();

    List<Employee> getActiveEmployees();

    List<Employee> getActiveDeliveryPersons();

    /** Candidates for the POS salesperson selector — genuinely Active employees only. */
    List<Employee> getActiveSalespersons();

    List<Employee> getPendingEmployees();

    /** Typeahead search for the global search modal — a lightweight projection, not full records. */
    List<EmployeeSearchResponse> search(String q, int size);

    /** Empty-query preview for the global search modal — the first {@code size} rows. */
    List<EmployeeSearchResponse> preview(int size);

    // ===== CREATE / UPDATE =====
    Employee createEmployee(EmployeeUpsertRequest request, MultipartFile avatar);

    Employee updateEmployee(Long id, EmployeeUpsertRequest request, MultipartFile avatar);

    // ===== STATUS =====
    Employee deactivateEmployee(Long id);

    Employee activateEmployee(Long id);

    // ===== WORKFLOW =====
    Employee approve(Long id);

    Employee reject(Long id);
}
