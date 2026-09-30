package com.billbull.backend.purchase.vendor;

/**
 * Lightweight vendor projection for typeahead / global search.
 *
 * <p>Deliberately NOT {@link VendorListResponse}: that payload carries bank account,
 * IBAN, SWIFT and credit terms, and building it runs three grouped balance
 * aggregates across every vendor — far too much for a per-keystroke lookup. This
 * is a strict identification projection, populated by a JPQL constructor
 * expression so a search never hydrates a Vendor entity.
 */
public class VendorSearchResponse {

    private Long id;
    private String code;
    private String name;
    private String email;
    private String contact;
    private String mobile;
    /** "Active", "On Hold", "Draft" — the vendor's own status column. */
    private String status;
    /** The vendor's directly-assigned branch, or null when it has none. */
    private String branch;

    public VendorSearchResponse() {
    }

    public VendorSearchResponse(Long id, String code, String name, String email,
            String contact, String mobile, String status, String branch) {
        this.id = id;
        this.code = code;
        this.name = name;
        this.email = email;
        this.contact = contact;
        this.mobile = mobile;
        this.status = status;
        this.branch = branch;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getContact() { return contact; }
    public void setContact(String contact) { this.contact = contact; }

    public String getMobile() { return mobile; }
    public void setMobile(String mobile) { this.mobile = mobile; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }
}
