package com.billbull.backend.inventory.category;

public class ProductCategoryResponse {

    private Long id;
    private String name;
    private String description;
    private long count;

    public ProductCategoryResponse() {
    }

    public ProductCategoryResponse(Long id, String name, String description, long count) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.count = count;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

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

    public long getCount() {
        return count;
    }

    public void setCount(long count) {
        this.count = count;
    }
}
