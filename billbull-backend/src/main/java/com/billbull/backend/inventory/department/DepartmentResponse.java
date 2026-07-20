package com.billbull.backend.inventory.department;

public class DepartmentResponse {

	private Long id;
	private String name;
	private String desc;
	private String code;
	private Long count;
	// Branch-Level Inventory Phase 11 — owning branch (null = shared/global) for the SPA badges.
	private Long branchId;
	private String branchName;

	public DepartmentResponse(Long id, String name, String desc, String code, Long count) {
		super();
		this.id = id;
		this.name = name;
		this.desc = desc;
		this.code = code;
		this.count = count;
	}

	public DepartmentResponse() {
	}

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public String getDesc() {
		return desc;
	}

	public void setDesc(String desc) {
		this.desc = desc;
	}

	public String getCode() {
		return code;
	}

	public void setCode(String code) {
		this.code = code;
	}

	public Long getCount() {
		return count;
	}

	public void setCount(Long count) {
		this.count = count;
	}

	public Long getBranchId() {
		return branchId;
	}

	public void setBranchId(Long branchId) {
		this.branchId = branchId;
	}

	public String getBranchName() {
		return branchName;
	}

	public void setBranchName(String branchName) {
		this.branchName = branchName;
	}

}
