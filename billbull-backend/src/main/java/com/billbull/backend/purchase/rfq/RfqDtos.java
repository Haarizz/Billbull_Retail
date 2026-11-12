package com.billbull.backend.purchase.rfq;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** Request and response shapes for {@code /api/purchase-rfqs}. */
public final class RfqDtos {

    private RfqDtos() {
    }

    // ── Requests ──────────────────────────────────────────────────────────────

    public record RfqRequest(
            String title,
            String reference,
            LocalDate deadline,
            LocalDate expectedDelivery,
            String deliveryLocation,
            Long warehouseId,
            String currency,
            String taxPref,
            String paymentTerms,
            String deliveryTerms,
            String quotationValidity,
            String shippingReqs,
            String notes,
            String vendorInstructions,
            List<ItemRequest> items,
            List<Long> vendorIds,
            Boolean send) {
    }

    public record ItemRequest(
            Long productId,
            String itemName,
            String description,
            String category,
            String brand,
            String model,
            String unit,
            Integer qtyNeeded,
            String minSpec,
            Boolean altBrandAllowed,
            Boolean partialAllowed,
            LocalDate expectedDelivery,
            String warrantyRequired) {
    }

    /** {@code action}: SAVE (in progress), SUBMIT, or DECLINE (vendor will not quote). */
    public record QuoteRequest(
            String action,
            String paymentTerms,
            String deliveryTerms,
            LocalDate validity,
            List<OfferRequest> offers) {
    }

    public record OfferRequest(
            Long id,
            Long rfqItemId,
            String brand,
            String model,
            String sku,
            String description,
            BigDecimal unitPrice,
            Integer quotedQty,
            Integer availableStock,
            String availability,
            LocalDate dispatchDate,
            LocalDate deliveryDate,
            String warranty,
            String countryOfOrigin,
            BigDecimal taxPercent,
            BigDecimal discountPercent,
            BigDecimal shippingCost,
            BigDecimal additionalCost,
            LocalDate validUntil,
            String notes,
            Boolean alternative,
            String alternativeReason,
            List<BulkTier> bulkTiers) {
    }

    public record BulkTier(
            Integer minQty,
            Integer maxQty,
            BigDecimal unitPrice,
            BigDecimal discountPct,
            Integer availableStock,
            Integer leadTimeDays) {
    }

    public record StatusRequest(String status, String reason) {
    }

    public record SendRequest(String channel) {
    }

    public record NegotiationRequest(Long offerId, BigDecimal targetPrice, Integer targetQty, String message, LocalDate deadline) {
    }

    /** {@code outcome}: ACCEPTED (target price agreed), REVISED (counter-offer price), DECLINED. */
    public record NegotiationReplyRequest(String outcome, BigDecimal revisedPrice, String message) {
    }

    /** Award (or with a null offerId, un-award) one item. */
    public record AwardRequest(Long itemId, Long offerId) {
    }

    public record CreateLposRequest(Long warehouseId, List<LpoLine> lines) {
    }

    public record LpoLine(Long itemId, Long offerId, Integer qty) {
    }

    // ── Responses ─────────────────────────────────────────────────────────────

    public record VendorRef(Long vendorId, String vendorName, String vendorCode) {
    }

    public record RfqSummary(
            Long id,
            String rfqNumber,
            String title,
            String reference,
            String status,
            LocalDateTime createdAt,
            String createdBy,
            LocalDate deadline,
            int itemCount,
            int vendorCount,
            int respondedCount,
            List<VendorRef> vendors,
            BigDecimal bestQuote,
            List<String> lpoNumbers) {
    }

    public record ItemDto(
            Long id,
            Integer lineNo,
            Long productId,
            String itemCode,
            String itemName,
            String description,
            String category,
            String brand,
            String model,
            String unit,
            Integer qtyNeeded,
            Integer qtyOrdered,
            String minSpec,
            boolean altBrandAllowed,
            boolean partialAllowed,
            LocalDate expectedDelivery,
            String warrantyRequired,
            Long awardedOfferId) {
    }

    public record OfferDto(
            Long id,
            Long rfqItemId,
            String brand,
            String model,
            String sku,
            String description,
            BigDecimal unitPrice,
            Integer quotedQty,
            Integer availableStock,
            String availability,
            LocalDate dispatchDate,
            LocalDate deliveryDate,
            String warranty,
            String countryOfOrigin,
            BigDecimal taxPercent,
            BigDecimal discountPercent,
            BigDecimal shippingCost,
            BigDecimal additionalCost,
            LocalDate validUntil,
            String notes,
            boolean alternative,
            String alternativeReason,
            List<BulkTier> bulkTiers,
            Integer version) {
    }

    public record VendorDto(
            Long id,
            Long vendorId,
            String vendorName,
            String vendorCode,
            String email,
            String phone,
            String responseStatus,
            LocalDateTime submittedAt,
            String paymentTerms,
            String deliveryTerms,
            LocalDate validity,
            Integer version,
            List<OfferDto> offers,
            /** Secret for this vendor's portal link (staff-only payload). */
            String portalToken,
            LocalDateTime portalLastAccessAt) {
    }

    /**
     * A vendor who supplied (LPO) or quoted (earlier RFQ) some of the requested products.
     * {@code score} (0-100) blends purchase volume, frequency, recency, price and how reliably the
     * vendor answers RFQs; {@code products} holds the per-product breakdown and rank.
     */
    public record VendorSuggestion(
            Long vendorId,
            String vendorName,
            List<Long> productIds,
            long lpoCount,
            long quoteCount,
            LocalDate lastDate,
            long totalQty,
            double score,
            Integer invitations,
            Integer answers,
            List<ProductSuggestion> products) {
    }

    /** One vendor's history for one requested product; {@code rank} 1 = best vendor for that product. */
    public record ProductSuggestion(
            Long productId,
            long lpoLines,
            long qtyPurchased,
            BigDecimal avgLpoPrice,
            long quoteCount,
            BigDecimal avgQuotePrice,
            LocalDate lastDate,
            double score,
            int rank) {
    }

    /** Defaults and pick-lists for the RFQ wizard. */
    public record FormOptions(
            String nextRfqNumber,
            String suggestedReference,
            String baseCurrency,
            List<CurrencyOption> currencies,
            List<String> paymentTerms) {
    }

    public record CurrencyOption(String code, String name, String symbol) {
    }

    /**
     * {@code emailVendors}: email each vendor an invitation with its portal link.
     * {@code portalBaseUrl}: the app origin the links should point at (e.g. https://erp.example.com).
     */
    public record SendInvitesRequest(String channel, Boolean emailVendors, String portalBaseUrl) {
    }

    public record EmailResult(Long rfqVendorId, String vendorName, String email, boolean sent, String error) {
    }

    public record SendResult(RfqDetail rfq, List<EmailResult> emails) {
    }

    public record NegotiationEvent(String type, LocalDateTime at, BigDecimal price, String message) {
    }

    public record NegotiationDto(
            Long id,
            Long rfqItemId,
            Long vendorId,
            Long offerId,
            String status,
            BigDecimal targetPrice,
            Integer targetQty,
            String message,
            LocalDate deadline,
            LocalDateTime requestedAt,
            LocalDateTime respondedAt,
            String responseMessage,
            BigDecimal previousPrice,
            BigDecimal revisedPrice,
            List<NegotiationEvent> history) {
    }

    public record ActivityDto(
            Long id,
            String type,
            String description,
            String actor,
            String actorType,
            LocalDateTime at,
            String ref,
            String oldValue,
            String newValue) {
    }

    public record LpoRefDto(Long lpoId, String lpoNumber, Long vendorId, String vendorName, LocalDateTime createdOn) {
    }

    /** source = QUOTE (earlier RFQ offer) or LPO (earlier purchase order line). */
    public record PriceHistoryDto(
            String source,
            LocalDate date,
            Long vendorId,
            String vendorName,
            BigDecimal price,
            Integer qty,
            String documentNumber,
            String brand) {
    }

    public record RfqDetail(
            Long id,
            String rfqNumber,
            String title,
            String reference,
            String status,
            LocalDateTime createdAt,
            String createdBy,
            LocalDate deadline,
            LocalDate expectedDelivery,
            String deliveryLocation,
            Long warehouseId,
            String warehouseName,
            String currency,
            String taxPref,
            String paymentTerms,
            String deliveryTerms,
            String quotationValidity,
            String shippingReqs,
            String notes,
            String vendorInstructions,
            String branchName,
            LocalDateTime sentAt,
            List<ItemDto> items,
            List<VendorDto> vendors,
            List<NegotiationDto> negotiations,
            List<ActivityDto> activity,
            List<LpoRefDto> lpos,
            Map<Long, List<PriceHistoryDto>> priceHistory) {
    }

    /** One offer row for the cross-RFQ "All Responses" view. */
    public record ResponseRow(
            Long rfqId,
            String rfqNumber,
            String rfqStatus,
            ItemDto item,
            Long rfqVendorId,
            Long vendorId,
            String vendorName,
            String vendorCode,
            String responseStatus,
            String paymentTerms,
            OfferDto offer,
            String negotiationStatus) {
    }
}
