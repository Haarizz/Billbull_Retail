package com.billbull.backend.financials.generalledger;

import java.util.ArrayList;
import java.util.List;

public class OpeningBalanceSaveResponse {
    private int updatedCount;
    private List<String> lockedAccountCodes = new ArrayList<>();

    public OpeningBalanceSaveResponse() {
    }

    public OpeningBalanceSaveResponse(int updatedCount, List<String> lockedAccountCodes) {
        this.updatedCount = updatedCount;
        this.lockedAccountCodes = lockedAccountCodes != null ? lockedAccountCodes : new ArrayList<>();
    }

    public int getUpdatedCount() {
        return updatedCount;
    }

    public void setUpdatedCount(int updatedCount) {
        this.updatedCount = updatedCount;
    }

    public List<String> getLockedAccountCodes() {
        return lockedAccountCodes;
    }

    public void setLockedAccountCodes(List<String> lockedAccountCodes) {
        this.lockedAccountCodes = lockedAccountCodes != null ? lockedAccountCodes : new ArrayList<>();
    }
}

