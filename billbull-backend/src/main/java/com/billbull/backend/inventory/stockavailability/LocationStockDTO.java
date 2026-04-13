package com.billbull.backend.inventory.stockavailability;

import java.time.LocalDateTime;

public class LocationStockDTO {
    private Long locationId;
    private String name;
    private LocationType type;
    private Integer onHand;
    private Integer reserved;
    private Integer available;
    private String uom;
    private LocalDateTime lastUpdated;

    public LocationStockDTO() {
    }

    public LocationStockDTO(Long locationId, String name, LocationType type, Integer onHand, Integer reserved,
            Integer available, String uom, LocalDateTime lastUpdated) {
        this.locationId = locationId;
        this.name = name;
        this.type = type;
        this.onHand = onHand;
        this.reserved = reserved;
        this.available = available;
        this.uom = uom;
        this.lastUpdated = lastUpdated;
    }

    public Long getLocationId() {
        return locationId;
    }

    public void setLocationId(Long locationId) {
        this.locationId = locationId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public LocationType getType() {
        return type;
    }

    public void setType(LocationType type) {
        this.type = type;
    }

    public Integer getOnHand() {
        return onHand;
    }

    public void setOnHand(Integer onHand) {
        this.onHand = onHand;
    }

    public Integer getReserved() {
        return reserved;
    }

    public void setReserved(Integer reserved) {
        this.reserved = reserved;
    }

    public Integer getAvailable() {
        return available;
    }

    public void setAvailable(Integer available) {
        this.available = available;
    }

    public String getUom() {
        return uom;
    }

    public void setUom(String uom) {
        this.uom = uom;
    }

    public LocalDateTime getLastUpdated() {
        return lastUpdated;
    }

    public void setLastUpdated(LocalDateTime lastUpdated) {
        this.lastUpdated = lastUpdated;
    }
}
