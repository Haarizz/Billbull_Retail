package com.billbull.backend.hr.employees;

import org.springframework.web.multipart.MultipartFile;
import java.util.List;

public interface EmployeeService {

    // ===== FETCH =====
    Employee getById(Long id);

    List<Employee> getAll();

    List<Employee> getActiveEmployees();

    List<Employee> getPendingEmployees();

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
