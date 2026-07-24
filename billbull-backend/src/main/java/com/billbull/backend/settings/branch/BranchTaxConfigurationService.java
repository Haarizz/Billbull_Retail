package com.billbull.backend.settings.branch;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Owns persistence of {@link BranchTaxConfiguration}. Only
 * {@link com.billbull.backend.common.tax.BranchTaxResolutionService} and the
 * {@link com.billbull.backend.settings.branch.BranchTaxConfigurationController} should depend on
 * this service directly — every other module resolves effective tax configuration through the
 * resolver, never this service or the entity.
 *
 * Entity mapping (request DTO -> entity, entity -> response DTO) happens only here — the
 * controller never touches {@link BranchTaxConfiguration} directly.
 */
@Service
public class BranchTaxConfigurationService {

    private static final String CACHE_NAME = "branchTaxConfiguration";

    private final BranchTaxConfigurationRepository repository;
    private final BranchAccessService branchAccessService;
    private final BranchRepository branchRepository;
    // Self-injected proxy (not `this`) so getForCurrentBranch() below invokes the CACHED
    // getForBranch() through Spring's AOP proxy. A plain `this.getForBranch(...)` call is a
    // self-invocation that bypasses the @Cacheable proxy entirely — Spring's caching (and
    // @Transactional) annotations only take effect on calls that go through the proxy, never
    // on a method calling another method of the same class directly. @Lazy breaks the
    // constructor circular-reference that would otherwise occur (this bean depending on its
    // own not-yet-created proxy).
    private final BranchTaxConfigurationService self;

    public BranchTaxConfigurationService(BranchTaxConfigurationRepository repository,
                                          BranchAccessService branchAccessService,
                                          BranchRepository branchRepository,
                                          @Lazy BranchTaxConfigurationService self) {
        this.repository = repository;
        this.branchAccessService = branchAccessService;
        this.branchRepository = branchRepository;
        this.self = self;
    }

    /** Not cached itself (the branch lookup depends on the current request's auth context),
     *  but delegates to the cached {@link #getForBranch} via the self-proxy once the branch is
     *  resolved, so repeat calls for the same branch within the cache's lifetime still hit it.
     *  Uses {@link BranchAccessService#getActiveBranchId()} (not {@code getCurrentUserBranchId()})
     *  so this resolves against the Branch Selector's active branch, not always the user's
     *  primary/HQ branch — otherwise every sales screen reading tax config through this method
     *  would silently apply HQ's Tax Enabled/Tax Mode/VAT rate after switching to another branch. */
    public BranchTaxConfiguration getForCurrentBranch() {
        Long branchId = branchAccessService.getActiveBranchId();
        if (branchId == null) return defaultConfig(null);
        return self.getForBranch(branchId);
    }

    /**
     * Cached per branch — tax configuration is read far more often (every sales-tax resolution)
     * than it's written (an occasional admin edit), so a per-branch cache removes the repeated
     * per-line-item DB round trip in {@code BranchTaxResolutionService}. Evicted on every
     * {@link #save}.
     */
    @Cacheable(value = CACHE_NAME, key = "#branchId", unless = "#result == null")
    @Transactional(readOnly = true)
    public BranchTaxConfiguration getForBranch(Long branchId) {
        return repository.findByBranchId(branchId).orElseGet(() -> defaultConfig(branchId));
    }

    @CacheEvict(value = CACHE_NAME, key = "#branchId")
    @Transactional
    public BranchTaxConfiguration save(Long branchId, BranchTaxConfigurationRequest request) {
        if (!branchRepository.existsById(branchId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Branch not found: " + branchId);
        }
        return repository.findByBranchId(branchId)
                .map(existing -> {
                    applyRequest(existing, request);
                    return repository.save(existing);
                })
                .orElseGet(() -> {
                    BranchTaxConfiguration created = new BranchTaxConfiguration();
                    created.setBranchId(branchId);
                    applyRequest(created, request);
                    return repository.save(created);
                });
    }

    private void applyRequest(BranchTaxConfiguration target, BranchTaxConfigurationRequest request) {
        target.setTaxEnabled(request.getTaxEnabled() != null ? request.getTaxEnabled() : true);
        target.setTaxInclusive(request.getTaxInclusive() != null ? request.getTaxInclusive() : false);
        target.setBranchDefaultVatRate(request.getBranchDefaultVatRate() != null ? request.getBranchDefaultVatRate() : 0.0);
    }

    private BranchTaxConfiguration defaultConfig(Long branchId) {
        BranchTaxConfiguration config = new BranchTaxConfiguration();
        config.setBranchId(branchId);
        return config;
    }
}
