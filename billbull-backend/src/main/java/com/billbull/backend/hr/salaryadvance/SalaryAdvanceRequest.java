package com.billbull.backend.hr.salaryadvance;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "salary_advance")
public class SalaryAdvanceRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String employeeId;
    private String employeeName;
    private String department;

    @Enumerated(EnumType.STRING)
    private AdvanceType type;

    private BigDecimal requestedAmount;
    private BigDecimal approvedAmount; // Set upon approval
    
    // ✅ ADDED THIS FIELD TO FIX THE ERROR
    private BigDecimal paidAmount; 

    private LocalDate requestDate;
    
    @Enumerated(EnumType.STRING)
    private AdvanceStatus status;

    private Integer repaymentPeriodMonths;
    
    @Column(columnDefinition = "TEXT")
    private String remarks;

    private String attachmentFileName;

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
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

	public BigDecimal getRequestedAmount() {
		return requestedAmount;
	}

	public void setRequestedAmount(BigDecimal requestedAmount) {
		this.requestedAmount = requestedAmount;
	}

	public BigDecimal getApprovedAmount() {
		return approvedAmount;
	}

	public void setApprovedAmount(BigDecimal approvedAmount) {
		this.approvedAmount = approvedAmount;
	}

	public BigDecimal getPaidAmount() {
		return paidAmount;
	}

	public void setPaidAmount(BigDecimal paidAmount) {
		this.paidAmount = paidAmount;
	}

	public LocalDate getRequestDate() {
		return requestDate;
	}

	public void setRequestDate(LocalDate requestDate) {
		this.requestDate = requestDate;
	}

	public AdvanceStatus getStatus() {
		return status;
	}

	public void setStatus(AdvanceStatus status) {
		this.status = status;
	}

	public Integer getRepaymentPeriodMonths() {
		return repaymentPeriodMonths;
	}

	public void setRepaymentPeriodMonths(Integer repaymentPeriodMonths) {
		this.repaymentPeriodMonths = repaymentPeriodMonths;
	}

	public String getRemarks() {
		return remarks;
	}

	public void setRemarks(String remarks) {
		this.remarks = remarks;
	}

	public String getAttachmentFileName() {
		return attachmentFileName;
	}

	public void setAttachmentFileName(String attachmentFileName) {
		this.attachmentFileName = attachmentFileName;
	}
}