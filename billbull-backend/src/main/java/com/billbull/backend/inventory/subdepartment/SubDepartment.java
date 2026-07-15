package com.billbull.backend.inventory.subdepartment;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.inventory.department.Department;
import com.billbull.backend.settings.branch.Branch;
import jakarta.persistence.*;

// Branch-Level Inventory Phase 6A: the global UNIQUE(code) and UNIQUE(name, department_id)
// constraints were removed here and replaced by DB-level PARTIAL unique indexes (Flyway V37) —
// per-branch + global-null. Both the table-level @UniqueConstraint set AND the field-level
// @Column(unique=true) on code are intentionally gone so Hibernate (ddl-auto=update) does not
// recreate a global unique constraint. Uniqueness is now owned by the database.
@Entity
@Table(name = "sub_departments")
@com.fasterxml.jackson.annotation.JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class SubDepartment extends BaseEntity {

	@Column(nullable = false)
	private String name;

	@Column(nullable = false)
	private String code;

	// Phase 6A: nullable branch (null = shared/global). Scoping wired in Phase 6B; inert for now.
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "branch_id")
	@com.fasterxml.jackson.annotation.JsonIgnore
	private Branch branch;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "department_id", nullable = false)
	private Department department;

	@Column(length = 500)
	private String description;

	// ---- UI Control Flags ----
	private boolean allowOverride;
	private boolean autoCreateGroups;
	private boolean restrictTerminals;

	// ---- Status ----
	@Column(nullable = false)
	private boolean active = true;

	// ---- Derived / Future Counters ----
	private int itemCount;
	private int brandCount;
	private int noBarcodeCount;

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getCode() {
		return code;
	}

	public void setCode(String code) {
		this.code = code;
	}

	public Branch getBranch() {
		return branch;
	}

	public void setBranch(Branch branch) {
		this.branch = branch;
	}

	public Department getDepartment() {
		return department;
	}

	public void setDepartment(Department department) {
		this.department = department;
	}

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public boolean isAllowOverride() {
		return allowOverride;
	}

	public void setAllowOverride(boolean allowOverride) {
		this.allowOverride = allowOverride;
	}

	public boolean isAutoCreateGroups() {
		return autoCreateGroups;
	}

	public void setAutoCreateGroups(boolean autoCreateGroups) {
		this.autoCreateGroups = autoCreateGroups;
	}

	public boolean isRestrictTerminals() {
		return restrictTerminals;
	}

	public void setRestrictTerminals(boolean restrictTerminals) {
		this.restrictTerminals = restrictTerminals;
	}

	public boolean isActive() {
		return active;
	}

	public void setActive(boolean active) {
		this.active = active;
	}

	public int getItemCount() {
		return itemCount;
	}

	public void setItemCount(int itemCount) {
		this.itemCount = itemCount;
	}

	public int getBrandCount() {
		return brandCount;
	}

	public void setBrandCount(int brandCount) {
		this.brandCount = brandCount;
	}

	public int getNoBarcodeCount() {
		return noBarcodeCount;
	}

	public void setNoBarcodeCount(int noBarcodeCount) {
		this.noBarcodeCount = noBarcodeCount;
	}

	/* getters & setters */

}
