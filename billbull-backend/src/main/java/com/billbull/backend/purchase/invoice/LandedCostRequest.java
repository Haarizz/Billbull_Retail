package com.billbull.backend.purchase.invoice;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class LandedCostRequest {

    private String costName;     // Freight, Customs, Insurance
    private String description;
    private BigDecimal amount;
	public String getCostName() {
		return costName;
	}
	public void setCostName(String costName) {
		this.costName = costName;
	}
	public String getDescription() {
		return description;
	}
	public void setDescription(String description) {
		this.description = description;
	}
	public BigDecimal getAmount() {
		return amount;
	}
	public void setAmount(BigDecimal amount) {
		this.amount = amount;
	}
    
    
}
