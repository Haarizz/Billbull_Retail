package com.billbull.backend.sales.quotation;

public class QuotationStockCheckDTO {

    private String itemCode;
    private String itemName;
    private Integer requestedQty;
    private Integer availableQty;
    private boolean sufficient;
	
	public String getItemCode() {
		return itemCode;
	}
	public String getItemName() {
		return itemName;
	}
	public Integer getRequestedQty() {
		return requestedQty;
	}
	public Integer getAvailableQty() {
		return availableQty;
	}
	public boolean isSufficient() {
		return sufficient;
	}
	public void setItemCode(String itemCode) {
		this.itemCode = itemCode;
	}
	public void setItemName(String itemName) {
		this.itemName = itemName;
	}
	public void setRequestedQty(Integer requestedQty) {
		this.requestedQty = requestedQty;
	}
	public void setAvailableQty(Integer availableQty) {
		this.availableQty = availableQty;
	}
	public void setSufficient(boolean sufficient) {
		this.sufficient = sufficient;
	}

}
