package com.billbull.backend.purchase.rfq;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.Base64;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.Warehouse;
import com.billbull.backend.inventory.warehouse.WarehouseRepository;
import com.billbull.backend.purchase.lpo.LpoDetailResponse;
import com.billbull.backend.purchase.lpo.LpoItem;
import com.billbull.backend.purchase.lpo.LpoItemRequest;
import com.billbull.backend.purchase.lpo.LpoRequest;
import com.billbull.backend.purchase.lpo.LpoService;
import com.billbull.backend.purchase.lpo.LpoSource;
import com.billbull.backend.purchase.rfq.RfqDtos.*;
import com.billbull.backend.purchase.vendor.Vendor;
import com.billbull.backend.purchase.vendor.VendorRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/**
 * Vendor Price Shares: Request for Quotation workflow.
 *
 * <p>Create → send to vendors → record each vendor's quotation → compare / negotiate → award
 * items → create one draft LPO per vendor through {@link LpoService}. Vendor quotes are entered
 * by staff on the vendor's behalf (there is no external vendor portal yet).
 */
@Service
public class RfqService {

    private static final int HISTORY_LIMIT = 6;
    private static final List<RfqVendorResponseStatus> RESPONDED_WITH_PRICES = List.of(
            RfqVendorResponseStatus.SUBMITTED, RfqVendorResponseStatus.REVISION_REQUESTED, RfqVendorResponseStatus.REVISED);
    private static final List<RfqVendorResponseStatus> RESPONDED_WITH_PRICES_OR_DECLINED = List.of(
            RfqVendorResponseStatus.SUBMITTED, RfqVendorResponseStatus.REVISION_REQUESTED, RfqVendorResponseStatus.REVISED,
            RfqVendorResponseStatus.DECLINED);
    private static final java.security.SecureRandom RANDOM = new java.security.SecureRandom();
    /** Vendor name while a portal request is being handled; activity is then attributed to the vendor. */
    private static final ThreadLocal<String> PORTAL_ACTOR = new ThreadLocal<>();
    private static final TypeReference<List<BulkTier>> BULK_TIERS = new TypeReference<>() { };
    private static final TypeReference<List<NegotiationEvent>> NEG_EVENTS = new TypeReference<>() { };

    private final RfqRepository rfqRepository;
    private final RfqNegotiationRepository negotiationRepository;
    private final RfqActivityRepository activityRepository;
    private final RfqPriceHistoryRepository priceHistoryRepository;
    private final VendorRepository vendorRepository;
    private final ProductRepository productRepository;
    private final WarehouseRepository warehouseRepository;
    private final BranchAccessService branchAccessService;
    private final LpoService lpoService;
    private final ObjectMapper objectMapper;

    public RfqService(RfqRepository rfqRepository,
                      RfqNegotiationRepository negotiationRepository,
                      RfqActivityRepository activityRepository,
                      RfqPriceHistoryRepository priceHistoryRepository,
                      VendorRepository vendorRepository,
                      ProductRepository productRepository,
                      WarehouseRepository warehouseRepository,
                      BranchAccessService branchAccessService,
                      LpoService lpoService,
                      ObjectMapper objectMapper) {
        this.rfqRepository = rfqRepository;
        this.negotiationRepository = negotiationRepository;
        this.activityRepository = activityRepository;
        this.priceHistoryRepository = priceHistoryRepository;
        this.vendorRepository = vendorRepository;
        this.productRepository = productRepository;
        this.warehouseRepository = warehouseRepository;
        this.branchAccessService = branchAccessService;
        this.lpoService = lpoService;
        this.objectMapper = objectMapper;
    }

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * Writes pending changes of an already-loaded RFQ so new child rows get their ids before the
     * response is built. Deliberately not {@code save()}: merging a managed parent can persist a
     * second copy of children that were just added to its collections.
     */
    private Rfq persistChanges(Rfq rfq) {
        if (entityManager != null) {
            entityManager.flush();
        }
        return rfq;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Read
    // ═════════════════════════════════════════════════════════════════════════

    @Transactional(readOnly = true)
    public List<RfqSummary> list() {
        List<Rfq> rfqs = branchAccessService.filterBranchScoped(
                rfqRepository.findByIsActiveTrueOrderByIdDesc(), Rfq::getBranchId);
        return rfqs.stream().map(this::toSummary).toList();
    }

    @Transactional(readOnly = true)
    public RfqDetail get(Long id) {
        return toDetail(load(id));
    }

    /** Every priced offer across the RFQs this user can see, for the "All Responses" view. */
    @Transactional(readOnly = true)
    public List<ResponseRow> responses(Long rfqId) {
        List<Rfq> rfqs = rfqId != null
                ? List.of(load(rfqId))
                : branchAccessService.filterBranchScoped(rfqRepository.findByIsActiveTrueOrderByIdDesc(), Rfq::getBranchId);
        if (rfqs.isEmpty()) {
            return List.of();
        }
        Map<Long, RfqNegotiation> latestNegByOffer = new HashMap<>();
        negotiationRepository.findByRfqIdIn(rfqs.stream().map(Rfq::getId).toList()).stream()
                .sorted(Comparator.comparing(RfqNegotiation::getId))
                .forEach(n -> latestNegByOffer.put(n.getOfferId(), n));

        List<ResponseRow> rows = new ArrayList<>();
        for (Rfq rfq : rfqs) {
            Map<Long, RfqItem> items = rfq.getItems().stream().collect(Collectors.toMap(RfqItem::getId, Function.identity()));
            for (RfqVendor v : rfq.getVendors()) {
                if (!v.getResponseStatus().hasResponded() || v.getResponseStatus() == RfqVendorResponseStatus.DECLINED) {
                    continue;
                }
                for (RfqOffer o : v.getOffers()) {
                    RfqItem item = items.get(o.getRfqItemId());
                    if (item == null) continue;
                    RfqNegotiation neg = latestNegByOffer.get(o.getId());
                    rows.add(new ResponseRow(rfq.getId(), rfq.getRfqNumber(), rfq.getStatus().name(), toItemDto(item),
                            v.getId(), v.getVendorId(), v.getVendorName(), v.getVendorCode(), v.getResponseStatus().name(),
                            v.getPaymentTerms(), toOfferDto(o), neg != null ? neg.getStatus().name() : null));
                }
            }
        }
        return rows;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Create / edit / delete
    // ═════════════════════════════════════════════════════════════════════════

    @Transactional
    public RfqDetail create(RfqRequest request) {
        Rfq rfq = new Rfq();
        rfq.setRfqNumber(nextNumber());
        rfq.setStatus(RfqStatus.DRAFT);
        Branch branch = branchAccessService.getCurrentUserBranchOrNull();
        if (branch != null) {
            rfq.setBranchId(branch.getId());
            rfq.setBranchName(branch.getName());
        }
        applyHeader(rfq, request);
        if (!notBlank(rfq.getReference())) {
            rfq.setReference("PR-" + rfq.getRfqNumber().substring("RFQ-".length()));
        }
        applyItems(rfq, request.items());
        applyVendors(rfq, request.vendorIds());
        Rfq saved = rfqRepository.save(rfq);

        log(saved, "created", "RFQ created", null, null, null);
        log(saved, "vendor_added", saved.getVendors().size() + " vendor(s) allocated", null, null, null);
        if (Boolean.TRUE.equals(request.send())) {
            markSent(saved, MARKED_ONLY);
        }
        return toDetail(saved);
    }

    /** Full edit is only allowed while the RFQ is still a draft (vendors have not seen it yet). */
    @Transactional
    public RfqDetail update(Long id, RfqRequest request) {
        Rfq rfq = load(id);
        if (rfq.getStatus() != RfqStatus.DRAFT) {
            throw new IllegalStateException("Only draft RFQs can be edited. This RFQ is " + label(rfq.getStatus()) + ".");
        }
        applyHeader(rfq, request);
        applyItems(rfq, request.items());
        applyVendors(rfq, request.vendorIds());
        log(rfq, "updated", "RFQ details updated", null, null, null);
        if (Boolean.TRUE.equals(request.send())) {
            markSent(rfq, MARKED_ONLY);
        }
        return toDetail(persistChanges(rfq));
    }

    @Transactional
    public void delete(Long id) {
        Rfq rfq = load(id);
        if (rfq.getStatus() != RfqStatus.DRAFT) {
            throw new IllegalStateException("Only draft RFQs can be deleted. Cancel it instead.");
        }
        rfq.setActive(false);
        persistChanges(rfq);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Workflow actions
    // ═════════════════════════════════════════════════════════════════════════

    @Transactional
    public RfqDetail send(Long id, SendRequest request) {
        Rfq rfq = load(id);
        assertOpen(rfq);
        if (rfq.getVendors().isEmpty()) {
            throw new IllegalArgumentException("Add at least one vendor before sending the RFQ.");
        }
        refreshVendorContacts(rfq);
        ensurePortalTokens(rfq);
        markSent(rfq, request != null && notBlank(request.channel()) ? request.channel() : MARKED_ONLY);
        return toDetail(persistChanges(rfq));
    }

    /** Every invited vendor needs a portal link secret before invitations go out. */
    private void ensurePortalTokens(Rfq rfq) {
        for (RfqVendor v : rfq.getVendors()) {
            if (v.getPortalToken() == null) {
                v.setPortalToken(newPortalToken());
            }
        }
    }

    static String newPortalToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** Runs {@code action} with activity entries attributed to the vendor acting through the portal. */
    public <T> T asPortalVendor(String vendorName, Supplier<T> action) {
        PORTAL_ACTOR.set(vendorName);
        try {
            return action.get();
        } finally {
            PORTAL_ACTOR.remove();
        }
    }

    /**
     * Records a portal-related event on the RFQ timeline. {@code byVendor} attributes it to the
     * vendor (inside {@link #asPortalVendor}); otherwise to the signed-in staff user.
     */
    public void logPortalEvent(Rfq rfq, String type, String description, boolean byVendor) {
        log(rfq, type, description, byVendor ? "vendor" : null, null, null);
    }

    /**
     * Vendors who supplied (LPO lines) or quoted (earlier RFQs) any of the given products, best
     * match first. Drives "Auto-Allocate" in the RFQ wizard.
     *
     * <p>Each vendor gets a per-product score (0-1) built from purchase volume (40%), how often we
     * ordered from them (15%), how recently (20%) and how their average price compares with the
     * cheapest vendor for that product (25%). Quote-only vendors score on recency and price only.
     * The vendor score is the average over all requested products (so coverage counts), scaled by
     * how reliably the vendor answers RFQs once it has been invited at least twice.
     */
    @Transactional(readOnly = true)
    public List<VendorSuggestion> suggestVendors(List<Long> productIds) {
        if (productIds == null || productIds.isEmpty()) return List.of();
        List<Long> requested = productIds.stream().filter(Objects::nonNull).distinct().toList();
        if (requested.isEmpty()) return List.of();
        BranchAccessService.ListScope scope = branchAccessService.currentListScope();
        Set<Long> branchIds = scope.branchIds() == null || scope.branchIds().isEmpty() ? Set.of(-1L) : scope.branchIds();

        Map<Long, String> names = new LinkedHashMap<>();
        Map<Long, Map<Long, SupplyStat>> byVendor = new LinkedHashMap<>();
        for (Object[] row : priceHistoryRepository.lpoSuppliersOf(requested, scope.allBranches(), branchIds)) {
            Long vendorId = (Long) row[0];
            names.putIfAbsent(vendorId, (String) row[1]);
            SupplyStat st = byVendor.computeIfAbsent(vendorId, k -> new LinkedHashMap<>()).computeIfAbsent((Long) row[2], k -> new SupplyStat());
            st.lpoLines += ((Number) row[3]).longValue();
            st.seen((LocalDate) row[4]);
            st.qty += row.length > 5 && row[5] != null ? ((Number) row[5]).longValue() : 0;
            st.avgLpo = row.length > 6 ? toDecimal(row[6]) : null;
        }
        for (Object[] row : priceHistoryRepository.quotingVendorsOf(requested, RESPONDED_WITH_PRICES)) {
            Long vendorId = (Long) row[0];
            names.putIfAbsent(vendorId, (String) row[1]);
            SupplyStat st = byVendor.computeIfAbsent(vendorId, k -> new LinkedHashMap<>()).computeIfAbsent((Long) row[2], k -> new SupplyStat());
            st.quotes += ((Number) row[3]).longValue();
            LocalDateTime t = (LocalDateTime) row[4];
            st.seen(t == null ? null : t.toLocalDate());
            st.avgQuote = row.length > 5 ? toDecimal(row[5]) : null;
        }
        if (byVendor.isEmpty()) return List.of();

        Map<Long, int[]> reliability = new HashMap<>();
        List<Object[]> stats = priceHistoryRepository.responseStatsOf(byVendor.keySet(), RESPONDED_WITH_PRICES_OR_DECLINED);
        for (Object[] row : stats == null ? List.<Object[]>of() : stats) {
            reliability.put((Long) row[0], new int[] { ((Number) row[1]).intValue(), row[2] == null ? 0 : ((Number) row[2]).intValue() });
        }

        LocalDate today = LocalDate.now();
        // productId -> vendorId -> score (0..1)
        Map<Long, Map<Long, Double>> productScores = new HashMap<>();
        for (Long productId : requested) {
            long maxQty = 0;
            long maxLines = 0;
            BigDecimal minPrice = null;
            for (Map<Long, SupplyStat> perProduct : byVendor.values()) {
                SupplyStat st = perProduct.get(productId);
                if (st == null) continue;
                maxQty = Math.max(maxQty, st.qty);
                maxLines = Math.max(maxLines, st.lpoLines);
                BigDecimal p = st.price();
                if (p != null && (minPrice == null || p.compareTo(minPrice) < 0)) minPrice = p;
            }
            Map<Long, Double> scores = new HashMap<>();
            for (Map.Entry<Long, Map<Long, SupplyStat>> e : byVendor.entrySet()) {
                SupplyStat st = e.getValue().get(productId);
                if (st == null) continue;
                double volume = maxQty > 0 ? (double) st.qty / maxQty : 0;
                double frequency = maxLines > 0 ? (double) st.lpoLines / maxLines : 0;
                double recency = st.last == null ? 0
                        : Math.max(0, 1 - java.time.temporal.ChronoUnit.DAYS.between(st.last, today) / 365.0);
                BigDecimal p = st.price();
                double price = minPrice != null && p != null ? minPrice.doubleValue() / p.doubleValue() : 0;
                scores.put(e.getKey(), 0.40 * volume + 0.15 * frequency + 0.20 * Math.min(1, recency) + 0.25 * price);
            }
            productScores.put(productId, scores);
        }

        List<VendorSuggestion> out = new ArrayList<>();
        for (Map.Entry<Long, Map<Long, SupplyStat>> e : byVendor.entrySet()) {
            Long vendorId = e.getKey();
            List<ProductSuggestion> products = new ArrayList<>();
            double sum = 0;
            long lpoCount = 0;
            long quoteCount = 0;
            long totalQty = 0;
            LocalDate last = null;
            for (Long productId : requested) {
                SupplyStat st = e.getValue().get(productId);
                if (st == null) continue;
                Map<Long, Double> scores = productScores.get(productId);
                double own = scores.getOrDefault(vendorId, 0d);
                int rank = 1 + (int) scores.values().stream().filter(v -> v > own).count();
                products.add(new ProductSuggestion(productId, st.lpoLines, st.qty, price2(st.avgLpo), st.quotes,
                        price2(st.avgQuote), st.last, round1(own * 100), rank));
                sum += own;
                lpoCount += st.lpoLines;
                quoteCount += st.quotes;
                totalQty += st.qty;
                if (st.last != null && (last == null || st.last.isAfter(last))) last = st.last;
            }
            double score = sum / requested.size();
            int[] rel = reliability.get(vendorId);
            if (rel != null && rel[0] >= 2) {
                score *= 0.75 + 0.25 * ((double) rel[1] / rel[0]);
            }
            out.add(new VendorSuggestion(vendorId, names.get(vendorId),
                    products.stream().map(ProductSuggestion::productId).sorted().toList(),
                    lpoCount, quoteCount, last, totalQty, round1(score * 100),
                    rel == null ? null : rel[0], rel == null ? null : rel[1], products));
        }
        out.sort(Comparator.comparingDouble(VendorSuggestion::score).reversed()
                .thenComparing(Comparator.comparingInt((VendorSuggestion s) -> s.productIds().size()).reversed())
                .thenComparing(VendorSuggestion::lastDate, Comparator.nullsLast(Comparator.reverseOrder())));
        return out;
    }

    /** Running purchase/quote history of one vendor for one product. */
    private static final class SupplyStat {
        long lpoLines;
        long qty;
        BigDecimal avgLpo;
        long quotes;
        BigDecimal avgQuote;
        LocalDate last;

        BigDecimal price() {
            if (avgLpo != null && avgLpo.signum() > 0) return avgLpo;
            if (avgQuote != null && avgQuote.signum() > 0) return avgQuote;
            return null;
        }

        void seen(LocalDate d) {
            if (d != null && (last == null || d.isAfter(last))) last = d;
        }
    }

    private static BigDecimal toDecimal(Object value) {
        if (value == null) return null;
        if (value instanceof BigDecimal bd) return bd;
        return BigDecimal.valueOf(((Number) value).doubleValue());
    }

    private static BigDecimal price2(BigDecimal value) {
        return value == null ? null : value.setScale(2, RoundingMode.HALF_UP);
    }

    private static double round1(double value) {
        return Math.round(value * 10) / 10.0;
    }

    /** {nextRfqNumber, suggestedReference}: what the next RFQ will most likely be numbered. */
    @Transactional(readOnly = true)
    public String[] previewNumbers() {
        String number = nextNumber();
        return new String[] { number, "PR-" + number.substring("RFQ-".length()) };
    }

    @Transactional
    public RfqDetail changeStatus(Long id, StatusRequest request) {
        Rfq rfq = load(id);
        RfqStatus target = parseStatus(request == null ? null : request.status());
        String reason = request == null ? null : trim(request.reason());
        if (Set.of(RfqStatus.CANCELLED, RfqStatus.REJECTED, RfqStatus.EXPIRED).contains(target) && !notBlank(reason)) {
            throw new IllegalArgumentException("A reason is required to mark the RFQ " + label(target) + ".");
        }
        if (target == RfqStatus.COMPLETED_LPO && rfq.getLpos().isEmpty()) {
            throw new IllegalArgumentException("No LPO has been created from this RFQ. Create the LPOs instead, or use Completed (No LPO).");
        }
        RfqStatus old = rfq.getStatus();
        if (old == target) {
            return toDetail(rfq);
        }
        rfq.setStatus(target);
        log(rfq, "status_changed",
                "Status updated: " + label(old) + " → " + label(target) + (notBlank(reason) ? " (" + reason + ")" : ""),
                null, label(old), label(target));
        return toDetail(persistChanges(rfq));
    }

    /**
     * Records (or replaces) one vendor's quotation. Offers sent with an existing id are updated in
     * place so negotiations and awards that point at them stay linked; offers left out are removed.
     */
    @Transactional
    public RfqDetail saveQuote(Long id, Long rfqVendorId, QuoteRequest request) {
        return toDetail(applyQuote(load(id), rfqVendorId, request));
    }

    /**
     * Shared by staff entry and the vendor portal. The caller has already checked access to
     * {@code rfq} (branch scope for staff, a valid vendor session for the portal).
     */
    @Transactional
    public Rfq applyQuote(Rfq rfq, Long rfqVendorId, QuoteRequest request) {
        assertOpen(rfq);
        RfqVendor vendor = findVendor(rfq, rfqVendorId);
        String action = request.action() == null ? "SAVE" : request.action().trim().toUpperCase(Locale.ROOT);
        Map<Long, RfqItem> items = rfq.getItems().stream().collect(Collectors.toMap(RfqItem::getId, Function.identity()));

        vendor.setPaymentTerms(trim(request.paymentTerms()));
        vendor.setDeliveryTerms(trim(request.deliveryTerms()));
        vendor.setValidity(request.validity());

        RfqVendorResponseStatus before = vendor.getResponseStatus();
        boolean wasSubmitted = before == RfqVendorResponseStatus.SUBMITTED
                || before == RfqVendorResponseStatus.REVISED
                || before == RfqVendorResponseStatus.REVISION_REQUESTED;

        if ("DECLINE".equals(action)) {
            vendor.getOffers().clear();
            vendor.setResponseStatus(RfqVendorResponseStatus.DECLINED);
            vendor.setSubmittedAt(LocalDateTime.now());
            clearDanglingAwards(rfq);
            log(rfq, "quote_declined", vendor.getVendorName() + " declined to quote", "vendor", null, null);
            recomputeResponseStatus(rfq);
            return persistChanges(rfq);
        }

        int nextVersion = "SUBMIT".equals(action) ? Math.max(1, vendor.getVersion() + (wasSubmitted ? 1 : 0)) : Math.max(1, vendor.getVersion());
        Map<Long, RfqOffer> existing = vendor.getOffers().stream().collect(Collectors.toMap(RfqOffer::getId, Function.identity()));
        List<RfqOffer> next = new ArrayList<>();
        for (OfferRequest req : Optional.ofNullable(request.offers()).orElse(List.of())) {
            if (req.rfqItemId() == null || !items.containsKey(req.rfqItemId())) {
                throw new IllegalArgumentException("Offer refers to an item that is not on this RFQ.");
            }
            RfqOffer offer = req.id() != null ? existing.get(req.id()) : null;
            if (offer == null) {
                offer = new RfqOffer();
                offer.setRfqVendor(vendor);
            }
            applyOffer(offer, req, nextVersion);
            assertOfferAllowed(items.get(req.rfqItemId()), offer, "SUBMIT".equals(action));
            next.add(offer);
        }
        vendor.getOffers().clear();
        vendor.getOffers().addAll(next);

        if ("SUBMIT".equals(action)) {
            boolean hasPricedOffer = next.stream().anyMatch(o -> positive(o.getUnitPrice()) && o.getQuotedQty() != null && o.getQuotedQty() > 0);
            if (!hasPricedOffer) {
                throw new IllegalArgumentException("Add at least one offer with a price and quantity before submitting.");
            }
            vendor.setVersion(nextVersion);
            vendor.setResponseStatus(wasSubmitted ? RfqVendorResponseStatus.REVISED : RfqVendorResponseStatus.SUBMITTED);
            vendor.setSubmittedAt(LocalDateTime.now());
            log(rfq, "quote_submitted", vendor.getVendorName() + (wasSubmitted ? " revised" : " submitted")
                    + " quotation (v" + nextVersion + ")", "vendor", "rfqVendor:" + vendor.getId(), null, null);
        } else if (!wasSubmitted) {
            vendor.setResponseStatus(RfqVendorResponseStatus.IN_PROGRESS);
        }
        clearDanglingAwards(rfq);
        recomputeResponseStatus(rfq);
        return persistChanges(rfq);
    }

    @Transactional
    public RfqDetail requestBetterPrice(Long id, NegotiationRequest request) {
        Rfq rfq = load(id);
        assertOpen(rfq);
        OfferContext ctx = findOffer(rfq, request.offerId());
        BigDecimal target = request.targetPrice();
        if (!positive(target)) {
            throw new IllegalArgumentException("Enter a target price greater than zero.");
        }
        if (target.compareTo(ctx.offer().getUnitPrice()) >= 0) {
            throw new IllegalArgumentException("The target price must be lower than the current offer price.");
        }
        boolean alreadyOpen = negotiationRepository.findByRfqIdOrderByIdAsc(rfq.getId()).stream()
                .anyMatch(n -> n.getOfferId().equals(ctx.offer().getId()) && n.getStatus() == RfqNegotiationStatus.REQUESTED);
        if (alreadyOpen) {
            throw new IllegalStateException("A price request for this offer is still waiting for the vendor's reply.");
        }
        LocalDateTime now = LocalDateTime.now();
        RfqNegotiation neg = new RfqNegotiation();
        neg.setRfqId(rfq.getId());
        neg.setRfqItemId(ctx.item().getId());
        neg.setVendorId(ctx.vendor().getVendorId());
        neg.setOfferId(ctx.offer().getId());
        neg.setStatus(RfqNegotiationStatus.REQUESTED);
        neg.setTargetPrice(target);
        neg.setTargetQty(request.targetQty() != null && request.targetQty() > 0 ? request.targetQty() : ctx.offer().getQuotedQty());
        neg.setMessage(trim(request.message()));
        neg.setDeadline(request.deadline());
        neg.setRequestedAt(now);
        neg.setPreviousPrice(ctx.offer().getUnitPrice());
        neg.setHistoryJson(writeJson(List.of(new NegotiationEvent("request", now, target, trim(request.message())))));
        RfqNegotiation saved = negotiationRepository.save(neg);

        ctx.vendor().setResponseStatus(RfqVendorResponseStatus.REVISION_REQUESTED);
        if (rfq.getStatus() != RfqStatus.NEGOTIATION && !rfq.getStatus().isClosed() && rfq.getStatus() != RfqStatus.PARTIAL_ORDERED) {
            RfqStatus old = rfq.getStatus();
            rfq.setStatus(RfqStatus.NEGOTIATION);
            log(rfq, "status_changed", "Status updated: " + label(old) + " → " + label(RfqStatus.NEGOTIATION), "system", label(old), label(RfqStatus.NEGOTIATION));
        }
        log(rfq, "negotiation_requested", "Better price requested from " + ctx.vendor().getVendorName() + " for "
                + ctx.item().getItemName() + " (target " + money(target) + ")", null, "negotiation:" + saved.getId(), null, null);
        return toDetail(persistChanges(rfq));
    }

    /** Records the vendor's answer to a price request. ACCEPTED / REVISED update the offer's unit price. */
    @Transactional
    public RfqDetail recordNegotiationReply(Long id, Long negotiationId, NegotiationReplyRequest request) {
        return toDetail(applyNegotiationReply(load(id), negotiationId, null, request));
    }

    /**
     * Shared by staff entry and the vendor portal. {@code onlyVendorId}, when set, refuses a
     * negotiation that was sent to a different vendor (the portal passes the session's vendor).
     */
    @Transactional
    public Rfq applyNegotiationReply(Rfq rfq, Long negotiationId, Long onlyVendorId, NegotiationReplyRequest request) {
        assertOpen(rfq);
        RfqNegotiation neg = negotiationRepository.findById(negotiationId)
                .filter(n -> n.getRfqId().equals(rfq.getId()))
                .filter(n -> onlyVendorId == null || n.getVendorId().equals(onlyVendorId))
                .orElseThrow(() -> new IllegalArgumentException("Negotiation not found on this RFQ."));
        if (neg.getStatus() != RfqNegotiationStatus.REQUESTED) {
            throw new IllegalStateException("This price request has already been answered.");
        }
        String outcome = request.outcome() == null ? "" : request.outcome().trim().toUpperCase(Locale.ROOT);
        OfferContext ctx = findOffer(rfq, neg.getOfferId());
        LocalDateTime now = LocalDateTime.now();
        BigDecimal newPrice;
        switch (outcome) {
            case "ACCEPTED" -> {
                newPrice = neg.getTargetPrice();
                neg.setStatus(RfqNegotiationStatus.ACCEPTED);
            }
            case "REVISED" -> {
                if (!positive(request.revisedPrice())) {
                    throw new IllegalArgumentException("Enter the revised price the vendor offered.");
                }
                newPrice = request.revisedPrice();
                neg.setStatus(RfqNegotiationStatus.REVISED);
            }
            case "DECLINED" -> {
                newPrice = null;
                neg.setStatus(RfqNegotiationStatus.DECLINED);
            }
            default -> throw new IllegalArgumentException("Outcome must be ACCEPTED, REVISED or DECLINED.");
        }
        neg.setRespondedAt(now);
        neg.setResponseMessage(trim(request.message()));
        neg.setRevisedPrice(newPrice);
        List<NegotiationEvent> history = new ArrayList<>(readJson(neg.getHistoryJson(), NEG_EVENTS));
        history.add(new NegotiationEvent(outcome.toLowerCase(Locale.ROOT), now, newPrice, trim(request.message())));
        neg.setHistoryJson(writeJson(history));
        negotiationRepository.save(neg);

        RfqVendor vendor = ctx.vendor();
        if (newPrice != null) {
            BigDecimal old = ctx.offer().getUnitPrice();
            ctx.offer().setUnitPrice(newPrice);
            vendor.setVersion(vendor.getVersion() + 1);
            ctx.offer().setVersion(vendor.getVersion());
            vendor.setResponseStatus(RfqVendorResponseStatus.REVISED);
            log(rfq, "price_revised", vendor.getVendorName() + " revised the price for " + ctx.item().getItemName()
                    + " (" + money(old) + " → " + money(newPrice) + ")", "vendor", "negotiation:" + neg.getId(), money(old), money(newPrice));
        } else {
            vendor.setResponseStatus(RfqVendorResponseStatus.SUBMITTED);
            log(rfq, "negotiation_declined", vendor.getVendorName() + " declined the price request for " + ctx.item().getItemName(),
                    "vendor", "negotiation:" + neg.getId(), null, null);
        }
        boolean otherOpen = negotiationRepository.findByRfqIdOrderByIdAsc(rfq.getId()).stream()
                .anyMatch(n -> !n.getId().equals(neg.getId()) && n.getVendorId().equals(neg.getVendorId())
                        && n.getStatus() == RfqNegotiationStatus.REQUESTED);
        if (otherOpen) {
            vendor.setResponseStatus(RfqVendorResponseStatus.REVISION_REQUESTED);
        }
        return persistChanges(rfq);
    }

    /** Awards an item to one offer, or clears the award when offerId is null or already awarded. */
    @Transactional
    public RfqDetail award(Long id, AwardRequest request) {
        Rfq rfq = load(id);
        assertOpen(rfq);
        RfqItem item = rfq.getItems().stream().filter(i -> i.getId().equals(request.itemId())).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Item not found on this RFQ."));
        if (request.offerId() == null || request.offerId().equals(item.getAwardedOfferId())) {
            item.setAwardedOfferId(null);
            log(rfq, "award_removed", "Award removed for " + item.getItemName(), null, null, null, null);
            return toDetail(persistChanges(rfq));
        }
        OfferContext ctx = findOffer(rfq, request.offerId());
        if (!ctx.item().getId().equals(item.getId())) {
            throw new IllegalArgumentException("That offer is for a different item.");
        }
        item.setAwardedOfferId(ctx.offer().getId());
        if (rfq.getStatus() == RfqStatus.PARTIAL || rfq.getStatus() == RfqStatus.RECEIVED) {
            RfqStatus old = rfq.getStatus();
            rfq.setStatus(RfqStatus.EVALUATION);
            log(rfq, "status_changed", "Status updated: " + label(old) + " → " + label(RfqStatus.EVALUATION), "system", label(old), label(RfqStatus.EVALUATION));
        }
        log(rfq, "item_awarded", item.getItemName() + " awarded to " + ctx.vendor().getVendorName()
                + " at " + money(ctx.offer().getUnitPrice()), null, null, null, null);
        return toDetail(persistChanges(rfq));
    }

    /**
     * Creates one draft LPO per vendor from the chosen offers. Runs in one transaction: if any LPO
     * is refused (e.g. vendor on hold), none are created and quantities stay untouched.
     */
    @Transactional
    public RfqDetail createLpos(Long id, CreateLposRequest request) {
        Rfq rfq = load(id);
        assertOpen(rfq);
        List<LpoLine> lines = Optional.ofNullable(request.lines()).orElse(List.of());
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("Select at least one offer to order.");
        }
        Long warehouseId = request.warehouseId() != null ? request.warehouseId() : rfq.getWarehouseId();
        if (warehouseId == null) {
            throw new IllegalArgumentException("Choose the warehouse the goods should be delivered to.");
        }

        Map<Long, List<Object[]>> byVendor = new LinkedHashMap<>(); // rfqVendorId -> [item, offer, qty]
        Set<Long> seenItems = new HashSet<>();
        for (LpoLine line : lines) {
            OfferContext ctx = findOffer(rfq, line.offerId());
            if (line.itemId() != null && !line.itemId().equals(ctx.item().getId())) {
                throw new IllegalArgumentException("Offer and item do not match.");
            }
            if (!seenItems.add(ctx.item().getId())) {
                throw new IllegalArgumentException(ctx.item().getItemName() + " is selected more than once.");
            }
            int qty = line.qty() == null ? 0 : line.qty();
            if (qty <= 0) {
                throw new IllegalArgumentException("Order quantity for " + ctx.item().getItemName() + " must be greater than zero.");
            }
            if (qty > ctx.item().remainingQty()) {
                throw new IllegalArgumentException("Only " + ctx.item().remainingQty() + " " + Objects.toString(ctx.item().getUnit(), "")
                        + " of " + ctx.item().getItemName() + " remain to be ordered.");
            }
            if (!positive(ctx.offer().getUnitPrice())) {
                throw new IllegalArgumentException("The offer for " + ctx.item().getItemName() + " has no price.");
            }
            byVendor.computeIfAbsent(ctx.vendor().getId(), k -> new ArrayList<>()).add(new Object[] { ctx.item(), ctx.offer(), qty });
        }

        String buyer = currentUsername();
        LocalDateTime now = LocalDateTime.now();
        for (Map.Entry<Long, List<Object[]>> entry : byVendor.entrySet()) {
            RfqVendor vendor = findVendor(rfq, entry.getKey());
            LpoRequest lpo = new LpoRequest();
            lpo.setVendorId(vendor.getVendorId());
            lpo.setVendorName(vendor.getVendorName());
            lpo.setVendorCode(vendor.getVendorCode());
            lpo.setSource(LpoSource.MANUAL);
            lpo.setWarehouseId(warehouseId);
            lpo.setBuyerAssigned(buyer);
            lpo.setReferenceDocument(rfq.getRfqNumber());

            LocalDate latestDelivery = null;
            List<LpoItemRequest> lpoItems = new ArrayList<>();
            for (Object[] row : entry.getValue()) {
                RfqItem item = (RfqItem) row[0];
                RfqOffer offer = (RfqOffer) row[1];
                int qty = (Integer) row[2];
                BigDecimal discount = offer.getDiscountPercent() == null ? BigDecimal.ZERO : offer.getDiscountPercent();
                BigDecimal lineTotal = offer.getUnitPrice().multiply(BigDecimal.valueOf(qty))
                        .multiply(BigDecimal.ONE.subtract(discount.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)))
                        .setScale(2, RoundingMode.HALF_UP);
                LpoItemRequest li = new LpoItemRequest();
                li.setProductId(item.getProductId());
                li.setItemName(item.getItemName());
                li.setUom(item.getUnit());
                li.setQuantity(qty);
                li.setUnitPrice(offer.getUnitPrice().setScale(4, RoundingMode.HALF_UP));
                li.setDiscountPercent(discount);
                li.setLineTotal(lineTotal);
                // VAT as the vendor quoted it; no rate quoted → the product's purchase tax applies.
                li.setPurchaseTax(offer.getTaxPercent());
                String spec = offerLabel(offer);
                li.setRemarks((offer.isAlternative() ? "Alternative: " : "") + spec + " · " + rfq.getRfqNumber());
                lpoItems.add(li);
                LocalDate d = offer.getDeliveryDate() != null ? offer.getDeliveryDate() : item.getExpectedDelivery();
                if (d != null && (latestDelivery == null || d.isAfter(latestDelivery))) latestDelivery = d;
            }
            if (latestDelivery == null) latestDelivery = rfq.getExpectedDelivery();
            // LpoService refuses a delivery date earlier than today's PO date.
            lpo.setExpectedDeliveryDate(latestDelivery != null && !latestDelivery.isBefore(LocalDate.now()) ? latestDelivery : null);
            lpo.setItems(lpoItems);

            LpoDetailResponse created = lpoService.create(lpo);
            rfq.getLpos().add(new RfqLpoRef(created.getId(), created.getLpoNumber(), vendor.getVendorId(), vendor.getVendorName(), now));
            for (Object[] row : entry.getValue()) {
                RfqItem item = (RfqItem) row[0];
                item.setQtyOrdered((item.getQtyOrdered() == null ? 0 : item.getQtyOrdered()) + (Integer) row[2]);
            }
            log(rfq, "lpo_created", "LPO " + created.getLpoNumber() + " created for " + vendor.getVendorName()
                    + " (" + entry.getValue().size() + " item(s))", null, created.getLpoNumber(), null, null);
        }

        boolean allOrdered = rfq.getItems().stream().allMatch(i -> i.remainingQty() == 0);
        RfqStatus old = rfq.getStatus();
        RfqStatus target = allOrdered ? RfqStatus.COMPLETED_LPO : RfqStatus.PARTIAL_ORDERED;
        if (old != target) {
            rfq.setStatus(target);
            log(rfq, "status_changed", "Status updated: " + label(old) + " → " + label(target), "system", label(old), label(target));
        }
        return toDetail(persistChanges(rfq));
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Helpers: mapping requests
    // ═════════════════════════════════════════════════════════════════════════

    private void applyHeader(Rfq rfq, RfqRequest r) {
        if (r == null || !notBlank(r.title())) {
            throw new IllegalArgumentException("RFQ title is required.");
        }
        if (r.deadline() == null) {
            throw new IllegalArgumentException("Quotation deadline is required.");
        }
        if (r.expectedDelivery() != null && r.expectedDelivery().isBefore(r.deadline())) {
            throw new IllegalArgumentException("Expected delivery cannot be before the quotation deadline.");
        }
        rfq.setTitle(r.title().trim());
        rfq.setReference(trim(r.reference()));
        rfq.setDeadline(r.deadline());
        rfq.setExpectedDelivery(r.expectedDelivery());
        rfq.setCurrency(notBlank(r.currency()) ? r.currency().trim().toUpperCase(Locale.ROOT) : "AED");
        rfq.setTaxPref(trim(r.taxPref()));
        rfq.setPaymentTerms(trim(r.paymentTerms()));
        rfq.setDeliveryTerms(trim(r.deliveryTerms()));
        rfq.setQuotationValidity(trim(r.quotationValidity()));
        rfq.setShippingReqs(trim(r.shippingReqs()));
        rfq.setNotes(trim(r.notes()));
        rfq.setVendorInstructions(trim(r.vendorInstructions()));

        if (r.warehouseId() != null) {
            Warehouse warehouse = warehouseRepository.findById(r.warehouseId())
                    .orElseThrow(() -> new IllegalArgumentException("Warehouse not found."));
            if (rfq.getBranchId() != null) {
                branchAccessService.assertWarehouseMatchesBranch(warehouse, rfq.getBranchId(), "RFQ");
            }
            rfq.setWarehouseId(warehouse.getId());
            rfq.setWarehouseName(warehouse.getName());
            rfq.setDeliveryLocation(notBlank(r.deliveryLocation()) ? r.deliveryLocation().trim() : warehouse.getName());
        } else {
            rfq.setWarehouseId(null);
            rfq.setWarehouseName(null);
            rfq.setDeliveryLocation(trim(r.deliveryLocation()));
        }
    }

    private void applyItems(Rfq rfq, List<ItemRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            throw new IllegalArgumentException("Add at least one item to the RFQ.");
        }
        rfq.getItems().clear();
        int lineNo = 1;
        Set<Long> seen = new HashSet<>();
        for (ItemRequest r : requests) {
            if (r.productId() == null) {
                throw new IllegalArgumentException("Every item must be picked from the product master.");
            }
            if (!seen.add(r.productId())) {
                throw new IllegalArgumentException("A product is listed more than once. Combine the quantities into one line.");
            }
            Product product = productRepository.findById(r.productId())
                    .orElseThrow(() -> new IllegalArgumentException("Product not found: " + r.productId()));
            if (r.qtyNeeded() == null || r.qtyNeeded() <= 0) {
                throw new IllegalArgumentException("Quantity for " + product.getName() + " must be greater than zero.");
            }
            RfqItem item = new RfqItem();
            item.setRfq(rfq);
            item.setLineNo(lineNo++);
            item.setProductId(product.getId());
            item.setItemCode(product.getCode());
            item.setItemName(notBlank(r.itemName()) ? r.itemName().trim() : product.getName());
            item.setDescription(trim(r.description()));
            item.setCategory(notBlank(r.category()) ? r.category().trim() : product.getCategory());
            item.setBrand(notBlank(r.brand()) ? r.brand().trim() : product.getBrand() != null ? product.getBrand().getName() : null);
            item.setModel(trim(r.model()));
            item.setUnit(notBlank(r.unit()) ? r.unit().trim() : "Pcs");
            item.setQtyNeeded(r.qtyNeeded());
            item.setQtyOrdered(0);
            item.setMinSpec(trim(r.minSpec()));
            item.setAltBrandAllowed(r.altBrandAllowed() == null || r.altBrandAllowed());
            item.setPartialAllowed(r.partialAllowed() == null || r.partialAllowed());
            item.setExpectedDelivery(r.expectedDelivery());
            item.setWarrantyRequired(trim(r.warrantyRequired()));
            rfq.getItems().add(item);
        }
    }

    private void applyVendors(Rfq rfq, List<Long> vendorIds) {
        if (vendorIds == null || vendorIds.isEmpty()) {
            throw new IllegalArgumentException("Select at least one vendor.");
        }
        Set<Long> wanted = new java.util.LinkedHashSet<>(vendorIds);
        rfq.getVendors().removeIf(v -> !wanted.contains(v.getVendorId()));
        Set<Long> present = rfq.getVendors().stream().map(RfqVendor::getVendorId).collect(Collectors.toSet());
        for (Long vendorId : wanted) {
            if (present.contains(vendorId)) continue;
            Vendor vendor = vendorRepository.findById(vendorId)
                    .orElseThrow(() -> new IllegalArgumentException("Vendor not found: " + vendorId));
            RfqVendor rv = new RfqVendor();
            rv.setRfq(rfq);
            rv.setVendorId(vendor.getId());
            rv.setVendorName(vendor.getName());
            rv.setVendorCode(vendor.getCode());
            rv.setEmail(vendor.getEmail());
            rv.setPhone(firstNonBlank(vendor.getMobile(), vendor.getPrimaryPhone()));
            rv.setPaymentTerms(vendor.getPayTerms());
            rv.setResponseStatus(RfqVendorResponseStatus.PENDING);
            rv.setPortalToken(newPortalToken());
            rfq.getVendors().add(rv);
        }
    }

    /**
     * Enforces the item's "Alternative brands OK" and "Partial quantity OK" flags. Alternatives are
     * refused on every save; a short quantity only on submit, so a draft can be finished later.
     */
    static void assertOfferAllowed(RfqItem item, RfqOffer offer, boolean submitting) {
        if (offer.isAlternative() && !item.isAltBrandAllowed()) {
            throw new IllegalArgumentException("Alternative items are not accepted for " + item.getItemName()
                    + ". Quote the requested item, or mark it as not available.");
        }
        boolean priced = positive(offer.getUnitPrice()) && !"out-of-stock".equals(offer.getAvailability());
        int needed = item.getQtyNeeded() == null ? 0 : item.getQtyNeeded();
        int quoted = offer.getQuotedQty() == null ? 0 : offer.getQuotedQty();
        if (submitting && priced && !item.isPartialAllowed() && quoted < needed) {
            throw new IllegalArgumentException(item.getItemName() + " must be quoted for the full " + needed + " "
                    + (item.getUnit() == null ? "" : item.getUnit()).trim() + " — partial quantities are not accepted.");
        }
    }

    private void applyOffer(RfqOffer offer, OfferRequest r, int version) {
        offer.setRfqItemId(r.rfqItemId());
        offer.setBrand(trim(r.brand()));
        offer.setModel(trim(r.model()));
        offer.setSku(trim(r.sku()));
        offer.setDescription(trim(r.description()));
        offer.setUnitPrice(nonNegative(r.unitPrice(), "Unit price"));
        offer.setQuotedQty(r.quotedQty() == null ? 0 : Math.max(0, r.quotedQty()));
        offer.setAvailableStock(r.availableStock());
        offer.setAvailability(notBlank(r.availability()) ? r.availability().trim() : "in-stock");
        offer.setDispatchDate(r.dispatchDate());
        offer.setDeliveryDate(r.deliveryDate());
        offer.setWarranty(trim(r.warranty()));
        offer.setCountryOfOrigin(trim(r.countryOfOrigin()));
        offer.setTaxPercent(nonNegative(r.taxPercent(), "Tax %"));
        BigDecimal discount = nonNegative(r.discountPercent(), "Discount %");
        if (discount.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new IllegalArgumentException("Discount % cannot exceed 100.");
        }
        offer.setDiscountPercent(discount);
        offer.setShippingCost(nonNegative(r.shippingCost(), "Shipping cost"));
        offer.setAdditionalCost(nonNegative(r.additionalCost(), "Additional cost"));
        offer.setValidUntil(r.validUntil());
        offer.setNotes(trim(r.notes()));
        offer.setAlternative(Boolean.TRUE.equals(r.alternative()));
        offer.setAlternativeReason(trim(r.alternativeReason()));
        List<BulkTier> tiers = r.bulkTiers() == null ? List.of()
                : r.bulkTiers().stream().filter(t -> t != null && positive(t.unitPrice())).toList();
        offer.setBulkTiersJson(tiers.isEmpty() ? null : writeJson(tiers));
        offer.setVersion(version);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Helpers: workflow
    // ═════════════════════════════════════════════════════════════════════════

    /** Channel used when staff only mark the RFQ as sent; the system itself sends nothing. */
    static final String MARKED_ONLY = "manual";

    private void markSent(Rfq rfq, String channel) {
        if (rfq.getStatus() == RfqStatus.DRAFT) {
            rfq.setStatus(RfqStatus.SENT);
            rfq.setSentAt(LocalDateTime.now());
            log(rfq, "status_changed", "Status updated: Draft → Sent", "system", label(RfqStatus.DRAFT), label(RfqStatus.SENT));
        }
        String description = channel == null || MARKED_ONLY.equals(channel) || channel.startsWith("manual")
                ? "RFQ marked as sent to " + rfq.getVendors().size() + " vendor(s) (no messages sent by the system)"
                : "RFQ sent via " + channel + " to " + rfq.getVendors().size() + " vendor(s)";
        log(rfq, "sent", description, null, null, null, null);
    }

    /** Picks up email/phone changes made on the vendor master since the RFQ was created. */
    private void refreshVendorContacts(Rfq rfq) {
        for (RfqVendor rv : rfq.getVendors()) {
            vendorRepository.findById(rv.getVendorId()).ifPresent(vendor -> {
                rv.setVendorName(vendor.getName());
                rv.setEmail(vendor.getEmail());
                rv.setPhone(firstNonBlank(vendor.getMobile(), vendor.getPrimaryPhone()));
            });
        }
    }

    /** Sent → Partially responded → Received, driven by how many vendors have answered. */
    private void recomputeResponseStatus(Rfq rfq) {
        RfqStatus old = rfq.getStatus();
        if (!RfqStatus.RESPONSE_DRIVEN.contains(old) && old != RfqStatus.DRAFT) {
            return;
        }
        long responded = rfq.getVendors().stream().filter(v -> v.getResponseStatus().hasResponded()).count();
        if (responded == 0) {
            return;
        }
        RfqStatus target = responded >= rfq.getVendors().size() ? RfqStatus.RECEIVED : RfqStatus.PARTIAL;
        if (target != old) {
            rfq.setStatus(target);
            if (rfq.getSentAt() == null) rfq.setSentAt(LocalDateTime.now());
            log(rfq, "status_changed", "Status updated: " + label(old) + " → " + label(target), "system", label(old), label(target));
        }
    }

    /** Clears awards that point at offers which no longer exist (offer removed or vendor declined). */
    private void clearDanglingAwards(Rfq rfq) {
        Set<Long> offerIds = rfq.getVendors().stream().flatMap(v -> v.getOffers().stream())
                .map(RfqOffer::getId).filter(Objects::nonNull).collect(Collectors.toSet());
        for (RfqItem item : rfq.getItems()) {
            if (item.getAwardedOfferId() != null && !offerIds.contains(item.getAwardedOfferId())) {
                item.setAwardedOfferId(null);
            }
        }
    }

    private record OfferContext(RfqVendor vendor, RfqOffer offer, RfqItem item) {
    }

    private OfferContext findOffer(Rfq rfq, Long offerId) {
        if (offerId == null) {
            throw new IllegalArgumentException("Offer is required.");
        }
        for (RfqVendor v : rfq.getVendors()) {
            for (RfqOffer o : v.getOffers()) {
                if (offerId.equals(o.getId())) {
                    RfqItem item = rfq.getItems().stream().filter(i -> i.getId().equals(o.getRfqItemId())).findFirst()
                            .orElseThrow(() -> new IllegalArgumentException("Offer item not found."));
                    return new OfferContext(v, o, item);
                }
            }
        }
        throw new IllegalArgumentException("Offer not found on this RFQ.");
    }

    private RfqVendor findVendor(Rfq rfq, Long rfqVendorId) {
        return rfq.getVendors().stream().filter(v -> v.getId().equals(rfqVendorId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Vendor is not on this RFQ."));
    }

    private Rfq load(Long id) {
        Rfq rfq = rfqRepository.findById(id).filter(Rfq::isActive)
                .orElseThrow(() -> new IllegalArgumentException("RFQ not found."));
        branchAccessService.assertTransactionBranchAccessible(rfq.getBranchId(), "RFQ");
        return rfq;
    }

    private void assertOpen(Rfq rfq) {
        if (rfq.getStatus().isClosed()) {
            throw new IllegalStateException("This RFQ is " + label(rfq.getStatus()) + " and can no longer be changed.");
        }
    }

    private String nextNumber() {
        String prefix = "RFQ-" + LocalDate.now().getYear() + "-";
        String last = rfqRepository.findLastNumberLike(prefix + "%");
        int next = 1;
        if (last != null) {
            try {
                next = Integer.parseInt(last.substring(prefix.length())) + 1;
            } catch (NumberFormatException ignored) {
                next = (int) rfqRepository.count() + 1;
            }
        }
        return prefix + String.format("%04d", next);
    }

    private void log(Rfq rfq, String type, String description, String actorType, String ref, String oldValue, String newValue) {
        RfqActivity a = new RfqActivity();
        a.setRfqId(rfq.getId());
        a.setType(type);
        a.setDescription(description);
        String kind = actorType == null ? "user" : actorType;
        String portalVendor = PORTAL_ACTOR.get();
        if (portalVendor != null && "vendor".equals(kind)) {
            a.setActorType("vendor_portal");
            a.setActor(portalVendor);
        } else {
            a.setActorType(kind);
            a.setActor("system".equals(kind) ? "System" : currentUsername());
        }
        a.setOccurredAt(LocalDateTime.now());
        a.setRef(ref);
        a.setOldValue(oldValue);
        a.setNewValue(newValue);
        activityRepository.save(a);
    }

    private void log(Rfq rfq, String type, String description, String actorType, String oldValue, String newValue) {
        log(rfq, type, description, actorType, null, oldValue, newValue);
    }

    static RfqStatus parseStatus(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Status is required.");
        }
        try {
            return RfqStatus.valueOf(raw.trim().toUpperCase(Locale.ROOT).replace('-', '_'));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown RFQ status: " + raw);
        }
    }

    static String label(RfqStatus s) {
        return switch (s) {
            case DRAFT -> "Draft";
            case SENT -> "Sent";
            case AWAITING -> "Awaiting Responses";
            case PARTIAL -> "Partially Responded";
            case RECEIVED -> "Responses Received";
            case EVALUATION -> "Under Evaluation";
            case NEGOTIATION -> "Negotiation";
            case PARTIAL_ORDERED -> "Partially Ordered";
            case COMPLETED_LPO -> "Completed w/ LPO";
            case COMPLETED_NO_LPO -> "Completed (No LPO)";
            case CANCELLED -> "Cancelled";
            case REJECTED -> "Rejected";
            case EXPIRED -> "Expired";
        };
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Helpers: mapping responses
    // ═════════════════════════════════════════════════════════════════════════

    private RfqSummary toSummary(Rfq rfq) {
        int responded = (int) rfq.getVendors().stream().filter(v -> v.getResponseStatus().hasResponded()).count();
        BigDecimal best = rfq.getVendors().stream()
                .filter(v -> RESPONDED_WITH_PRICES.contains(v.getResponseStatus()))
                .flatMap(v -> v.getOffers().stream())
                .map(RfqOffer::getUnitPrice)
                .filter(RfqService::positive)
                .min(Comparator.naturalOrder()).orElse(null);
        return new RfqSummary(rfq.getId(), rfq.getRfqNumber(), rfq.getTitle(), rfq.getReference(), rfq.getStatus().name(),
                rfq.getCreatedAt(), rfq.getCreatedBy(), rfq.getDeadline(), rfq.getItems().size(), rfq.getVendors().size(), responded,
                rfq.getVendors().stream().map(v -> new VendorRef(v.getVendorId(), v.getVendorName(), v.getVendorCode())).toList(),
                best, rfq.getLpos().stream().map(RfqLpoRef::getLpoNumber).toList());
    }

    private RfqDetail toDetail(Rfq rfq) {
        List<NegotiationDto> negs = negotiationRepository.findByRfqIdOrderByIdAsc(rfq.getId()).stream()
                .map(n -> new NegotiationDto(n.getId(), n.getRfqItemId(), n.getVendorId(), n.getOfferId(), n.getStatus().name(),
                        n.getTargetPrice(), n.getTargetQty(), n.getMessage(), n.getDeadline(), n.getRequestedAt(), n.getRespondedAt(),
                        n.getResponseMessage(), n.getPreviousPrice(), n.getRevisedPrice(), readJson(n.getHistoryJson(), NEG_EVENTS)))
                .toList();
        List<ActivityDto> activity = rfq.getId() == null ? List.of()
                : activityRepository.findByRfqIdOrderByOccurredAtDescIdDesc(rfq.getId()).stream()
                        .map(a -> new ActivityDto(a.getId(), a.getType(), a.getDescription(), a.getActor(), a.getActorType(),
                                a.getOccurredAt(), a.getRef(), a.getOldValue(), a.getNewValue()))
                        .toList();
        Map<Long, List<PriceHistoryDto>> history = new LinkedHashMap<>();
        for (RfqItem item : rfq.getItems()) {
            history.put(item.getId(), priceHistory(rfq, item));
        }
        return new RfqDetail(rfq.getId(), rfq.getRfqNumber(), rfq.getTitle(), rfq.getReference(), rfq.getStatus().name(),
                rfq.getCreatedAt(), rfq.getCreatedBy(), rfq.getDeadline(), rfq.getExpectedDelivery(), rfq.getDeliveryLocation(),
                rfq.getWarehouseId(), rfq.getWarehouseName(), rfq.getCurrency(), rfq.getTaxPref(), rfq.getPaymentTerms(),
                rfq.getDeliveryTerms(), rfq.getQuotationValidity(), rfq.getShippingReqs(), rfq.getNotes(), rfq.getVendorInstructions(),
                rfq.getBranchName(), rfq.getSentAt(),
                rfq.getItems().stream().map(this::toItemDto).toList(),
                rfq.getVendors().stream().map(this::toVendorDto).toList(),
                negs, activity,
                rfq.getLpos().stream().map(l -> new LpoRefDto(l.getLpoId(), l.getLpoNumber(), l.getVendorId(), l.getVendorName(), l.getCreatedOn())).toList(),
                history);
    }

    private List<PriceHistoryDto> priceHistory(Rfq rfq, RfqItem item) {
        if (item.getProductId() == null) return List.of();
        List<PriceHistoryDto> out = new ArrayList<>();
        for (RfqOffer o : priceHistoryRepository.findPreviousOffers(item.getProductId(), rfq.getId() == null ? -1L : rfq.getId(),
                RESPONDED_WITH_PRICES, PageRequest.of(0, HISTORY_LIMIT))) {
            RfqVendor v = o.getRfqVendor();
            if (!branchAccessService.canAccessTransactionBranch(v.getRfq().getBranchId())) continue;
            LocalDate date = v.getSubmittedAt() != null ? v.getSubmittedAt().toLocalDate() : v.getRfq().getCreatedAt() != null ? v.getRfq().getCreatedAt().toLocalDate() : null;
            String brand = offerLabel(o);
            out.add(new PriceHistoryDto("QUOTE", date, v.getVendorId(), v.getVendorName(), o.getUnitPrice(), o.getQuotedQty(),
                    v.getRfq().getRfqNumber(), brand));
        }
        for (LpoItem li : priceHistoryRepository.findRecentLpoLines(item.getProductId(), PageRequest.of(0, HISTORY_LIMIT))) {
            if (li.getLpo() == null || !branchAccessService.canAccessTransactionBranch(li.getLpo().getBranchId())) continue;
            out.add(new PriceHistoryDto("LPO", li.getLpo().getLpoDate(), li.getLpo().getVendorId(), li.getLpo().getVendorName(),
                    li.getUnitPrice(), li.getQuantity(), li.getLpo().getLpoNumber(), null));
        }
        return out;
    }

    private ItemDto toItemDto(RfqItem i) {
        return new ItemDto(i.getId(), i.getLineNo(), i.getProductId(), i.getItemCode(), i.getItemName(), i.getDescription(),
                i.getCategory(), i.getBrand(), i.getModel(), i.getUnit(), i.getQtyNeeded(), i.getQtyOrdered(), i.getMinSpec(),
                i.isAltBrandAllowed(), i.isPartialAllowed(), i.getExpectedDelivery(), i.getWarrantyRequired(), i.getAwardedOfferId());
    }

    private VendorDto toVendorDto(RfqVendor v) {
        return new VendorDto(v.getId(), v.getVendorId(), v.getVendorName(), v.getVendorCode(), v.getEmail(), v.getPhone(),
                v.getResponseStatus().name(), v.getSubmittedAt(), v.getPaymentTerms(), v.getDeliveryTerms(), v.getValidity(),
                v.getVersion(), v.getOffers().stream().map(this::toOfferDto).toList(),
                v.getPortalToken(), v.getPortalLastAccessAt());
    }

    public OfferDto toOfferDto(RfqOffer o) {
        return new OfferDto(o.getId(), o.getRfqItemId(), o.getBrand(), o.getModel(), o.getSku(), o.getDescription(),
                o.getUnitPrice(), o.getQuotedQty(), o.getAvailableStock(), o.getAvailability(), o.getDispatchDate(),
                o.getDeliveryDate(), o.getWarranty(), o.getCountryOfOrigin(), o.getTaxPercent(), o.getDiscountPercent(),
                o.getShippingCost(), o.getAdditionalCost(), o.getValidUntil(), o.getNotes(), o.isAlternative(),
                o.getAlternativeReason(), readJson(o.getBulkTiersJson(), BULK_TIERS), o.getVersion());
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Small utilities
    // ═════════════════════════════════════════════════════════════════════════

    public List<NegotiationEvent> readNegotiationHistory(String json) {
        return readJson(json, NEG_EVENTS);
    }

    private <T> List<T> readJson(String json, TypeReference<List<T>> type) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return objectMapper.readValue(json, type);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Could not store RFQ data", e);
        }
    }

    private static boolean positive(BigDecimal v) {
        return v != null && v.signum() > 0;
    }

    private static BigDecimal nonNegative(BigDecimal v, String label) {
        if (v == null) return BigDecimal.ZERO;
        if (v.signum() < 0) throw new IllegalArgumentException(label + " cannot be negative.");
        return v;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    /** "Item [code]" as the vendor offered it; older offers fall back to brand + model. */
    private static String offerLabel(RfqOffer o) {
        String name = notBlank(o.getDescription()) ? o.getDescription().trim()
                : (Objects.toString(o.getBrand(), "") + " " + Objects.toString(o.getModel(), "")).trim();
        return notBlank(o.getSku()) ? (name + " [" + o.getSku().trim() + "]").trim() : name;
    }

    private static String trim(String s) {
        return notBlank(s) ? s.trim() : null;
    }

    private static String firstNonBlank(String a, String b) {
        return notBlank(a) ? a.trim() : trim(b);
    }

    private static String money(BigDecimal v) {
        return v == null ? "—" : v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getName() != null ? auth.getName() : "system";
    }
}
