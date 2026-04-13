package com.billbull.backend.inventory.stocktransfer;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.inventory.warehouse.Bin;
import com.billbull.backend.inventory.warehouse.Locator;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.Zone;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "stock_transfers")
public class StockTransfer extends BaseEntity {

    @Column(nullable = false, unique = true)
    private String transferNo;

    private String referenceDoc;

    @Column(nullable = false)
    private LocalDate transferDate;

    private String reason;
    private String requestedBy;
    private String remarks;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_warehouse_id", nullable = false)
    private Warehouse fromWarehouse;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_zone_id")
    private Zone fromZone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_locator_id")
    private Locator fromLocator;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_bin_id")
    private Bin fromBin;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_warehouse_id", nullable = false)
    private Warehouse toWarehouse;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_zone_id")
    private Zone toZone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_locator_id")
    private Locator toLocator;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_bin_id")
    private Bin toBin;

    @Enumerated(EnumType.STRING)
    private StockTransferStatus status = StockTransferStatus.DRAFT;

    // Logistics
    private String transportMode;
    private String vehicleNo;
    private String driverName;
    private LocalDate dispatchDate;
    private LocalDate arrivalDate;

    @OneToMany(mappedBy = "stockTransfer", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<StockTransferItem> items = new ArrayList<>();

    // Getters & Setters
    public String getTransferNo() {
        return transferNo;
    }

    public void setTransferNo(String transferNo) {
        this.transferNo = transferNo;
    }

    public String getReferenceDoc() {
        return referenceDoc;
    }

    public void setReferenceDoc(String referenceDoc) {
        this.referenceDoc = referenceDoc;
    }

    public LocalDate getTransferDate() {
        return transferDate;
    }

    public void setTransferDate(LocalDate transferDate) {
        this.transferDate = transferDate;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public void setRequestedBy(String requestedBy) {
        this.requestedBy = requestedBy;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public Warehouse getFromWarehouse() {
        return fromWarehouse;
    }

    public void setFromWarehouse(Warehouse fromWarehouse) {
        this.fromWarehouse = fromWarehouse;
    }

    public Zone getFromZone() {
        return fromZone;
    }

    public void setFromZone(Zone fromZone) {
        this.fromZone = fromZone;
    }

    public Locator getFromLocator() {
        return fromLocator;
    }

    public void setFromLocator(Locator fromLocator) {
        this.fromLocator = fromLocator;
    }

    public Bin getFromBin() {
        return fromBin;
    }

    public void setFromBin(Bin fromBin) {
        this.fromBin = fromBin;
    }

    public Warehouse getToWarehouse() {
        return toWarehouse;
    }

    public void setToWarehouse(Warehouse toWarehouse) {
        this.toWarehouse = toWarehouse;
    }

    public Zone getToZone() {
        return toZone;
    }

    public void setToZone(Zone toZone) {
        this.toZone = toZone;
    }

    public Locator getToLocator() {
        return toLocator;
    }

    public void setToLocator(Locator toLocator) {
        this.toLocator = toLocator;
    }

    public Bin getToBin() {
        return toBin;
    }

    public void setToBin(Bin toBin) {
        this.toBin = toBin;
    }

    public StockTransferStatus getStatus() {
        return status;
    }

    public void setStatus(StockTransferStatus status) {
        this.status = status;
    }

    public String getTransportMode() {
        return transportMode;
    }

    public void setTransportMode(String transportMode) {
        this.transportMode = transportMode;
    }

    public String getVehicleNo() {
        return vehicleNo;
    }

    public void setVehicleNo(String vehicleNo) {
        this.vehicleNo = vehicleNo;
    }

    public String getDriverName() {
        return driverName;
    }

    public void setDriverName(String driverName) {
        this.driverName = driverName;
    }

    public LocalDate getDispatchDate() {
        return dispatchDate;
    }

    public void setDispatchDate(LocalDate dispatchDate) {
        this.dispatchDate = dispatchDate;
    }

    public LocalDate getArrivalDate() {
        return arrivalDate;
    }

    public void setArrivalDate(LocalDate arrivalDate) {
        this.arrivalDate = arrivalDate;
    }

    public List<StockTransferItem> getItems() {
        return items;
    }

    public void setItems(List<StockTransferItem> items) {
        this.items = items;
    }
}
