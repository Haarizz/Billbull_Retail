package com.billbull.backend.settings.branch;

import com.fasterxml.jackson.annotation.JsonProperty;

public class BranchResponse {

    private Long id;
    private String name;
    private String code;
    private String address;
    private String addressLine2;
    private String city;
    private String state;
    private String country;
    private String postalCode;
    private String phone;
    private String fax;
    private String email;
    private String trnNumber;
    private String logoUrl;
    private String stampUrl;
    private String bankName;
    private String bankAccountNumber;
    private String bankIban;
    private String bankSwift;
    private int sortOrder;
    private boolean isDefault;
    private boolean isHeadquarters;
    private BranchType type;
    private Long defaultWarehouseId;
    private String defaultWarehouseName;
    private String defaultWarehouseBranchName;

    public BranchResponse() {}

    public static BranchResponse from(Branch b) {
        BranchResponse r = new BranchResponse();
        r.id = b.getId();
        r.name = b.getName();
        r.code = b.getCode();
        r.address = b.getAddress();
        r.addressLine2 = b.getAddressLine2();
        r.city = b.getCity();
        r.state = b.getState();
        r.country = b.getCountry();
        r.postalCode = b.getPostalCode();
        r.phone = b.getPhone();
        r.fax = b.getFax();
        r.email = b.getEmail();
        r.trnNumber = b.getTrnNumber();
        r.logoUrl = b.getLogoUrl();
        r.stampUrl = b.getStampUrl();
        r.bankName = b.getBankName();
        r.bankAccountNumber = b.getBankAccountNumber();
        r.bankIban = b.getBankIban();
        r.bankSwift = b.getBankSwift();
        r.sortOrder = b.getSortOrder();
        r.isDefault = b.isDefault();
        r.isHeadquarters = b.isHeadquarters();
        r.type = b.getType();
        if (b.getDefaultWarehouse() != null) {
            r.defaultWarehouseId = b.getDefaultWarehouse().getId();
            r.defaultWarehouseName = b.getDefaultWarehouse().getName();
            r.defaultWarehouseBranchName = b.getDefaultWarehouse().getBranch() != null
                    ? b.getDefaultWarehouse().getBranch().getName()
                    : null;
        }
        return r;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getAddressLine2() { return addressLine2; }
    public void setAddressLine2(String addressLine2) { this.addressLine2 = addressLine2; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getPostalCode() { return postalCode; }
    public void setPostalCode(String postalCode) { this.postalCode = postalCode; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getFax() { return fax; }
    public void setFax(String fax) { this.fax = fax; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getTrnNumber() { return trnNumber; }
    public void setTrnNumber(String trnNumber) { this.trnNumber = trnNumber; }

    public String getLogoUrl() { return logoUrl; }
    public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }

    public String getStampUrl() { return stampUrl; }
    public void setStampUrl(String stampUrl) { this.stampUrl = stampUrl; }

    public String getBankName() { return bankName; }
    public void setBankName(String bankName) { this.bankName = bankName; }

    public String getBankAccountNumber() { return bankAccountNumber; }
    public void setBankAccountNumber(String bankAccountNumber) { this.bankAccountNumber = bankAccountNumber; }

    public String getBankIban() { return bankIban; }
    public void setBankIban(String bankIban) { this.bankIban = bankIban; }

    public String getBankSwift() { return bankSwift; }
    public void setBankSwift(String bankSwift) { this.bankSwift = bankSwift; }

    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }

    @JsonProperty("isDefault")
    public boolean isDefault() { return isDefault; }
    public void setDefault(boolean isDefault) { this.isDefault = isDefault; }

    @JsonProperty("isHeadquarters")
    public boolean isHeadquarters() { return isHeadquarters; }
    public void setHeadquarters(boolean isHeadquarters) { this.isHeadquarters = isHeadquarters; }

    public BranchType getType() { return type; }
    public void setType(BranchType type) { this.type = type; }

    public Long getDefaultWarehouseId() { return defaultWarehouseId; }
    public void setDefaultWarehouseId(Long defaultWarehouseId) { this.defaultWarehouseId = defaultWarehouseId; }

    public String getDefaultWarehouseName() { return defaultWarehouseName; }
    public void setDefaultWarehouseName(String defaultWarehouseName) { this.defaultWarehouseName = defaultWarehouseName; }

    public String getDefaultWarehouseBranchName() { return defaultWarehouseBranchName; }
    public void setDefaultWarehouseBranchName(String defaultWarehouseBranchName) {
        this.defaultWarehouseBranchName = defaultWarehouseBranchName;
    }
}
