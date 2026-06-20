package com.billbull.backend.pos.search;

import java.math.BigDecimal;

public class PosCreditBalanceResponse {

    public static class CustomerInfo {
        private Long id;
        private String code;
        private String name;
        private String mobile;
        private String phone;
        private String email;
        private String status;
        private String groupType;

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getCode() { return code; }
        public void setCode(String code) { this.code = code; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getMobile() { return mobile; }
        public void setMobile(String mobile) { this.mobile = mobile; }
        public String getPhone() { return phone; }
        public void setPhone(String phone) { this.phone = phone; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public String getGroupType() { return groupType; }
        public void setGroupType(String groupType) { this.groupType = groupType; }
    }

    private boolean found = false;
    private CustomerInfo customer;
    private BigDecimal outstanding = BigDecimal.ZERO;
    private BigDecimal creditLimit = BigDecimal.ZERO;
    private BigDecimal advanceBalance = BigDecimal.ZERO;

    public boolean isFound() { return found; }
    public void setFound(boolean found) { this.found = found; }
    public CustomerInfo getCustomer() { return customer; }
    public void setCustomer(CustomerInfo customer) { this.customer = customer; }
    public BigDecimal getOutstanding() { return outstanding; }
    public void setOutstanding(BigDecimal outstanding) { this.outstanding = outstanding; }
    public BigDecimal getCreditLimit() { return creditLimit; }
    public void setCreditLimit(BigDecimal creditLimit) { this.creditLimit = creditLimit; }
    public BigDecimal getAdvanceBalance() { return advanceBalance; }
    public void setAdvanceBalance(BigDecimal advanceBalance) { this.advanceBalance = advanceBalance; }
}
