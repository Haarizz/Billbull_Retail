package com.billbull.backend.hr.salaryadvance;

import jakarta.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Entity
@Table(name = "salary_repayment_schedules")
public class RepaymentSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne
    @JoinColumn(name = "request_id", referencedColumnName = "id")
    private SalaryAdvanceRequest request;

    private String employeeId; // Redundant but useful for fast queries
    private String employeeName;
    private String department;
    
    @Enumerated(EnumType.STRING)
    private AdvanceType type;

    private BigDecimal totalAmount;
    private BigDecimal paidAmount;
    private BigDecimal installmentAmount;
    private BigDecimal remainingAmount;

    private Integer totalMonths;
    
    @Enumerated(EnumType.STRING)
    private AdvanceStatus status; // ACTIVE or COMPLETED

    public Long getId() {
		return id;
	}
	public void setId(Long id) {
		this.id = id;
	}
	public SalaryAdvanceRequest getRequest() {
		return request;
	}
	public void setRequest(SalaryAdvanceRequest request) {
		this.request = request;
	}
	public String getEmployeeId() {
		return employeeId;
	}
	public void setEmployeeId(String employeeId) {
		this.employeeId = employeeId;
	}
	public String getEmployeeName() {
		return employeeName;
	}
	public void setEmployeeName(String employeeName) {
		this.employeeName = employeeName;
	}
	public String getDepartment() {
		return department;
	}
	public void setDepartment(String department) {
		this.department = department;
	}
	public AdvanceType getType() {
		return type;
	}
	public void setType(AdvanceType type) {
		this.type = type;
	}
	public BigDecimal getTotalAmount() {
		return totalAmount;
	}
	public void setTotalAmount(BigDecimal totalAmount) {
		this.totalAmount = totalAmount;
	}
	public BigDecimal getPaidAmount() {
		return paidAmount;
	}
	public void setPaidAmount(BigDecimal paidAmount) {
		this.paidAmount = paidAmount;
	}
	public BigDecimal getInstallmentAmount() {
		return installmentAmount;
	}
	public void setInstallmentAmount(BigDecimal installmentAmount) {
		this.installmentAmount = installmentAmount;
	}
	public BigDecimal getRemainingAmount() {
		return remainingAmount;
	}
	public void setRemainingAmount(BigDecimal remainingAmount) {
		this.remainingAmount = remainingAmount;
	}
	public Integer getTotalMonths() {
		return totalMonths;
	}
	public void setTotalMonths(Integer totalMonths) {
		this.totalMonths = totalMonths;
	}
	public AdvanceStatus getStatus() {
		return status;
	}
	public void setStatus(AdvanceStatus status) {
		this.status = status;
	}
	public LocalDate getNextDeductionDate() {
		return nextDeductionDate;
	}
	public void setNextDeductionDate(LocalDate nextDeductionDate) {
		this.nextDeductionDate = nextDeductionDate;
	}
	public String getApproverName() {
		return approverName;
	}
	public void setApproverName(String approverName) {
		this.approverName = approverName;
	}
	public LocalDate getApprovalDate() {
		return approvalDate;
	}
	public void setApprovalDate(LocalDate approvalDate) {
		this.approvalDate = approvalDate;
	}
	private LocalDate nextDeductionDate;
    private String approverName;
    private LocalDate approvalDate;
}