package com.billbull.backend.sales.pricing;

import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.sales.customerledger.CustomerRepository;

/** Create / rename / activate / deactivate named price levels. */
@Service
public class PriceLevelService {

    static final int NAME_MAX = 100;
    static final int CODE_MAX = 50;
    static final int DESCRIPTION_MAX = 500;

    private final PriceLevelRepository repository;
    private final ProductLevelPriceRepository levelPriceRepository;
    private final CustomerRepository customerRepository;

    public PriceLevelService(PriceLevelRepository repository,
                             ProductLevelPriceRepository levelPriceRepository,
                             CustomerRepository customerRepository) {
        this.repository = repository;
        this.levelPriceRepository = levelPriceRepository;
        this.customerRepository = customerRepository;
    }

    /** Request body for create / update. */
    public static class PriceLevelRequest {
        private String code;
        private String name;
        private String description;
        private Integer sortOrder;

        public String getCode() { return code; }
        public void setCode(String code) { this.code = code; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public Integer getSortOrder() { return sortOrder; }
        public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    }

    /** Response view. */
    /** @param quantityTierCount live quantity tiers under the level (any product / branch) — 0 lets a
     *                          screen skip quantity-driven re-pricing entirely */
    public record PriceLevelResponse(Long id, String code, String name, String description, Integer sortOrder,
                                     boolean systemDefault, boolean active, long productPriceCount,
                                     long quantityTierCount) {
        static PriceLevelResponse of(PriceLevel l, long count) {
            return of(l, count, 0);
        }

        static PriceLevelResponse of(PriceLevel l, long count, long tierCount) {
            return new PriceLevelResponse(l.getId(), l.getCode(), l.getName(), l.getDescription(),
                    l.getSortOrder(), l.isSystemDefault(), l.isActive(), count, tierCount);
        }
    }

    /** Quantity tiers (Phase 3); setter-injected so hand-built tests keep compiling. */
    private ProductQuantityTierRepository tierRepository;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setTierRepository(ProductQuantityTierRepository tierRepository) {
        this.tierRepository = tierRepository;
    }

    private long tierCount(Long levelId) {
        return tierRepository == null || levelId == null ? 0 : tierRepository.countByPriceLevelIdAndIsActiveTrue(levelId);
    }

    @Transactional(readOnly = true)
    public List<PriceLevelResponse> list(boolean includeInactive) {
        return repository.findAllByOrderBySortOrderAscNameAsc().stream()
                .filter(l -> includeInactive || l.isActive())
                .map(l -> PriceLevelResponse.of(l, levelPriceRepository.countByPriceLevelIdAndIsActiveTrue(l.getId()), tierCount(l.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public PriceLevel get(Long id) {
        return repository.findById(id).orElseThrow(() -> new PricingException("Price level " + id + " does not exist."));
    }

    @Transactional
    public PriceLevelResponse create(PriceLevelRequest request) {
        String name = requireName(request);
        String code = normalizeCode(request.getCode(), name);
        assertNameFree(name, null);
        code = uniqueCode(code, request.getCode() != null && !request.getCode().isBlank());

        PriceLevel level = new PriceLevel();
        level.setName(name);
        level.setCode(code);
        level.setDescription(trimTo(request.getDescription(), DESCRIPTION_MAX));
        level.setSortOrder(request.getSortOrder() != null ? request.getSortOrder() : nextSortOrder());
        level.setSystemDefault(false);
        level.setActive(true);
        PriceLevel saved = repository.save(level);
        return PriceLevelResponse.of(saved, 0);
    }

    @Transactional
    public PriceLevelResponse update(Long id, PriceLevelRequest request) {
        PriceLevel level = get(id);
        String name = requireName(request);
        assertNameFree(name, id);
        boolean renamed = !name.equals(level.getName());
        level.setName(name);
        if (request.getCode() != null && !request.getCode().isBlank()) {
            String code = normalizeCode(request.getCode(), name);
            if (!code.equalsIgnoreCase(level.getCode())) {
                repository.findFirstByCodeIgnoreCase(code).filter(other -> !other.getId().equals(id))
                        .ifPresent(other -> { throw new PricingException("Price level code '" + code + "' is already used."); });
                level.setCode(code);
            }
        }
        level.setDescription(trimTo(request.getDescription(), DESCRIPTION_MAX));
        if (request.getSortOrder() != null) level.setSortOrder(request.getSortOrder());
        PriceLevel saved = repository.save(level);
        if (renamed) {
            // Keep the legacy free-text label shown in reports and exports in step with the level.
            customerRepository.renamePriceList(saved.getId(), saved.getName());
        }
        return PriceLevelResponse.of(saved, levelPriceRepository.countByPriceLevelIdAndIsActiveTrue(saved.getId()), tierCount(saved.getId()));
    }

    /**
     * Activate / deactivate. A deactivated level can no longer be chosen on a transaction or
     * assigned to a customer; customers already on it fall back to default prices. The system
     * default level can't be deactivated — it is what everything falls back to.
     */
    @Transactional
    public PriceLevelResponse setActive(Long id, boolean active) {
        PriceLevel level = get(id);
        if (!active && level.isSystemDefault()) {
            throw new PricingException("The default price level '" + level.getName() + "' cannot be deactivated.");
        }
        level.setActive(active);
        PriceLevel saved = repository.save(level);
        return PriceLevelResponse.of(saved, levelPriceRepository.countByPriceLevelIdAndIsActiveTrue(saved.getId()), tierCount(saved.getId()));
    }

    // ------------------------------------------------------------------

    private static String requireName(PriceLevelRequest request) {
        String name = request != null && request.getName() != null ? request.getName().trim() : "";
        if (name.isEmpty()) throw new PricingException("Price level name is required.");
        if (name.length() > NAME_MAX) throw new PricingException("Price level name must be at most " + NAME_MAX + " characters.");
        return name;
    }

    private void assertNameFree(String name, Long selfId) {
        repository.findFirstByNameIgnoreCase(name)
                .filter(other -> selfId == null || !other.getId().equals(selfId))
                .ifPresent(other -> { throw new PricingException("A price level named '" + name + "' already exists."); });
    }

    static String normalizeCode(String requested, String name) {
        String source = requested != null && !requested.isBlank() ? requested : name;
        String code = source.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_").replaceAll("^_+|_+$", "");
        if (code.isEmpty()) code = "LEVEL";
        return code.length() > CODE_MAX - 4 ? code.substring(0, CODE_MAX - 4) : code;
    }

    /** A code the caller typed must be free; a derived one gets a numeric suffix instead. */
    private String uniqueCode(String code, boolean explicit) {
        if (repository.findFirstByCodeIgnoreCase(code).isEmpty()) return code;
        if (explicit) throw new PricingException("Price level code '" + code + "' is already used.");
        for (int i = 2; i < 1000; i++) {
            String candidate = code + "_" + i;
            if (repository.findFirstByCodeIgnoreCase(candidate).isEmpty()) return candidate;
        }
        throw new PricingException("Could not derive a unique code for price level '" + code + "'.");
    }

    private int nextSortOrder() {
        return repository.findAllByOrderBySortOrderAscNameAsc().stream()
                .mapToInt(l -> l.getSortOrder() != null ? l.getSortOrder() : 0)
                .max().orElse(0) + 10;
    }

    private static String trimTo(String value, int max) {
        if (value == null) return null;
        String t = value.trim();
        if (t.isEmpty()) return null;
        return t.length() > max ? t.substring(0, max) : t;
    }
}
