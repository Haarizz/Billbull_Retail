package com.billbull.backend.sales.pricing;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.sales.pricing.PricingModels.Context;
import com.billbull.backend.sales.pricing.PricingModels.Line;
import com.billbull.backend.sales.pricing.PricingModels.Resolution;
import com.billbull.backend.sales.pricing.PricingModels.SaleUnits;
import com.billbull.backend.sales.settings.SalesItemPricePolicy;
import com.billbull.backend.sales.settings.SalesSettings;
import com.billbull.backend.sales.settings.SalesSettingsService;
import com.billbull.backend.security.BranchScope;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Prices lines for a transaction being built (POS cart, Sales Invoice editor) through the shared
 * resolver. Advisory for the screen: the authoritative resolution runs again when the invoice is
 * saved.
 *
 * <p>Lines are priced for the transaction's customer too: a negotiated (customer-specific) price
 * wins over the level price — see {@link PricingResolutionService}.
 *
 * <p>The branch is never taken from the request. A POS call names its session and prices on that
 * session's branch (which the caller must be able to access); a back-office call prices on the
 * caller's current branch, as saving the invoice will.
 */
@RestController
@RequestMapping("/api/pricing")
public class PricingController {

    static final String[] SELLING_MODULES = {
            "sales.pos", "sales.invoice", "sales.quotation", "sales.order", "sales.proforma", "sales.delivery"
    };

    private final PricingResolutionService resolver;
    private final ModulePermissionService permissions;
    private final BranchAccessService branchAccessService;
    private final PosSessionService sessionService;
    private final SalesSettingsService salesSettingsService;

    public PricingController(PricingResolutionService resolver, ModulePermissionService permissions,
                             BranchAccessService branchAccessService, PosSessionService sessionService,
                             SalesSettingsService salesSettingsService) {
        this.resolver = resolver;
        this.permissions = permissions;
        this.branchAccessService = branchAccessService;
        this.sessionService = sessionService;
        this.salesSettingsService = salesSettingsService;
    }

    public static class ResolveRequest {
        /** "POS" prices on the till's retail basis; anything else uses Sales Settings. */
        private String channel;
        private Long sessionId;
        private Long priceLevelId;
        private Long customerId;
        private String customerCode;
        private List<ResolveLine> items;
        /** Back office only: the document's date, which negotiated prices must be valid on. */
        private java.time.LocalDate pricingDate;

        public java.time.LocalDate getPricingDate() { return pricingDate; }
        public void setPricingDate(java.time.LocalDate pricingDate) { this.pricingDate = pricingDate; }
        public String getChannel() { return channel; }
        public void setChannel(String channel) { this.channel = channel; }
        public Long getSessionId() { return sessionId; }
        public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
        public Long getPriceLevelId() { return priceLevelId; }
        public void setPriceLevelId(Long priceLevelId) { this.priceLevelId = priceLevelId; }
        public Long getCustomerId() { return customerId; }
        public void setCustomerId(Long customerId) { this.customerId = customerId; }
        public String getCustomerCode() { return customerCode; }
        public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }
        public List<ResolveLine> getItems() { return items; }
        public void setItems(List<ResolveLine> items) { this.items = items; }
    }

    public static class ResolveLine {
        private Long productId;
        private String itemCode;
        private String unit;
        private BigDecimal quantity;

        public Long getProductId() { return productId; }
        public void setProductId(Long productId) { this.productId = productId; }
        public String getItemCode() { return itemCode; }
        public void setItemCode(String itemCode) { this.itemCode = itemCode; }
        public String getUnit() { return unit; }
        public void setUnit(String unit) { this.unit = unit; }
        public BigDecimal getQuantity() { return quantity; }
        public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }
    }

    @PostMapping("/resolve")
    @PreAuthorize("isAuthenticated()")
    public Resolution resolve(@RequestBody ResolveRequest request) {
        permissions.requireCanViewAny(SELLING_MODULES);
        if (request.getItems() != null && request.getItems().size() > 500) {
            throw new PricingException("At most 500 lines can be priced at once.");
        }
        boolean pos = "POS".equalsIgnoreCase(request.getChannel());
        Long branchId = trustedBranchId(request.getSessionId());

        SalesItemPricePolicy policy = SalesItemPricePolicy.RETAIL;
        if (!pos) {
            SalesSettings settings = salesSettingsService.getSettings();
            if (settings != null && settings.getSalesItemPricePolicy() != null) {
                policy = settings.getSalesItemPricePolicy();
            }
        }
        List<Line> lines = request.getItems() == null ? List.of()
                : request.getItems().stream()
                        .map(l -> new Line(l.getProductId(), l.getItemCode(), l.getUnit(), l.getQuantity()))
                        .toList();
        // The till always prices on the business day; a back-office document on its own date.
        return resolver.resolve(new Context(branchId, request.getPriceLevelId(), request.getCustomerId(),
                request.getCustomerCode(), policy, pos ? null : request.getPricingDate()), lines);
    }

    public static class UnitsRequest {
        private String channel;
        private Long sessionId;
        private Long priceLevelId;
        private Long customerId;
        private String customerCode;
        private Long productId;
        private String itemCode;

        public String getChannel() { return channel; }
        public void setChannel(String channel) { this.channel = channel; }
        public Long getSessionId() { return sessionId; }
        public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
        public Long getPriceLevelId() { return priceLevelId; }
        public void setPriceLevelId(Long priceLevelId) { this.priceLevelId = priceLevelId; }
        public Long getCustomerId() { return customerId; }
        public void setCustomerId(Long customerId) { this.customerId = customerId; }
        public String getCustomerCode() { return customerCode; }
        public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }
        public Long getProductId() { return productId; }
        public void setProductId(Long productId) { this.productId = productId; }
        public String getItemCode() { return itemCode; }
        public void setItemCode(String itemCode) { this.itemCode = itemCode; }
    }

    /**
     * The units one product sells in (piece, box, carton …), each priced as {@code /resolve} would
     * price a line in that unit. Backs the till's unit picker. Same access and branch rules as
     * {@code /resolve}.
     */
    @PostMapping("/units")
    @PreAuthorize("isAuthenticated()")
    public SaleUnits units(@RequestBody UnitsRequest request) {
        permissions.requireCanViewAny(SELLING_MODULES);
        if (request.getProductId() == null && (request.getItemCode() == null || request.getItemCode().isBlank())) {
            throw new PricingException("A productId or itemCode is required.");
        }
        Long branchId = trustedBranchId(request.getSessionId());
        return resolver.saleUnits(new Context(branchId, request.getPriceLevelId(), request.getCustomerId(),
                request.getCustomerCode(), policyFor(request.getChannel())), request.getProductId(), request.getItemCode());
    }

    private SalesItemPricePolicy policyFor(String channel) {
        if ("POS".equalsIgnoreCase(channel)) return SalesItemPricePolicy.RETAIL;
        SalesSettings settings = salesSettingsService.getSettings();
        return settings != null && settings.getSalesItemPricePolicy() != null
                ? settings.getSalesItemPricePolicy() : SalesItemPricePolicy.RETAIL;
    }

    /** The session's branch for a POS call, else the caller's current branch. */
    Long trustedBranchId(Long sessionId) {
        if (sessionId != null) {
            PosSession session;
            try {
                session = sessionService.getById(sessionId);
            } catch (RuntimeException ex) {
                session = null;
            }
            if (session == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "POS session " + sessionId + " not found.");
            }
            BranchScope.assertCanAccess(session.getBranchId());
            return session.getBranchId();
        }
        Long active = BranchScope.currentBranchId();
        if (active != null) return active;
        Branch own = branchAccessService.getCurrentUserBranchOrNull();
        return own != null ? own.getId() : null;
    }
}
