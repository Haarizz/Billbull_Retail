package com.billbull.backend.pos.layaway;

import com.billbull.backend.financials.generalledger.JournalEntry;
import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.inventory.batch.BatchSelectionService;
import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.security.RolePermissionService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
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
    private final PosLayawayPaymentRepository paymentRepo;
    private final ProductRepository productRepository;
    private final BatchSelectionService batchSelectionService;
    private final RolePermissionService permissionService;
    private final PostingEngineService postingEngine;
    private final BranchRepository branchRepository;
    private final PosAuditService auditService;

    public PosLayawayService(PosLayawayRepository repo,
                             PosLayawayPaymentRepository paymentRepo,
                             ProductRepository productRepository,
                             BatchSelectionService batchSelectionService,
                             RolePermissionService permissionService,
                             PostingEngineService postingEngine,
                             BranchRepository branchRepository,
                             PosAuditService auditService) {
        this.repo = repo;
        this.paymentRepo = paymentRepo;
        this.productRepository = productRepository;
        this.batchSelectionService = batchSelectionService;
        this.permissionService = permissionService;
        this.postingEngine = postingEngine;
        this.branchRepository = branchRepository;
        this.auditService = auditService;
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

        // Post deposit GL: Dr Cash/Card → Cr Customer Advance (2060)
        if (saved.getDepositAmount() != null && saved.getDepositAmount().signum() > 0) {
            Branch branch = saved.getBranchId() != null
                    ? branchRepository.findById(saved.getBranchId()).orElse(null) : null;
            JournalEntry depositJournal = postingEngine.createJournalFromLayawayDeposit(
                    saved.getId(),
                    saved.getDepositAmount(),
                    saved.getDepositPaymentMode(),
                    java.time.LocalDate.now(),
                    branch);
            if (depositJournal != null) {
                saved.setDepositJournalId(depositJournal.getId());
                saved = repo.save(saved);
            }
        }

        auditService.logLayawayCreated(
                saved.getPosSessionId(), saved.getTerminalId(), saved.getBranchId(),
                saved.getId(), saved.getLayawayNumber());

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
        PageRequest page = PageRequest.of(0, 200);
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

        // Reverse deposit GL if a journal was posted at creation
        if (layaway.getDepositAmount() != null && layaway.getDepositAmount().signum() > 0
                && layaway.getDepositJournalId() != null) {
            Branch branch = layaway.getBranchId() != null
                    ? branchRepository.findById(layaway.getBranchId()).orElse(null) : null;
            postingEngine.reverseLayawayDepositJournal(
                    layaway.getId(),
                    layaway.getDepositAmount(),
                    layaway.getDepositPaymentMode(),
                    java.time.LocalDate.now(),
                    branch);
        }

        layaway.setStatus(PosLayawayStatus.CANCELLED);
        layaway.setCancelledAt(LocalDateTime.now());
        layaway.setCancelledBy(currentUsername());
        PosLayaway cancelled = repo.save(layaway);
        auditService.logLayawayCancelled(
                cancelled.getPosSessionId(), cancelled.getTerminalId(), cancelled.getBranchId(),
                cancelled.getId(), cancelled.getLayawayNumber());
        return cancelled;
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

    /**
     * §3.4 Record a partial instalment against an open layaway.
     * Updates depositAmount + balanceAmount on the parent and derives new status.
     * Posts a deposit GL entry for the new amount.
     */
    public PosLayawayPayment recordPayment(Long layawayId, BigDecimal amount,
                                            String paymentMode, String referenceNumber, String notes) {
        PosLayaway layaway = getById(layawayId);
        if (!layaway.isOpen()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cannot record payment against a " + layaway.getStatus() + " layaway");
        }
        BigDecimal balance = nz(layaway.getBalanceAmount());
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payment amount must be positive");
        }
        BigDecimal applied = amount.min(balance);

        PosLayawayPayment payment = new PosLayawayPayment();
        payment.setLayaway(layaway);
        payment.setPaymentDate(LocalDate.now());
        payment.setPaymentMode(paymentMode);
        payment.setAmount(round2(applied));
        payment.setReferenceNumber(referenceNumber);
        payment.setNotes(notes);
        PosLayawayPayment saved = paymentRepo.save(payment);

        // Update parent totals
        layaway.setDepositAmount(round2(nz(layaway.getDepositAmount()).add(applied)));
        layaway.setBalanceAmount(round2(balance.subtract(applied).max(BigDecimal.ZERO)));
        layaway.setStatus(deriveStatus(nz(layaway.getSaleTotal()), nz(layaway.getDepositAmount())));
        repo.save(layaway);

        // Post GL for the new instalment
        Branch branch = layaway.getBranchId() != null
                ? branchRepository.findById(layaway.getBranchId()).orElse(null) : null;
        try {
            JournalEntry je = postingEngine.createJournalFromLayawayDeposit(
                    layaway.getId(), applied, paymentMode, LocalDate.now(), branch);
            if (je != null) {
                saved.setJournalId(je.getId());
                paymentRepo.save(saved);
            }
        } catch (Exception ignored) {
            // GL failure must not roll back the instalment record.
        }

        return saved;
    }

    @Transactional(readOnly = true)
    public List<PosLayawayPayment> getPayments(Long layawayId) {
        return paymentRepo.findByLayaway_IdOrderByPaymentDateAsc(layawayId);
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
