package com.billbull.backend.purchase.rfq.portal;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import com.billbull.backend.purchase.rfq.RfqDtos.NegotiationEvent;
import com.billbull.backend.purchase.rfq.RfqDtos.OfferDto;

/**
 * Shapes returned to vendors on the public portal. They deliberately carry nothing about other
 * vendors, internal notes, awards, price history or LPOs.
 */
public final class RfqPortalDtos {

    private RfqPortalDtos() {
    }

    /** What an unauthenticated visitor with a valid link may see before entering the code. */
    public record Invite(
            String companyName,
            String vendorName,
            String rfqNumber,
            String title,
            LocalDate deadline,
            String maskedEmail,
            boolean open,
            String notice) {
    }

    public record CodeSent(String maskedEmail, int expiresInSeconds, int resendInSeconds) {
    }

    public record VerifyRequest(String code) {
    }

    public record Session(String sessionToken, LocalDateTime expiresAt) {
    }

    public record Item(
            Long id,
            Integer lineNo,
            String itemCode,
            String itemName,
            String description,
            String category,
            String brand,
            String model,
            String unit,
            Integer qtyNeeded,
            String minSpec,
            boolean altBrandAllowed,
            boolean partialAllowed,
            LocalDate expectedDelivery,
            String warrantyRequired) {
    }

    public record MyResponse(
            String vendorName,
            String responseStatus,
            LocalDateTime submittedAt,
            String paymentTerms,
            String deliveryTerms,
            LocalDate validity,
            Integer version,
            List<OfferDto> offers) {
    }

    public record PriceRequest(
            Long id,
            Long rfqItemId,
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

    public record PortalRfq(
            String companyName,
            String rfqNumber,
            String title,
            String state,
            LocalDate deadline,
            LocalDate expectedDelivery,
            String deliveryLocation,
            String currency,
            String taxPref,
            String paymentTerms,
            String deliveryTerms,
            String quotationValidity,
            String shippingReqs,
            String vendorInstructions,
            List<Item> items,
            MyResponse response,
            List<PriceRequest> priceRequests,
            boolean canEditQuote,
            String editBlockedReason,
            LocalDateTime sessionExpiresAt) {
    }
}
