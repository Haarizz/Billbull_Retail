package com.billbull.backend.hr.employees;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;

@Service
public class EmployeeServiceImpl implements EmployeeService {

    private final EmployeeRepository repository;

    // ✅ MANUAL CONSTRUCTOR (FIXES ERROR)
    public EmployeeServiceImpl(EmployeeRepository repository) {
        this.repository = repository;
    }

    @Override
    public Employee getById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Employee not found"));
    }

    @Override
    public List<Employee> getAll() {
        return repository.findAll();
    }

    @Override
    public List<Employee> getActiveEmployees() {
        return repository.findByStatusIn(
                Arrays.asList("Active", "Inactive"));
    }

    @Override
    public List<Employee> getPendingEmployees() {
        return repository.findByStatus("Pending");
    }

    @Override
    public Employee createEmployee(Employee employee, MultipartFile avatar) {
        employee.setStatus("Pending");
        employee.setWorkflowStage("HR Review");
        handleAvatarUpload(employee, avatar);
        return repository.save(employee);
    }

    @Override
    public Employee updateEmployee(Long id, Employee updated, MultipartFile avatar) {
        Employee existing = getById(id);

        existing.setFirstName(updated.getFirstName());
        existing.setMiddleName(updated.getMiddleName());
        existing.setLastName(updated.getLastName());
        existing.setGender(updated.getGender());
        existing.setDateOfBirth(updated.getDateOfBirth());
        existing.setPhone(updated.getPhone());
        existing.setEmail(updated.getEmail());
        existing.setCurrentAddress(updated.getCurrentAddress());
        existing.setNationality(updated.getNationality());
        existing.setRole(updated.getRole());
        existing.setDepartment(updated.getDepartment());
        existing.setBranch(updated.getBranch());
        existing.setReportingManager(updated.getReportingManager());
        existing.setWorkLocation(updated.getWorkLocation());
        existing.setEmploymentType(updated.getEmploymentType());
        existing.setJoinDate(updated.getJoinDate());
        existing.setProbationPeriod(updated.getProbationPeriod());
        existing.setConfirmationDate(updated.getConfirmationDate());
        existing.setPosAccess(updated.getPosAccess());
        existing.setPosPin(updated.getPosPin());
        existing.setPermissionProfile(updated.getPermissionProfile());
        existing.setSalaryType(updated.getSalaryType());
        existing.setBasicSalary(updated.getBasicSalary());
        existing.setEmiratesId(updated.getEmiratesId());
        existing.setEmiratesIdExpiry(updated.getEmiratesIdExpiry());

        handleAvatarUpload(existing, avatar);
        return repository.save(existing);
    }

    @Override
    public Employee deactivateEmployee(Long id) {
        Employee emp = getById(id);
        emp.setStatus("Inactive");
        emp.setWorkflowStage("Deactivated");
        emp.setPosAccess(false);
        return repository.save(emp);
    }

    @Override
    public Employee activateEmployee(Long id) {
        Employee emp = getById(id);
        emp.setStatus("Active");
        emp.setWorkflowStage("Completed");
        return repository.save(emp);
    }

    @Override
    public Employee approve(Long id) {
        Employee emp = getById(id);

        if ("HR Review".equals(emp.getWorkflowStage())) {
            emp.setWorkflowStage("Manager Approval");
        } else if ("Manager Approval".equals(emp.getWorkflowStage())) {
            emp.setWorkflowStage("Accounts Approval");
        } else {
            emp.setStatus("Active");
            emp.setWorkflowStage("Completed");
        }
        return repository.save(emp);
    }

    @Override
    public Employee reject(Long id) {
        Employee emp = getById(id);
        emp.setStatus("Rejected");
        emp.setWorkflowStage("Rejected");
        return repository.save(emp);
    }

    private void handleAvatarUpload(Employee employee, MultipartFile avatar) {
        if (avatar == null || avatar.isEmpty())
            return;

        try {
            File dir = new File("uploads/employees");
            if (!dir.exists())
                dir.mkdirs();

            String filename = System.currentTimeMillis() + "_" + avatar.getOriginalFilename();
            File file = new File(dir, filename);
            Files.write(file.toPath(), avatar.getBytes());
            employee.setAvatarUrl("/uploads/employees/" + filename);
        } catch (Exception e) {
            throw new RuntimeException("Avatar upload failed", e);
        }
    }
}
