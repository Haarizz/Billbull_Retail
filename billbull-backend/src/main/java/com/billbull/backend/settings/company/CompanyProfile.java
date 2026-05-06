package com.billbull.backend.settings.company;

import jakarta.persistence.*;

/**
 * Singleton entity — always ONE row with id = 1 per client database.
 * Stores the client company's branding and contact details used in
 * print templates, email headers, and report headers.
 */
@Entity
@Table(name = "company_profile")
public class CompanyProfile {

    @Id
    private Long id = 1L;

    @Column(name = "company_name")
    private String companyName;

    @Column(name = "local_name")
    private String localName;

    private String address;
    private String city;
    private String country;
    private String phone;
    private String mobile;
    private String email;
    private String trn;

    /** Relative path stored in DB, e.g. /uploads/company/logo.png */
    @Column(name = "logo_path")
    private String logoPath;

    /** Relative path for company stamp image, e.g. /uploads/company/stamp.png */
    @Column(name = "stamp_path")
    private String stampPath;

    @Column(name = "show_stamp_in_print")
    private Boolean showStampInPrint;

    @Column(name = "show_stamp_in_email")
    private Boolean showStampInEmail;

    private String currency;

    @Column(name = "currency_symbol")
    private String currencySymbol;

    private String website;

    // -------------------------------------------------------
    // Getters & Setters
    // -------------------------------------------------------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }

    public String getLocalName() { return localName; }
    public void setLocalName(String localName) { this.localName = localName; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getMobile() { return mobile; }
    public void setMobile(String mobile) { this.mobile = mobile; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getTrn() { return trn; }
    public void setTrn(String trn) { this.trn = trn; }

    public String getLogoPath() { return logoPath; }
    public void setLogoPath(String logoPath) { this.logoPath = logoPath; }

    public String getStampPath() { return stampPath; }
    public void setStampPath(String stampPath) { this.stampPath = stampPath; }

    public Boolean getShowStampInPrint() { return showStampInPrint; }
    public void setShowStampInPrint(Boolean showStampInPrint) { this.showStampInPrint = showStampInPrint; }

    public Boolean getShowStampInEmail() { return showStampInEmail; }
    public void setShowStampInEmail(Boolean showStampInEmail) { this.showStampInEmail = showStampInEmail; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public String getCurrencySymbol() { return currencySymbol; }
    public void setCurrencySymbol(String currencySymbol) { this.currencySymbol = currencySymbol; }

    public String getWebsite() { return website; }
    public void setWebsite(String website) { this.website = website; }
}
