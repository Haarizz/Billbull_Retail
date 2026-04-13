package com.billbull.backend.inventory.stockavailability;

import java.util.List;
import java.util.ArrayList;

public class StockAvailabilityResponse {
    private List<LocationStockDTO> locations = new ArrayList<>();
    private List<IncomingLpoDTO> incomingLpos = new ArrayList<>();

    public StockAvailabilityResponse() {
    }

    public StockAvailabilityResponse(List<LocationStockDTO> locations, List<IncomingLpoDTO> incomingLpos) {
        this.locations = locations != null ? locations : new ArrayList<>();
        this.incomingLpos = incomingLpos != null ? incomingLpos : new ArrayList<>();
    }

    public List<LocationStockDTO> getLocations() {
        return locations;
    }

    public void setLocations(List<LocationStockDTO> locations) {
        this.locations = locations != null ? locations : new ArrayList<>();
    }

    public List<IncomingLpoDTO> getIncomingLpos() {
        return incomingLpos;
    }

    public void setIncomingLpos(List<IncomingLpoDTO> incomingLpos) {
        this.incomingLpos = incomingLpos != null ? incomingLpos : new ArrayList<>();
    }
}
