package com.billbull.backend.settings.branch;

public class BranchResponse {

    private Long id;
    private String name;
    private String code;
    private String address;
    private String phone;
    private boolean isDefault;
    private Long defaultWarehouseId;
    private String defaultWarehouseName;

    public BranchResponse() {}

    public static BranchResponse from(Branch b) {
        BranchResponse r = new BranchResponse();
        r.id = b.getId();
        r.name = b.getName();
        r.code = b.getCode();
        r.address = b.getAddress();
        r.phone = b.getPhone();
        r.isDefault = b.isDefault();
        if (b.getDefaultWarehouse() != null) {
            r.defaultWarehouseId = b.getDefaultWarehouse().getId();
            r.defaultWarehouseName = b.getDefaultWarehouse().getName();
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

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public boolean isDefault() { return isDefault; }
    public void setDefault(boolean isDefault) { this.isDefault = isDefault; }

    public Long getDefaultWarehouseId() { return defaultWarehouseId; }
    public void setDefaultWarehouseId(Long defaultWarehouseId) { this.defaultWarehouseId = defaultWarehouseId; }

    public String getDefaultWarehouseName() { return defaultWarehouseName; }
    public void setDefaultWarehouseName(String defaultWarehouseName) { this.defaultWarehouseName = defaultWarehouseName; }
}
