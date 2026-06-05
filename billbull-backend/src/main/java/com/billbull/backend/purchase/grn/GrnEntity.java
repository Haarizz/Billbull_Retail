package com.billbull.backend.purchase.grn;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.Zone;
import com.billbull.backend.inventory.warehouse.Locator;
import com.billbull.backend.inventory.warehouse.Bin;
import com.billbull.backend.purchase.lpo.Lpo;
import com.billbull.backend.settings.branch.Branch;

import jakarta.persistence.*;

@Entity
@Table(name = "grns", indexes = {
    @Index(name = "idx_grn_branch", columnList = "branch_id")
})
public class GrnEntity extends BaseEntity {

    @Column(unique = true, nullable = false)
    private String grnNo;

    private LocalDate grnDate;
    private String vendorName;

    /* ===== LPO LINK (ONLY FOR LPO-BASED GRNs) ===== */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lpo_id")
    private Lpo lpo;

    private String lpoNumber; // display only

    @Enumerated(EnumType.STRING)
    private GrnStatus status;

    @Enumerated(EnumType.STRING)
    private QcStatus qcStatus;

    /* ===== STOCK FLAG ===== */
    @Column(nullable = false)
    private boolean stockPosted = false;

    private Integer packageCount;
    private String receivedBy;
    private String checkedBy;

    private BigDecimal subtotal;
    private BigDecimal taxAmount;
    private BigDecimal grandTotal;
    @Column(name = "branch_id")
    private Long branchId;
    private String branchName;
    private String branchCode;

    /** Navigable view of {@link #branchId}. Read-only — writes go through {@link #setBranchId(Long)}. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id", insertable = false, updatable = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Branch branchEntity;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "zone_id")
    private Zone zone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "locator_id")
    private Locator locator;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bin_id")
    private Bin bin;

    @OneToMany(mappedBy = "grn", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<GrnItemEntity> items = new ArrayList<>();

    /* ===== SOURCE OF TRUTH ===== */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private GrnSourceType sourceType;

    /**
     * Points to:
     * - LPO.id when sourceType = SYSTEM_AUTO
     * - DirectPurchase.id when sourceType = DIRECT_PURCHASE
     * - null when sourceType = MANUAL
     */
    @Column(name = "reference_id")
    private Long referenceId;

    /* ===== GETTERS / SETTERS ===== */

    public boolean isStockPosted() {
        return stockPosted;
    }

    public void setStockPosted(boolean stockPosted) {
        this.stockPosted = stockPosted;
    }

    public GrnSourceType getSourceType() {
        return sourceType;
    }

    public void setSourceType(GrnSourceType sourceType) {
        this.sourceType = sourceType;
    }

    public Long getReferenceId() {
        return referenceId;
    }

    public void setReferenceId(Long referenceId) {
        this.referenceId = referenceId;
    }

    public Warehouse getWarehouse() {
        return warehouse;
    }

    public void setWarehouse(Warehouse warehouse) {
        this.warehouse = warehouse;
    }

    public Zone getZone() {
        return zone;
    }

    public void setZone(Zone zone) {
        this.zone = zone;
    }

    public Locator getLocator() {
        return locator;
    }

    public void setLocator(Locator locator) {
        this.locator = locator;
    }

    public Bin getBin() {
        return bin;
    }

    public void setBin(Bin bin) {
        this.bin = bin;
    }

    public List<GrnItemEntity> getItems() {
        return items;
    }

    public void setItems(List<GrnItemEntity> items) {
        this.items = items;
    }

    public String getGrnNo() {
        return grnNo;
    }

    public void setGrnNo(String grnNo) {
        this.grnNo = grnNo;
    }

    public Lpo getLpo() {
        return lpo;
    }

    public void setLpo(Lpo lpo) {
        this.lpo = lpo;
    }

    public String getLpoNumber() {
        return lpoNumber;
    }

    public void setLpoNumber(String lpoNumber) {
        this.lpoNumber = lpoNumber;
    }

    public LocalDate getGrnDate() {
        return grnDate;
    }

    public void setGrnDate(LocalDate grnDate) {
        this.grnDate = grnDate;
    }

    public String getVendorName() {
        return vendorName;
    }

    public void setVendorName(String vendorName) {
        this.vendorName = vendorName;
    }

    public GrnStatus getStatus() {
        return status;
    }

    public void setStatus(GrnStatus status) {
        this.status = status;
    }

    public QcStatus getQcStatus() {
        return qcStatus;
    }

    public void setQcStatus(QcStatus qcStatus) {
        this.qcStatus = qcStatus;
    }

    public Integer getPackageCount() {
        return packageCount;
    }

    public void setPackageCount(Integer packageCount) {
        this.packageCount = packageCount;
    }

    public String getReceivedBy() {
        return receivedBy;
    }

    public void setReceivedBy(String receivedBy) {
        this.receivedBy = receivedBy;
    }

    public String getCheckedBy() {
        return checkedBy;
    }

    public void setCheckedBy(String checkedBy) {
        this.checkedBy = checkedBy;
    }

    public BigDecimal getSubtotal() {
        return subtotal;
    }

    public void setSubtotal(BigDecimal subtotal) {
        this.subtotal = subtotal;
    }

    public BigDecimal getTaxAmount() {
        return taxAmount;
    }

    public void setTaxAmount(BigDecimal taxAmount) {
        this.taxAmount = taxAmount;
    }

    public BigDecimal getGrandTotal() {
        return grandTotal;
    }

    public void setGrandTotal(BigDecimal grandTotal) {
        this.grandTotal = grandTotal;
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

    public String getBranchCode() {
        return branchCode;
    }

    public void setBranchCode(String branchCode) {
        this.branchCode = branchCode;
    }

    public Branch getBranchEntity() { return branchEntity; }
}
