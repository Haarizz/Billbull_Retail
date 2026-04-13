package com.billbull.backend.customer.inquiries;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.inventory.product.Product;
import jakarta.persistence.*;

@Entity
@Table(name = "inquiry_items")
public class InquiryItem extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inquiry_id", nullable = false)
    private CustomerInquiry inquiry;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    private Double quantity;
    private Double price;

    // Getters & Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public CustomerInquiry getInquiry() {
        return inquiry;
    }

    public void setInquiry(CustomerInquiry inquiry) {
        this.inquiry = inquiry;
    }

    public Product getProduct() {
        return product;
    }

    public void setProduct(Product product) {
        this.product = product;
    }

    public Double getQuantity() {
        return quantity;
    }

    public void setQuantity(Double quantity) {
        this.quantity = quantity;
    }

    public Double getPrice() {
        return price;
    }

    public void setPrice(Double price) {
        this.price = price;
    }
}
