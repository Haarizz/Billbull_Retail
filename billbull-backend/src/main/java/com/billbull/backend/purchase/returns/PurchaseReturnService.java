package com.billbull.backend.purchase.returns;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.purchase.grn.GrnEntity;
import com.billbull.backend.purchase.grn.GrnItemEntity;
import com.billbull.backend.purchase.grn.GrnRepository;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Slf4j
public class PurchaseReturnService {

    private final PurchaseReturnRepository purchaseReturnRepository;
    private final PostingEngineService postingEngineService;
    private final BranchRepository branchRepository;
    private final PurchaseInvoiceRepository purchaseInvoiceRepository;
    private final GrnRepository grnRepository;

    public PurchaseReturnService(
            PurchaseReturnRepository purchaseReturnRepository,
            PostingEngineService postingEngineService,
            BranchRepository branchRepository,
            PurchaseInvoiceRepository purchaseInvoiceRepository,
            GrnRepository grnRepository) {
        this.purchaseReturnRepository = purchaseReturnRepository;
        this.postingEngineService = postingEngineService;
        this.branchRepository = branchRepository;
        this.purchaseInvoiceRepository = purchaseInvoiceRepository;
        this.grnRepository = grnRepository;
    }

    @Transactional
    public PurchaseReturn create(PurchaseReturn purchaseReturn) {
        if (purchaseReturn.getDebitNoteNumber() == null || purchaseReturn.getDebitNoteNumber().isBlank()) {
            purchaseReturn.setDebitNoteNumber(generateDebitNoteNumber());
        }
        if (purchaseReturn.getStatus() == null) {
            purchaseReturn.setStatus(PurchaseReturnStatus.DRAFT);
        }
        if (purchaseReturn.getReturnDate() == null) {
            purchaseReturn.setReturnDate(LocalDate.now());
        }
        if (purchaseReturn.getItems() != null) {
            purchaseReturn.getItems().forEach(item -> item.setPurchaseReturn(purchaseReturn));
        }
        return purchaseReturnRepository.save(purchaseReturn);
    }

    @Transactional
    public PurchaseReturn approve(Long id) {
        PurchaseReturn ret = purchaseReturnRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Purchase return not found: " + id));

        if (ret.getStatus() != PurchaseReturnStatus.DRAFT) {
            throw new RuntimeException("Purchase return " + ret.getDebitNoteNumber() + " is already " + ret.getStatus());
        }

        ret.setStatus(PurchaseReturnStatus.APPROVED);
        PurchaseReturn saved = purchaseReturnRepository.save(ret);

        BigDecimal originalGrnCost = resolveOriginalGrnCost(saved);
        postingEngineService.createJournalFromPurchaseReturn(saved, originalGrnCost);
        log.info("[PurchaseReturn] Approved and posted GL journal for debit note {} (originalGrnCost={})",
                saved.getDebitNoteNumber(), originalGrnCost);

        return saved;
    }

    @Transactional
    public PurchaseReturn cancel(Long id) {
        PurchaseReturn ret = purchaseReturnRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Purchase return not found: " + id));

        if (ret.getStatus() == PurchaseReturnStatus.APPROVED) {
            throw new RuntimeException("Cannot cancel an approved purchase return. Raise a new purchase invoice instead.");
        }
        ret.setStatus(PurchaseReturnStatus.CANCELLED);
        return purchaseReturnRepository.save(ret);
    }

    public List<PurchaseReturn> findByBranch(Long branchId) {
        return purchaseReturnRepository.findByBranchIdOrderByReturnDateDesc(branchId);
    }

    public List<PurchaseReturn> findAll() {
        return purchaseReturnRepository.findAll();
    }

    public PurchaseReturn findById(Long id) {
        return purchaseReturnRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Purchase return not found: " + id));
    }

    /**
     * Resolves the total inventory cost at original GRN receipt prices for the returned items.
     * Walk: return.linkedInvoiceNumber → PurchaseInvoice.grnNo → GrnEntity.items → unitCost × returnQty.
     * Falls back to null (caller uses subTotal) when any link is missing.
     */
    private BigDecimal resolveOriginalGrnCost(PurchaseReturn ret) {
        if (ret.getLinkedInvoiceNumber() == null || ret.getLinkedInvoiceNumber().isBlank()) {
            log.warn("[PurchaseReturn] {} — no linkedInvoiceNumber; using subTotal for inventory credit.", ret.getDebitNoteNumber());
            return null;
        }
        Optional<PurchaseInvoice> invoiceOpt = purchaseInvoiceRepository.findByInvoiceNumber(ret.getLinkedInvoiceNumber());
        if (invoiceOpt.isEmpty() || invoiceOpt.get().getGrnNo() == null) {
            log.warn("[PurchaseReturn] {} — invoice '{}' not found or has no grnNo; using subTotal.", ret.getDebitNoteNumber(), ret.getLinkedInvoiceNumber());
            return null;
        }
        Optional<GrnEntity> grnOpt = grnRepository.findByGrnNo(invoiceOpt.get().getGrnNo());
        if (grnOpt.isEmpty() || grnOpt.get().getItems() == null) {
            log.warn("[PurchaseReturn] {} — GRN '{}' not found; using subTotal.", ret.getDebitNoteNumber(), invoiceOpt.get().getGrnNo());
            return null;
        }
        // Build a map of itemCode → unitCost from the GRN
        Map<String, BigDecimal> grnCostByCode = grnOpt.get().getItems().stream()
                .filter(i -> i.getProductCode() != null && i.getUnitCost() != null)
                .collect(Collectors.toMap(
                        GrnItemEntity::getProductCode,
                        GrnItemEntity::getUnitCost,
                        (a, b) -> a)); // keep first if duplicate codes
        BigDecimal total = BigDecimal.ZERO;
        boolean anyResolved = false;
        if (ret.getItems() != null) {
            for (PurchaseReturnItem item : ret.getItems()) {
                BigDecimal grnUnitCost = grnCostByCode.get(item.getItemCode());
                if (grnUnitCost != null && item.getQuantity() != null) {
                    total = total.add(grnUnitCost.multiply(item.getQuantity()));
                    anyResolved = true;
                } else if (item.getUnitCost() != null && item.getQuantity() != null) {
                    // GRN item not found — fall back to the return line's own unit cost
                    total = total.add(item.getUnitCost().multiply(item.getQuantity()));
                    anyResolved = true;
                }
            }
        }
        if (!anyResolved) return null;
        log.info("[PurchaseReturn] {} — resolved original GRN cost = {}", ret.getDebitNoteNumber(), total);
        return total;
    }

    private String generateDebitNoteNumber() {
        String datePart = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        long count = purchaseReturnRepository.count() + 1;
        return String.format("DN-%s-%04d", datePart, count);
    }
}
