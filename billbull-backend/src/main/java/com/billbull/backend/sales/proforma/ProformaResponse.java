package com.billbull.backend.sales.proforma;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class ProformaResponse {

    private Long id;
    private String piNumber;
    private LocalDate piDate;
    private LocalDate validUntil;

    private Long customerId;
    private String customerCode;

    public static class BranchInfo {
        private Long id;
        private String name;
        private String code;

        public BranchInfo(Long id, String name, String code) {
            this.id = id;
            this.name = name;
            this.code = code;
        }

        public Long getId() { return id; }
        public String getName() { return name; }
        public String getCode() { return code; }
    }

    private BranchInfo branch;
    private String customerName;
    private String customerTrn;

    private String quotationNo;
    private String salesOrderNo;
    private Long warehouseId;
    private String warehouseName;

    private BigDecimal subTotal;
    private BigDecimal billDiscount;
    private BigDecimal taxTotal;
    private BigDecimal grandTotal;

    private BigDecimal advancePaid;
    private BigDecimal balanceDue;

    private String paymentMethod;
    private String paymentNotes;

    private ProformaStatus status;
    private Integer revisionNo;

    private List<ProformaItemResponse> items;

	public Long getId() {
		return id;
	}

	public String getPiNumber() {
		return piNumber;
	}

	public LocalDate getPiDate() {
		return piDate;
	}

	public LocalDate getValidUntil() {
		return validUntil;
	}

	public Long getCustomerId() {
		return customerId;
	}

	public String getCustomerCode() {
		return customerCode;
	}

	public String getCustomerName() {
		return customerName;
	}

	public String getCustomerTrn() {
		return customerTrn;
	}

	public String getQuotationNo() {
		return quotationNo;
	}

	public String getSalesOrderNo() {
		return salesOrderNo;
	}

	public Long getWarehouseId() {
		return warehouseId;
	}

	public String getWarehouseName() {
		return warehouseName;
	}

	public BigDecimal getSubTotal() {
		return subTotal;
	}

	public BigDecimal getBillDiscount() {
		return billDiscount;
	}

	public void setBillDiscount(BigDecimal billDiscount) {
		this.billDiscount = billDiscount;
	}

	public BigDecimal getTaxTotal() {
		return taxTotal;
	}

	public BigDecimal getGrandTotal() {
		return grandTotal;
	}

	public BigDecimal getAdvancePaid() {
		return advancePaid;
	}

	public BigDecimal getBalanceDue() {
		return balanceDue;
	}

	public String getPaymentMethod() {
		return paymentMethod;
	}

	public String getPaymentNotes() {
		return paymentNotes;
	}

	public ProformaStatus getStatus() {
		return status;
	}

	public Integer getRevisionNo() {
		return revisionNo;
	}

	public List<ProformaItemResponse> getItems() {
		return items;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public void setPiNumber(String piNumber) {
		this.piNumber = piNumber;
	}

	public void setPiDate(LocalDate piDate) {
		this.piDate = piDate;
	}

	public void setValidUntil(LocalDate validUntil) {
		this.validUntil = validUntil;
	}

	public void setCustomerId(Long customerId) {
		this.customerId = customerId;
	}

	public void setCustomerCode(String customerCode) {
		this.customerCode = customerCode;
	}

	public void setCustomerName(String customerName) {
		this.customerName = customerName;
	}

	public void setCustomerTrn(String customerTrn) {
		this.customerTrn = customerTrn;
	}

	public void setQuotationNo(String quotationNo) {
		this.quotationNo = quotationNo;
	}

	public void setSalesOrderNo(String salesOrderNo) {
		this.salesOrderNo = salesOrderNo;
	}

	public void setWarehouseId(Long warehouseId) {
		this.warehouseId = warehouseId;
	}

	public void setWarehouseName(String warehouseName) {
		this.warehouseName = warehouseName;
	}

	public void setSubTotal(BigDecimal subTotal) {
		this.subTotal = subTotal;
	}

	public void setTaxTotal(BigDecimal taxTotal) {
		this.taxTotal = taxTotal;
	}

	public void setGrandTotal(BigDecimal grandTotal) {
		this.grandTotal = grandTotal;
	}

	public void setAdvancePaid(BigDecimal advancePaid) {
		this.advancePaid = advancePaid;
	}

	public void setBalanceDue(BigDecimal balanceDue) {
		this.balanceDue = balanceDue;
	}

	public void setPaymentMethod(String paymentMethod) {
		this.paymentMethod = paymentMethod;
	}

	public void setPaymentNotes(String paymentNotes) {
		this.paymentNotes = paymentNotes;
	}

	public void setStatus(ProformaStatus status) {
		this.status = status;
	}

	public void setRevisionNo(Integer revisionNo) {
		this.revisionNo = revisionNo;
	}

	public void setItems(List<ProformaItemResponse> items) {
		this.items = items;
	}

    public BranchInfo getBranch() { return branch; }
    public void setBranch(BranchInfo branch) { this.branch = branch; }
}
