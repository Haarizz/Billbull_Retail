package com.billbull.backend.pos.search;

import com.billbull.backend.inventory.batch.BatchMasterRepository;
import com.billbull.backend.sales.advance.AdvanceApplicationService;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class PosLookupService {

    private final CustomerRepository customerRepository;
    private final SalesInvoiceRepository invoiceRepository;
    private final AdvanceApplicationService advanceApplicationService;
    private final BatchMasterRepository batchMasterRepository;

    public PosLookupService(CustomerRepository customerRepository,
                            SalesInvoiceRepository invoiceRepository,
                            AdvanceApplicationService advanceApplicationService,
                            BatchMasterRepository batchMasterRepository) {
        this.customerRepository = customerRepository;
        this.invoiceRepository = invoiceRepository;
        this.advanceApplicationService = advanceApplicationService;
        this.batchMasterRepository = batchMasterRepository;
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

    @Transactional(readOnly = true)
    public PosBatchCheckResponse batchCheck(String batchNumber, String invoiceNumber,
                                            String itemCode, String customerMobile) {
        List<SalesInvoice> invoices = new ArrayList<>();
        // batchNumber used to pin the display value; pinnedBatchNumber is @Transient so
        // we resolve via batch_master → productCode → invoices containing that item code.
        String resolvedBatchNumber = null;
        String resolvedItemCode = itemCode != null && !itemCode.isBlank() ? itemCode.trim() : null;

        if (batchNumber != null && !batchNumber.isBlank()) {
            String bn = batchNumber.trim();
            resolvedBatchNumber = bn;
            // Resolve batch → product code via batch_master, then find invoices by item code
            java.util.Optional<com.billbull.backend.inventory.batch.BatchMaster> bm =
                    batchMasterRepository.findFirstByBatchNumberIgnoreCase(bn);
            if (bm.isPresent()) {
                String productCode = bm.get().getProductCode();
                invoices = invoiceRepository.findByItemCodeWithItems(productCode);
            }
        } else if (invoiceNumber != null && !invoiceNumber.isBlank()) {
            invoices = invoiceRepository.findByInvoiceNumberPrefixWithItems(invoiceNumber.trim());
        } else if (resolvedItemCode != null) {
            invoices = invoiceRepository.findByItemCodeWithItems(resolvedItemCode);
        }

        List<PosBatchCheckResponse.BatchSoldItem> results = new ArrayList<>();
        final String finalBatchNumber = resolvedBatchNumber;

        for (SalesInvoice inv : invoices) {
            for (SalesInvoiceItem item : inv.getItems()) {
                if (Boolean.TRUE.equals(item.getVoided())) continue;

                // Filter by itemCode if provided
                if (resolvedItemCode != null) {
                    if (item.getItemCode() == null || !item.getItemCode().equalsIgnoreCase(resolvedItemCode)) continue;
                }

                PosBatchCheckResponse.BatchSoldItem sold = new PosBatchCheckResponse.BatchSoldItem();
                sold.setItemCode(item.getItemCode());
                sold.setItemName(item.getItemName());
                sold.setBatchNumber(finalBatchNumber); // the scanned batch number
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

                // Enrich with batch expiry from batch_master
                if (finalBatchNumber != null) {
                    batchMasterRepository.findFirstByBatchNumberIgnoreCase(finalBatchNumber)
                            .ifPresent(bm -> sold.setExpiryDate(bm.getExpiryDate()));
                }

                results.add(sold);
            }
        }

        PosBatchCheckResponse response = new PosBatchCheckResponse();
        response.setResults(results);
        response.setTotal(results.size());
        return response;
    }

    private PosCreditBalanceResponse notFoundCredit() {
        PosCreditBalanceResponse r = new PosCreditBalanceResponse();
        r.setFound(false);
        return r;
    }
}
