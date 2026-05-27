package com.billbull.backend.settings.branch;

import com.billbull.backend.inventory.warehouse.Warehouse;
import jakarta.persistence.*;

@Entity
@Table(name = "branches")
@com.fasterxml.jackson.annotation.JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class Branch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 20)
    private String code;

    @Column(length = 300)
    private String address;

    @Column(name = "address_line_2", length = 300)
    private String addressLine2;

    @Column(length = 100)
    private String city;

    @Column(length = 100)
    private String state;

    @Column(length = 100)
    private String country;

    @Column(name = "postal_code", length = 30)
    private String postalCode;

    @Column(length = 30)
    private String phone;

    @Column(length = 30)
    private String fax;

    @Column(length = 150)
    private String email;

    @Column(name = "trn_number", length = 60)
    private String trnNumber;

    @Column(name = "logo_url", length = 500)
    private String logoUrl;

    @Column(name = "sort_order", nullable = false, columnDefinition = "integer not null default 0")
    private int sortOrder = 0;

    @Column(nullable = false)
    private boolean isDefault = false;

    @Column(name = "is_headquarters", nullable = false, columnDefinition = "boolean not null default false")
    private boolean isHeadquarters = false;

    @Enumerated(EnumType.STRING)
    @Column(length = 20, nullable = false, columnDefinition = "varchar(20) not null default 'BRANCH'")
    private BranchType type = BranchType.BRANCH;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "default_warehouse_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Warehouse defaultWarehouse;

    // ===== Getters & Setters =====

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

    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }

    public boolean isDefault() { return isDefault; }
    public void setDefault(boolean isDefault) { this.isDefault = isDefault; }

    public boolean isHeadquarters() { return isHeadquarters; }
    public void setHeadquarters(boolean isHeadquarters) { this.isHeadquarters = isHeadquarters; }

    public BranchType getType() { return type; }
    public void setType(BranchType type) { this.type = type; }

    public Warehouse getDefaultWarehouse() { return defaultWarehouse; }
    public void setDefaultWarehouse(Warehouse defaultWarehouse) { this.defaultWarehouse = defaultWarehouse; }
}
