package com.billbull.backend.inventory.brand;

import java.security.SecureRandom;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.billbull.backend.inventory.product.ProductRepository;

import jakarta.transaction.Transactional;

@Service
@Transactional
public class BrandService {

    private final BrandRepository repository;
    private final BrandLogoStorageService logoStorage;
    private final ProductRepository productRepo;

    public BrandService(BrandRepository repository,
            BrandLogoStorageService logoStorage,
            ProductRepository productRepo) {
        this.repository = repository;
        this.logoStorage = logoStorage;
        this.productRepo = productRepo;
    }

    // ---------------------------
    // LIST (ONLY METHOD USED)
    // ---------------------------
    public List<BrandResponse> list() {
        return repository.findByActiveTrue()
                .stream()
                .map(this::map)
                .toList();
    }

    // ---------------------------
    // CREATE
    // ---------------------------
    public BrandResponse create(BrandRequest req, MultipartFile logo) {

        if (repository.existsByCodeAndActiveTrue(req.code)) {
            throw new RuntimeException("Brand code already exists");
        }

        Brand brand = new Brand();
        setFields(brand, req, logo);

        // Generate barcode if auto-generate is enabled
        if (req.auto != null && req.auto) {
            String generatedBarcode = generateBarcode(
                    req.prefix,
                    req.prefixLength,
                    req.suffixLength,
                    req.ruleGlobalUnique);
            brand.setBarcode(generatedBarcode);
        }

        return map(repository.save(brand));
    }

    // ---------------------------
    // UPDATE
    // ---------------------------
    public BrandResponse update(Long id, BrandRequest req, MultipartFile logo) {

        Brand brand = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Brand not found"));

        setFields(brand, req, logo);

        // Generate/Regenerate barcode if auto-generate is enabled
        if (req.auto != null && req.auto) {
            String generatedBarcode = generateBarcode(
                    req.prefix,
                    req.prefixLength,
                    req.suffixLength,
                    req.ruleGlobalUnique);
            brand.setBarcode(generatedBarcode);
        }

        return map(repository.save(brand));
    }

    // ---------------------------
    // DELETE (SOFT)
    // ---------------------------
    public void delete(Long id) {
        Brand brand = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Brand not found"));

        long count = productRepo.countByBrandIdAndIsActiveTrue(id);
        if (count > 0) {
            throw new IllegalStateException("Cannot delete brand. It is currently in use by " + count + " products.");
        }

        brand.setActive(false);
        repository.save(brand);
    }

    // ---------------------------
    // HELPERS
    // ---------------------------
    private void setFields(Brand brand, BrandRequest req, MultipartFile logo) {

        brand.setName(req.name);
        brand.setCode(req.code);
        brand.setDescription(req.description);
        brand.setCountry(req.country);
        brand.setRegion(req.region);
        brand.setTags(req.tags);
        brand.setActive(req.active);

        // Barcode fields
        brand.setBarcodePrefix(req.prefix);
        brand.setPrefixLength(req.prefixLength != null ? req.prefixLength : 2);
        brand.setSuffixLength(req.suffixLength != null ? req.suffixLength : 8);
        brand.setAutoGenerate(req.auto != null ? req.auto : false);
        brand.setRuleGlobalUnique(req.ruleGlobalUnique != null ? req.ruleGlobalUnique : true);
        brand.setRuleBrandUnique(req.ruleBrandUnique != null ? req.ruleBrandUnique : false);
        brand.setRuleManualOverride(req.ruleManualOverride != null ? req.ruleManualOverride : false);

        if (logo != null && !logo.isEmpty()) {
            brand.setLogoPath(logoStorage.store(logo));
        }
    }

    private BrandResponse map(Brand brand) {
        BrandResponse res = new BrandResponse();
        res.id = brand.getId();
        res.name = brand.getName();
        res.code = brand.getCode();
        res.description = brand.getDescription();
        res.country = brand.getCountry();
        res.region = brand.getRegion();
        res.logoUrl = brand.getLogoPath();
        res.active = brand.isActive();
        res.tags = brand.getTags();
        res.productsCount = productRepo.countByBrandIdAndIsActiveTrue(brand.getId());

        // Barcode response fields
        res.prefix = brand.getBarcodePrefix();
        res.prefixLength = brand.getPrefixLength();
        res.suffixLength = brand.getSuffixLength();
        res.rule = brand.getSuffixLength() != null ? "+ " + brand.getSuffixLength() + "-digit suffix" : null;
        res.auto = brand.getAutoGenerate();
        res.ruleGlobalUnique = brand.getRuleGlobalUnique();
        res.ruleBrandUnique = brand.getRuleBrandUnique();
        res.ruleManualOverride = brand.getRuleManualOverride();
        return res;
    }

    /**
     * Generates a unique barcode using the brand prefix value (truncated to prefix
     * length) and a random numeric suffix.
     * Format: [PREFIX_VALUE_TRUNCATED]-[RANDOM_SUFFIX]
     */
    private String generateBarcode(String prefixValue, Integer prefixLength, Integer suffixLength,
            Boolean globalUnique) {
        SecureRandom random = new SecureRandom();
        int maxAttempts = 10;

        int pLen = prefixLength != null ? prefixLength : 2;
        int sLen = suffixLength != null ? suffixLength : 8;

        // Truncate prefix to specified length
        String prefix = prefixValue;
        if (prefixValue != null && prefixValue.length() > pLen) {
            prefix = prefixValue.substring(0, pLen);
        }

        for (int attempt = 0; attempt < maxAttempts; attempt++) {
            // Generate random suffix
            StringBuilder suffix = new StringBuilder();
            for (int i = 0; i < sLen; i++) {
                suffix.append(random.nextInt(10));
            }

            // Combine prefix value with hyphen separator and random suffix
            String barcode = prefix + "-" + suffix.toString();

            // Check uniqueness if required
            if (globalUnique != null && globalUnique) {
                if (!repository.existsByBarcode(barcode)) {
                    return barcode;
                }
            } else {
                // No uniqueness check needed, return immediately
                return barcode;
            }
        }

        throw new IllegalStateException(
                "Unable to generate unique barcode after " + maxAttempts + " attempts. " +
                        "Consider increasing suffix length or using a different prefix value.");
    }
}