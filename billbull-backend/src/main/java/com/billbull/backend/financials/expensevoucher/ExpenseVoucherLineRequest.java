package com.billbull.backend.financials.expensevoucher;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class ExpenseVoucherLineRequest {
    private String glAccountId;
    private String glAccountName;
    private String description;
    private String category;
    private String costCenter;
    private BigDecimal amount;
    private BigDecimal taxRate;
}
