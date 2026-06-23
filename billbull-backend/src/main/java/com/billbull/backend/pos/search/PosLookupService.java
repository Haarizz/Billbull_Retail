package com.billbull.backend.pos.search;

import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.purchase.stockmovement.StockMovement;
import com.billbull.backend.purchase.stockmovement.StockMovementRepository;
import com.billbull.backend.purchase.stockmovement.StockSourceType;
import com.billbull.backend.sales.advance.AdvanceApplicationService;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class PosLookupService {

    private final CustomerRepository customerRepository;
    private final SalesInvoiceRepository invoiceRepository;
    private final AdvanceApplicationService advanceApplicationService;
    private final BatchMasterRepository batchMasterRepository;
    private final StockMovementRepository stockMovementRepository;

    public PosLookupService(CustomerRepository customerRepository,
                            SalesInvoiceRepository invoiceRepository,
                            AdvanceApplicationService advanceApplicationService,
                            BatchMasterRepository batchMasterRepository,
                            StockMovementRepository stockMovementRepository) {
        this.customerRepository = customerRepository;
        this.invoiceRepository = invoiceRepository;
        this.advanceApplicationService = advanceApplicationService;
        this.batchMasterRepository = batchMasterRepository;
        this.stockMovementRepository = stockMovementRepository;
    }

    @Transactional(readOnly = true)
    public PosCreditBalanceResponse creditBalance(String q) {
        if (q == null || q.isBlank()) {
            return notFoundCredit();
        }
        String query = q.trim();

        // Exact match on code / mobile / phone / email
        Optional<Customer> opt = customerRepository
                .findFirstByCodeIgnoreCaseOrMobileIgnoreCaseOrPhoneIgnoreCaseOrEmailIgnoreCase(
                        query, query, query, query);

        // Fallback: partial name / code search
        if (opt.isEmpty()) {
            List<Customer> byName = customerRepository
                    .findByNameContainingIgnoreCaseOrCodeContainingIgnoreCase(query, query);
            if (!byName.isEmpty()) {
                opt = Optional.of(byName.get(0));
            }
        }

        if (opt.isEmpty()) {
            return notFoundCredit();
        }

        Customer c = opt.get();
        Double outstanding = invoiceRepository.findOutstandingBalanceByCustomerCode(c.getCode());
        BigDecimal advanceBalance = advanceApplicationService.findOpenAdvances(c.getCode())
                .stream()
                .map(AdvanceApplicationService.AdvanceBalance::openBalance)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        PosCreditBalanceResponse.CustomerInfo info = new PosCreditBalanceResponse.CustomerInfo();
        info.setId(c.getId());
        info.setCode(c.getCode());
        info.setName(c.getName());
        info.setMobile(c.getMobile());
        info.setPhone(c.getPhone());
        info.setEmail(c.getEmail());
        info.setStatus(c.getStatus());
        info.setGroupType(c.getGroupType());

        PosCreditBalanceResponse res = new PosCreditBalanceResponse();
        res.setFound(true);
        res.setCustomer(info);
        res.setOutstanding(outstanding != null ? BigDecimal.valueOf(outstanding) : BigDecimal.ZERO);
        res.setCreditLimit(c.getCreditLimitAmount() != null ? c.getCreditLimitAmount() : BigDecimal.ZERO);
        res.setAdvanceBalance(advanceBalance);
        return res;
    }

    private static final List<StockSourceType> SALE_MOVEMENT_TYPES =
            List.of(StockSourceType.SALES_INVOICE, StockSourceType.DELIVERY_NOTE);

    @Transactional(readOnly = true)
    public PosBatchCheckResponse batchCheck(String batchNumber, String invoiceNumber,
                                            String itemCode, String customerMobile) {
        List<SalesInvoice> invoices = new ArrayList<>();
        String resolvedBatchNumber = null;
        String resolvedItemCode = itemCode != null && !itemCode.isBlank() ? itemCode.trim() : null;

        if (batchNumber != null && !batchNumber.isBlank()) {
            String bn = batchNumber.trim();
            resolvedBatchNumber = bn;

            // Use StockMovement as source of truth: only invoices that have an actual outbound
            // deduction for this exact batch are genuine "Sold" records.
            List<StockMovement> saleMovements =
                    stockMovementRepository.findOutboundByBatchNumber(bn, SALE_MOVEMENT_TYPES);

            List<String> invoiceNumbers = saleMovements.stream()
                    .map(StockMovement::getReferenceNo)
                    .filter(ref -> ref != null && !ref.isBlank())
                    .distinct()
                    .collect(Collectors.toList());

            if (!invoiceNumbers.isEmpty()) {
                invoices = invoiceRepository.findByInvoiceNumberIn(invoiceNumbers);
                // Resolve product code for item-level matching within the invoice
                if (resolvedItemCode == null) {
                    resolvedItemCode = batchMasterRepository.findFirstByBatchNumberIgnoreCase(bn)
                            .map(bm -> bm.getProductCode())
                            .orElse(null);
                }
            }
        } else if (invoiceNumber != null && !invoiceNumber.isBlank()) {
            invoices = invoiceRepository.findByInvoiceNumberPrefixWithItems(invoiceNumber.trim());
        } else if (resolvedItemCode != null) {
            invoices = invoiceRepository.findByItemCodeWithItems(resolvedItemCode);
        }

        List<PosBatchCheckResponse.BatchSoldItem> results = new ArrayList<>();
        final String finalBatchNumber = resolvedBatchNumber;
        final String finalItemCode = resolvedItemCode;

        // Resolve expiry once from batch_master
        final java.time.LocalDate batchExpiry = finalBatchNumber != null
                ? batchMasterRepository.findFirstByBatchNumberIgnoreCase(finalBatchNumber)
                        .map(bm -> bm.getExpiryDate())
                        .orElse(null)
                : null;

        for (SalesInvoice inv : invoices) {
            for (SalesInvoiceItem item : inv.getItems()) {
                if (Boolean.TRUE.equals(item.getVoided())) continue;

                // When searching by batch, only include the matching product's line items
                if (finalItemCode != null) {
                    if (item.getItemCode() == null || !item.getItemCode().equalsIgnoreCase(finalItemCode)) continue;
                }

                PosBatchCheckResponse.BatchSoldItem sold = new PosBatchCheckResponse.BatchSoldItem();
                sold.setItemCode(item.getItemCode());
                sold.setItemName(item.getItemName());
                sold.setBatchNumber(finalBatchNumber);
                sold.setSoldQty(item.getQuantity());
                sold.setStatus("Sold");
                sold.setInvoiceNumber(inv.getInvoiceNumber());
                sold.setInvoiceDate(inv.getInvoiceDate());
                sold.setInvoiceCreatedAt(inv.getCreatedAt());
                sold.setCustomerCode(inv.getCustomerCode());
                sold.setCustomerName(inv.getCustomerName());
                sold.setCashierName(inv.getSalesperson());
                sold.setBranchName(inv.getBranchName());
                sold.setPaymentMode(inv.getPaymentMode());
                sold.setInvoiceTotal(inv.getInvoiceTotal() != null ? inv.getInvoiceTotal().doubleValue() : null);
                sold.setItemPrice(item.getPrice() != null ? item.getPrice().doubleValue() : null);
                sold.setItemTaxAmount(item.getTaxAmount() != null ? item.getTaxAmount().doubleValue() : null);
                sold.setItemNetAmount(item.getNetAmount() != null ? item.getNetAmount().doubleValue() : null);
                sold.setExpiryDate(batchExpiry);

                results.add(sold);
            }
        }

        PosBatchCheckResponse response = new PosBatchCheckResponse();
        response.setResults(results);
        response.setTotal(results.size());
        return response;
    }

    /**
     * Returns up to 20 recent invoices for a customer, shaped as lightweight summary maps
     * for the POS History tab.  Only non-draft, non-cancelled invoices are included.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> customerHistory(String customerCode) {
        if (customerCode == null || customerCode.isBlank()) return List.of();
        List<SalesInvoice> invoices = invoiceRepository.findRecentByCustomerCode(
                customerCode.trim(), PageRequest.of(0, 20));
        return invoices.stream().map(inv -> {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("id", inv.getId());
            m.put("invoiceNumber", inv.getInvoiceNumber());
            m.put("invoiceDate", inv.getInvoiceDate() != null ? inv.getInvoiceDate().toString() : null);
            m.put("invoiceTotal", inv.getInvoiceTotal());
            m.put("amountPaid", inv.getAmountPaid());
            m.put("balance", inv.getBalance());
            m.put("paymentMode", inv.getPaymentMode());
            m.put("status", inv.getStatus() != null ? inv.getStatus().name() : null);
            m.put("itemCount", inv.getItems() != null ? inv.getItems().size() : 0);
            return m;
        }).collect(Collectors.toList());
    }

    private PosCreditBalanceResponse notFoundCredit() {
        PosCreditBalanceResponse r = new PosCreditBalanceResponse();
        r.setFound(false);
        return r;
    }
}
