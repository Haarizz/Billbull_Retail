package com.billbull.backend.purchase.lpo;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One row of the "recent purchase orders" list in the vendor details panel.
 *
 * <p>A narrow projection of {@link Lpo}: number, date, total, status, branch. The entity
 * carries line items, delivery terms, approval state and pricing detail — procurement
 * data that a search preview has no business exposing.
 */
public class VendorRecentLpoResponse {

    private Long id;
    private String lpoNumber;
    private LocalDate lpoDate;
    private BigDecimal grandTotal;
    private String status;
    private String branchName;

    public VendorRecentLpoResponse() {}

    public static VendorRecentLpoResponse from(Lpo lpo) {
        VendorRecentLpoResponse r = new VendorRecentLpoResponse();
        r.id = lpo.getId();
        r.lpoNumber = lpo.getLpoNumber();
        r.lpoDate = lpo.getLpoDate();
        r.grandTotal = lpo.getGrandTotal();
        r.status = lpo.getStatus() != null ? lpo.getStatus().name() : null;
        r.branchName = lpo.getBranchName();
        return r;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getLpoNumber() { return lpoNumber; }
    public void setLpoNumber(String lpoNumber) { this.lpoNumber = lpoNumber; }

    public LocalDate getLpoDate() { return lpoDate; }
    public void setLpoDate(LocalDate lpoDate) { this.lpoDate = lpoDate; }

    public BigDecimal getGrandTotal() { return grandTotal; }
    public void setGrandTotal(BigDecimal grandTotal) { this.grandTotal = grandTotal; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getBranchName() { return branchName; }
    public void setBranchName(String branchName) { this.branchName = branchName; }
}
