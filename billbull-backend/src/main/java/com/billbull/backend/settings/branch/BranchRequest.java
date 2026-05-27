package com.billbull.backend.settings.branch;

public class BranchRequest {

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
    private Integer sortOrder;
    private Boolean isHeadquarters;
    private BranchType type;
    private Long defaultWarehouseId;

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

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }

    public Boolean getIsHeadquarters() { return isHeadquarters; }
    public void setIsHeadquarters(Boolean isHeadquarters) { this.isHeadquarters = isHeadquarters; }

    public BranchType getType() { return type; }
    public void setType(BranchType type) { this.type = type; }

    public Long getDefaultWarehouseId() { return defaultWarehouseId; }
    public void setDefaultWarehouseId(Long defaultWarehouseId) { this.defaultWarehouseId = defaultWarehouseId; }
}
