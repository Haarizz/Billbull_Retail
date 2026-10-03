package com.billbull.backend.inventory.category;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Master list of product categories. {@code Product.category} stays a plain name column (no FK),
 * so imports, reports and existing rows keep working; this table is the pick-list behind it and
 * {@link ProductCategoryService#registerIfMissing} keeps the two in step on product save.
 * Case-insensitive uniqueness among active rows is owned by the DB (Flyway V109).
 */
@Entity
@Table(name = "product_categories")
@com.fasterxml.jackson.annotation.JsonIgnoreProperties({ "hibernateLazyInitializer", "handler" })
public class ProductCategory extends BaseEntity {

    @Column(nullable = false, length = 100)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
