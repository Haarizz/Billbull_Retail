package com.billbull.backend.hr.targets;

import java.time.LocalDate;
import java.util.List;

/**
 * Whether this month's salesperson target configuration is complete enough to allow POS sales.
 *
 * <p>Carries only what the warning needs to render: who is misconfigured, and which half is
 * missing. Deliberately no phone, salary, email, branch or any other employee field — the POS
 * cashier who sees this dialog has no HR permissions, and this DTO is the reason that is safe.
 */
public class TargetReadinessResponse {

    /** Mirrors {@code SalesSettings.monthlyTargetRequired}. False means nothing is ever blocked. */
    private boolean required;
    /** True when sales may proceed. Always true when {@link #required} is false. */
    private boolean ready;
    /** The month evaluated, normalised to its first day. */
    private LocalDate month;
    /** Empty when ready. Never null. */
    private List<MissingRow> missing = List.of();

    public boolean isRequired() { return required; }
    public void setRequired(boolean required) { this.required = required; }

    public boolean isReady() { return ready; }
    public void setReady(boolean ready) { this.ready = ready; }

    public LocalDate getMonth() { return month; }
    public void setMonth(LocalDate month) { this.month = month; }

    public List<MissingRow> getMissing() { return missing; }
    public void setMissing(List<MissingRow> missing) { this.missing = missing != null ? missing : List.of(); }

    /** One active, eligible employee whose current-month configuration is incomplete. */
    public static class MissingRow {
        private Long employeeId;
        private String employeeCode;
        private String employeeName;
        private String role;
        /** No target row at all, or a target of zero. */
        private boolean missingTarget;
        /** Commission rate is NULL. An explicit 0.00 is CONFIGURED and does not set this. */
        private boolean missingCommission;

        public Long getEmployeeId() { return employeeId; }
        public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }

        public String getEmployeeCode() { return employeeCode; }
        public void setEmployeeCode(String employeeCode) { this.employeeCode = employeeCode; }

        public String getEmployeeName() { return employeeName; }
        public void setEmployeeName(String employeeName) { this.employeeName = employeeName; }

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public boolean isMissingTarget() { return missingTarget; }
        public void setMissingTarget(boolean missingTarget) { this.missingTarget = missingTarget; }

        public boolean isMissingCommission() { return missingCommission; }
        public void setMissingCommission(boolean missingCommission) { this.missingCommission = missingCommission; }
    }
}
