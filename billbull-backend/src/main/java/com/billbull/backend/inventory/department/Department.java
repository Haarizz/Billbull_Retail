package com.billbull.backend.inventory.department;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "departments", uniqueConstraints = {
		@UniqueConstraint(columnNames = "code")
})
@com.fasterxml.jackson.annotation.JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class Department extends BaseEntity {

	// --------------------
	// Section A: Basic Details
	// --------------------

	@Column(nullable = false)
	private String name;

	@Column(nullable = false, length = 10)
	private String code;

	@Column(columnDefinition = "TEXT")
	private String description;

	// Barcode auto-generation settings (mirrors Brand structure, required NOT NULL
	// in DB)
	@Column(name = "auto_generate", nullable = false)
	private boolean autoGenerate = false;

	@Column(name = "rule_dept_unique", nullable = false)
	private Boolean ruleDeptUnique = false;

	@Column(name = "rule_global_unique")
	private Boolean ruleGlobalUnique = false;

	@Column(name = "rule_brand_unique")
	private Boolean ruleBrandUnique = false;

	@Column(name = "rule_manual_override")
	private Boolean ruleManualOverride = false;

	@Column(name = "barcode_prefix", length = 10, nullable = false)
	private String barcodePrefix = ""; // empty string satisfies NOT NULL

	@Column(name = "prefix_length", nullable = false)
	private Integer prefixLength = 2; // Default to satisfy NOT NULL

	@Column(name = "suffix_length", nullable = false)
	private Integer suffixLength = 4; // Default to satisfy NOT NULL

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

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public Boolean getRuleDeptUnique() {
		return ruleDeptUnique;
	}

	public void setRuleDeptUnique(Boolean ruleDeptUnique) {
		this.ruleDeptUnique = ruleDeptUnique;
	}

	public Boolean getRuleGlobalUnique() {
		return ruleGlobalUnique;
	}

	public void setRuleGlobalUnique(Boolean ruleGlobalUnique) {
		this.ruleGlobalUnique = ruleGlobalUnique;
	}

	public Boolean getRuleBrandUnique() {
		return ruleBrandUnique;
	}

	public void setRuleBrandUnique(Boolean ruleBrandUnique) {
		this.ruleBrandUnique = ruleBrandUnique;
	}

	public Boolean getRuleManualOverride() {
		return ruleManualOverride;
	}

	public void setRuleManualOverride(Boolean ruleManualOverride) {
		this.ruleManualOverride = ruleManualOverride;
	}

	public boolean isAutoGenerate() {
		return autoGenerate;
	}

	public void setAutoGenerate(boolean autoGenerate) {
		this.autoGenerate = autoGenerate;
	}

	public Integer getPrefixLength() {
		return prefixLength;
	}

	public void setPrefixLength(Integer prefixLength) {
		this.prefixLength = prefixLength;
	}

	public Integer getSuffixLength() {
		return suffixLength;
	}

	public void setSuffixLength(Integer suffixLength) {
		this.suffixLength = suffixLength;
	}

}