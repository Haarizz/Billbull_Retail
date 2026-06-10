package com.billbull.backend.purchase.reports;

import com.billbull.backend.purchase.grn.GrnEntity;
import com.billbull.backend.purchase.grn.GrnItemEntity;
import com.billbull.backend.purchase.grn.GrnRepository;
import com.billbull.backend.purchase.grn.QcStatus;
import com.billbull.backend.purchase.invoice.InvoiceStatus;
import com.billbull.backend.purchase.invoice.PurchaseInvoice;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceItem;
import com.billbull.backend.purchase.invoice.PurchaseInvoiceRepository;
import com.billbull.backend.purchase.lpo.Lpo;
import com.billbull.backend.purchase.lpo.LpoItem;
import com.billbull.backend.purchase.lpo.LpoRepository;
import com.billbull.backend.purchase.lpo.LpoStatus;
import com.billbull.backend.purchase.payment.PaymentMode;
import com.billbull.backend.purchase.payment.PaymentVoucher;
import com.billbull.backend.purchase.payment.PaymentVoucherRepository;
import com.billbull.backend.purchase.vendor.Vendor;
import com.billbull.backend.purchase.vendor.VendorRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Predicate;
import java.util.stream.Collectors;

@Service
public class PurchaseReportDataService {

    private final VendorRepository vendorRepository;
    private final LpoRepository lpoRepository;
    private final GrnRepository grnRepository;
    private final PurchaseInvoiceRepository invoiceRepository;
    private final PaymentVoucherRepository paymentVoucherRepository;

    public PurchaseReportDataService(
            VendorRepository vendorRepository,
            LpoRepository lpoRepository,
            GrnRepository grnRepository,
            PurchaseInvoiceRepository invoiceRepository,
            PaymentVoucherRepository paymentVoucherRepository) {
        this.vendorRepository = vendorRepository;
        this.lpoRepository = lpoRepository;
        this.grnRepository = grnRepository;
        this.invoiceRepository = invoiceRepository;
        this.paymentVoucherRepository = paymentVoucherRepository;
    }

    @Transactional(readOnly = true)
    public PurchaseReportDataResponse getReport(
            String reportId,
            LocalDate dateFrom,
            LocalDate dateTo,
            String vendor,
            String branch,
            String search) {
        PurchaseDataset data = loadDataset(dateFrom, dateTo, vendor, branch, search);
        String id = safe(reportId).toLowerCase();
        List<Map<String, Object>> rows = switch (id) {
            case "vendor-master" -> vendorMaster(data);
            case "vendor-aging", "payment-aging" -> vendorAging(data);
            case "vendor-performance" -> vendorPerformance(data);
            case "vendor-price-history" -> vendorPriceHistory(data);
            case "vendor-contract-compliance" -> List.of();
            case "lpo-register" -> lpoRegister(data);
            case "lpo-fulfillment" -> lpoFulfillment(data);
            case "lpo-aging" -> lpoAging(data);
            case "lpo-cancelled" -> lpoCancelled(data);
            case "grn-register" -> grnRegister(data);
            case "grn-variance" -> grnVariance(data);
            case "grn-batch-expiry" -> List.of();
            case "grn-qc-rejection" -> qcRejection(data);
            case "invoice-register" -> invoiceRegister(data);
            case "invoice-grn-variance" -> invoiceGrnVariance(data);
            case "invoice-landed-cost" -> invoiceLandedCost(data);
            case "invoice-backdated" -> invoiceBackdated(data);
            case "payment-register" -> paymentRegister(data);
            case "payment-cheque-tracking" -> paymentChequeTracking(data);
            case "payment-advance" -> paymentAdvance(data);
            case "vat-input-register" -> vatInputRegister(data);
            case "period-lock-violations" -> periodLockViolations(data);
            case "missing-documents" -> missingDocuments(data);
            case "audit-trail" -> auditTrail(data);
            case "grv-register", "grv-reason-analysis", "grv-replacement-pending",
                    "grv-debit-note-mapping", "debit-note-register", "claim-settlement",
                    "vendor-claim-history" -> List.of();
            default -> vendorMaster(data);
        };
        PurchaseReportDataResponse response = new PurchaseReportDataResponse();
        response.setReportId(id);
        response.setGeneratedAt(OffsetDateTime.now().toString());
        response.setRows(rows);
        response.setCharts(defaultCharts(id, rows));
        return response;
    }

    private PurchaseDataset loadDataset(
            LocalDate dateFrom,
            LocalDate dateTo,
            String vendor,
            String branch,
            String search) {
        PurchaseDataset data = new PurchaseDataset();
        data.asOf = dateTo != null ? dateTo : LocalDate.now();
        data.vendors = vendorRepository.findAll().stream()
                .filter(v -> matchesVendorName(v.getName(), vendor))
                .filter(v -> matchesBranch(v.getBranch() == null ? null : v.getBranch().getName(),
                        v.getBranch() == null ? null : v.getBranch().getCode(), branch))
                .filter(v -> matchesSearch(search, v.getCode(), v.getName(), v.getCategory(), v.getTaxId()))
                .collect(Collectors.toList());
        data.lpos = lpoRepository.findForReports(dateFrom, dateTo).stream()
                .filter(lpo -> matchesVendorName(lpo.getVendorName(), vendor))
                .filter(lpo -> matchesBranch(lpo.getBranchName(), lpo.getBranchCode(), branch))
                .filter(lpo -> matchesLpoSearch(lpo, search))
                .collect(Collectors.toList());
        data.grns = grnRepository.findForReports(dateFrom, dateTo).stream()
                .filter(grn -> matchesVendorName(grn.getVendorName(), vendor))
                .filter(grn -> matchesBranch(grn.getBranchName(), grn.getBranchCode(), branch))
                .filter(grn -> matchesGrnSearch(grn, search))
                .collect(Collectors.toList());
        data.invoices = invoiceRepository.findForReports(dateFrom, dateTo).stream()
                .filter(invoice -> matchesVendorName(invoice.getVendorName(), vendor))
                .filter(invoice -> matchesBranch(invoice.getBranchName(), invoice.getBranchCode(), branch))
                .filter(invoice -> matchesInvoiceSearch(invoice, search))
                .collect(Collectors.toList());
        data.payments = paymentVoucherRepository.findForReports(dateFrom, dateTo).stream()
                .filter(payment -> matchesVendorName(payment.getVendorName(), vendor))
                .filter(payment -> matchesBranch(
                        payment.getBranch() == null ? null : payment.getBranch().getName(),
                        payment.getBranch() == null ? null : payment.getBranch().getCode(),
                        branch))
                .filter(payment -> matchesSearch(search, payment.getVoucherNumber(), payment.getVendorName(), payment.getReferenceNumber()))
                .collect(Collectors.toList());
        data.invoicePayments = data.payments.stream()
                .filter(this::isPostedPayment)
                .filter(p -> p.getInvoiceId() != null)
                .collect(Collectors.groupingBy(PaymentVoucher::getInvoiceId,
                        LinkedHashMap::new,
                        Collectors.summingDouble(p -> n(p.getAmount()))));
        return data;
    }

    private List<Map<String, Object>> vendorMaster(PurchaseDataset data) {
        return data.vendors.stream()
                .map(vendor -> row(
                        "code", vendor.getCode(),
                        "name", vendor.getName(),
                        "category", fallback(vendor.getCategory(), fallback(vendor.getVendorType(), "General")),
                        "trn", fallback(vendor.getTaxId(), ""),
                        "creditLimit", n(vendor.getCreditLimit()),
                        "outstanding", outstandingForVendor(data, vendor.getName()),
                        "paymentTerms", fallback(vendor.getPayTerms(), vendor.getCreditDays() == null ? "" : "Net " + vendor.getCreditDays()),
                        "status", vendorStatus(vendor),
                        "rating", n(vendor.getRating())))
                .sorted(byDoubleDesc("outstanding"))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> vendorAging(PurchaseDataset data) {
        Map<String, AgingAgg> aging = new LinkedHashMap<>();
        for (PurchaseInvoice invoice : data.invoices) {
            if (!isPayableInvoice(invoice)) continue;
            double outstanding = outstandingInvoice(invoice, data);
            if (outstanding <= 0) continue;
            AgingAgg agg = aging.computeIfAbsent(fallback(invoice.getVendorName(), "Unassigned"), ignored -> new AgingAgg());
            long days = invoice.getDueDate() == null ? 0 : Math.max(0, ChronoUnit.DAYS.between(invoice.getDueDate(), data.asOf));
            if (days <= 30) agg.d30 += outstanding;
            else if (days <= 60) agg.d60 += outstanding;
            else if (days <= 90) agg.d90 += outstanding;
            else agg.d90plus += outstanding;
        }
        return aging.entrySet().stream()
                .map(entry -> {
                    Vendor vendor = findVendor(data, entry.getKey());
                    AgingAgg agg = entry.getValue();
                    double total = agg.total();
                    return row(
                            "vendor", entry.getKey(),
                            "total", total,
                            "d30", agg.d30,
                            "d60", agg.d60,
                            "d90", agg.d90,
                            "d90plus", agg.d90plus,
                            "creditLimit", vendor == null ? 0 : n(vendor.getCreditLimit()),
                            "status", total > 0 && agg.d90plus > 0 ? "Review" : vendor == null ? "Active" : vendorStatus(vendor),
                            "overdue0", agg.d30,
                            "overdue30", agg.d60,
                            "overdue60", agg.d90,
                            "overdue90plus", agg.d90plus,
                            "avgDelay", averageDelayDays(data, entry.getKey()));
                })
                .sorted(byDoubleDesc("total"))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> vendorPerformance(PurchaseDataset data) {
        Map<String, List<Lpo>> byVendor = data.lpos.stream()
                .collect(Collectors.groupingBy(lpo -> fallback(lpo.getVendorName(), "Unassigned"), LinkedHashMap::new, Collectors.toList()));
        return byVendor.entrySet().stream()
                .map(entry -> {
                    String vendor = entry.getKey();
                    List<Lpo> lpos = entry.getValue();
                    long onTime = lpos.stream().filter(lpo -> isDeliveredOnTime(lpo, data)).count();
                    double pct = lpos.isEmpty() ? 0 : onTime * 100.0 / lpos.size();
                    double avgSettleDays = averageDelayDays(data, vendor);
                    return row(
                            "vendor", vendor,
                            "orders", lpos.size(),
                            "onTime", onTime,
                            "onTimePct", round1(pct),
                            "returnRate", 0,
                            "claimRate", 0,
                            "avgSettleDays", round0(avgSettleDays),
                            "score", score(pct, avgSettleDays));
                })
                .sorted(byDoubleDesc("orders"))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> vendorPriceHistory(PurchaseDataset data) {
        Map<String, List<PricePoint>> grouped = new LinkedHashMap<>();
        for (PurchaseInvoice invoice : data.invoices) {
            for (PurchaseInvoiceItem item : items(invoice)) {
                String key = fallback(item.getItemCode(), item.getItemName()) + "::" + fallback(invoice.getVendorName(), "Unassigned");
                grouped.computeIfAbsent(key, ignored -> new ArrayList<>())
                        .add(new PricePoint(invoice.getInvoiceDate(), item.getItemName(), item.getItemCode(), invoice.getVendorName(), n(item.getUnitCost())));
            }
        }
        return grouped.values().stream()
                .map(points -> {
                    points.sort(Comparator.comparing((PricePoint p) -> p.date == null ? LocalDate.MIN : p.date).reversed());
                    PricePoint first = points.get(0);
                    double p1 = priceAt(points, 4);
                    double p2 = priceAt(points, 3);
                    double p3 = priceAt(points, 2);
                    double p4 = priceAt(points, 1);
                    double p5 = priceAt(points, 0);
                    return row(
                            "item", fallback(first.item, "N/A"),
                            "sku", fallback(first.sku, ""),
                            "vendor", fallback(first.vendor, "Unassigned"),
                            "p1", p1,
                            "p2", p2,
                            "p3", p3,
                            "p4", p4,
                            "p5", p5,
                            "change", p1 == 0 ? 0 : round2((p5 - p1) * 100 / p1));
                })
                .sorted(byDoubleDesc("p5"))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> vendorContractCompliance(PurchaseDataset data) {
        return List.of();
    }

    private List<Map<String, Object>> lpoRegister(PurchaseDataset data) {
        return data.lpos.stream()
                .map(lpo -> row(
                        "lpoNo", lpo.getLpoNumber(),
                        "date", lpo.getLpoDate(),
                        "vendor", lpo.getVendorName(),
                        "branch", fallback(lpo.getBranchName(), fallback(lpo.getBranchCode(), "")),
                        "totalItems", lpo.getItems() == null ? 0 : lpo.getItems().size(),
                        "totalValue", n(lpo.getGrandTotal()),
                        "status", lpoStatus(lpo),
                        "approvedBy", fallback(lpo.getApprovedBy(), "-")))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> lpoFulfillment(PurchaseDataset data) {
        return data.lpos.stream()
                .map(lpo -> {
                    double orderedQty = lpoQty(lpo);
                    double orderedValue = n(lpo.getGrandTotal());
                    List<GrnEntity> grns = grnsForLpo(data, lpo);
                    double deliveredQty = grns.stream().flatMap(g -> g.getItems().stream()).mapToDouble(item -> ni(item.getReceivedQty())).sum();
                    double deliveredValue = grns.stream().mapToDouble(grn -> n(grn.getGrandTotal())).sum();
                    double pendingQty = Math.max(0, orderedQty - deliveredQty);
                    return row(
                            "lpoNo", lpo.getLpoNumber(),
                            "vendor", lpo.getVendorName(),
                            "orderedQty", orderedQty,
                            "deliveredQty", deliveredQty,
                            "pendingQty", pendingQty,
                            "orderedValue", orderedValue,
                            "deliveredValue", deliveredValue,
                            "fulfillmentPct", orderedQty == 0 ? 0 : round1(deliveredQty * 100 / orderedQty));
                })
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> lpoAging(PurchaseDataset data) {
        return data.lpos.stream()
                .filter(lpo -> lpo.getStatus() != LpoStatus.COMPLETED && lpo.getStatus() != LpoStatus.CANCELLED)
                .map(lpo -> {
                    LocalDate base = lpo.getExpectedDeliveryDate() != null ? lpo.getExpectedDeliveryDate() : lpo.getLpoDate();
                    long days = base == null ? 0 : Math.max(0, ChronoUnit.DAYS.between(base, data.asOf));
                    return row(
                            "lpoNo", lpo.getLpoNumber(),
                            "vendor", lpo.getVendorName(),
                            "issueDate", lpo.getLpoDate(),
                            "expectedDate", lpo.getExpectedDeliveryDate(),
                            "daysPending", days,
                            "value", n(lpo.getGrandTotal()),
                            "status", days > 0 && lpo.getExpectedDeliveryDate() != null && data.asOf.isAfter(lpo.getExpectedDeliveryDate()) ? "Overdue" : "Pending");
                })
                .sorted(byDoubleDesc("daysPending"))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> lpoCancelled(PurchaseDataset data) {
        return data.lpos.stream()
                .filter(lpo -> lpo.getStatus() == LpoStatus.CANCELLED)
                .map(lpo -> row(
                        "lpoNo", lpo.getLpoNumber(),
                        "vendor", lpo.getVendorName(),
                        "date", lpo.getLpoDate(),
                        "value", n(lpo.getGrandTotal()),
                        "reason", fallback(lpo.getReferenceDocument(), "Cancelled purchase order"),
                        "cancelledBy", fallback(lpo.getUpdatedBy(), "-"),
                        "status", "Cancelled"))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> grnRegister(PurchaseDataset data) {
        return data.grns.stream()
                .map(grn -> row(
                        "grnNo", grn.getGrnNo(),
                        "date", grn.getGrnDate(),
                        "lpoNo", fallback(grn.getLpoNumber(), ""),
                        "vendor", grn.getVendorName(),
                        "warehouse", grn.getWarehouse() == null ? fallback(grn.getBranchName(), "") : grn.getWarehouse().getName(),
                        "items", grn.getItems() == null ? 0 : grn.getItems().size(),
                        "receivedQty", grn.getItems() == null ? 0 : grn.getItems().stream().mapToInt(i -> ni(i.getReceivedQty())).sum(),
                        "value", n(grn.getGrandTotal()),
                        "qcStatus", grnQcStatus(grn),
                        "status", grnStatus(grn)))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> grnVariance(PurchaseDataset data) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (GrnEntity grn : data.grns) {
            for (GrnItemEntity item : grn.getItems()) {
                double lpoQty = ni(item.getLpoQty());
                double grnQty = ni(item.getReceivedQty());
                double rate = n(item.getUnitCost());
                double qtyVar = grnQty - lpoQty;
                double valueVar = qtyVar * rate;
                if (qtyVar == 0 && valueVar == 0) continue;
                rows.add(row(
                        "grnNo", grn.getGrnNo(),
                        "vendor", grn.getVendorName(),
                        "item", fallback(item.getProductName(), item.getProductCode()),
                        "lpoQty", lpoQty,
                        "grnQty", grnQty,
                        "qtyVar", qtyVar,
                        "lpoRate", rate,
                        "grnRate", rate,
                        "valueVar", valueVar,
                        "variancePct", lpoQty == 0 ? 0 : round1(qtyVar * 100 / lpoQty)));
            }
        }
        return rows;
    }

    private List<Map<String, Object>> batchExpiry(PurchaseDataset data) {
        return List.of();
    }

    private List<Map<String, Object>> qcRejection(PurchaseDataset data) {
        return data.grns.stream()
                .flatMap(grn -> grn.getItems().stream()
                        .filter(item -> ni(item.getRejectedQty()) > 0)
                        .map(item -> row(
                                "grnNo", grn.getGrnNo(),
                                "vendor", grn.getVendorName(),
                                "item", fallback(item.getProductName(), item.getProductCode()),
                                "rejectedQty", ni(item.getRejectedQty()),
                                "reason", fallback(item.getRemarks(), "QC rejection"),
                                "warehouse", grn.getWarehouse() == null ? "" : grn.getWarehouse().getName(),
                                "date", grn.getGrnDate(),
                                "value", ni(item.getRejectedQty()) * n(item.getUnitCost()),
                                "action", "Review")))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> invoiceRegister(PurchaseDataset data) {
        return data.invoices.stream()
                .map(invoice -> row(
                        "invNo", invoice.getInvoiceNumber(),
                        "date", invoice.getInvoiceDate(),
                        "vendor", invoice.getVendorName(),
                        "grnRef", fallback(invoice.getGrnNo(), ""),
                        "lpoRef", fallback(invoice.getReferenceNo(), invoice.getLpoId() == null ? "" : String.valueOf(invoice.getLpoId())),
                        "taxableAmt", n(invoice.getSubTotal()),
                        "vat", n(invoice.getTaxTotal()),
                        "totalAmt", n(invoice.getGrandTotal()),
                        "status", invoiceStatus(invoice),
                        "dueDate", invoice.getDueDate()))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> invoiceGrnVariance(PurchaseDataset data) {
        Map<String, GrnItemEntity> grnItems = new LinkedHashMap<>();
        for (GrnEntity grn : data.grns) {
            for (GrnItemEntity item : grn.getItems()) {
                grnItems.put(grn.getGrnNo() + "::" + item.getProductCode(), item);
            }
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (PurchaseInvoice invoice : data.invoices) {
            for (PurchaseInvoiceItem item : items(invoice)) {
                GrnItemEntity grnItem = grnItems.get(fallback(invoice.getGrnNo(), "") + "::" + item.getItemCode());
                double invQty = ni(item.getQty());
                double invRate = n(item.getUnitCost());
                double grnQty = grnItem == null ? 0 : ni(grnItem.getReceivedQty());
                double grnRate = grnItem == null ? 0 : n(grnItem.getUnitCost());
                double qtyVar = invQty - grnQty;
                double rateVar = invRate - grnRate;
                double valueVar = qtyVar * invRate + rateVar * grnQty;
                rows.add(row(
                        "invNo", invoice.getInvoiceNumber(),
                        "vendor", invoice.getVendorName(),
                        "grnNo", fallback(invoice.getGrnNo(), ""),
                        "invQty", invQty,
                        "grnQty", grnQty,
                        "qtyVar", qtyVar,
                        "invRate", invRate,
                        "grnRate", grnRate,
                        "rateVar", rateVar,
                        "valueVar", valueVar,
                        "status", valueVar == 0 && qtyVar == 0 ? "Matched" : "Variance"));
            }
        }
        return rows;
    }

    private List<Map<String, Object>> invoiceLandedCost(PurchaseDataset data) {
        return data.invoices.stream()
                .filter(invoice -> landedCostTotal(invoice) > 0 || n(invoice.getLandedCost()) > 0)
                .map(invoice -> {
                    double freight = n(invoice.getFreight());
                    double customs = n(invoice.getCustomsDuty());
                    double handling = n(invoice.getHandling()) + n(invoice.getClearing()) + n(invoice.getInsurance()) + n(invoice.getOtherCosts());
                    double invoiceValue = n(invoice.getGrandTotal());
                    double total = invoiceValue + freight + customs + handling;
                    int itemCount = items(invoice).size();
                    return row(
                            "invNo", invoice.getInvoiceNumber(),
                            "vendor", invoice.getVendorName(),
                            "invoiceValue", invoiceValue,
                            "freight", freight,
                            "customs", customs,
                            "handling", handling,
                            "total", total,
                            "items", itemCount,
                            "nlcPerItem", itemCount == 0 ? 0 : total / itemCount);
                })
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> invoiceBackdated(PurchaseDataset data) {
        return data.invoices.stream()
                .filter(invoice -> invoice.getCreatedAt() != null && invoice.getInvoiceDate() != null)
                .filter(invoice -> invoice.getCreatedAt().toLocalDate().isAfter(invoice.getInvoiceDate()))
                .map(invoice -> row(
                        "invNo", invoice.getInvoiceNumber(),
                        "invDate", invoice.getInvoiceDate(),
                        "postDate", invoice.getCreatedAt().toLocalDate(),
                        "vendor", invoice.getVendorName(),
                        "value", n(invoice.getGrandTotal()),
                        "postedBy", fallback(invoice.getCreatedBy(), fallback(invoice.getSubmittedBy(), "-")),
                        "period", periodLabel(invoice.getInvoiceDate()),
                        "status", "Backdated"))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> paymentRegister(PurchaseDataset data) {
        return data.payments.stream()
                .map(payment -> row(
                        "pvNo", payment.getVoucherNumber(),
                        "date", payment.getPaymentDate(),
                        "vendor", payment.getVendorName(),
                        "invRef", fallback(payment.getReferenceNumber(), payment.getInvoiceId() == null ? "" : String.valueOf(payment.getInvoiceId())),
                        "mode", paymentMode(payment.getPaymentMode()),
                        "bank", fallback(payment.getBankAccount(), "-"),
                        "amount", n(payment.getAmount()),
                        "status", paymentStatus(payment)))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> paymentChequeTracking(PurchaseDataset data) {
        return data.payments.stream()
                .filter(payment -> payment.getPaymentMode() == PaymentMode.CHEQUE)
                .map(payment -> row(
                        "chequeNo", fallback(payment.getReferenceNumber(), payment.getVoucherNumber()),
                        "vendor", payment.getVendorName(),
                        "bank", fallback(payment.getBankAccount(), ""),
                        "branch", payment.getBranch() == null ? "" : payment.getBranch().getName(),
                        "amount", n(payment.getAmount()),
                        "chequeDate", payment.getChequeDate() != null ? payment.getChequeDate() : payment.getPaymentDate(),
                        "pvNo", payment.getVoucherNumber(),
                        "status", paymentStatus(payment),
                        "clearedDate", isPostedPayment(payment) ? payment.getPaymentDate() : "-"))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> paymentAdvance(PurchaseDataset data) {
        return data.payments.stream()
                .filter(payment -> payment.getInvoiceId() == null)
                .map(payment -> row(
                        "pvNo", payment.getVoucherNumber(),
                        "vendor", payment.getVendorName(),
                        "advDate", payment.getPaymentDate(),
                        "advAmount", n(payment.getAmount()),
                        "adjusted", n(payment.getAllocated()),
                        "balance", n(payment.getUnallocated()),
                        "lastAdj", payment.getPaymentDate(),
                        "status", n(payment.getUnallocated()) > 0 ? "Open" : "Closed"))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> vatInputRegister(PurchaseDataset data) {
        return data.invoices.stream()
                .filter(invoice -> invoice.getStatus() != InvoiceStatus.REVERSED)
                .map(invoice -> {
                    Vendor vendor = findVendor(data, invoice.getVendorName());
                    return row(
                            "invNo", invoice.getInvoiceNumber(),
                            "invDate", invoice.getInvoiceDate(),
                            "vendor", invoice.getVendorName(),
                            "trn", vendor == null ? "" : fallback(vendor.getTaxId(), ""),
                            "taxableAmt", n(invoice.getSubTotal()),
                            "vatAmt", n(invoice.getTaxTotal()),
                            "totalAmt", n(invoice.getGrandTotal()),
                            "vatRate", "5%",
                            "period", periodLabel(invoice.getInvoiceDate()));
                })
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> periodLockViolations(PurchaseDataset data) {
        List<Map<String, Object>> rows = new ArrayList<>();
        data.invoices.stream()
                .filter(i -> i.getCreatedAt() != null && i.getInvoiceDate() != null && i.getCreatedAt().toLocalDate().isAfter(i.getInvoiceDate()))
                .forEach(i -> rows.add(row("refNo", i.getInvoiceNumber(), "type", "Purchase Invoice", "txDate", i.getInvoiceDate(),
                        "postDate", i.getCreatedAt().toLocalDate(), "lockedPeriod", periodLabel(i.getInvoiceDate()),
                        "user", fallback(i.getCreatedBy(), "-"), "reason", "Posted after document date")));
        data.grns.stream()
                .filter(g -> g.getCreatedAt() != null && g.getGrnDate() != null && g.getCreatedAt().toLocalDate().isAfter(g.getGrnDate()))
                .forEach(g -> rows.add(row("refNo", g.getGrnNo(), "type", "GRN", "txDate", g.getGrnDate(),
                        "postDate", g.getCreatedAt().toLocalDate(), "lockedPeriod", periodLabel(g.getGrnDate()),
                        "user", fallback(g.getCreatedBy(), "-"), "reason", "Posted after document date")));
        data.lpos.stream()
                .filter(l -> l.getCreatedAt() != null && l.getLpoDate() != null && l.getCreatedAt().toLocalDate().isAfter(l.getLpoDate()))
                .forEach(l -> rows.add(row("refNo", l.getLpoNumber(), "type", "LPO", "txDate", l.getLpoDate(),
                        "postDate", l.getCreatedAt().toLocalDate(), "lockedPeriod", periodLabel(l.getLpoDate()),
                        "user", fallback(l.getCreatedBy(), "-"), "reason", "Posted after document date")));
        return rows;
    }

    private List<Map<String, Object>> missingDocuments(PurchaseDataset data) {
        List<Map<String, Object>> rows = new ArrayList<>();
        List<String> invoiceGrns = data.invoices.stream().map(PurchaseInvoice::getGrnNo).filter(Objects::nonNull).collect(Collectors.toList());
        for (GrnEntity grn : data.grns) {
            if (!invoiceGrns.contains(grn.getGrnNo())) {
                rows.add(row(
                        "refNo", grn.getGrnNo(),
                        "type", "GRN without Invoice",
                        "vendor", grn.getVendorName(),
                        "date", grn.getGrnDate(),
                        "value", n(grn.getGrandTotal()),
                        "daysOpen", grn.getGrnDate() == null ? 0 : Math.max(0, ChronoUnit.DAYS.between(grn.getGrnDate(), data.asOf)),
                        "status", "Warning"));
            }
        }
        for (PurchaseInvoice invoice : data.invoices) {
            if ((invoice.getGrnNo() == null || invoice.getGrnNo().isBlank()) && "AGAINST_GRN".equalsIgnoreCase(fallback(invoice.getSourceType(), ""))) {
                rows.add(row(
                        "refNo", invoice.getInvoiceNumber(),
                        "type", "Invoice without GRN",
                        "vendor", invoice.getVendorName(),
                        "date", invoice.getInvoiceDate(),
                        "value", n(invoice.getGrandTotal()),
                        "daysOpen", invoice.getInvoiceDate() == null ? 0 : Math.max(0, ChronoUnit.DAYS.between(invoice.getInvoiceDate(), data.asOf)),
                        "status", "Critical"));
            }
        }
        return rows;
    }

    private List<Map<String, Object>> auditTrail(PurchaseDataset data) {
        List<Map<String, Object>> rows = new ArrayList<>();
        data.lpos.stream().filter(l -> l.getCreatedAt() != null).forEach(l -> rows.add(row(
                "timestamp", l.getCreatedAt(),
                "user", fallback(l.getCreatedBy(), "-"),
                "action", "Create",
                "module", "LPO",
                "refNo", l.getLpoNumber(),
                "field", "Status",
                "before", "-",
                "after", lpoStatus(l))));
        data.grns.stream().filter(g -> g.getCreatedAt() != null).forEach(g -> rows.add(row(
                "timestamp", g.getCreatedAt(),
                "user", fallback(g.getCreatedBy(), "-"),
                "action", "Create",
                "module", "GRN",
                "refNo", g.getGrnNo(),
                "field", "Status",
                "before", "-",
                "after", grnStatus(g))));
        data.invoices.stream().filter(i -> i.getCreatedAt() != null).forEach(i -> rows.add(row(
                "timestamp", i.getCreatedAt(),
                "user", fallback(i.getCreatedBy(), fallback(i.getSubmittedBy(), "-")),
                "action", "Create",
                "module", "Purchase Invoice",
                "refNo", i.getInvoiceNumber(),
                "field", "Status",
                "before", "-",
                "after", invoiceStatus(i))));
        rows.sort((a, b) -> String.valueOf(b.get("timestamp")).compareTo(String.valueOf(a.get("timestamp"))));
        return rows;
    }

    private List<Map<String, Object>> defaultCharts(String reportId, List<Map<String, Object>> rows) {
        return switch (reportId) {
            case "vendor-aging", "payment-aging" -> List.of(
                    row("name", "0-30 Days", "value", rows.stream().mapToDouble(r -> n(r.get("d30"))).sum()),
                    row("name", "31-60 Days", "value", rows.stream().mapToDouble(r -> n(r.get("d60"))).sum()),
                    row("name", "61-90 Days", "value", rows.stream().mapToDouble(r -> n(r.get("d90"))).sum()),
                    row("name", "90+ Days", "value", rows.stream().mapToDouble(r -> n(r.get("d90plus"))).sum()));
            case "lpo-aging" -> bucketChart(rows, "daysPending", "value");
            case "grn-variance", "invoice-grn-variance" -> rows.stream()
                    .collect(Collectors.groupingBy(r -> fallback(r.get("vendor"), "Unassigned"), LinkedHashMap::new,
                            Collectors.summingDouble(r -> n(r.get("valueVar")))))
                    .entrySet().stream().map(e -> row("name", e.getKey(), "variance", e.getValue())).collect(Collectors.toList());
            default -> List.of();
        };
    }

    private List<Map<String, Object>> bucketChart(List<Map<String, Object>> rows, String daysKey, String valueKey) {
        List<String> names = List.of("0-7 days", "8-15 days", "16-30 days", "31-60 days", "60+ days");
        List<Map<String, Object>> buckets = new ArrayList<>();
        for (String name : names) {
            buckets.add(row("bucket", name, "count", 0, "value", 0));
        }
        for (Map<String, Object> source : rows) {
            double days = n(source.get(daysKey));
            int index = days <= 7 ? 0 : days <= 15 ? 1 : days <= 30 ? 2 : days <= 60 ? 3 : 4;
            Map<String, Object> bucket = buckets.get(index);
            bucket.put("count", n(bucket.get("count")) + 1);
            bucket.put("value", n(bucket.get("value")) + n(source.get(valueKey)));
        }
        return buckets;
    }

    private List<GrnEntity> grnsForLpo(PurchaseDataset data, Lpo lpo) {
        return data.grns.stream()
                .filter(grn -> Objects.equals(grn.getReferenceId(), lpo.getId())
                        || Objects.equals(fallback(grn.getLpoNumber(), ""), fallback(lpo.getLpoNumber(), "")))
                .collect(Collectors.toList());
    }

    private double outstandingForVendor(PurchaseDataset data, String vendor) {
        double invoiced = data.invoices.stream()
                .filter(this::isPayableInvoice)
                .filter(invoice -> Objects.equals(fallback(invoice.getVendorName(), ""), fallback(vendor, "")))
                .mapToDouble(invoice -> n(invoice.getGrandTotal()))
                .sum();
        double paid = data.payments.stream()
                .filter(this::isPostedPayment)
                .filter(payment -> Objects.equals(fallback(payment.getVendorName(), ""), fallback(vendor, "")))
                .mapToDouble(payment -> n(payment.getAmount()))
                .sum();
        Vendor vendorEntity = findVendor(data, vendor);
        return Math.max(0, (vendorEntity == null ? 0 : n(vendorEntity.getOpeningBalance())) + invoiced - paid);
    }

    private double outstandingInvoice(PurchaseInvoice invoice, PurchaseDataset data) {
        if (invoice.getPaymentStatus() == com.billbull.backend.purchase.invoice.PaymentStatus.PAID) return 0;
        double paid = data.invoicePayments.getOrDefault(invoice.getId(), 0.0);
        return Math.max(0, n(invoice.getGrandTotal()) - paid);
    }

    private double averageDelayDays(PurchaseDataset data, String vendor) {
        List<Double> days = new ArrayList<>();
        for (PurchaseInvoice invoice : data.invoices) {
            if (!Objects.equals(fallback(invoice.getVendorName(), ""), fallback(vendor, ""))) continue;
            for (PaymentVoucher payment : data.payments) {
                if (!isPostedPayment(payment) || !Objects.equals(payment.getInvoiceId(), invoice.getId())) continue;
                if (invoice.getInvoiceDate() != null && payment.getPaymentDate() != null) {
                    days.add((double) Math.max(0, ChronoUnit.DAYS.between(invoice.getInvoiceDate(), payment.getPaymentDate())));
                }
            }
        }
        return days.stream().mapToDouble(Double::doubleValue).average().orElse(0);
    }

    private boolean isDeliveredOnTime(Lpo lpo, PurchaseDataset data) {
        if (lpo.getExpectedDeliveryDate() == null) return false;
        return grnsForLpo(data, lpo).stream()
                .map(GrnEntity::getGrnDate)
                .filter(Objects::nonNull)
                .anyMatch(date -> !date.isAfter(lpo.getExpectedDeliveryDate()));
    }

    private double lpoQty(Lpo lpo) {
        return lpo.getItems() == null ? 0 : lpo.getItems().stream().mapToDouble(item -> ni(item.getQuantity())).sum();
    }

    private List<PurchaseInvoiceItem> items(PurchaseInvoice invoice) {
        return invoice.getItems() == null ? List.of() : invoice.getItems();
    }

    private double landedCostTotal(PurchaseInvoice invoice) {
        return n(invoice.getFreight()) + n(invoice.getCustomsDuty()) + n(invoice.getHandling())
                + n(invoice.getClearing()) + n(invoice.getInsurance()) + n(invoice.getOtherCosts());
    }

    private boolean isPayableInvoice(PurchaseInvoice invoice) {
        return invoice.getStatus() != InvoiceStatus.DRAFT && invoice.getStatus() != InvoiceStatus.REVERSED;
    }

    private boolean isPostedPayment(PaymentVoucher payment) {
        return payment.getStatus() == com.billbull.backend.purchase.payment.PaymentStatus.POSTED
                || payment.getStatus() == com.billbull.backend.purchase.payment.PaymentStatus.CLEARED;
    }

    private Vendor findVendor(PurchaseDataset data, String vendorName) {
        return data.vendors.stream()
                .filter(vendor -> Objects.equals(fallback(vendor.getName(), ""), fallback(vendorName, "")))
                .findFirst()
                .orElse(null);
    }

    private boolean matchesVendorName(String actual, String filter) {
        return isAll(filter) || Objects.equals(normalize(actual), normalize(filter));
    }

    private boolean matchesBranch(String name, String code, String filter) {
        if (isAll(filter)) return true;
        String term = normalize(filter).replace(" branch", "");
        return normalize(name).contains(term) || normalize(code).contains(term);
    }

    private boolean matchesLpoSearch(Lpo lpo, String search) {
        if (matchesSearch(search, lpo.getLpoNumber(), lpo.getVendorName(), lpo.getVendorCode())) return true;
        return lpo.getItems() != null && lpo.getItems().stream()
                .anyMatch(item -> matchesSearch(search, item.getItemCode(), item.getItemName(), item.getBarcode()));
    }

    private boolean matchesGrnSearch(GrnEntity grn, String search) {
        if (matchesSearch(search, grn.getGrnNo(), grn.getVendorName(), grn.getLpoNumber())) return true;
        return grn.getItems() != null && grn.getItems().stream()
                .anyMatch(item -> matchesSearch(search, item.getProductCode(), item.getProductName(), item.getBarcode()));
    }

    private boolean matchesInvoiceSearch(PurchaseInvoice invoice, String search) {
        if (matchesSearch(search, invoice.getInvoiceNumber(), invoice.getVendorName(), invoice.getVendorInvoiceNo(), invoice.getGrnNo(), invoice.getReferenceNo())) return true;
        return invoice.getItems() != null && invoice.getItems().stream()
                .anyMatch(item -> matchesSearch(search, item.getItemCode(), item.getItemName(), item.getBarcode()));
    }

    private boolean matchesSearch(String search, Object... values) {
        if (isAll(search)) return true;
        String term = normalize(search);
        for (Object value : values) {
            if (normalize(value).contains(term)) return true;
        }
        return false;
    }

    private String periodLabel(LocalDate date) {
        if (date == null) return "";
        return date.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH) + "-" + date.getYear();
    }

    private boolean isAll(String value) {
        return value == null || value.isBlank() || "All".equalsIgnoreCase(value);
    }

    private String vendorStatus(Vendor vendor) {
        String status = fallback(vendor.getStatus(), "Active");
        if ("ON_HOLD".equalsIgnoreCase(status) || "On Hold".equalsIgnoreCase(status)) return "Review";
        if ("Blocked".equalsIgnoreCase(status)) return "Blocked";
        if ("Inactive".equalsIgnoreCase(status)) return "Inactive";
        return "Active";
    }

    private String lpoStatus(Lpo lpo) {
        if (lpo.getStatus() == null) return "Pending";
        return switch (lpo.getStatus()) {
            case APPROVED, SENT_TO_VENDOR -> "Approved";
            case PARTIALLY_RECEIVED -> "Partial";
            case COMPLETED -> "Received";
            case CANCELLED -> "Cancelled";
            default -> "Pending";
        };
    }

    private String grnStatus(GrnEntity grn) {
        if (grn.getStatus() == null) return "Pending";
        return switch (grn.getStatus()) {
            case POSTED -> "Posted";
            case QC_COMPLETED -> "Received";
            case QC_PENDING -> "On Hold";
            case REVERSED -> "Cancelled";
            default -> "Pending";
        };
    }

    private String grnQcStatus(GrnEntity grn) {
        if (grn.getQcStatus() == QcStatus.COMPLETED) return "Pass";
        if (grn.getItems() != null && grn.getItems().stream().anyMatch(item -> ni(item.getRejectedQty()) > 0)) return "Fail";
        if (grn.getQcStatus() == QcStatus.IN_PROGRESS) return "Partial";
        return "Pending";
    }

    private String invoiceStatus(PurchaseInvoice invoice) {
        if (invoice.getStatus() == null) return "Draft";
        return switch (invoice.getStatus()) {
            case POSTED -> "Posted";
            case SUBMITTED, PENDING_APPROVAL -> "On Hold";
            case REVERSED -> "Cancelled";
            default -> "Draft";
        };
    }

    private String paymentStatus(PaymentVoucher payment) {
        if (payment.getStatus() == null) return "Pending";
        return switch (payment.getStatus()) {
            case POSTED -> "Paid";
            case CLEARED -> "Cleared";
            case REJECTED -> "Rejected";
            default -> "Pending";
        };
    }

    private String paymentMode(PaymentMode mode) {
        if (mode == null) return "";
        return switch (mode) {
            case BANK_TRANSFER -> "Bank Transfer";
            case CHEQUE -> "Cheque";
            case CASH -> "Cash";
            case CARD -> "Card";
        };
    }

    private String score(double onTimePct, double avgSettleDays) {
        if (onTimePct >= 90 && avgSettleDays <= 45) return "A";
        if (onTimePct >= 75) return "B+";
        if (onTimePct >= 60) return "C";
        return "D";
    }

    private Map<String, Object> row(Object... values) {
        LinkedHashMap<String, Object> row = new LinkedHashMap<>();
        for (int i = 0; i + 1 < values.length; i += 2) {
            row.put(String.valueOf(values[i]), values[i + 1]);
        }
        return row;
    }

    private String fallback(Object value, String fallback) {
        if (value == null || String.valueOf(value).isBlank()) return fallback;
        return String.valueOf(value);
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private String normalize(Object value) {
        return String.valueOf(value == null ? "" : value).trim().toLowerCase();
    }

    private double n(Object value) {
        if (value == null) return 0;
        if (value instanceof BigDecimal decimal) return decimal.doubleValue();
        if (value instanceof Number number) return number.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private int ni(Number value) {
        return value == null ? 0 : value.intValue();
    }

    private double priceAt(List<PricePoint> points, int index) {
        if (points.isEmpty()) return 0;
        int safeIndex = Math.min(index, points.size() - 1);
        return points.get(safeIndex).price;
    }

    private double round0(double value) {
        return Math.round(value);
    }

    private double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private Comparator<Map<String, Object>> byDoubleDesc(String key) {
        return (a, b) -> Double.compare(n(b.get(key)), n(a.get(key)));
    }

    private static class PurchaseDataset {
        private LocalDate asOf;
        private List<Vendor> vendors = List.of();
        private List<Lpo> lpos = List.of();
        private List<GrnEntity> grns = List.of();
        private List<PurchaseInvoice> invoices = List.of();
        private List<PaymentVoucher> payments = List.of();
        private Map<Long, Double> invoicePayments = Map.of();
    }

    private static class AgingAgg {
        private double d30;
        private double d60;
        private double d90;
        private double d90plus;

        private double total() {
            return d30 + d60 + d90 + d90plus;
        }
    }

    private static class PricePoint {
        private final LocalDate date;
        private final String item;
        private final String sku;
        private final String vendor;
        private final double price;

        private PricePoint(LocalDate date, String item, String sku, String vendor, double price) {
            this.date = date;
            this.item = item;
            this.sku = sku;
            this.vendor = vendor;
            this.price = price;
        }
    }
}
