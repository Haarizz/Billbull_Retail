package com.billbull.backend.sales.pricing;

import com.billbull.backend.common.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * A named selling-price level (e.g. "Wholesale", "VIP", "Staff" — names are the business's own).
 *
 * <p>Tenant-wide: a level is defined once and its product prices can then be set for all branches
 * or per branch (see {@link ProductLevelPrice}). Exactly one level is the {@link #systemDefault}
 * level: it carries no prices of its own and stands for the product's existing effective selling
 * price, so a sale "at the default level" prices exactly as it did before price levels existed.
 * The default level can be renamed but never deactivated.
 *
 * <p>{@code isActive} (from {@link BaseEntity}) is the activate/deactivate switch. Levels are never
 * physically deleted: invoices and customers keep pointing at them.
 */
@Entity
@Table(name = "price_levels")
public class PriceLevel extends BaseEntity {

    @Column(nullable = false, length = 50)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 500)
    private String description;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "system_default", nullable = false)
    private boolean systemDefault;

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder != null ? sortOrder : 0; }
    public boolean isSystemDefault() { return systemDefault; }
    public void setSystemDefault(boolean systemDefault) { this.systemDefault = systemDefault; }
}
