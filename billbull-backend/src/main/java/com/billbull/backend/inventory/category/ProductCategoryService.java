package com.billbull.backend.inventory.category;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.ProductRepository;

/**
 * Product category master. Categories are global (no branch scoping) labels; names are unique
 * case-insensitively among active rows. Products reference a category by name, so a rename is
 * carried onto every product holding the old name.
 */
@Service
@Transactional
public class ProductCategoryService {

    static final int MAX_NAME_LENGTH = 100;

    private final ProductCategoryRepository repository;
    private final ProductRepository productRepo;

    public ProductCategoryService(ProductCategoryRepository repository, ProductRepository productRepo) {
        this.repository = repository;
        this.productRepo = productRepo;
    }

    // ================= READ =================

    @Transactional(readOnly = true)
    public List<ProductCategoryResponse> getAll() {
        Map<String, Long> counts = new HashMap<>();
        for (Object[] row : productRepo.countActiveByCategory()) {
            if (row[0] != null) {
                counts.put((String) row[0], ((Number) row[1]).longValue());
            }
        }
        return repository.findByIsActiveTrueOrderByNameAsc().stream()
                .map(c -> toResponse(c, counts.getOrDefault(c.getName().trim().toLowerCase(), 0L)))
                .toList();
    }

    // ================= CREATE =================

    public ProductCategoryResponse create(ProductCategoryRequest request) {
        String name = normalize(request.getName());
        if (name == null) {
            throw new IllegalArgumentException("Category name is required");
        }

        Optional<ProductCategory> existing = repository.findFirstByNameIgnoreCase(name);
        if (existing.isPresent()) {
            ProductCategory c = existing.get();
            if (c.isActive()) {
                throw new IllegalStateException("Category '" + c.getName() + "' already exists");
            }
            // Restore the soft-deleted row rather than inserting a second one with the same name.
            c.setActive(true);
            c.setName(name);
            c.setDescription(request.getDescription());
            return toResponse(repository.save(c), productRepo.countActiveByCategory(name));
        }

        ProductCategory c = new ProductCategory();
        c.setName(name);
        c.setDescription(request.getDescription());
        return toResponse(repository.save(c), productRepo.countActiveByCategory(name));
    }

    /**
     * Called on every product save so the master list never misses a name a product carries.
     * Returns the canonical (master) spelling to store on the product — "general" becomes
     * "General" when that row exists — or the input unchanged when blank.
     */
    public String registerIfMissing(String rawName) {
        String name = normalize(rawName);
        if (name == null) {
            return rawName;
        }
        Optional<ProductCategory> existing = repository.findFirstByNameIgnoreCase(name);
        if (existing.isPresent()) {
            ProductCategory c = existing.get();
            if (!c.isActive()) {
                c.setActive(true);
                repository.save(c);
            }
            return c.getName();
        }
        ProductCategory c = new ProductCategory();
        c.setName(name);
        repository.save(c);
        return name;
    }

    // ================= UPDATE =================

    @CacheEvict(value = "productList", allEntries = true)
    public ProductCategoryResponse update(Long id, ProductCategoryRequest request) {
        ProductCategory c = repository.findById(id)
                .filter(ProductCategory::isActive)
                .orElseThrow(() -> new IllegalArgumentException("Category not found"));
        String name = normalize(request.getName());
        if (name == null) {
            throw new IllegalArgumentException("Category name is required");
        }

        repository.findFirstByNameIgnoreCaseAndIsActiveTrue(name)
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> {
                    throw new IllegalStateException("Category '" + other.getName() + "' already exists");
                });

        String oldName = c.getName();
        c.setName(name);
        c.setDescription(request.getDescription());
        ProductCategory saved = repository.save(c);
        if (!oldName.equals(name)) {
            productRepo.renameCategory(oldName, name);
        }
        return toResponse(saved, productRepo.countActiveByCategory(name));
    }

    // ================= DELETE (SOFT) =================

    public void delete(Long id) {
        ProductCategory c = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Category not found"));
        long count = productRepo.countActiveByCategory(c.getName());
        if (count > 0) {
            throw new IllegalStateException(
                    "Cannot delete category. It is currently in use by " + count + " products.");
        }
        c.setActive(false);
        repository.save(c);
    }

    // ================= HELPERS =================

    private static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String name = raw.trim().replaceAll("\s+", " ");
        if (name.isEmpty()) {
            return null;
        }
        if (name.length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException("Category name must be at most " + MAX_NAME_LENGTH + " characters");
        }
        return name;
    }

    private static ProductCategoryResponse toResponse(ProductCategory c, long count) {
        return new ProductCategoryResponse(c.getId(), c.getName(), c.getDescription(), count);
    }
}
