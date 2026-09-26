package com.billbull.backend.hr.employees;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * THE server-side resolver for "who is the salesperson on this sale?".
 *
 * <p>Every path that turns a client-supplied identifier into an attributed employee goes through
 * {@link #requireEligible} — POS checkout, the barcode scan lookup, back-office invoice save. The
 * identity written onto an invoice is always re-read from the employee row here; nothing the
 * client sends about the employee (name, role, status) is ever trusted. A caller that posts an
 * arbitrary {@code salespersonEmployeeId} gets a 400, not an attribution.
 *
 * <p>One resolver, not one per call site: {@code isActiveDeliveryPerson} is already implemented
 * twice in this codebase (once in JPQL, once in Java) and that is exactly the drift this class
 * exists to avoid for salespersons.
 */
@Service
public class SalespersonService {

    private final EmployeeRepository employeeRepository;

    public SalespersonService(EmployeeRepository employeeRepository) {
        this.employeeRepository = employeeRepository;
    }

    /** Active employees holding one of the two salesperson-eligible designations. */
    @Transactional(readOnly = true)
    public List<Employee> listEligible() {
        return employeeRepository.findActiveSalespersons();
    }

    /**
     * Resolves by employee code (the barcode value) and enforces eligibility.
     *
     * @throws ResponseStatusException 400 when the code is blank, unknown, inactive or ineligible
     */
    @Transactional(readOnly = true)
    public Employee requireEligibleByCode(String employeeCode) {
        if (employeeCode == null || employeeCode.isBlank()) {
            throw badRequest("Scan or enter an employee barcode.");
        }
        Employee employee = employeeRepository
                .findByEmployeeCodeIgnoreCase(employeeCode.trim())
                .orElseThrow(() -> badRequest("No employee found for barcode " + employeeCode.trim() + "."));
        return requireEligible(employee);
    }

    /**
     * Resolves by id, falling back to employee code, then enforces eligibility.
     *
     * <p>Mirrors the id-then-code order the Phase 1 POS checkout resolver already used, so an
     * existing client that sends only one of the two keeps working.
     *
     * @return null when the caller supplied neither identifier — "no salesperson named", which is
     *         a legitimate state when the feature is switched off. Whether null is ACCEPTABLE is
     *         the caller's decision, not this method's.
     */
    @Transactional(readOnly = true)
    public Employee resolveEligible(Long employeeId, String employeeCode) {
        boolean hasId = employeeId != null;
        boolean hasCode = employeeCode != null && !employeeCode.isBlank();
        if (!hasId && !hasCode) {
            return null;
        }

        Employee employee = null;
        if (hasId) {
            employee = employeeRepository.findById(employeeId).orElse(null);
        }
        if (employee == null && hasCode) {
            employee = employeeRepository.findByEmployeeCodeIgnoreCase(employeeCode.trim()).orElse(null);
        }
        if (employee == null) {
            throw badRequest("Selected salesperson could not be found.");
        }
        return requireEligible(employee);
    }

    /**
     * The eligibility gate itself. Messages are deliberately specific about WHY — a cashier holding
     * a rejected badge needs to know whether to fetch a different colleague or call HR — but carry
     * no data beyond what the person scanning already has in their hand.
     */
    public Employee requireEligible(Employee employee) {
        if (employee == null) {
            throw badRequest("Selected salesperson could not be found.");
        }
        if (!SalespersonEligibility.isActive(employee)) {
            throw badRequest("Selected salesperson must be an active employee.");
        }
        if (!SalespersonEligibility.isEligibleRole(employee.getRole())) {
            throw badRequest("Employee is not an eligible salesperson. "
                    + "Only Salesperson and Cashier + Salesperson can be selected.");
        }
        return employee;
    }

    public static String fullName(Employee employee) {
        return (employee.getFirstName() + " "
                + (employee.getMiddleName() != null ? employee.getMiddleName() + " " : "")
                + employee.getLastName()).trim().replaceAll("\\s+", " ");
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
