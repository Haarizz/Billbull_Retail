package com.billbull.backend.hr.employees;

import org.springframework.beans.BeanUtils;

public class EmployeeUpsertRequest extends Employee {

    private EmployeeLoginAccessRequest loginAccess;

    public EmployeeLoginAccessRequest getLoginAccess() {
        return loginAccess;
    }

    public void setLoginAccess(EmployeeLoginAccessRequest loginAccess) {
        this.loginAccess = loginAccess;
    }

    public boolean hasLoginAccessRequest() {
        return loginAccess != null && loginAccess.isRequested();
    }

    public Employee toEmployee() {
        Employee employee = new Employee();
        BeanUtils.copyProperties(
                this,
                employee,
                "id",
                "loginAccess",
                "status",
                "workflowStage",
                "submittedAt",
                "avatarUrl");
        return employee;
    }
}
