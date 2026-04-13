package com.billbull.backend.inventory.department;

import jakarta.validation.constraints.NotBlank;

public class DepartmentRequest {

	@NotBlank
	private String name;

	// Optional on quick-add — service auto-generates when blank
	private String code;

	private String desc;

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

	public String getDesc() {
		return desc;
	}

	public void setDesc(String desc) {
		this.desc = desc;
	}

}
