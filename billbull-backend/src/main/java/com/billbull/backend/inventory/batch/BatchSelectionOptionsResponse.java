package com.billbull.backend.inventory.batch;

import java.util.ArrayList;
import java.util.List;

public class BatchSelectionOptionsResponse {
    public String itemCode;
    public String productName;
    public String locationCode;
    public Integer requiredQuantity;
    public Boolean fefoEnabled;
    public Integer minExpiryDaysForSale;
    public Integer selectedQuantity;
    public Integer shortageQuantity;
    public Boolean sufficient;
    public String message;
    public List<BatchSelectionRow> fefoSelection = new ArrayList<>();
    public List<BatchSelectionRow> availableBatches = new ArrayList<>();
    public List<BinOption> availableBins = new ArrayList<>();
    public Long binId;
    public Long warehouseId;

    public static class BinOption {
        public Long id;
        public String code;
        public String name;

        public BinOption() {
        }

        public BinOption(Long id, String code, String name) {
            this.id = id;
            this.code = code;
            this.name = name;
        }
    }
}
