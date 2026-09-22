package com.billbull.backend.sales.invoice;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.hr.employees.Employee;
import com.billbull.backend.hr.employees.EmployeeRepository;

/**
 * Server-side resolution of the salesperson an invoice is attributed to.
 *
 * <p>Deliberately a tiny collaborator rather than another argument on {@link SalesInvoiceService}'s
 * constructor: the same rule has to hold for the POS checkout path and the back-office invoice
 * path, and this keeps one copy of it without widening a 30-argument constructor that four existing
 * test classes build positionally.
 *
 * <p>The contract mirrors {@code PosCheckoutController.resolveSalesperson}: the client names a
 * candidate by id (or employee code as a fallback), and the identity written onto the invoice comes
 * from the employee row — never from a client-supplied display name.
 */
@Service
public class SalespersonAttributionService {

    private final EmployeeRepository employeeRepository;

    public SalespersonAttributionService(EmployeeRepository employeeRepository) {
        this.employeeRepository = employeeRepository;
    }

    /**
     * Normalises the salesperson fields on an incoming invoice in place.
     *
     * <p>No id and no code supplied → all three fields are cleared to null ("Unassigned"). There is
     * no sentinel employee. An explicitly supplied but unresolvable or inactive employee is an
     * error rather than a silent drop, because dropping it would quietly misattribute commission.
     *
     * <p>The legacy {@link SalesInvoice#getSalesperson()} String is never read or written here.
     */
    public void applyTo(SalesInvoice invoice) {
        if (invoice == null) return;

        Long id = invoice.getSalespersonEmployeeId();
        String code = invoice.getSalespersonEmployeeCode();
        boolean hasId = id != null;
        boolean hasCode = code != null && !code.isBlank();

        if (!hasId && !hasCode) {
            invoice.setSalespersonEmployeeId(null);
            invoice.setSalespersonEmployeeCode(null);
            invoice.setSalespersonName(null);
            return;
        }

        Employee employee = null;
        if (hasId) {
            employee = employeeRepository.findById(id).orElse(null);
        }
        if (employee == null && hasCode) {
            employee = employeeRepository.findByEmployeeCodeIgnoreCase(code.trim()).orElse(null);
        }
        if (employee == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Selected salesperson could not be found.");
        }
        if (employee.getStatus() == null || !"active".equalsIgnoreCase(employee.getStatus().trim())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Selected salesperson must be an active employee.");
        }

        invoice.setSalespersonEmployeeId(employee.getId());
        invoice.setSalespersonEmployeeCode(employee.getEmployeeCode());
        invoice.setSalespersonName(fullName(employee));
    }

    public static String fullName(Employee employee) {
        return (employee.getFirstName() + " "
                + (employee.getMiddleName() != null ? employee.getMiddleName() + " " : "")
                + employee.getLastName()).trim().replaceAll("\\s+", " ");
    }
}
