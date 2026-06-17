package com.billbull.backend.hr.employees;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.billbull.backend.security.AdminSafeguardService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.user.UserService;
import com.billbull.backend.user.UserRepository;

import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@Service
public class EmployeeServiceImpl implements EmployeeService {

    private final EmployeeRepository repository;
    private final UserRepository userRepository;
    private final AdminSafeguardService adminSafeguardService;
    private final UserService userService;
    private final BranchRepository branchRepository;

    public EmployeeServiceImpl(
            EmployeeRepository repository,
            UserRepository userRepository,
            AdminSafeguardService adminSafeguardService,
            UserService userService,
            BranchRepository branchRepository) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.adminSafeguardService = adminSafeguardService;
        this.userService = userService;
        this.branchRepository = branchRepository;
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
    @Transactional
    public Employee createEmployee(EmployeeUpsertRequest request, MultipartFile avatar) {
        Employee employee = request.toEmployee();
        employee.setStatus("Pending");
        employee.setWorkflowStage("HR Review");
        resolveBranchEntity(employee);
        handleAvatarUpload(employee, avatar);
        Employee saved = repository.save(employee);

        if (request.hasLoginAccessRequest()) {
            userService.createPendingEmployeeAccess(saved, request.getLoginAccess());
        }

        return saved;
    }

    @Override
    @Transactional
    public Employee updateEmployee(Long id, EmployeeUpsertRequest request, MultipartFile avatar) {
        Employee updated = request.toEmployee();
        Employee existing = getById(id);

        // Capture old email BEFORE field updates (needed for linked user email sync)
        String oldEmail = existing.getEmail();

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
        existing.setPassportNumber(updated.getPassportNumber());
        existing.setPassportIssueDate(updated.getPassportIssueDate());
        existing.setPassportExpiryDate(updated.getPassportExpiryDate());
        existing.setVisaType(updated.getVisaType());
        existing.setVisaNumber(updated.getVisaNumber());
        existing.setVisaExpiryDate(updated.getVisaExpiryDate());

        // Emergency contact
        existing.setEmergencyContactName(updated.getEmergencyContactName());
        existing.setEmergencyContactRelation(updated.getEmergencyContactRelation());
        existing.setEmergencyContactPhone(updated.getEmergencyContactPhone());

        // Attendance / shift
        existing.setShiftType(updated.getShiftType());
        existing.setWorkDays(updated.getWorkDays());
        existing.setWeeklyOffDays(updated.getWeeklyOffDays());
        existing.setLeavePolicy(updated.getLeavePolicy());

        // Additional branch access
        existing.setAdditionalBranchIds(updated.getAdditionalBranchIds());
        existing.setAdditionalWarehouseIds(updated.getAdditionalWarehouseIds());

        // Notes & tags
        existing.setHrNotes(updated.getHrNotes());
        existing.setTags(updated.getTags());

        resolveBranchEntity(existing);
        handleAvatarUpload(existing, avatar);
        Employee saved = repository.save(existing);

        String newEmail = updated.getEmail();
        userRepository.findByLinkedEmployee_Id(id).ifPresent(user -> {
            boolean userChanged = false;
            if (newEmail != null && !newEmail.equals(oldEmail)) {
                // Only sync username if it was originally derived from the old email
                if (oldEmail != null && oldEmail.equals(user.getUsername())) {
                    boolean usernameConflict = userRepository.findByUsername(newEmail).isPresent();
                    if (!usernameConflict) {
                        user.setUsername(newEmail);
                    }
                }
                user.setEmail(newEmail);
                userChanged = true;
            }

            Branch primaryBranch = existing.getBranchEntity();

            // Sync primary branch
            if (primaryBranch != null && (user.getBranch() == null || !primaryBranch.getId().equals(user.getBranch().getId()))) {
                user.setBranch(primaryBranch);
                userChanged = true;
            } else if (primaryBranch == null && user.getBranch() != null) {
                user.setBranch(null);
                userChanged = true;
            }

            // Sync additional branches
            java.util.Set<com.billbull.backend.settings.branch.Branch> nextAdditionalBranches = new java.util.HashSet<>();
            if (existing.getAdditionalBranchIds() != null && !existing.getAdditionalBranchIds().isEmpty()) {
                String[] parts = existing.getAdditionalBranchIds().split(",");
                for (String part : parts) {
                    try {
                        Long bid = Long.parseLong(part.trim());
                        if (primaryBranch != null && bid.equals(primaryBranch.getId())) continue;
                        branchRepository.findById(bid).ifPresent(nextAdditionalBranches::add);
                    } catch (NumberFormatException ignored) {}
                }
            }
            user.setAdditionalBranches(nextAdditionalBranches);
            userChanged = true;

            if (userChanged) {
                userRepository.save(user);
            }
        });

        return saved;
    }

    @Override
    @Transactional
    public Employee deactivateEmployee(Long id) {
        Employee emp = getById(id);

        // BLOCK deactivation if the linked user is the last active ADMIN
        userRepository.findByLinkedEmployee_Id(id).ifPresent(user -> {
            if (adminSafeguardService.isLastAdmin(user)) {
                throw new IllegalStateException(
                        "Cannot deactivate employee: linked user is the last active ADMIN. " +
                        "Reassign the ADMIN role to another user first.");
            }
        });

        emp.setStatus("Inactive");
        emp.setWorkflowStage("Deactivated");
        emp.setPosAccess(false);
        Employee saved = repository.save(emp);

        // Freeze linked user — safe because the last-admin check already passed
        userRepository.findByLinkedEmployee_Id(id).ifPresent(user -> {
            user.setActive(false);
            userRepository.save(user);
        });

        return saved;
    }

    @Override
    @Transactional
    public Employee activateEmployee(Long id) {
        Employee emp = getById(id);
        emp.setStatus("Active");
        emp.setWorkflowStage("Completed");
        Employee saved = repository.save(emp);
        userService.activatePendingEmployeeAccessForEmployee(id);
        return saved;
    }

    @Override
    @Transactional
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
        Employee saved = repository.save(emp);

        if ("Active".equals(saved.getStatus())) {
            userService.activatePendingEmployeeAccessForEmployee(id);
        }

        return saved;
    }

    @Override
    public Employee reject(Long id) {
        Employee emp = getById(id);
        emp.setStatus("Rejected");
        emp.setWorkflowStage("Rejected");
        return repository.save(emp);
    }

    private void resolveBranchEntity(Employee employee) {
        String branchName = employee.getBranch();
        if (branchName == null || branchName.isBlank()) {
            employee.setBranchEntity(null);
            return;
        }

        String label = branchName.trim();
        employee.setBranchEntity(
                branchRepository.findByCodeIgnoreCase(label)
                        .or(() -> branchRepository.findByNameIgnoreCase(label))
                        .or(() -> resolveBranchFromFormattedLabel(label))
                        .orElse(null));
    }

    private Optional<Branch> resolveBranchFromFormattedLabel(String label) {
        int openParenIndex = label.lastIndexOf('(');
        int closeParenIndex = label.lastIndexOf(')');

        if (openParenIndex < 0 || closeParenIndex <= openParenIndex) {
            return Optional.empty();
        }

        String code = label.substring(openParenIndex + 1, closeParenIndex).trim();
        String name = label.substring(0, openParenIndex).trim();

        if (!code.isBlank()) {
            Optional<Branch> byCode = branchRepository.findByCodeIgnoreCase(code);
            if (byCode.isPresent()) {
                return byCode;
            }
        }

        if (!name.isBlank()) {
            return branchRepository.findByNameIgnoreCase(name);
        }

        return Optional.empty();
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
