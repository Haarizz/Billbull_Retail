package com.billbull.backend.pos.offline;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Pilot limits for offline selling (decision D7). Off unless {@code pos.offline.enabled=true}.
 *
 * <p>Expiry and the business-day end can only be enforced against the till's own clock, so they
 * are honest-mode controls. The sale count and value caps are what the server can actually check
 * at ingest, which is why they are kept small.
 */
@Component
public class PosOfflineSettings {

    /** Bumped when the lease claims or the record format change meaning. */
    public static final int POLICY_VERSION = 1;
    public static final String TENDER_TYPES = "CASH";
    public static final String PRODUCT_POLICY = "NON_BATCH_NON_SERIAL_NON_EXPIRY;LIST_PRICE_ONLY;NO_DISCOUNT";

    private final boolean enabled;
    private final Set<Long> branchIds;
    private final long leaseMinutes;
    private final long graceHours;
    private final int maxSales;
    private final long maxValueMinor;
    private final long branchMaxValueMinor;
    private final long clockSkewSeconds;
    private final int catalogMaxProducts;

    public PosOfflineSettings(
            @Value("${pos.offline.enabled:false}") boolean enabled,
            @Value("${pos.offline.branch-ids:}") String branchIds,
            @Value("${pos.offline.lease-minutes:240}") long leaseMinutes,
            @Value("${pos.offline.grace-hours:24}") long graceHours,
            @Value("${pos.offline.max-sales:50}") int maxSales,
            @Value("${pos.offline.max-value-minor:500000}") long maxValueMinor,
            @Value("${pos.offline.branch-max-value-minor:1500000}") long branchMaxValueMinor,
            @Value("${pos.offline.clock-skew-seconds:300}") long clockSkewSeconds,
            @Value("${pos.offline.catalog.max-products:5000}") int catalogMaxProducts) {
        this.enabled = enabled;
        this.branchIds = Arrays.stream(branchIds.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).map(Long::valueOf).collect(Collectors.toUnmodifiableSet());
        this.leaseMinutes = leaseMinutes;
        this.graceHours = graceHours;
        this.maxSales = maxSales;
        this.maxValueMinor = maxValueMinor;
        this.branchMaxValueMinor = branchMaxValueMinor;
        this.clockSkewSeconds = clockSkewSeconds;
        this.catalogMaxProducts = catalogMaxProducts;
    }

    public boolean enabledFor(Long branchId) {
        return enabled && branchId != null && (branchIds.isEmpty() || branchIds.contains(branchId));
    }

    public boolean enabled() { return enabled; }
    public long leaseMinutes() { return leaseMinutes; }
    public long graceHours() { return graceHours; }
    public int maxSales() { return maxSales; }
    public long maxValueMinor() { return maxValueMinor; }
    public long branchMaxValueMinor() { return branchMaxValueMinor; }
    public long clockSkewSeconds() { return clockSkewSeconds; }
    public int catalogMaxProducts() { return catalogMaxProducts; }
}
