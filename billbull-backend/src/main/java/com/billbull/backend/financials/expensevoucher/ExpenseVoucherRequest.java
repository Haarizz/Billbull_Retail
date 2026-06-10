package com.billbull.backend.financials.expensevoucher;

import java.time.LocalDate;
import java.util.List;
import lombok.Data;

@Data
public class ExpenseVoucherRequest {
    private LocalDate date;
    private String vendor;
    private Long vendorId;
    private String paymentMode;
    private String paymentAccountId;
    private Long branchId;
    private String narration;
    private String status;
    private List<ExpenseVoucherLineRequest> lines;
}
