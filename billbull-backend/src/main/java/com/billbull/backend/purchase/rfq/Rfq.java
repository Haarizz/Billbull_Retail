package com.billbull.backend.purchase.rfq;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** A Request for Quotation sent to one or more vendors (Vendors and Purchases, Vendor Price Shares). */
@Entity
@Table(name = "purchase_rfqs")
@Getter
@Setter
public class Rfq extends BaseEntity {

    @Column(name = "rfq_number", nullable = false, unique = true, length = 40)
    private String rfqNumber;

    @Column(nullable = false)
    private String title;

    @Column(length = 120)
    private String reference;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private RfqStatus status = RfqStatus.DRAFT;

    private LocalDate deadline;

    @Column(name = "expected_delivery")
    private LocalDate expectedDelivery;

    @Column(name = "delivery_location")
    private String deliveryLocation;

    @Column(name = "warehouse_id")
    private Long warehouseId;

    @Column(name = "warehouse_name")
    private String warehouseName;

    @Column(length = 10)
    private String currency;

    @Column(name = "tax_pref", length = 40)
    private String taxPref;

    @Column(name = "payment_terms", length = 120)
    private String paymentTerms;

    @Column(name = "delivery_terms", length = 120)
    private String deliveryTerms;

    @Column(name = "quotation_validity", length = 60)
    private String quotationValidity;

    @Column(name = "shipping_reqs", columnDefinition = "TEXT")
    private String shippingReqs;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "vendor_instructions", columnDefinition = "TEXT")
    private String vendorInstructions;

    @Column(name = "branch_id")
    private Long branchId;

    @Column(name = "branch_name")
    private String branchName;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    @OneToMany(mappedBy = "rfq", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo ASC, id ASC")
    private List<RfqItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "rfq", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<RfqVendor> vendors = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "purchase_rfq_lpos", joinColumns = @JoinColumn(name = "rfq_id"))
    private List<RfqLpoRef> lpos = new ArrayList<>();
}
