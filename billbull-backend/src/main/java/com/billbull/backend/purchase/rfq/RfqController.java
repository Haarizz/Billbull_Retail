package com.billbull.backend.purchase.rfq;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.billbull.backend.financials.currency.Currency;
import com.billbull.backend.financials.currency.CurrencyService;
import com.billbull.backend.financials.paymentterms.PaymentTerms;
import com.billbull.backend.financials.paymentterms.PaymentTermsService;
import com.billbull.backend.purchase.rfq.RfqDtos.*;
import com.billbull.backend.security.ModulePermissionService;

/** Vendor Price Shares (RFQ) API. Guarded by the {@code purchases.rfq} module (inherits from {@code purchases}). */
@RestController
@RequestMapping("/api/purchase-rfqs")
@PreAuthorize("isAuthenticated()")
public class RfqController {

    static final String MODULE = "purchases.rfq";
    private static final String LPO_MODULE = "purchases.lpo";

    private final RfqService service;
    private final ModulePermissionService permissions;
    private final com.billbull.backend.purchase.rfq.portal.RfqPortalService portalService;
    private final CurrencyService currencyService;
    private final PaymentTermsService paymentTermsService;

    public RfqController(RfqService service, ModulePermissionService permissions,
                         com.billbull.backend.purchase.rfq.portal.RfqPortalService portalService,
                         CurrencyService currencyService, PaymentTermsService paymentTermsService) {
        this.service = service;
        this.permissions = permissions;
        this.portalService = portalService;
        this.currencyService = currencyService;
        this.paymentTermsService = paymentTermsService;
    }

    /**
     * Pick-lists for the RFQ wizard. Served here (RFQ permission) rather than from the finance
     * endpoints so purchase users without finance access still get the currency/terms lists.
     */
    @GetMapping("/form-options")
    public FormOptions formOptions() {
        permissions.requireCanView(MODULE);
        String[] numbers = service.previewNumbers();
        List<Currency> active = currencyService.getActiveCurrencies();
        String base = active.stream().filter(c -> Boolean.TRUE.equals(c.getIsBase())).map(Currency::getCode)
                .findFirst().orElse("AED");
        List<CurrencyOption> currencies = active.stream()
                .filter(c -> c.getCode() != null && !c.getCode().isBlank())
                .map(c -> new CurrencyOption(c.getCode().trim().toUpperCase(java.util.Locale.ROOT), c.getName(), c.getSymbol()))
                .distinct()
                .toList();
        List<String> terms = paymentTermsService.getAll().stream()
                .map(PaymentTerms::getName)
                .filter(n -> n != null && !n.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
        return new FormOptions(numbers[0], numbers[1], base, currencies, terms);
    }

    @GetMapping
    public List<RfqSummary> list() {
        permissions.requireCanView(MODULE);
        return service.list();
    }

    @GetMapping("/responses")
    public List<ResponseRow> responses(@RequestParam(required = false) Long rfqId) {
        permissions.requireCanView(MODULE);
        return service.responses(rfqId);
    }

    @GetMapping("/{id}")
    public RfqDetail get(@PathVariable Long id) {
        permissions.requireCanView(MODULE);
        return service.get(id);
    }

    @PostMapping
    public RfqDetail create(@RequestBody RfqRequest request) {
        permissions.requireCanCreate(MODULE);
        return service.create(request);
    }

    @PutMapping("/{id}")
    public RfqDetail update(@PathVariable Long id, @RequestBody RfqRequest request) {
        permissions.requireCanEdit(MODULE);
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        permissions.requireCanDelete(MODULE);
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Marks the RFQ sent and, when {@code emailVendors} is true, emails every vendor its personal
     * portal link. Email failures are reported per vendor and never undo the send.
     */
    @PostMapping("/{id}/send")
    public SendResult send(@PathVariable Long id, @RequestBody(required = false) SendInvitesRequest request) {
        permissions.requireCanEdit(MODULE);
        boolean email = request != null && Boolean.TRUE.equals(request.emailVendors());
        if (email) {
            com.billbull.backend.purchase.rfq.portal.RfqPortalService.normalizeBaseUrlOrThrow(request.portalBaseUrl());
        }
        service.send(id, new SendRequest(request == null ? null : request.channel()));
        List<EmailResult> emails = email ? portalService.emailInvitations(id, request.portalBaseUrl()) : List.of();
        return new SendResult(service.get(id), emails);
    }

    @GetMapping("/vendor-suggestions")
    public List<VendorSuggestion> vendorSuggestions(@RequestParam List<Long> productIds) {
        permissions.requireCanView(MODULE);
        return service.suggestVendors(productIds);
    }

    @PostMapping("/{id}/status")
    public RfqDetail changeStatus(@PathVariable Long id, @RequestBody StatusRequest request) {
        permissions.requireCanEdit(MODULE);
        return service.changeStatus(id, request);
    }

    @PutMapping("/{id}/vendors/{rfqVendorId}/quote")
    public RfqDetail saveQuote(@PathVariable Long id, @PathVariable Long rfqVendorId, @RequestBody QuoteRequest request) {
        permissions.requireCanEdit(MODULE);
        return service.saveQuote(id, rfqVendorId, request);
    }

    @PostMapping("/{id}/negotiations")
    public RfqDetail requestBetterPrice(@PathVariable Long id, @RequestBody NegotiationRequest request) {
        permissions.requireCanEdit(MODULE);
        return service.requestBetterPrice(id, request);
    }

    @PostMapping("/{id}/negotiations/{negotiationId}/reply")
    public RfqDetail recordReply(@PathVariable Long id, @PathVariable Long negotiationId,
                                 @RequestBody NegotiationReplyRequest request) {
        permissions.requireCanEdit(MODULE);
        return service.recordNegotiationReply(id, negotiationId, request);
    }

    @PostMapping("/{id}/award")
    public RfqDetail award(@PathVariable Long id, @RequestBody AwardRequest request) {
        permissions.requireCanEdit(MODULE);
        return service.award(id, request);
    }

    /** Creating LPOs needs both RFQ edit rights and LPO create rights. */
    @PostMapping("/{id}/lpos")
    public RfqDetail createLpos(@PathVariable Long id, @RequestBody CreateLposRequest request) {
        permissions.requireCanEdit(MODULE);
        permissions.requireCanCreate(LPO_MODULE);
        return service.createLpos(id, request);
    }
}
