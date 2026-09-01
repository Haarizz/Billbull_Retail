package com.billbull.backend.financials.reports;

/**
 * One entry in the financial reports "Account / Cost Centre" picker.
 *
 * <p>{@code hasData} says whether any ledger entry in the requested period is actually tagged
 * with this cost center, so the picker can mark selections that would return an empty report.
 */
public class CostCenterOptionDTO {

    private final String code;
    private final String name;
    private final boolean hasData;

    public CostCenterOptionDTO(String code, String name, boolean hasData) {
        this.code = code;
        this.name = name;
        this.hasData = hasData;
    }

    public String getCode() { return code; }

    public String getName() { return name; }

    public boolean isHasData() { return hasData; }
}
