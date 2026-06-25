package com.billbull.backend.pos.search;

import com.billbull.backend.inventory.product.ProductAggregateResponse;

/**
 * Single best-match envelope returned by the POS unified search resolver
 * ({@code GET /api/pos/resolve}). The resolver maps one scanned/typed value to
 * exactly one action for the cashier: add a product (optionally pinning the
 * exact scanned batch unit), set a customer, or nothing (let the grid filter).
 */
public class PosResolveResponse {

    public enum Type {
        PRODUCT,
        CUSTOMER,
        /**
         * The query matched an exact batch/serial unit that cannot be sold (e.g.
         * already RESERVED for a layaway, or CONSUMED/SOLD). The frontend must NOT
         * add it to the cart — it shows {@link #message} to the cashier instead.
         */
        BLOCKED,
        NONE
    }

    private Type type = Type.NONE;

    /** Human-readable reason, set when {@code type == BLOCKED}. */
    private String message;

    /** Populated when {@code type == PRODUCT}. */
    private ProductAggregateResponse product;

    /**
     * Set when the query matched an exact batch number. The frontend pins this
     * batch on the cart line so checkout consumes the scanned unit instead of
     * the FEFO-preferred one.
     */
    private String pinnedBatchNumber;

    /**
     * Set when the query matched an exact serial number on a serialized product.
     * The frontend pre-fills this serial on the cart line for checkout tracking.
     */
    private String pinnedSerialNumber;

    /** Populated when {@code type == CUSTOMER}. */
    private CustomerMatch customer;

    public static class CustomerMatch {
        private Long id;
        private String code;
        private String name;
        private String mobile;
        private String phone;
        private String email;

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
    }

    public static PosResolveResponse none() {
        return new PosResolveResponse();
    }

    public static PosResolveResponse product(ProductAggregateResponse product, String pinnedBatchNumber) {
        PosResolveResponse res = new PosResolveResponse();
        res.type = Type.PRODUCT;
        res.product = product;
        res.pinnedBatchNumber = pinnedBatchNumber;
        return res;
    }

    public static PosResolveResponse productWithSerial(ProductAggregateResponse product, String serialNumber) {
        PosResolveResponse res = new PosResolveResponse();
        res.type = Type.PRODUCT;
        res.product = product;
        res.pinnedSerialNumber = serialNumber;
        return res;
    }

    public static PosResolveResponse customer(CustomerMatch customer) {
        PosResolveResponse res = new PosResolveResponse();
        res.type = Type.CUSTOMER;
        res.customer = customer;
        return res;
    }

    public static PosResolveResponse blocked(String message) {
        PosResolveResponse res = new PosResolveResponse();
        res.type = Type.BLOCKED;
        res.message = message;
        return res;
    }

    public Type getType() { return type; }
    public void setType(Type type) { this.type = type; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public ProductAggregateResponse getProduct() { return product; }
    public void setProduct(ProductAggregateResponse product) { this.product = product; }
    public String getPinnedBatchNumber() { return pinnedBatchNumber; }
    public void setPinnedBatchNumber(String pinnedBatchNumber) { this.pinnedBatchNumber = pinnedBatchNumber; }
    public String getPinnedSerialNumber() { return pinnedSerialNumber; }
    public void setPinnedSerialNumber(String pinnedSerialNumber) { this.pinnedSerialNumber = pinnedSerialNumber; }
    public CustomerMatch getCustomer() { return customer; }
    public void setCustomer(CustomerMatch customer) { this.customer = customer; }
}
