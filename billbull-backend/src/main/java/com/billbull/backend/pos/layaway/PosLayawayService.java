package com.billbull.backend.pos.layaway;

import com.billbull.backend.inventory.batch.BatchSelectionService;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.security.RolePermissionService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
@Transactional
public class PosLayawayService {

    private static final String LAYAWAY_PREFIX = "LAY-";
    private static final int LAYAWAY_PAD = 6;
    /** Permission module whose delete flag gates layaway cancellation (supervisor). */
    private static final String CANCEL_MODULE = "sales";

    private final PosLayawayRepository repo;
    private final ProductRepository productRepository;
    private final BatchSelectionService batchSelectionService;
    private final RolePermissionService permissionService;

    public PosLayawayService(PosLayawayRepository repo,
                             ProductRepository productRepository,
                             BatchSelectionService batchSelectionService,
                             RolePermissionService permissionService) {
        this.repo = repo;
        this.productRepository = productRepository;
        this.batchSelectionService = batchSelectionService;
        this.permissionService = permissionService;
    }

    public PosLayaway create(PosLayawayCreateRequest req) {
        if (req.getItems() == null || req.getItems().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot save a layaway with an empty cart");
        }
        long activeCount = req.getItems().stream()
                .filter(i -> !Boolean.TRUE.equals(i.getVoided())).count();
        if (activeCount == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot save a layaway with no active (non-voided) items");
        }
        boolean hasRealCustomer = req.getCustomerCode() != null
                && !req.getCustomerCode().isBlank()
                && !"WALK-IN".equalsIgnoreCase(req.getCustomerCode().trim());
        if (!hasRealCustomer) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A customer is required to save a layaway");
        }

        PosLayaway layaway = new PosLayaway();
        layaway.setLayawayNumber(nextLayawayNumber());
        layaway.setCustomerCode(req.getCustomerCode().trim());
        layaway.setCustomerName(req.getCustomerName());
        layaway.setCustomerPhone(req.getCustomerPhone());
        layaway.setBranchId(req.getBranchId());
        layaway.setBranchName(req.getBranchName());
        layaway.setBranchCode(req.getBranchCode());
        layaway.setPosSessionId(req.getSessionId());
        layaway.setTerminalId(req.getTerminalId());
        layaway.setCounterName(req.getCounterName());
        layaway.setCashierName(req.getCashierName() != null ? req.getCashierName() : currentUsername());
        layaway.setDueDate(req.getDueDate());
        layaway.setRemarks(req.getRemarks());
        layaway.setReserveStockRequested(req.getReserveStockRequested() == null || req.getReserveStockRequested());
        layaway.setBillDiscountAmount(nz(req.getBillDiscountAmount()));

        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal taxTotal = BigDecimal.ZERO;
        List<PosLayawayItem> items = new ArrayList<>();
        for (PosLayawayCreateRequest.PosLayawayItemRequest ir : req.getItems()) {
            PosLayawayItem item = new PosLayawayItem();
            item.setItemCode(ir.getItemCode());
            item.setItemName(ir.getItemName());
            item.setUnit(ir.getUnit() != null ? ir.getUnit() : "Each");
            int qty = ir.getQuantity() != null ? ir.getQuantity() : 0;
            item.setQuantity(qty);
            BigDecimal price = nz(ir.getPrice());
            item.setPrice(price);
            double discountPct = ir.getDiscount() != null ? ir.getDiscount() : 0.0;
            item.setDiscount(discountPct);
            double taxRate = ir.getTaxRate() != null ? ir.getTaxRate() : 5.0;
            item.setTaxRate(taxRate);

            boolean itemVoided = Boolean.TRUE.equals(ir.getVoided());
            item.setVoided(itemVoided);

            boolean batchControlled = !itemVoided && isBatchControlled(ir.getItemCode());
            item.setBatchControlled(batchControlled);
            if (batchControlled) {
                if (ir.getBatchNumber() == null || ir.getBatchNumber().isBlank()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Batch-controlled item " + ir.getItemCode()
                                    + " needs a scanned batch to reserve for a layaway");
                }
                item.setPinnedBatchNumber(ir.getBatchNumber().trim());
            }

            // Voided lines are stored for display but excluded from totals/reservations.
            if (!itemVoided) {
                // net = price * qty * (1 - discountPct/100); tax = net * (taxRate/100).
                // discountPct/taxRate are percentages (not money) so stay double-derived.
                BigDecimal discountFactor = BigDecimal.valueOf(1 - discountPct / 100.0);
                BigDecimal net = price.multiply(BigDecimal.valueOf(qty)).multiply(discountFactor);
                subtotal = subtotal.add(net);
                taxTotal = taxTotal.add(net.multiply(BigDecimal.valueOf(taxRate / 100.0)));
            }

            item.setPosLayaway(layaway);
            items.add(item);
        }
        layaway.setItems(items);

        BigDecimal billDiscount = nz(layaway.getBillDiscountAmount());
        BigDecimal saleTotal = subtotal.subtract(billDiscount).max(BigDecimal.ZERO).add(taxTotal);
        layaway.setTaxTotal(round2(taxTotal));
        layaway.setSaleTotal(round2(saleTotal));

        BigDecimal deposit = nz(req.getDepositAmount()).min(layaway.getSaleTotal());
        layaway.setDepositAmount(round2(deposit));
        layaway.setDepositPaymentMode(req.getDepositPaymentMode());
        layaway.setDepositRequired(req.getDepositRequired() != null && req.getDepositRequired());
        layaway.setBalanceAmount(round2(layaway.getSaleTotal().subtract(deposit).max(BigDecimal.ZERO)));
        layaway.setStatus(deriveStatus(layaway.getSaleTotal(), deposit));

        // Persist first so the layaway + items have ids to anchor batch reservations.
        PosLayaway saved = repo.save(layaway);

        for (PosLayawayItem item : saved.getItems()) {
            if (!item.isVoided() && item.isBatchControlled() && item.getPinnedBatchNumber() != null) {
                batchSelectionService.reserveBatchForLayawayLine(
                        saved.getId(), item.getId(), item.getItemCode(), item.getPinnedBatchNumber());
            }
        }

        return saved;
    }

    @Transactional(readOnly = true)
    public List<PosLayaway> search(Long branchId, PosLayawayStatus status, String customer, String number) {
        // Lowercased here so the JPQL only needs LOWER() on the column side; this
        // also keeps the bound param a typed (non-null-typed) string.
        String cust = customer != null && !customer.isBlank() ? customer.trim().toLowerCase() : null;
        String num = number != null && !number.isBlank() ? number.trim().toLowerCase() : null;
        // Cap at 200 most-recent — the query is already branch-scoped and filtered;
        // a hard limit prevents memory spikes on stores with many historical layaways.
        PageRequest page = PageRequest.of(0, 200, Sort.by(Sort.Direction.DESC, "createdAt"));
        List<PosLayaway> results = repo.search(branchId, status != null ? status.name() : null, cust, num, page);
        // ARCHFIX §1.6: items is LAZY — init (batched) in-session so the response serializes.
        results.forEach(l -> org.hibernate.Hibernate.initialize(l.getItems()));
        return results;
    }

    @Transactional(readOnly = true)
    public PosLayaway getById(Long id) {
        PosLayaway layaway = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Layaway not found: " + id));
        org.hibernate.Hibernate.initialize(layaway.getItems()); // ARCHFIX §1.6
        return layaway;
    }

    public PosLayaway cancel(Long id) {
        if (!permissionService.currentUserCanDelete(CANCEL_MODULE)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Supervisor permission is required to cancel a layaway");
        }
        PosLayaway layaway = getById(id);
        if (!layaway.isOpen()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only an open layaway can be cancelled (current status: " + layaway.getStatus() + ")");
        }
        batchSelectionService.releaseLayaway(layaway.getId());
        layaway.setStatus(PosLayawayStatus.CANCELLED);
        layaway.setCancelledAt(LocalDateTime.now());
        layaway.setCancelledBy(currentUsername());
        return repo.save(layaway);
    }

    /**
     * Stamp a layaway as converted once its conversion POS sale has posted. The new
     * sale re-reserves its own batches through the normal checkout path, so the
     * layaway's reservations are released here.
     */
    public PosLayaway markConverted(Long id, Long invoiceId, String invoiceNumber) {
        PosLayaway layaway = getById(id);
        if (!layaway.isOpen()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only an open layaway can be converted (current status: " + layaway.getStatus() + ")");
        }
        batchSelectionService.releaseLayaway(layaway.getId());
        layaway.setStatus(PosLayawayStatus.CONVERTED);
        layaway.setConvertedInvoiceId(invoiceId);
        layaway.setConvertedInvoiceNumber(invoiceNumber);
        layaway.setConvertedAt(LocalDateTime.now());
        return repo.save(layaway);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private PosLayawayStatus deriveStatus(BigDecimal saleTotal, BigDecimal deposit) {
        if (deposit.compareTo(saleTotal) >= 0 && saleTotal.signum() > 0) {
            return PosLayawayStatus.READY_TO_CONVERT;
        }
        if (deposit.signum() > 0) {
            return PosLayawayStatus.PARTIALLY_PAID;
        }
        return PosLayawayStatus.ACTIVE;
    }

    private boolean isBatchControlled(String itemCode) {
        if (itemCode == null || itemCode.isBlank()) {
            return false;
        }
        return productRepository.findByCode(itemCode.trim())
                .map(Product::isBatch)
                .orElse(false);
    }

    private String nextLayawayNumber() {
        String max = repo.findMaxLayawayNumber();
        long next = 1;
        if (max != null && max.startsWith(LAYAWAY_PREFIX)) {
            try {
                next = Long.parseLong(max.substring(LAYAWAY_PREFIX.length())) + 1;
            } catch (NumberFormatException ignored) {
                // Fall back to 1 if an unexpected format slipped in.
            }
        }
        return LAYAWAY_PREFIX + String.format("%0" + LAYAWAY_PAD + "d", next);
    }

    /** Round a monetary amount to 2 dp, HALF_UP — matches the legacy
     *  {@code Math.round(v*100)/100} for the non-negative amounts handled here. */
    private static BigDecimal round2(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    /** Null-safe Double -> BigDecimal at the request boundary (treats null as zero). */
    private static BigDecimal nz(Double v) {
        return v != null ? BigDecimal.valueOf(v) : BigDecimal.ZERO;
    }

    /** Null-safe view of a persisted BigDecimal money field (treats null as zero). */
    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    private String currentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null ? authentication.getName() : "system";
    }
}
