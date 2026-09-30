package com.billbull.backend.hr.employees;

/**
 * Lightweight employee projection for the global search modal.
 *
 * <p>A strict identification projection in the same spirit as
 * {@link SalespersonLookupResponse}: identity, designation, department, branch and
 * status. It deliberately carries <em>no</em> salary, payroll, attendance, leave,
 * document (Emirates ID / passport / visa), address, phone or email data — a
 * search result is a pointer to a record, not the record.
 *
 * <p>Unlike {@code SalespersonLookupResponse}, this endpoint is gated on
 * {@code hr.employee}, not merely on being authenticated.
 */
public class EmployeeSearchResponse {

    private Long id;
    private String employeeCode;
    /** First + middle + last, whitespace-collapsed. */
    private String name;
    /** Designation. */
    private String role;
    private String department;
    private String branch;
    /** "Active", "Inactive", "Pending", … */
    private String status;

    public EmployeeSearchResponse() {
    }

    /**
     * Built directly from a JPQL constructor expression; the name parts are
     * joined here so the query stays a plain projection.
     */
    public EmployeeSearchResponse(Long id, String employeeCode, String firstName, String middleName,
            String lastName, String role, String department, String branch, String status) {
        this.id = id;
        this.employeeCode = employeeCode;
        this.name = joinName(firstName, middleName, lastName);
        this.role = role;
        this.department = department;
        this.branch = branch;
        this.status = status;
    }

    /** Mirrors EmployeeController's own fullName() helper. */
    private static String joinName(String first, String middle, String last) {
        String joined = (first == null ? "" : first) + " "
                + (middle == null || middle.isBlank() ? "" : middle + " ")
                + (last == null ? "" : last);
        return joined.trim().replaceAll("\\s+", " ");
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getEmployeeCode() { return employeeCode; }
    public void setEmployeeCode(String employeeCode) { this.employeeCode = employeeCode; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
