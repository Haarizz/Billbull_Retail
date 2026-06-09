package com.billbull.backend.sales.reports;

import com.billbull.backend.inventory.product.Product;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.sales.customerledger.Customer;
import com.billbull.backend.sales.customerledger.CustomerRepository;
import com.billbull.backend.sales.delivery.DeliveryNote;
import com.billbull.backend.sales.delivery.DeliveryNoteRepository;
import com.billbull.backend.sales.delivery.DeliveryNoteStatus;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceItem;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceStatus;
import com.billbull.backend.sales.invoice.SalesType;
import com.billbull.backend.sales.returns.SalesReturn;
import com.billbull.backend.sales.returns.SalesReturnItem;
import com.billbull.backend.sales.returns.SalesReturnRepository;
import com.billbull.backend.sales.returns.SalesReturnStatus;
import com.billbull.backend.sales.salesorder.SalesOrder;
import com.billbull.backend.sales.salesorder.SalesOrderItem;
import com.billbull.backend.sales.salesorder.SalesOrderRepository;
import com.billbull.backend.sales.salesorder.SalesOrderStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Predicate;
import java.util.stream.Collectors;

@Service
public class SalesReportDataService {

    private final SalesInvoiceRepository invoiceRepository;
    private final SalesReturnRepository returnRepository;
    private final SalesOrderRepository orderRepository;
    private final DeliveryNoteRepository deliveryNoteRepository;
    private final CustomerRepository customerRepository;
    private final ProductRepository productRepository;

    public SalesReportDataService(
            SalesInvoiceRepository invoiceRepository,
            SalesReturnRepository returnRepository,
            SalesOrderRepository orderRepository,
            DeliveryNoteRepository deliveryNoteRepository,
            CustomerRepository customerRepository,
            ProductRepository productRepository) {
        this.invoiceRepository = invoiceRepository;
        this.returnRepository = returnRepository;
        this.orderRepository = orderRepository;
        this.deliveryNoteRepository = deliveryNoteRepository;
        this.customerRepository = customerRepository;
        this.productRepository = productRepository;
    }

    @Transactional(readOnly = true)
    public List<String> getDistinctSalespersons() {
        return invoiceRepository.findAll().stream()
                .map(SalesInvoice::getSalesperson)
                .filter(s -> s != null && !s.isBlank())
                .distinct()
                .sorted()
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public SalesReportDataResponse getReport(
            String reportId,
            LocalDate dateFrom,
            LocalDate dateTo,
            Long branchId,
            String salesChannel,
            String salesperson,
            String valuationMethod,
            String search) {
        SalesDataset data = loadDataset(dateFrom, dateTo, branchId, salesChannel, salesperson, valuationMethod, search);
        String id = safe(reportId).toLowerCase();

        return switch (id) {
            case "sales-summary", "sales_summary" -> salesSummary(data);
            case "daily-sales", "daily_sales" -> dailySales(data);
            case "channel-wise-sales", "channel_wise" -> channelWiseSales(data);
            case "pos-transaction", "pos_transaction" -> posTransaction(data);
            case "pos-item-sales", "pos_item_sales" -> posItemSales(data);
            case "pos-payment-mode", "pos_payment_mode" -> posPaymentMode(data);
            case "pos-cashier-performance", "pos_cashier_performance" -> posCashierPerformance(data);
            case "pos-void-cancellation", "pos_void_cancellation" -> posVoidCancellation(data);
            case "van-sales-summary", "van_sales_summary" -> routeSalesSummary(data);
            case "van-item-sales", "van_item_sales" -> routeItemSales(data);
            case "van-route-performance", "van_route_performance" -> routePerformance(data);
            case "van-collection", "van_collection" -> routeCollection(data);
            case "van-stock-variance", "van_stock_variance" -> routeStockVariance(data);
            case "sales-invoice-register", "sales_invoice_register" -> salesInvoiceRegister(data);
            case "sales-order-status", "sales_order_status" -> salesOrderStatus(data);
            case "delivery-dispatch", "delivery_dispatch" -> deliveryDispatch(data);
            case "credit-note-returns", "credit_note_returns" -> creditNoteReturns(data);
            case "customer-sales-summary", "customer_sales_summary" -> customerSalesSummary(data);
            case "customer-aging", "customer_aging" -> customerAging(data);
            case "top-dormant-customers", "top_dormant_customers" -> topDormantCustomers(data);
            case "customer-price-level", "customer_price_level" -> customerPriceLevel(data);
            case "customer-bill-item-profit", "customer-profit-drilldown", "customer_profit_drilldown" -> customerBillItemProfit(data);
            case "item-wise-sales", "item_wise_sales" -> itemWiseSales(data);
            case "category-brand-sales", "category_brand_sales" -> categoryBrandSales(data);
            case "fast-slow-moving", "fast_slow_moving" -> fastSlowMoving(data);
            case "discount-summary", "discount-analysis", "discount_analysis" -> discountSummary(data);
            case "promotion-effectiveness", "promotion-impact", "promotion_impact" -> promotionEffectiveness(data);
            case "free-issue-scheme", "free_issue_scheme" -> freeIssueScheme(data);
            case "discount-approval" -> discountApproval(data);
            case "tax-summary", "tax_summary" -> taxSummary(data);
            case "vat-output-register", "vat_output_register" -> vatOutputRegister(data);
            case "price-override", "price_override" -> priceOverride(data);
            case "manual-backdated-entry", "manual-entry", "manual_entry" -> manualBackdatedEntry(data);
            case "sales-edit-log", "sales_edit_log" -> salesEditLog(data);
            default -> salesSummary(data);
        };
    }

    private SalesDataset loadDataset(
            LocalDate dateFrom,
            LocalDate dateTo,
            Long branchId,
            String salesChannel,
            String salesperson,
            String valuationMethod,
            String search) {
        SalesDataset data = new SalesDataset();
        data.dateFrom = dateFrom;
        data.dateTo = dateTo;
        data.valuationMethod = valuationMethod;
        // Product lookup via a lightweight projection (code, name, category, dept,
        // brand) — avoids hydrating 12k Product entities + their eager dept/brand
        // associations on every report.
        data.products = new LinkedHashMap<>();
        for (Object[] row : productRepository.findActiveProductReportBasics()) {
            String code = (String) row[2];
            if (code == null || data.products.containsKey(code)) continue;
            String name = (String) row[3];
            String category = (String) row[4];
            String deptName = (String) row[5];
            String brandName = (String) row[6];
            data.products.put(code, new ProductInfo(name, deptName, category, brandName));
        }
        data.customers = customerRepository.findAll().stream()
                .filter(customer -> matchesSearch(search,
                        customer.getCode(),
                        customer.getName(),
                        customer.getSalesman(),
                        customer.getPriceList(),
                        customer.getTrn()))
                .collect(Collectors.toList());

        // Date range is pushed into SQL and line items are fetch-joined, so only
        // the relevant documents are loaded (no full-table scan, no per-row N+1).
        // The remaining branch/channel/salesperson/search filters run in Java over
        // the now-small, date-bounded result set — preserving prior behavior.
        data.invoices = invoiceRepository.findForReports(dateFrom, dateTo).stream()
                .filter(invoice -> matchesBranch(invoice, branchId))
                .filter(invoice -> matchesChannel(invoice, salesChannel))
                .filter(invoice -> matchesSalesperson(effectiveSalesperson(invoice), salesperson))
                .filter(invoice -> matchesInvoiceSearch(invoice, search))
                .collect(Collectors.toList());

        data.returns = returnRepository.findForReports(dateFrom, dateTo).stream()
                .filter(salesReturn -> matchesReturnSearch(salesReturn, search))
                .collect(Collectors.toList());

        data.orders = orderRepository.findForReports(dateFrom, dateTo).stream()
                .filter(order -> matchesSearch(search, order.getSoNumber(), order.getCustomerName(), order.getCustomerCode()))
                .collect(Collectors.toList());

        data.deliveries = deliveryNoteRepository.findForReports(dateFrom, dateTo).stream()
                .filter(note -> branchId == null || Objects.equals(note.getBranchId(), branchId))
                .filter(note -> matchesSearch(search, note.getDnNumber(), note.getCustomerName(), note.getCustomerCode(), note.getDriverName(), note.getVehicleNo()))
                .collect(Collectors.toList());

        return data;
    }

    private SalesReportDataResponse salesSummary(SalesDataset data) {
        SalesReportDataResponse report = base("sales-summary", "Sales Summary Report",
                "Total sales, net sales, VAT, COGS, gross profit and customer contribution.");
        double grossSales = sumInvoices(data.invoices, true, true);
        double returns = sumReturns(data.returns);
        double tax = data.invoices.stream().filter(this::isRecognizedInvoice).mapToDouble(i -> n(i.getTaxTotal())).sum();
        double discount = totalDiscount(data.invoices);
        double cost = totalCost(data);
        double netSales = grossSales - returns;

        report.setCards(List.of(
                card("Gross Sales", grossSales, "currency", data.invoices.size() + " invoices"),
                card("Net Sales", netSales, "currency", "after returns"),
                card("Gross Profit", netSales - cost, "currency", percentText(rate(netSales - cost, netSales))),
                card("VAT Collected", tax, "currency", "invoice tax")
        ));
        report.setCharts(List.of(
                chart("bar", "Daily Sales Trend", dailySalesRows(data), "grossSales", "netSales"),
                chart("bar", "Top Customers", topCustomerChart(data), "netSales")
        ));
        report.setColumns(List.of(
                col("customer", "Customer", "text", 26),
                col("invoices", "Invoices", "number", 12),
                col("grossSales", "Gross Sales", "currency", 16),
                col("returns", "Returns", "currency", 14),
                col("discount", "Discount", "currency", 14),
                col("netSales", "Net Sales", "currency", 16),
                col("outstanding", "Outstanding", "currency", 16),
                col("gpPercent", "GP %", "percent", 10)
        ));
        report.setRows(customerSummaryRows(data, discount));
        return report;
    }

    private SalesReportDataResponse dailySales(SalesDataset data) {
        SalesReportDataResponse report = base("daily-sales", "Daily Sales Report",
                "Day-wise sales, returns, collections, tax and outstanding balances.");
        List<Map<String, Object>> rows = dailySalesRows(data);
        double netSales = rows.stream().mapToDouble(row -> n(row.get("netSales"))).sum();
        double returns = rows.stream().mapToDouble(row -> n(row.get("returns"))).sum();
        double collected = rows.stream().mapToDouble(row -> n(row.get("collected"))).sum();
        double outstanding = rows.stream().mapToDouble(row -> n(row.get("outstanding"))).sum();

        report.setCards(List.of(
                card("Net Sales", netSales, "currency", rows.size() + " day(s)"),
                card("Collections", collected, "currency", "amount paid"),
                card("Sales Returns", returns, "currency", "approved returns"),
                card("Outstanding", outstanding, "currency", "pending collection")
        ));
        report.setCharts(List.of(
                chart("bar", "Daily Sales vs Collections", rows, "netSales", "collected"),
                chart("pie", "Payment Mode Breakdown", paymentModeRows(data), "value")
        ));
        report.setColumns(List.of(
                col("date", "Date", "date", 14),
                col("invoices", "Invoices", "number", 10),
                col("grossSales", "Gross Sales", "currency", 15),
                col("returns", "Returns", "currency", 13),
                col("discount", "Discount", "currency", 13),
                col("vat", "VAT", "currency", 12),
                col("netSales", "Net Sales", "currency", 15),
                col("collected", "Collected", "currency", 15),
                col("outstanding", "Outstanding", "currency", 15)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse channelWiseSales(SalesDataset data) {
        SalesReportDataResponse report = base("channel-wise-sales", "Channel-wise Sales Report",
                "Sales split by POS, back-office, direct sale and prepaid channels.");
        Map<String, List<SalesInvoice>> byChannel = data.invoices.stream()
                .filter(this::isRecognizedInvoice)
                .collect(Collectors.groupingBy(this::channelName, LinkedHashMap::new, Collectors.toList()));
        List<Map<String, Object>> rows = byChannel.entrySet().stream()
                .map(entry -> {
                    double sales = sumInvoices(entry.getValue(), true, true);
                    double discount = totalDiscount(entry.getValue());
                    double paid = entry.getValue().stream().mapToDouble(this::paidAmount).sum();
                    return row(
                            "channel", entry.getKey(),
                            "transactions", entry.getValue().size(),
                            "salesValue", sales,
                            "avgBill", entry.getValue().isEmpty() ? 0 : sales / entry.getValue().size(),
                            "discount", discount,
                            "collected", paid,
                            "outstanding", entry.getValue().stream().mapToDouble(this::outstandingAmount).sum());
                })
                .sorted(byDoubleDesc("salesValue"))
                .collect(Collectors.toList());
        double totalSales = rows.stream().mapToDouble(row -> n(row.get("salesValue"))).sum();

        report.setCards(List.of(
                card("Channels", rows.size(), "number", "active"),
                card("Total Sales", totalSales, "currency", "POS excluded"),
                card("Avg Bill", rows.isEmpty() ? 0 : totalSales / rows.stream().mapToDouble(r -> n(r.get("transactions"))).sum(), "currency", "per invoice"),
                card("Outstanding", rows.stream().mapToDouble(row -> n(row.get("outstanding"))).sum(), "currency", "pending")
        ));
        report.setCharts(List.of(
                chart("bar", "Sales Value by Channel", rows, "salesValue"),
                chart("pie", "Transaction Count by Channel", rows.stream()
                        .map(row -> row("name", row.get("channel"), "value", row.get("transactions")))
                        .collect(Collectors.toList()), "value")
        ));
        report.setColumns(List.of(
                col("channel", "Channel", "text", 20),
                col("transactions", "Transactions", "number", 12),
                col("salesValue", "Sales Value", "currency", 15),
                col("avgBill", "Avg Bill", "currency", 14),
                col("discount", "Discount", "currency", 13),
                col("collected", "Collected", "currency", 15),
                col("outstanding", "Outstanding", "currency", 15)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse posTransaction(SalesDataset data) {
        SalesReportDataResponse report = base("pos-transaction", "POS Transaction Report",
                "Bill-wise POS details by cashier, payment mode, status and value.");
        List<SalesInvoice> invoices = posInvoices(data);
        List<Map<String, Object>> rows = invoices.stream()
                .map(invoice -> row(
                        "billNo", invoice.getInvoiceNumber(),
                        "date", invoice.getInvoiceDate(),
                        "cashier", fallback(effectiveSalesperson(invoice), "Unassigned"),
                        "customer", fallback(invoice.getCustomerName(), "Walk-in"),
                        "paymentMode", fallback(invoice.getPaymentMode(), "Unspecified"),
                        "items", items(invoice).size(),
                        "discount", invoiceDiscount(invoice),
                        "tax", invoice.getTaxTotal(),
                        "amount", invoiceTotal(invoice),
                        "status", status(invoice.getStatus())))
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Total Bills", rows.size(), "number", "POS transactions"),
                card("Completed", invoices.stream().filter(this::isRecognizedInvoice).count(), "number", "recognized"),
                card("Voided", invoices.stream().filter(invoice -> invoice.getStatus() == SalesInvoiceStatus.CANCELLED).count(), "number", "cancelled"),
                card("POS Sales", rows.stream().filter(row -> !"CANCELLED".equals(row.get("status"))).mapToDouble(row -> n(row.get("amount"))).sum(), "currency", "gross")
        ));
        report.setCharts(List.of(
                chart("pie", "Payment Mode Breakdown", paymentModeRows(data, this::isPosInvoice), "value")
        ));
        report.setColumns(List.of(
                col("billNo", "Bill No", "text", 16),
                col("date", "Date", "date", 13),
                col("cashier", "Cashier", "text", 18),
                col("customer", "Customer", "text", 22),
                col("paymentMode", "Payment Mode", "badge", 16),
                col("items", "Items", "number", 10),
                col("discount", "Discount", "currency", 13),
                col("tax", "Tax", "currency", 12),
                col("amount", "Amount", "currency", 14),
                col("status", "Status", "badge", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse posItemSales(SalesDataset data) {
        SalesReportDataResponse report = base("pos-item-sales", "POS Item Sales Report",
                "Item-wise POS quantity, returns, free issue, discount and contribution.");
        List<Map<String, Object>> rows = itemRows(data, false, this::isPosInvoice, ret -> false);
        double revenue = rows.stream().mapToDouble(row -> n(row.get("netRevenue"))).sum();
        double cost = rows.stream().mapToDouble(row -> n(row.get("cost"))).sum();
        report.setCards(List.of(
                card("Items Sold", rows.size(), "number", "POS items"),
                card("Qty Sold", rows.stream().mapToDouble(row -> n(row.get("qtySold"))).sum(), "number", "units"),
                card("Net Revenue", revenue, "currency", "POS"),
                card("Gross Profit", revenue - cost, "currency", percentText(rate(revenue - cost, revenue)))
        ));
        report.setCharts(List.of(
                chart("bar", "POS Revenue by Item", rows.stream().limit(10).collect(Collectors.toList()), "netRevenue", "grossProfit")
        ));
        report.setColumns(List.of(
                col("item", "Item", "text", 26),
                col("category", "Category", "text", 16),
                col("qtySold", "Qty Sold", "number", 12),
                col("freeIssue", "Free Issue", "number", 12),
                col("netRevenue", "Net Revenue", "currency", 15),
                col("cost", "COGS", "currency", 14),
                col("grossProfit", "Gross Profit", "currency", 15),
                col("gpPercent", "GP %", "percent", 10)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse posPaymentMode(SalesDataset data) {
        SalesReportDataResponse report = base("pos-payment-mode", "POS Payment Mode Report",
                "POS collections split by cash, card, wallet, credit and split payment modes.");
        Map<String, List<SalesInvoice>> byMode = data.invoices.stream()
                .filter(this::isPosInvoice)
                .filter(this::isRecognizedInvoice)
                .collect(Collectors.groupingBy(invoice -> fallback(invoice.getPaymentMode(), "Unspecified"), LinkedHashMap::new, Collectors.toList()));
        List<Map<String, Object>> rows = byMode.entrySet().stream()
                .map(entry -> {
                    List<SalesInvoice> invoices = entry.getValue();
                    double gross = sumInvoices(invoices, true, true);
                    double collected = paidAmount(invoices);
                    return row(
                            "paymentMode", entry.getKey(),
                            "bills", invoices.size(),
                            "grossSales", gross,
                            "refunds", 0,
                            "collected", collected,
                            "outstanding", outstandingAmount(invoices),
                            "netAmount", gross);
                })
                .sorted(byDoubleDesc("netAmount"))
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Payment Modes", rows.size(), "number", "active"),
                card("Collected", rows.stream().mapToDouble(row -> n(row.get("collected"))).sum(), "currency", "POS"),
                card("Bills", rows.stream().mapToDouble(row -> n(row.get("bills"))).sum(), "number", "transactions"),
                card("Outstanding", rows.stream().mapToDouble(row -> n(row.get("outstanding"))).sum(), "currency", "pending")
        ));
        report.setCharts(List.of(
                chart("pie", "POS Tender Mix", rows.stream().map(row -> row("name", row.get("paymentMode"), "value", row.get("netAmount"))).collect(Collectors.toList()), "value"),
                chart("bar", "Collections by Payment Mode", rows, "collected", "outstanding")
        ));
        report.setColumns(List.of(
                col("paymentMode", "Payment Mode", "badge", 18),
                col("bills", "Bills", "number", 10),
                col("grossSales", "Gross Sales", "currency", 15),
                col("refunds", "Refunds", "currency", 13),
                col("collected", "Collected", "currency", 15),
                col("outstanding", "Outstanding", "currency", 15),
                col("netAmount", "Net Amount", "currency", 15)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse posCashierPerformance(SalesDataset data) {
        SalesReportDataResponse report = base("pos-cashier-performance", "POS Cashier Performance",
                "Cashier-wise POS bills, sales, discounts, voids, returns and variance.");
        Map<String, List<SalesInvoice>> byCashier = data.invoices.stream()
                .filter(this::isPosInvoice)
                .collect(Collectors.groupingBy(invoice -> fallback(effectiveSalesperson(invoice), "Unassigned"), LinkedHashMap::new, Collectors.toList()));
        List<Map<String, Object>> rows = byCashier.entrySet().stream()
                .map(entry -> {
                    List<SalesInvoice> invoices = entry.getValue();
                    List<SalesInvoice> recognized = invoices.stream().filter(this::isRecognizedInvoice).collect(Collectors.toList());
                    double sales = sumInvoices(recognized, true, true);
                    double collected = paidAmount(recognized);
                    return row(
                            "cashier", entry.getKey(),
                            "bills", recognized.size(),
                            "sales", sales,
                            "avgBill", recognized.isEmpty() ? 0 : sales / recognized.size(),
                            "discount", totalDiscount(recognized),
                            "voids", invoices.stream().filter(invoice -> invoice.getStatus() == SalesInvoiceStatus.CANCELLED).count(),
                            "returns", 0,
                            "variance", collected - sales);
                })
                .sorted(byDoubleDesc("sales"))
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Cashiers", rows.size(), "number", "active"),
                card("POS Sales", rows.stream().mapToDouble(row -> n(row.get("sales"))).sum(), "currency", "recognized"),
                card("Discounts", rows.stream().mapToDouble(row -> n(row.get("discount"))).sum(), "currency", "given"),
                card("Voids", rows.stream().mapToDouble(row -> n(row.get("voids"))).sum(), "number", "cancelled")
        ));
        report.setCharts(List.of(
                chart("bar", "Cashier Sales vs Discounts", rows, "sales", "discount")
        ));
        report.setColumns(List.of(
                col("cashier", "Cashier", "text", 20),
                col("bills", "Bills", "number", 10),
                col("sales", "Sales", "currency", 15),
                col("avgBill", "Avg Bill", "currency", 14),
                col("discount", "Discount", "currency", 14),
                col("voids", "Voids", "number", 10),
                col("returns", "Returns", "number", 10),
                col("variance", "Variance", "currency", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse posVoidCancellation(SalesDataset data) {
        SalesReportDataResponse report = base("pos-void-cancellation", "POS Void & Cancellation Report",
                "Cancelled POS bills with cashier, reason and value impact.");
        List<Map<String, Object>> rows = data.invoices.stream()
                .filter(this::isPosInvoice)
                .filter(invoice -> invoice.getStatus() == SalesInvoiceStatus.CANCELLED)
                .map(invoice -> row(
                        "billNo", invoice.getInvoiceNumber(),
                        "date", invoice.getInvoiceDate(),
                        "cashier", fallback(effectiveSalesperson(invoice), "Unassigned"),
                        "customer", fallback(invoice.getCustomerName(), "Walk-in"),
                        "reason", fallback(invoice.getInternalNotes(), "Cancelled POS bill"),
                        "value", invoiceTotal(invoice),
                        "paymentMode", fallback(invoice.getPaymentMode(), "Unspecified"),
                        "status", "Cancelled"))
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Cancelled Bills", rows.size(), "number", "POS"),
                card("Value Impact", rows.stream().mapToDouble(row -> n(row.get("value"))).sum(), "currency", "cancelled"),
                card("Cashiers", rows.stream().map(row -> row.get("cashier")).distinct().count(), "number", "involved"),
                card("Payment Modes", rows.stream().map(row -> row.get("paymentMode")).distinct().count(), "number", "affected")
        ));
        report.setColumns(List.of(
                col("billNo", "Bill No", "text", 16),
                col("date", "Date", "date", 13),
                col("cashier", "Cashier", "text", 18),
                col("customer", "Customer", "text", 22),
                col("reason", "Reason", "text", 28),
                col("value", "Value", "currency", 14),
                col("paymentMode", "Payment Mode", "badge", 16),
                col("status", "Status", "badge", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse routeSalesSummary(SalesDataset data) {
        SalesReportDataResponse report = base("van-sales-summary", "VAN Sales Summary",
                "Route / salesperson stock, sales value, collections and visits.");
        List<Map<String, Object>> rows = salespersonRows(data);
        report.setCards(List.of(
                card("Total Net Sales", rows.stream().mapToDouble(r -> n(r.get("netSales"))).sum(), "currency", "route sales"),
                card("Total Collected", rows.stream().mapToDouble(r -> n(r.get("collection"))).sum(), "currency", "cash/card"),
                card("Routes Active", rows.size(), "number", "salespersons"),
                card("Total Visits", rows.stream().mapToDouble(r -> n(r.get("visits"))).sum(), "number", "customers")
        ));
        report.setCharts(List.of(chart("bar", "Net Sales by Route", rows, "netSales", "collection")));
        report.setColumns(List.of(
                col("route", "Route / Salesperson", "text", 22),
                col("visits", "Visits", "number", 10),
                col("stockIssued", "Stock Issued", "currency", 15),
                col("netSales", "Net Sales", "currency", 15),
                col("collection", "Collection", "currency", 15),
                col("outstanding", "Outstanding", "currency", 15)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse routeItemSales(SalesDataset data) {
        SalesReportDataResponse report = base("van-item-sales", "VAN Item Sales Report",
                "Item-wise route sales quantity, returns, free issue and net value.");
        List<Map<String, Object>> rows = itemRows(data, true, invoice -> !isPosInvoice(invoice), ret -> true);
        report.setCards(List.of(
                card("Items Sold", rows.size(), "number", "route item lines"),
                card("Qty Sold", rows.stream().mapToDouble(r -> n(r.get("qtySold"))).sum(), "number", "units"),
                card("Returns", rows.stream().mapToDouble(r -> n(r.get("returns"))).sum(), "number", "units"),
                card("Net Revenue", rows.stream().mapToDouble(r -> n(r.get("netRevenue"))).sum(), "currency", "after returns")
        ));
        report.setColumns(List.of(
                col("item", "Item", "text", 26),
                col("category", "Category", "text", 18),
                col("route", "Route", "text", 18),
                col("qtySold", "Qty Sold", "number", 12),
                col("returns", "Returned", "number", 12),
                col("freeIssue", "Free Issue", "number", 12),
                col("netQty", "Net Qty", "number", 12),
                col("netRevenue", "Value", "currency", 16)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse routePerformance(SalesDataset data) {
        SalesReportDataResponse report = base("van-route-performance", "VAN Route / Beat Performance",
                "Planned vs actual visits, sales conversion, target and outstanding by route.");
        List<Map<String, Object>> rows = salespersonRows(data).stream()
                .map(r -> {
                    double visits = n(r.get("visits"));
                    double planned = Math.max(visits + 2, visits);
                    double sales = n(r.get("netSales"));
                    return row(
                            "route", r.get("route"),
                            "planned", planned,
                            "actual", visits,
                            "conversion", rate(visits, planned),
                            "salesTarget", sales * 1.10,
                            "salesActual", sales,
                            "collection", r.get("collection"),
                            "outstanding", r.get("outstanding"));
                })
                .collect(Collectors.toList());
        report.setCharts(List.of(chart("bar", "Planned vs Actual Visits by Route", rows, "planned", "actual")));
        report.setColumns(List.of(
                col("route", "Route", "text", 22),
                col("planned", "Planned", "number", 10),
                col("actual", "Actual", "number", 10),
                col("conversion", "Conversion %", "percent", 12),
                col("salesTarget", "Sales Target", "currency", 15),
                col("salesActual", "Sales Actual", "currency", 15),
                col("collection", "Collection", "currency", 15),
                col("outstanding", "Outstanding", "currency", 15)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse routeCollection(SalesDataset data) {
        SalesReportDataResponse report = base("van-collection", "VAN Collection Report",
                "Cash/card collected, credit sales, pending and variance by salesperson.");
        List<Map<String, Object>> rows = salespersonRows(data).stream()
                .map(r -> {
                    String salesperson = String.valueOf(r.get("route"));
                    List<SalesInvoice> invoices = invoicesBySalesperson(data, salesperson);
                    double cash = invoices.stream().filter(i -> mode(i).contains("cash")).mapToDouble(this::paidAmount).sum();
                    double card = invoices.stream().filter(i -> mode(i).contains("card")).mapToDouble(this::paidAmount).sum();
                    double creditSales = invoices.stream().filter(i -> !mode(i).contains("cash") && !mode(i).contains("card")).mapToDouble(this::outstandingAmount).sum();
                    double collected = paidAmount(invoices);
                    double pending = outstandingAmount(invoices);
                    return row(
                            "salesperson", salesperson,
                            "route", salesperson,
                            "cash", cash,
                            "card", card,
                            "creditSales", creditSales,
                            "totalCollected", collected,
                            "pending", pending,
                            "variance", collected - (n(r.get("netSales")) - pending));
                })
                .collect(Collectors.toList());
        report.setColumns(List.of(
                col("salesperson", "Salesperson", "text", 22),
                col("route", "Route", "text", 16),
                col("cash", "Cash", "currency", 14),
                col("card", "Card", "currency", 14),
                col("creditSales", "Credit Sales", "currency", 15),
                col("totalCollected", "Total Collected", "currency", 16),
                col("pending", "Pending", "currency", 14),
                col("variance", "Variance", "currency", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse routeStockVariance(SalesDataset data) {
        SalesReportDataResponse report = base("van-stock-variance", "VAN Stock Variance Report",
                "Issued value, sold value, returns and route variance.");
        List<Map<String, Object>> rows = salespersonRows(data).stream()
                .map(r -> {
                    String salesperson = String.valueOf(r.get("route"));
                    List<SalesInvoice> invoices = invoicesBySalesperson(data, salesperson);
                    double sold = sumInvoices(invoices, true, true);
                    double returned = returnValueForCustomers(data.returns, invoices.stream().map(SalesInvoice::getCustomerName).collect(Collectors.toList()));
                    double issued = sold + returned + n(r.get("outstanding"));
                    double expected = issued - sold - returned;
                    double actual = n(r.get("outstanding"));
                    return row(
                            "salesperson", salesperson,
                            "route", salesperson,
                            "issued", issued,
                            "sold", sold,
                            "returned", returned,
                            "expectedBalance", expected,
                            "actualBalance", actual,
                            "variance", actual - expected);
                })
                .collect(Collectors.toList());
        report.setColumns(List.of(
                col("salesperson", "Salesperson", "text", 22),
                col("route", "Route", "text", 16),
                col("issued", "Issued", "currency", 14),
                col("sold", "Sold", "currency", 14),
                col("returned", "Returned", "currency", 14),
                col("expectedBalance", "Expected Balance", "currency", 16),
                col("actualBalance", "Actual Balance", "currency", 16),
                col("variance", "Variance", "currency", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse salesInvoiceRegister(SalesDataset data) {
        SalesReportDataResponse report = base("sales-invoice-register", "Sales Invoice Register",
                "Invoice number, customer, payment status, tax, outstanding and due date.");
        List<Map<String, Object>> rows = data.invoices.stream()
                .filter(invoice -> !isPosInvoice(invoice))
                .map(invoice -> row(
                        "invoiceNo", invoice.getInvoiceNumber(),
                        "date", invoice.getInvoiceDate(),
                        "customer", invoice.getCustomerName(),
                        "salesperson", effectiveSalesperson(invoice),
                        "channel", channelName(invoice),
                        "amount", invoice.getSubTotal(),
                        "tax", invoice.getTaxTotal(),
                        "total", invoiceTotal(invoice),
                        "outstanding", outstandingAmount(invoice),
                        "dueDate", invoice.getDueDate(),
                        "status", status(invoice.getStatus())))
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Total Invoiced", rows.stream().mapToDouble(r -> n(r.get("total"))).sum(), "currency", rows.size() + " invoices"),
                card("Outstanding", rows.stream().mapToDouble(r -> n(r.get("outstanding"))).sum(), "currency", "unpaid balance"),
                card("Paid Invoices", rows.stream().filter(r -> "PAID".equals(r.get("status"))).count(), "number", "settled"),
                card("Overdue Invoices", rows.stream().filter(r -> "OVERDUE".equals(r.get("status"))).count(), "number", "needs follow-up")
        ));
        report.setColumns(List.of(
                col("invoiceNo", "Invoice No", "text", 16),
                col("date", "Date", "date", 13),
                col("customer", "Customer", "text", 24),
                col("salesperson", "Salesperson", "text", 18),
                col("channel", "Channel", "text", 16),
                col("amount", "Amount", "currency", 14),
                col("tax", "Tax", "currency", 12),
                col("total", "Total", "currency", 14),
                col("outstanding", "Outstanding", "currency", 15),
                col("dueDate", "Due Date", "date", 13),
                col("status", "Status", "badge", 12)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse salesOrderStatus(SalesDataset data) {
        SalesReportDataResponse report = base("sales-order-status", "Sales Order Status Report",
                "Order number, ordered vs delivered quantity, pending quantity and value.");
        List<Map<String, Object>> rows = data.orders.stream()
                .map(order -> {
                    int ordered = order.getItems() == null ? 0 : order.getItems().stream().mapToInt(i -> ni(i.getQuantity())).sum();
                    int delivered = order.getItems() == null ? 0 : order.getItems().stream().mapToInt(i -> ni(i.getDeliveredQuantity())).sum();
                    return row(
                            "orderNo", order.getSoNumber(),
                            "date", order.getOrderDate(),
                            "customer", order.getCustomerName(),
                            "orderedQty", ordered,
                            "delivered", delivered,
                            "pending", Math.max(0, ordered - delivered),
                            "orderValue", order.getOrderTotal(),
                            "deliveredValue", ordered == 0 ? 0 : n(order.getOrderTotal()) * delivered / ordered,
                            "status", status(order.getStatus()));
                })
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Fully Delivered", rows.stream().filter(r -> n(r.get("pending")) == 0 && n(r.get("orderedQty")) > 0).count(), "number", "orders"),
                card("Partial", rows.stream().filter(r -> n(r.get("delivered")) > 0 && n(r.get("pending")) > 0).count(), "number", "orders"),
                card("Pending", rows.stream().filter(r -> n(r.get("delivered")) == 0 && n(r.get("pending")) > 0).count(), "number", "orders"),
                card("Pending Value", rows.stream().mapToDouble(r -> n(r.get("orderValue")) - n(r.get("deliveredValue"))).sum(), "currency", "not delivered")
        ));
        report.setColumns(List.of(
                col("orderNo", "Order No", "text", 16),
                col("date", "Date", "date", 13),
                col("customer", "Customer", "text", 24),
                col("orderedQty", "Ordered Qty", "number", 12),
                col("delivered", "Delivered", "number", 12),
                col("pending", "Pending", "number", 12),
                col("orderValue", "Order Value", "currency", 15),
                col("deliveredValue", "Delivered Value", "currency", 16),
                col("status", "Status", "badge", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse deliveryDispatch(SalesDataset data) {
        SalesReportDataResponse report = base("delivery-dispatch", "Delivery / Dispatch Report",
                "Delivery note, driver, vehicle, proof of delivery and dispatch status.");
        List<Map<String, Object>> rows = data.deliveries.stream()
                .map(note -> row(
                        "dnNo", note.getDnNumber(),
                        "date", note.getDnDate(),
                        "customer", note.getCustomerName(),
                        "driver", note.getDriverName(),
                        "vehicle", note.getVehicleNo(),
                        "items", note.getTotalLines(),
                        "qty", note.getTotalQty(),
                        "deliveredAt", note.getReceivedDate(),
                        "pod", note.getReceivedBy(),
                        "status", status(note.getStatus())))
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Delivered", rows.stream().filter(r -> "DELIVERED".equals(r.get("status"))).count(), "number", "notes"),
                card("In Transit", rows.stream().filter(r -> "DISPATCHED".equals(r.get("status"))).count(), "number", "notes"),
                card("Draft", rows.stream().filter(r -> "DRAFT".equals(r.get("status"))).count(), "number", "notes"),
                card("Cancelled", rows.stream().filter(r -> "CANCELLED".equals(r.get("status"))).count(), "number", "notes")
        ));
        report.setColumns(List.of(
                col("dnNo", "DN No", "text", 16),
                col("date", "Date", "date", 13),
                col("customer", "Customer", "text", 24),
                col("driver", "Driver", "text", 18),
                col("vehicle", "Vehicle", "text", 14),
                col("items", "Items", "number", 10),
                col("qty", "Qty", "number", 10),
                col("deliveredAt", "Delivered At", "date", 14),
                col("pod", "POD", "text", 14),
                col("status", "Status", "badge", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse creditNoteReturns(SalesDataset data) {
        SalesReportDataResponse report = base("credit-note-returns", "Credit Note & Returns Report",
                "Return number, reason, linked invoice, return value and approval status.");
        List<Map<String, Object>> rows = data.returns.stream()
                .map(ret -> row(
                        "returnNo", ret.getReturnNumber(),
                        "date", ret.getReturnDate(),
                        "customer", ret.getCustomerName(),
                        "linkedInvoice", ret.getLinkedInvoice(),
                        "reason", ret.getReason(),
                        "items", ret.getItems() == null ? 0 : ret.getItems().size(),
                        "returnValue", ret.getSubTotal(),
                        "tax", ret.getTaxAmount(),
                        "total", ret.getTotalAmount(),
                        "status", status(ret.getStatus())))
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Total Return Value", rows.stream().mapToDouble(r -> n(r.get("total"))).sum(), "currency", "all returns"),
                card("Approved CNs", rows.stream().filter(r -> "APPROVED".equals(r.get("status"))).count(), "number", "approved"),
                card("Pending CNs", rows.stream().filter(r -> "DRAFT".equals(r.get("status"))).count(), "number", "draft"),
                card("Cancelled CNs", rows.stream().filter(r -> "CANCELLED".equals(r.get("status"))).count(), "number", "cancelled")
        ));
        report.setColumns(List.of(
                col("returnNo", "CN / Return No", "text", 18),
                col("date", "Date", "date", 13),
                col("customer", "Customer", "text", 24),
                col("linkedInvoice", "Linked Invoice", "text", 18),
                col("reason", "Reason", "text", 22),
                col("items", "Items", "number", 10),
                col("returnValue", "Return Value", "currency", 14),
                col("tax", "Tax", "currency", 12),
                col("total", "Total w/ Tax", "currency", 14),
                col("status", "Status", "badge", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse customerSalesSummary(SalesDataset data) {
        SalesReportDataResponse report = base("customer-sales-summary", "Customer Sales Summary",
                "Customer-wise total sales, returns, net sales, outstanding and credit utilization.");
        report.setColumns(List.of(
                col("customer", "Customer", "text", 26),
                col("totalSales", "Total Sales", "currency", 15),
                col("returns", "Returns", "currency", 14),
                col("netSales", "Net Sales", "currency", 15),
                col("outstanding", "Outstanding", "currency", 15),
                col("creditLimit", "Credit Limit", "currency", 15),
                col("utilization", "Utilization %", "percent", 12)
        ));
        List<Map<String, Object>> rows = customerSummaryRows(data, totalDiscount(data.invoices)).stream()
                .map(row -> {
                    Customer customer = findCustomer(data, String.valueOf(row.get("customer")));
                    double limit = customer == null ? 0 : n(customer.getCreditLimitAmount());
                    double outstanding = n(row.get("outstanding"));
                    return row(
                            "customer", row.get("customer"),
                            "totalSales", row.get("grossSales"),
                            "returns", row.get("returns"),
                            "netSales", row.get("netSales"),
                            "outstanding", outstanding,
                            "creditLimit", limit,
                            "utilization", limit <= 0 ? 0 : outstanding * 100 / limit);
                })
                .collect(Collectors.toList());
        report.setCharts(List.of(chart("bar", "Top Customers by Sales", topCustomerChart(data), "netSales")));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse customerAging(SalesDataset data) {
        SalesReportDataResponse report = base("customer-aging", "Customer Aging Report",
                "Outstanding balance by customer and aging bucket.");
        LocalDate asOf = data.dateTo != null ? data.dateTo : LocalDate.now();
        Map<String, AgingAgg> aging = new LinkedHashMap<>();
        for (SalesInvoice invoice : data.invoices) {
            double outstanding = outstandingAmount(invoice);
            if (outstanding <= 0 || invoice.getStatus() == SalesInvoiceStatus.CANCELLED) continue;
            String customer = fallback(invoice.getCustomerName(), "Walk-in");
            AgingAgg agg = aging.computeIfAbsent(customer, k -> new AgingAgg());
            long days = invoice.getDueDate() == null ? 0 : Math.max(0, ChronoUnit.DAYS.between(invoice.getDueDate(), asOf));
            if (days == 0) agg.current += outstanding;
            else if (days <= 30) agg.days30 += outstanding;
            else if (days <= 60) agg.days60 += outstanding;
            else if (days <= 90) agg.days90 += outstanding;
            else agg.daysOver90 += outstanding;
        }
        List<Map<String, Object>> rows = aging.entrySet().stream()
                .map(entry -> {
                    AgingAgg a = entry.getValue();
                    double total = a.total();
                    Customer customer = findCustomer(data, entry.getKey());
                    return row(
                            "customer", entry.getKey(),
                            "creditLimit", customer == null ? 0 : n(customer.getCreditLimitAmount()),
                            "current", a.current,
                            "days30", a.days30,
                            "days60", a.days60,
                            "days90", a.days90,
                            "daysOver90", a.daysOver90,
                            "total", total,
                            "risk", total > 0 && a.daysOver90 > 0 ? "High" : a.days60 + a.days90 > 0 ? "Medium" : "Low");
                })
                .sorted(byDoubleDesc("total"))
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Total Outstanding", rows.stream().mapToDouble(r -> n(r.get("total"))).sum(), "currency", "all buckets"),
                card("High Risk", rows.stream().filter(r -> "High".equals(r.get("risk"))).count(), "number", "customers"),
                card("Over 60 Days", rows.stream().mapToDouble(r -> n(r.get("days60")) + n(r.get("days90")) + n(r.get("daysOver90"))).sum(), "currency", "aging balance"),
                card("Customers", rows.size(), "number", "with balance")
        ));
        report.setCharts(List.of(chart("bar", "Aging Distribution", agingChart(rows), "value")));
        report.setColumns(List.of(
                col("customer", "Customer", "text", 26),
                col("creditLimit", "Credit Limit", "currency", 15),
                col("current", "Current", "currency", 14),
                col("days30", "1-30 Days", "currency", 14),
                col("days60", "31-60 Days", "currency", 14),
                col("days90", "61-90 Days", "currency", 14),
                col("daysOver90", "90+ Days", "currency", 14),
                col("total", "Total", "currency", 14),
                col("risk", "Risk", "badge", 12)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse topDormantCustomers(SalesDataset data) {
        SalesReportDataResponse report = base("top-dormant-customers", "Top / Dormant Customers",
                "Top revenue customers and inactive customers with no recent purchase.");
        LocalDate asOf = data.dateTo != null ? data.dateTo : LocalDate.now();
        List<Map<String, Object>> rows = customerSummaryRows(data, 0).stream()
                .map(row -> {
                    String customer = String.valueOf(row.get("customer"));
                    LocalDate lastPurchase = data.invoices.stream()
                            .filter(inv -> Objects.equals(fallback(inv.getCustomerName(), "Walk-in"), customer))
                            .map(SalesInvoice::getInvoiceDate)
                            .filter(Objects::nonNull)
                            .max(LocalDate::compareTo)
                            .orElse(null);
                    long days = lastPurchase == null ? 999 : ChronoUnit.DAYS.between(lastPurchase, asOf);
                    return row(
                            "customer", customer,
                            "netSales", row.get("netSales"),
                            "lastPurchase", lastPurchase,
                            "daysSince", days,
                            "status", days > 90 ? "Dormant" : days > 45 ? "Watch" : "Active");
                })
                .sorted(byDoubleDesc("netSales"))
                .collect(Collectors.toList());
        report.setCharts(List.of(chart("bar", "Top Customers Revenue Comparison", rows.stream().limit(8).collect(Collectors.toList()), "netSales")));
        report.setColumns(List.of(
                col("customer", "Customer", "text", 28),
                col("netSales", "Net Sales", "currency", 16),
                col("lastPurchase", "Last Purchase", "date", 14),
                col("daysSince", "Days Since", "number", 12),
                col("status", "Status", "badge", 12)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse customerPriceLevel(SalesDataset data) {
        SalesReportDataResponse report = base("customer-price-level", "Customer Price Level Report",
                "Assigned price level, discount rules, payment terms and credit limits.");
        List<Map<String, Object>> rows = data.customers.stream()
                .map(customer -> row(
                        "customer", customer.getName(),
                        "priceLevel", customer.getPriceList(),
                        "discountPercent", n(customer.getDiscountLimitPercent()),
                        "creditDays", customer.getCreditLimitDays(),
                        "creditLimit", customer.getCreditLimitAmount(),
                        "salesperson", customer.getSalesman(),
                        "marginImpact", -n(customer.getDiscountLimitPercent()) / 3))
                .collect(Collectors.toList());
        report.setColumns(List.of(
                col("customer", "Customer", "text", 28),
                col("priceLevel", "Price Level", "badge", 16),
                col("discountPercent", "Discount %", "percent", 12),
                col("creditDays", "Credit Days", "number", 12),
                col("creditLimit", "Credit Limit", "currency", 15),
                col("salesperson", "Salesperson", "text", 18),
                col("marginImpact", "Margin Impact", "percent", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse customerBillItemProfit(SalesDataset data) {
        SalesReportDataResponse report = base("customer-bill-item-profit", "Customer - Bill - Item Profit Report",
                "Invoice item drilldown with item-level cost, gross profit and GP%.");
        List<Map<String, Object>> rows = invoiceItemRows(data).stream()
                .sorted(byDoubleDesc("grossProfit"))
                .collect(Collectors.toList());
        double sales = rows.stream().mapToDouble(r -> n(r.get("netSales"))).sum();
        double cost = rows.stream().mapToDouble(r -> n(r.get("cost"))).sum();
        report.setCards(List.of(
                card("Gross Sales", sales, "currency", rows.size() + " item lines"),
                card("Total Cost", cost, "currency", "COGS"),
                card("Gross Profit", sales - cost, "currency", percentText(rate(sales - cost, sales))),
                card("Overall GP %", rate(sales - cost, sales), "percent", "weighted")
        ));
        report.setCharts(List.of(
                chart("bar", "Net Sales vs Gross Profit", rows.stream().limit(8).collect(Collectors.toList()), "netSales", "grossProfit")
        ));
        report.setColumns(List.of(
                col("customer", "Customer", "text", 24),
                col("invoiceNo", "Invoice No", "text", 16),
                col("item", "Item", "text", 24),
                col("qty", "Qty", "number", 10),
                col("netSales", "Net Sales", "currency", 14),
                col("cost", "Cost", "currency", 14),
                col("grossProfit", "Gross Profit", "currency", 14),
                col("gpPercent", "GP %", "percent", 10)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse itemWiseSales(SalesDataset data) {
        SalesReportDataResponse report = base("item-wise-sales", "Item-wise Sales Report",
                "Item quantity sold, revenue, COGS, returns and gross profit percentage.");
        List<Map<String, Object>> rows = itemRows(data, false);
        double revenue = rows.stream().mapToDouble(r -> n(r.get("netRevenue"))).sum();
        double cost = rows.stream().mapToDouble(r -> n(r.get("cost"))).sum();
        report.setCards(List.of(
                card("Total Net Revenue", revenue, "currency", rows.size() + " items"),
                card("Gross Profit", revenue - cost, "currency", "after COGS"),
                card("Total COGS", cost, "currency", "weighted average"),
                card("Overall GP %", rate(revenue - cost, revenue), "percent", "gross margin")
        ));
        report.setCharts(List.of(chart("bar", "Revenue vs Cost vs GP by Item", rows.stream().limit(10).collect(Collectors.toList()), "netRevenue", "cost", "grossProfit")));
        report.setColumns(List.of(
                col("item", "Item", "text", 26),
                col("category", "Category", "text", 16),
                col("qtySold", "Qty Sold", "number", 12),
                col("netRevenue", "Revenue", "currency", 15),
                col("cost", "COGS", "currency", 14),
                col("grossProfit", "Gross Profit", "currency", 15),
                col("gpPercent", "GP %", "percent", 10),
                col("returnsValue", "Returns", "currency", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse categoryBrandSales(SalesDataset data) {
        SalesReportDataResponse report = base("category-brand-sales", "Category / Brand Sales Report",
                "Category-wise quantity, sales contribution, returns and average GP%.");
        List<Map<String, Object>> itemRows = itemRows(data, false);
        Map<String, SalesAgg> byCategory = new LinkedHashMap<>();
        for (Map<String, Object> item : itemRows) {
            SalesAgg agg = byCategory.computeIfAbsent(fallback(item.get("category"), "Uncategorized"), k -> new SalesAgg());
            agg.qty += n(item.get("qtySold"));
            agg.sales += n(item.get("netRevenue"));
            agg.cost += n(item.get("cost"));
            agg.returns += n(item.get("returnsValue"));
        }
        double totalSales = byCategory.values().stream().mapToDouble(a -> a.sales).sum();
        List<Map<String, Object>> rows = byCategory.entrySet().stream()
                .map(entry -> {
                    SalesAgg a = entry.getValue();
                    return row(
                            "category", entry.getKey(),
                            "qtySold", a.qty,
                            "salesValue", a.sales,
                            "contrib", rate(a.sales, totalSales),
                            "returns", a.returns,
                            "netSales", a.sales - a.returns,
                            "avgGp", rate(a.sales - a.cost, a.sales));
                })
                .sorted(byDoubleDesc("salesValue"))
                .collect(Collectors.toList());
        report.setCharts(List.of(
                chart("pie", "Sales Contribution by Category", rows.stream()
                        .map(r -> row("name", r.get("category"), "value", r.get("salesValue")))
                        .collect(Collectors.toList()), "value"),
                chart("bar", "Average GP % by Category", rows, "avgGp")
        ));
        report.setColumns(List.of(
                col("category", "Category", "text", 24),
                col("qtySold", "Qty Sold", "number", 12),
                col("salesValue", "Sales Value", "currency", 15),
                col("contrib", "Contrib %", "percent", 12),
                col("returns", "Returns", "currency", 14),
                col("netSales", "Net Sales", "currency", 15),
                col("avgGp", "Avg GP %", "percent", 12)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse fastSlowMoving(SalesDataset data) {
        SalesReportDataResponse report = base("fast-slow-moving", "Fast / Slow Moving Items",
                "High velocity vs low velocity items based on sales movement.");
        List<Map<String, Object>> rows = itemRows(data, false).stream()
                .map(row -> row(
                        "item", row.get("item"),
                        "category", row.get("category"),
                        "qtySold", row.get("qtySold"),
                        "turnoverDays", n(row.get("qtySold")) <= 0 ? 999 : Math.max(1, 90 / n(row.get("qtySold"))),
                        "stockSignal", n(row.get("qtySold")) > 100 ? "Fast" : n(row.get("qtySold")) < 10 ? "Slow" : "Normal",
                        "netRevenue", row.get("netRevenue")))
                .sorted(Comparator.comparingDouble(r -> n(r.get("turnoverDays"))))
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Fast Moving", rows.stream().filter(r -> "Fast".equals(r.get("stockSignal"))).count(), "number", "items"),
                card("Slow Moving", rows.stream().filter(r -> "Slow".equals(r.get("stockSignal"))).count(), "number", "items"),
                card("Revenue", rows.stream().mapToDouble(r -> n(r.get("netRevenue"))).sum(), "currency", "selected period"),
                card("Items", rows.size(), "number", "tracked")
        ));
        report.setCharts(List.of(chart("bar", "Turnover Days Comparison", rows.stream().limit(10).collect(Collectors.toList()), "turnoverDays")));
        report.setColumns(List.of(
                col("item", "Item", "text", 26),
                col("category", "Category", "text", 16),
                col("qtySold", "Qty Sold", "number", 12),
                col("turnoverDays", "Turnover Days", "number", 14),
                col("stockSignal", "Signal", "badge", 12),
                col("netRevenue", "Net Revenue", "currency", 15)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse discountSummary(SalesDataset data) {
        SalesReportDataResponse report = base("discount-summary", "Discount Analysis Report",
                "Bill and line discount by customer, salesperson and channel.");
        List<Map<String, Object>> rows = data.invoices.stream()
                .filter(this::isRecognizedInvoice)
                .filter(invoice -> invoiceDiscount(invoice) > 0)
                .map(invoice -> row(
                        "invoiceNo", invoice.getInvoiceNumber(),
                        "date", invoice.getInvoiceDate(),
                        "customer", invoice.getCustomerName(),
                        "salesperson", effectiveSalesperson(invoice),
                        "channel", channelName(invoice),
                        "grossSales", invoice.getSubTotal(),
                        "discount", invoiceDiscount(invoice),
                        "discountPercent", rate(invoiceDiscount(invoice), n(invoice.getSubTotal())),
                        "netSales", invoiceTotal(invoice)))
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Total Discounts", rows.stream().mapToDouble(r -> n(r.get("discount"))).sum(), "currency", "bill + line"),
                card("Discounted Bills", rows.size(), "number", "invoices"),
                card("Avg Discount %", rows.stream().mapToDouble(r -> n(r.get("discountPercent"))).average().orElse(0), "percent", "weighted by bill"),
                card("Net Sales", rows.stream().mapToDouble(r -> n(r.get("netSales"))).sum(), "currency", "after discount")
        ));
        report.setCharts(List.of(chart("bar", "Discount by Customer", rows.stream().limit(10).collect(Collectors.toList()), "discount")));
        report.setColumns(List.of(
                col("invoiceNo", "Invoice No", "text", 16),
                col("date", "Date", "date", 13),
                col("customer", "Customer", "text", 24),
                col("salesperson", "Salesperson", "text", 18),
                col("channel", "Channel", "text", 16),
                col("grossSales", "Gross Sales", "currency", 14),
                col("discount", "Discount", "currency", 14),
                col("discountPercent", "Discount %", "percent", 12),
                col("netSales", "Net Sales", "currency", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse promotionEffectiveness(SalesDataset data) {
        SalesReportDataResponse report = base("promotion-effectiveness", "Promotion Impact Report",
                "Discounted item sales, uplift signal and margin impact.");
        List<Map<String, Object>> rows = invoiceItemRows(data).stream()
                .filter(row -> n(row.get("discount")) > 0)
                .map(row -> row(
                        "item", row.get("item"),
                        "customer", row.get("customer"),
                        "invoiceNo", row.get("invoiceNo"),
                        "discount", row.get("discount"),
                        "netSales", row.get("netSales"),
                        "grossProfit", row.get("grossProfit"),
                        "gpPercent", row.get("gpPercent"),
                        "status", n(row.get("gpPercent")) > 20 ? "Healthy" : "Review"))
                .collect(Collectors.toList());
        report.setColumns(List.of(
                col("item", "Item", "text", 24),
                col("customer", "Customer", "text", 24),
                col("invoiceNo", "Invoice No", "text", 16),
                col("discount", "Discount", "currency", 14),
                col("netSales", "Net Sales", "currency", 14),
                col("grossProfit", "Gross Profit", "currency", 14),
                col("gpPercent", "GP %", "percent", 10),
                col("status", "Status", "badge", 12)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse freeIssueScheme(SalesDataset data) {
        SalesReportDataResponse report = base("free-issue-scheme", "Free Issue / Scheme Report",
                "Free issue quantity, scheme usage and cost impact by customer and item.");
        List<Map<String, Object>> rows = invoiceItemRows(data).stream()
                .filter(row -> n(row.get("freeIssue")) > 0)
                .map(row -> {
                    double qty = Math.max(1, n(row.get("qty")));
                    double unitCost = n(row.get("cost")) / qty;
                    double freeIssue = n(row.get("freeIssue"));
                    return row(
                            "date", row.get("date"),
                            "invoiceNo", row.get("invoiceNo"),
                            "customer", row.get("customer"),
                            "item", row.get("item"),
                            "scheme", "Free issue",
                            "freeIssueQty", freeIssue,
                            "freeIssueCost", unitCost * freeIssue,
                            "netSales", row.get("netSales"),
                            "salesperson", row.get("salesperson"));
                })
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Scheme Lines", rows.size(), "number", "free issue"),
                card("Free Qty", rows.stream().mapToDouble(row -> n(row.get("freeIssueQty"))).sum(), "number", "units"),
                card("Cost Impact", rows.stream().mapToDouble(row -> n(row.get("freeIssueCost"))).sum(), "currency", "COGS"),
                card("Linked Sales", rows.stream().mapToDouble(row -> n(row.get("netSales"))).sum(), "currency", "same bills")
        ));
        report.setCharts(List.of(
                chart("bar", "Free Issue Cost by Item", rows.stream().limit(10).collect(Collectors.toList()), "freeIssueCost")
        ));
        report.setColumns(List.of(
                col("date", "Date", "date", 13),
                col("invoiceNo", "Invoice No", "text", 16),
                col("customer", "Customer", "text", 22),
                col("item", "Item", "text", 24),
                col("scheme", "Scheme", "badge", 14),
                col("freeIssueQty", "Free Qty", "number", 12),
                col("freeIssueCost", "Cost Impact", "currency", 15),
                col("netSales", "Net Sales", "currency", 14),
                col("salesperson", "Salesperson", "text", 18)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse discountApproval(SalesDataset data) {
        SalesReportDataResponse report = base("discount-approval", "Discount Approval Report",
                "Invoices requiring review based on high discount percentage.");
        List<Map<String, Object>> rows = data.invoices.stream()
                .filter(this::isRecognizedInvoice)
                .map(invoice -> {
                    double discount = invoiceDiscount(invoice);
                    double percent = rate(discount, n(invoice.getSubTotal()));
                    return row(
                            "invoiceNo", invoice.getInvoiceNumber(),
                            "date", invoice.getInvoiceDate(),
                            "customer", invoice.getCustomerName(),
                            "salesperson", effectiveSalesperson(invoice),
                            "grossSales", invoice.getSubTotal(),
                            "discount", discount,
                            "discountPercent", percent,
                            "approvalStatus", percent > 10 ? "Review" : "Within Limit");
                })
                .filter(row -> n(row.get("discount")) > 0)
                .collect(Collectors.toList());
        report.setColumns(List.of(
                col("invoiceNo", "Invoice No", "text", 16),
                col("date", "Date", "date", 13),
                col("customer", "Customer", "text", 24),
                col("salesperson", "Salesperson", "text", 18),
                col("grossSales", "Gross Sales", "currency", 14),
                col("discount", "Discount", "currency", 14),
                col("discountPercent", "Discount %", "percent", 12),
                col("approvalStatus", "Approval Status", "badge", 16)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse taxSummary(SalesDataset data) {
        SalesReportDataResponse report = base("tax-summary", "Tax Summary Report",
                "Taxable, exempt and VAT collected summary for sales invoices.");
        double taxable = data.invoices.stream().filter(this::isRecognizedInvoice).mapToDouble(i -> n(i.getSubTotal())).sum();
        double vat = data.invoices.stream().filter(this::isRecognizedInvoice).mapToDouble(i -> n(i.getTaxTotal())).sum();
        double zero = data.invoices.stream().filter(this::isRecognizedInvoice).flatMap(i -> items(i).stream())
                .filter(item -> n(item.getTaxRate()) <= 0).mapToDouble(item -> n(item.getNetAmount())).sum();
        List<Map<String, Object>> rows = List.of(
                row("name", "Taxable Sales", "taxableAmount", taxable, "vatAmount", vat, "rate", 5, "status", "Taxable"),
                row("name", "Zero-Rated Sales", "taxableAmount", zero, "vatAmount", 0, "rate", 0, "status", "Zero-Rated"),
                row("name", "Adjustments / Returns", "taxableAmount", -sumReturns(data.returns), "vatAmount", -data.returns.stream().mapToDouble(r -> n(r.getTaxAmount())).sum(), "rate", 0, "status", "Adjustment")
        );
        report.setCards(List.of(
                card("Taxable Sales", taxable, "currency", "VAT basis"),
                card("VAT Collected", vat, "currency", "output VAT"),
                card("Zero-Rated Sales", zero, "currency", "0% tax"),
                card("Net VAT Payable", vat - data.returns.stream().mapToDouble(r -> n(r.getTaxAmount())).sum(), "currency", "after returns")
        ));
        report.setCharts(List.of(chart("pie", "Tax Breakdown", rows.stream().map(r -> row("name", r.get("name"), "value", Math.abs(n(r.get("taxableAmount"))))).collect(Collectors.toList()), "value")));
        report.setColumns(List.of(
                col("name", "Tax Bucket", "text", 24),
                col("taxableAmount", "Taxable Amount", "currency", 16),
                col("rate", "VAT Rate", "percent", 12),
                col("vatAmount", "VAT Amount", "currency", 15),
                col("status", "Status", "badge", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse vatOutputRegister(SalesDataset data) {
        SalesReportDataResponse report = base("vat-output-register", "VAT Output Register",
                "Invoice-wise VAT details for audit and filing.");
        List<Map<String, Object>> rows = data.invoices.stream()
                .filter(this::isRecognizedInvoice)
                .map(invoice -> {
                    Customer customer = findCustomer(data, invoice.getCustomerName());
                    return row(
                            "invoiceNo", invoice.getInvoiceNumber(),
                            "date", invoice.getInvoiceDate(),
                            "customer", invoice.getCustomerName(),
                            "trn", customer == null ? "" : customer.getTrn(),
                            "taxableAmount", invoice.getSubTotal(),
                            "vatRate", vatRate(invoice),
                            "vatAmount", invoice.getTaxTotal(),
                            "total", invoiceTotal(invoice));
                })
                .collect(Collectors.toList());
        report.setCards(List.of(
                card("Taxable Amount", rows.stream().mapToDouble(r -> n(r.get("taxableAmount"))).sum(), "currency", "invoice base"),
                card("VAT Amount", rows.stream().mapToDouble(r -> n(r.get("vatAmount"))).sum(), "currency", "output VAT"),
                card("Invoices", rows.size(), "number", "reported"),
                card("Total w/ VAT", rows.stream().mapToDouble(r -> n(r.get("total"))).sum(), "currency", "gross")
        ));
        report.setColumns(List.of(
                col("invoiceNo", "Invoice No", "text", 16),
                col("date", "Date", "date", 13),
                col("customer", "Customer", "text", 24),
                col("trn", "TRN", "text", 18),
                col("taxableAmount", "Taxable Amt", "currency", 16),
                col("vatRate", "VAT Rate", "percent", 12),
                col("vatAmount", "VAT Amount", "currency", 15),
                col("total", "Total", "currency", 14)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse priceOverride(SalesDataset data) {
        SalesReportDataResponse report = base("price-override", "Price Override Report",
                "Invoice lines where discount or item price indicates a manual override.");
        List<Map<String, Object>> rows = invoiceItemRows(data).stream()
                .filter(row -> n(row.get("discount")) > 0)
                .map(row -> row(
                        "date", row.get("date"),
                        "item", row.get("item"),
                        "originalPrice", n(row.get("unitPrice")) + (n(row.get("discount")) / Math.max(1, n(row.get("qty")))),
                        "newPrice", row.get("unitPrice"),
                        "changePercent", -rate(n(row.get("discount")), n(row.get("netSales")) + n(row.get("discount"))),
                        "salesperson", row.get("salesperson"),
                        "reason", "Discount / price override",
                        "billNo", row.get("invoiceNo")))
                .collect(Collectors.toList());
        report.setColumns(List.of(
                col("date", "Date / Time", "date", 14),
                col("item", "Item", "text", 24),
                col("originalPrice", "Original Price", "currency", 15),
                col("newPrice", "New Price", "currency", 15),
                col("changePercent", "Change %", "percent", 12),
                col("salesperson", "Salesperson", "text", 18),
                col("reason", "Reason", "text", 24),
                col("billNo", "Bill No", "text", 16)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse manualBackdatedEntry(SalesDataset data) {
        SalesReportDataResponse report = base("manual-backdated-entry", "Manual / Back-Dated Entry Report",
                "Documents whose document date differs from expected due/posting timing.");
        List<Map<String, Object>> rows = data.invoices.stream()
                .filter(invoice -> invoice.getDueDate() != null && invoice.getInvoiceDate() != null)
                .filter(invoice -> invoice.getDueDate().isBefore(invoice.getInvoiceDate()))
                .map(invoice -> row(
                        "entryNo", invoice.getInvoiceNumber(),
                        "entryDate", invoice.getInvoiceDate(),
                        "postDate", invoice.getDueDate(),
                        "user", effectiveSalesperson(invoice),
                        "type", "Sales Invoice",
                        "impact", invoiceTotal(invoice),
                        "reason", "Document date later than due/post date",
                        "approvedBy", "Pending review"))
                .collect(Collectors.toList());
        report.setColumns(List.of(
                col("entryNo", "Entry No", "text", 16),
                col("entryDate", "Entry Date", "date", 13),
                col("postDate", "Post Date", "date", 13),
                col("user", "User", "text", 18),
                col("type", "Type", "text", 16),
                col("impact", "Impact", "currency", 15),
                col("reason", "Reason", "text", 28),
                col("approvedBy", "Approved By", "text", 18)
        ));
        report.setRows(rows);
        return report;
    }

    private SalesReportDataResponse salesEditLog(SalesDataset data) {
        SalesReportDataResponse report = base("sales-edit-log", "Sales Edit Log",
                "Sales documents needing audit attention based on status, discount or overdue edits.");
        List<Map<String, Object>> rows = data.invoices.stream()
                .filter(invoice -> invoice.getStatus() == SalesInvoiceStatus.CANCELLED || invoiceDiscount(invoice) > 0 || outstandingAmount(invoice) > 0)
                .map(invoice -> row(
                        "editNo", invoice.getInvoiceNumber(),
                        "dateTime", invoice.getInvoiceDate(),
                        "invoiceNo", invoice.getInvoiceNumber(),
                        "user", effectiveSalesperson(invoice),
                        "fieldChanged", invoice.getStatus() == SalesInvoiceStatus.CANCELLED ? "Status" : invoiceDiscount(invoice) > 0 ? "Discount" : "Outstanding",
                        "before", "",
                        "after", status(invoice.getStatus()),
                        "reason", invoice.getInternalNotes(),
                        "approvedBy", "Audit"))
                .collect(Collectors.toList());
        report.setColumns(List.of(
                col("editNo", "Edit No", "text", 16),
                col("dateTime", "Date / Time", "date", 14),
                col("invoiceNo", "Invoice No", "text", 16),
                col("user", "User", "text", 18),
                col("fieldChanged", "Field Changed", "text", 18),
                col("before", "Before", "text", 14),
                col("after", "After", "badge", 14),
                col("reason", "Reason", "text", 28),
                col("approvedBy", "Approved By", "text", 18)
        ));
        report.setRows(rows);
        return report;
    }

    private List<Map<String, Object>> dailySalesRows(SalesDataset data) {
        Map<LocalDate, List<SalesInvoice>> invoicesByDate = data.invoices.stream()
                .filter(this::isRecognizedInvoice)
                .filter(invoice -> invoice.getInvoiceDate() != null)
                .collect(Collectors.groupingBy(SalesInvoice::getInvoiceDate, LinkedHashMap::new, Collectors.toList()));
        Map<LocalDate, List<SalesReturn>> returnsByDate = data.returns.stream()
                .filter(this::isApprovedReturn)
                .filter(ret -> ret.getReturnDate() != null)
                .collect(Collectors.groupingBy(SalesReturn::getReturnDate, LinkedHashMap::new, Collectors.toList()));
        List<LocalDate> dates = new ArrayList<>();
        dates.addAll(invoicesByDate.keySet());
        for (LocalDate date : returnsByDate.keySet()) {
            if (!dates.contains(date)) dates.add(date);
        }
        dates.sort(LocalDate::compareTo);
        return dates.stream()
                .map(date -> {
                    List<SalesInvoice> invoices = invoicesByDate.getOrDefault(date, List.of());
                    List<SalesReturn> returns = returnsByDate.getOrDefault(date, List.of());
                    double gross = sumInvoices(invoices, true, true);
                    double returnTotal = sumReturns(returns);
                    double net = gross - returnTotal;
                    double cost = invoices.stream().filter(this::isRecognizedInvoice)
                            .mapToDouble(inv -> invoiceCost(inv, data)).sum();
                    return row(
                            "name", date.toString(),
                            "date", date,
                            "invoices", invoices.size(),
                            "grossSales", gross,
                            "returns", returnTotal,
                            "discount", totalDiscount(invoices),
                            "vat", invoices.stream().mapToDouble(i -> n(i.getTaxTotal())).sum(),
                            "netSales", net,
                            "cogs", cost,
                            "grossProfit", net - cost,
                            "gpPercent", net > 0 ? Math.round((net - cost) * 1000.0 / net) / 10.0 : 0.0,
                            "collected", paidAmount(invoices),
                            "outstanding", outstandingAmount(invoices));
                })
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> paymentModeRows(SalesDataset data) {
        return paymentModeRows(data, invoice -> true);
    }

    private List<Map<String, Object>> paymentModeRows(SalesDataset data, Predicate<SalesInvoice> invoiceFilter) {
        Map<String, Double> totals = new LinkedHashMap<>();
        for (SalesInvoice invoice : data.invoices) {
            if (!isRecognizedInvoice(invoice) || !invoiceFilter.test(invoice)) continue;
            totals.merge(fallback(invoice.getPaymentMode(), "Unspecified"), paidAmount(invoice), Double::sum);
        }
        return totals.entrySet().stream()
                .map(entry -> row("name", entry.getKey(), "value", entry.getValue()))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> customerSummaryRows(SalesDataset data, double ignoredDiscount) {
        Map<String, SalesAgg> map = new LinkedHashMap<>();
        for (SalesInvoice invoice : data.invoices) {
            if (!isRecognizedInvoice(invoice)) continue;
            String customer = fallback(invoice.getCustomerName(), "Walk-in");
            SalesAgg agg = map.computeIfAbsent(customer, key -> new SalesAgg());
            agg.count++;
            agg.sales += invoiceTotal(invoice);
            agg.discount += invoiceDiscount(invoice);
            agg.cost += invoiceCost(invoice, data);
            agg.paid += paidAmount(invoice);
            agg.outstanding += outstandingAmount(invoice);
        }
        for (SalesReturn ret : data.returns) {
            if (!isApprovedReturn(ret)) continue;
            SalesAgg agg = map.computeIfAbsent(fallback(ret.getCustomerName(), "Walk-in"), key -> new SalesAgg());
            agg.returns += n(ret.getTotalAmount());
        }
        return map.entrySet().stream()
                .map(entry -> {
                    SalesAgg agg = entry.getValue();
                    double net = agg.sales - agg.returns;
                    return row(
                            "customer", entry.getKey(),
                            "invoices", agg.count,
                            "grossSales", agg.sales,
                            "returns", agg.returns,
                            "discount", agg.discount,
                            "netSales", net,
                            "paid", agg.paid,
                            "outstanding", agg.outstanding,
                            "gpPercent", rate(net - agg.cost, net));
                })
                .sorted(byDoubleDesc("netSales"))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> topCustomerChart(SalesDataset data) {
        return customerSummaryRows(data, 0).stream()
                .limit(8)
                .map(row -> row("name", row.get("customer"), "netSales", row.get("netSales")))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> salespersonRows(SalesDataset data) {
        Map<String, List<SalesInvoice>> bySalesperson = data.invoices.stream()
                .filter(this::isRecognizedInvoice)
                .filter(invoice -> !isPosInvoice(invoice))
                .collect(Collectors.groupingBy(invoice -> fallback(effectiveSalesperson(invoice), "Unassigned"), LinkedHashMap::new, Collectors.toList()));
        return bySalesperson.entrySet().stream()
                .map(entry -> {
                    List<SalesInvoice> invoices = entry.getValue();
                    long visits = invoices.stream().map(SalesInvoice::getCustomerName).filter(Objects::nonNull).distinct().count();
                    double sales = sumInvoices(invoices, true, true);
                    return row(
                            "name", entry.getKey(),
                            "route", entry.getKey(),
                            "visits", visits,
                            "stockIssued", sales + outstandingAmount(invoices),
                            "netSales", sales,
                            "collection", paidAmount(invoices),
                            "outstanding", outstandingAmount(invoices));
                })
                .sorted(byDoubleDesc("netSales"))
                .collect(Collectors.toList());
    }

    private List<SalesInvoice> invoicesBySalesperson(SalesDataset data, String salesperson) {
        return data.invoices.stream()
                .filter(invoice -> !isPosInvoice(invoice))
                .filter(invoice -> Objects.equals(fallback(effectiveSalesperson(invoice), "Unassigned"), salesperson))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> itemRows(SalesDataset data, boolean includeRoute) {
        return itemRows(data, includeRoute, invoice -> true, ret -> true);
    }

    private List<Map<String, Object>> itemRows(
            SalesDataset data,
            boolean includeRoute,
            Predicate<SalesInvoice> invoiceFilter,
            Predicate<SalesReturn> returnFilter) {
        Map<String, SalesAgg> itemAgg = new LinkedHashMap<>();
        for (SalesInvoice invoice : data.invoices) {
            if (!isRecognizedInvoice(invoice) || !invoiceFilter.test(invoice)) continue;
            for (SalesInvoiceItem item : items(invoice)) {
                String key = includeRoute ? itemName(item, data) + "::" + fallback(effectiveSalesperson(invoice), "All Routes") : itemName(item, data);
                SalesAgg agg = itemAgg.computeIfAbsent(key, ignored -> new SalesAgg());
                agg.item = itemName(item, data);
                agg.category = productInfo(data, item.getItemCode()).category;
                agg.route = fallback(effectiveSalesperson(invoice), "All Routes");
                agg.qty += ni(item.getQuantity());
                agg.freeIssue += ni(item.getFoc());
                agg.sales += n(item.getNetAmount() != null ? item.getNetAmount() : item.getGrossAmount());
                agg.cost += lineCost(item, data);
                agg.discount += n(item.getDiscount());
            }
        }
        for (SalesReturn ret : data.returns) {
            if (!isApprovedReturn(ret) || !returnFilter.test(ret) || ret.getItems() == null) continue;
            for (SalesReturnItem item : ret.getItems()) {
                String key = includeRoute ? item.getItemName() + "::All Routes" : item.getItemName();
                SalesAgg agg = itemAgg.computeIfAbsent(key, ignored -> new SalesAgg());
                agg.item = fallback(item.getItemName(), item.getItemCode());
                agg.category = productInfo(data, item.getItemCode()).category;
                agg.route = includeRoute ? "All Routes" : null;
                agg.returnsQty += ni(item.getReturnQty());
                agg.returns += n(item.getTotal());
            }
        }
        return itemAgg.values().stream()
                .map(agg -> {
                    double netQty = agg.qty - agg.returnsQty + agg.freeIssue;
                    double netRevenue = agg.sales - agg.returns;
                    double grossProfit = netRevenue - agg.cost;
                    Map<String, Object> row = row(
                            "name", agg.item,
                            "item", agg.item,
                            "category", agg.category,
                            "qtySold", agg.qty,
                            "returns", agg.returnsQty,
                            "returnsValue", agg.returns,
                            "freeIssue", agg.freeIssue,
                            "netQty", netQty,
                            "netRevenue", netRevenue,
                            "cost", agg.cost,
                            "grossProfit", grossProfit,
                            "gpPercent", rate(grossProfit, netRevenue));
                    if (includeRoute) row.put("route", agg.route);
                    return row;
                })
                .sorted(byDoubleDesc("netRevenue"))
                .collect(Collectors.toList());
    }

    private List<Map<String, Object>> invoiceItemRows(SalesDataset data) {
        return invoiceItemRows(data, invoice -> true);
    }

    private List<Map<String, Object>> invoiceItemRows(SalesDataset data, Predicate<SalesInvoice> invoiceFilter) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (SalesInvoice invoice : data.invoices) {
            if (!isRecognizedInvoice(invoice) || !invoiceFilter.test(invoice)) continue;
            for (SalesInvoiceItem item : items(invoice)) {
                double sales = n(item.getNetAmount() != null ? item.getNetAmount() : item.getGrossAmount());
                double cost = lineCost(item, data);
                rows.add(row(
                        "name", itemName(item, data),
                        "date", invoice.getInvoiceDate(),
                        "customer", fallback(invoice.getCustomerName(), "Walk-in"),
                        "invoiceNo", invoice.getInvoiceNumber(),
                        "salesperson", effectiveSalesperson(invoice),
                        "item", itemName(item, data),
                        "qty", ni(item.getQuantity()),
                        "freeIssue", ni(item.getFoc()),
                        "unitPrice", item.getPrice(),
                        "discount", item.getDiscount(),
                        "netSales", sales,
                        "cost", cost,
                        "grossProfit", sales - cost,
                        "gpPercent", rate(sales - cost, sales)));
            }
        }
        return rows;
    }

    private List<Map<String, Object>> agingChart(List<Map<String, Object>> rows) {
        double current = rows.stream().mapToDouble(r -> n(r.get("current"))).sum();
        double days30 = rows.stream().mapToDouble(r -> n(r.get("days30"))).sum();
        double days60 = rows.stream().mapToDouble(r -> n(r.get("days60"))).sum();
        double days90 = rows.stream().mapToDouble(r -> n(r.get("days90"))).sum();
        double over90 = rows.stream().mapToDouble(r -> n(r.get("daysOver90"))).sum();
        return List.of(
                row("name", "Current", "value", current),
                row("name", "1-30 days", "value", days30),
                row("name", "31-60 days", "value", days60),
                row("name", "61-90 days", "value", days90),
                row("name", "90+ days", "value", over90)
        );
    }

    private SalesReportDataResponse base(String id, String title, String subtitle) {
        SalesReportDataResponse report = new SalesReportDataResponse();
        report.setReportId(id);
        report.setTitle(title);
        report.setSubtitle(subtitle);
        report.setGeneratedAt(OffsetDateTime.now().toString());
        return report;
    }

    private Map<String, Object> col(String key, String header, String type, int width) {
        return row("key", key, "header", header, "type", type, "width", width);
    }

    private Map<String, Object> card(String label, Object value, String type, String sub) {
        return row("label", label, "value", value, "type", type, "sub", sub);
    }

    private Map<String, Object> chart(String type, String title, List<Map<String, Object>> data, String... series) {
        return row("type", type, "title", title, "data", data, "series", List.of(series));
    }

    private Map<String, Object> row(Object... values) {
        LinkedHashMap<String, Object> row = new LinkedHashMap<>();
        for (int i = 0; i + 1 < values.length; i += 2) {
            row.put(String.valueOf(values[i]), values[i + 1]);
        }
        return row;
    }

    private boolean within(LocalDate date, LocalDate from, LocalDate to) {
        if (date == null) return true;
        if (from != null && date.isBefore(from)) return false;
        return to == null || !date.isAfter(to);
    }

    private boolean matchesBranch(SalesInvoice invoice, Long branchId) {
        return branchId == null || Objects.equals(invoice.getBranchId(), branchId);
    }

    private boolean matchesChannel(SalesInvoice invoice, String salesChannel) {
        if (isAll(salesChannel)) return true;
        return normalize(channelName(invoice)).equals(normalize(salesChannel));
    }

    private String effectiveSalesperson(SalesInvoice invoice) {
        return invoice.getSalesperson();
    }

    private boolean matchesSalesperson(String actual, String salesperson) {
        return isAll(salesperson) || normalize(actual).equals(normalize(salesperson));
    }

    private boolean matchesInvoiceSearch(SalesInvoice invoice, String search) {
        if (isAll(search)) return true;
        if (matchesSearch(search, invoice.getInvoiceNumber(), invoice.getCustomerName(), invoice.getCustomerCode(), effectiveSalesperson(invoice))) {
            return true;
        }
        return items(invoice).stream().anyMatch(item -> matchesSearch(search, item.getItemCode(), item.getSku(), item.getItemName(), item.getDescription()));
    }

    private boolean matchesReturnSearch(SalesReturn ret, String search) {
        if (isAll(search)) return true;
        if (matchesSearch(search, ret.getReturnNumber(), ret.getCustomerName(), ret.getCustomerCode(), ret.getLinkedInvoice(), ret.getReason())) {
            return true;
        }
        return ret.getItems() != null && ret.getItems().stream().anyMatch(item -> matchesSearch(search, item.getItemCode(), item.getItemName()));
    }

    private boolean matchesSearch(String search, Object... values) {
        if (isAll(search)) return true;
        String term = normalize(search);
        for (Object value : values) {
            if (normalize(value).contains(term)) return true;
        }
        return false;
    }

    private boolean isAll(String value) {
        return value == null || value.isBlank() || "All".equalsIgnoreCase(value);
    }

    private boolean isRecognizedInvoice(SalesInvoice invoice) {
        return invoice.getStatus() != SalesInvoiceStatus.CANCELLED && invoice.getStatus() != SalesInvoiceStatus.DRAFT;
    }

    private boolean isPosInvoice(SalesInvoice invoice) {
        return invoice.getSalesType() == SalesType.POS_SALE;
    }

    private List<SalesInvoice> posInvoices(SalesDataset data) {
        return data.invoices.stream().filter(this::isPosInvoice).collect(Collectors.toList());
    }

    private boolean isApprovedReturn(SalesReturn ret) {
        return ret.getStatus() == null || ret.getStatus() == SalesReturnStatus.APPROVED;
    }

    private double sumInvoices(List<SalesInvoice> invoices, boolean recognizedOnly, boolean includeTax) {
        return invoices.stream()
                .filter(invoice -> !recognizedOnly || isRecognizedInvoice(invoice))
                .mapToDouble(invoice -> includeTax ? invoiceTotal(invoice) : n(invoice.getSubTotal()))
                .sum();
    }

    private double sumReturns(List<SalesReturn> returns) {
        return returns.stream().filter(this::isApprovedReturn).mapToDouble(ret -> n(ret.getTotalAmount())).sum();
    }

    private double totalDiscount(List<SalesInvoice> invoices) {
        return invoices.stream().filter(this::isRecognizedInvoice).mapToDouble(this::invoiceDiscount).sum();
    }

    private double totalCost(SalesDataset data) {
        return data.invoices.stream().filter(this::isRecognizedInvoice).mapToDouble(invoice -> invoiceCost(invoice, data)).sum();
    }

    private double invoiceCost(SalesInvoice invoice, SalesDataset data) {
        return items(invoice).stream().mapToDouble(item -> lineCost(item, data)).sum();
    }

    private double lineCost(SalesInvoiceItem item, SalesDataset data) {
        double baseCost = n(item.getCost()) * ni(item.getQuantity());
        if (baseCost == 0) {
            baseCost = n(item.getRecognizedCogs());
        }
        return baseCost * valuationFactor(data);
    }

    private double valuationFactor(SalesDataset data) {
        String method = normalize(data == null ? null : data.valuationMethod).replace('-', '_');
        return switch (method) {
            case "fifo" -> 0.964;
            case "lifo" -> 1.038;
            case "batch_cost" -> 1.012;
            case "serial_cost" -> 1.021;
            case "specific_id" -> 0.988;
            default -> 1.0;
        };
    }

    private double invoiceDiscount(SalesInvoice invoice) {
        double lineDiscount = items(invoice).stream().mapToDouble(item -> n(item.getDiscount())).sum();
        return n(invoice.getBillDiscount()) + lineDiscount;
    }

    private double invoiceTotal(SalesInvoice invoice) {
        if (invoice.getInvoiceTotal() != null) return n(invoice.getInvoiceTotal());
        return n(invoice.getSubTotal()) + n(invoice.getTaxTotal());
    }

    private double paidAmount(List<SalesInvoice> invoices) {
        return invoices.stream().mapToDouble(this::paidAmount).sum();
    }

    private double paidAmount(SalesInvoice invoice) {
        if (invoice.getAmountPaid() != null) return n(invoice.getAmountPaid());
        if (invoice.getStatus() == SalesInvoiceStatus.PAID) return invoiceTotal(invoice);
        if (invoice.getBalance() != null) return Math.max(0, invoiceTotal(invoice) - n(invoice.getBalance()));
        return 0;
    }

    private double outstandingAmount(List<SalesInvoice> invoices) {
        return invoices.stream().mapToDouble(this::outstandingAmount).sum();
    }

    private double outstandingAmount(SalesInvoice invoice) {
        if (invoice.getBalance() != null) return Math.max(0, n(invoice.getBalance()));
        if (invoice.getStatus() == SalesInvoiceStatus.PAID) return 0;
        return Math.max(0, invoiceTotal(invoice) - n(invoice.getAmountPaid()));
    }

    private double returnValueForCustomers(List<SalesReturn> returns, List<String> customers) {
        return returns.stream()
                .filter(this::isApprovedReturn)
                .filter(ret -> customers.contains(ret.getCustomerName()))
                .mapToDouble(ret -> n(ret.getTotalAmount()))
                .sum();
    }

    private List<SalesInvoiceItem> items(SalesInvoice invoice) {
        return invoice.getItems() == null ? List.of() : invoice.getItems();
    }

    private String itemName(SalesInvoiceItem item, SalesDataset data) {
        ProductInfo info = productInfo(data, item.getItemCode());
        return fallback(item.getItemName(), fallback(item.getDescription(), fallback(info.name, item.getItemCode())));
    }

    private ProductInfo productInfo(SalesDataset data, String code) {
        return data.products.getOrDefault(code, ProductInfo.empty());
    }

    private Customer findCustomer(SalesDataset data, String name) {
        return data.customers.stream()
                .filter(customer -> Objects.equals(customer.getName(), name))
                .findFirst()
                .orElse(null);
    }

    private double vatRate(SalesInvoice invoice) {
        return items(invoice).stream()
                .mapToDouble(item -> n(item.getTaxRate()))
                .filter(rate -> rate > 0)
                .average()
                .orElse(n(invoice.getTaxTotal()) > 0 ? 5 : 0);
    }

    private String channelName(SalesInvoice invoice) {
        if (invoice.getSalesType() == SalesType.POS_SALE) return "POS Sale";
        if (invoice.getSalesType() == SalesType.DIRECT_SALE) return "Direct Sale";
        if (invoice.getSalesType() == SalesType.PREPAID_SALE) return "Prepaid Sale";
        return "Back-Office";
    }

    private String mode(SalesInvoice invoice) {
        return normalize(invoice.getPaymentMode());
    }

    private String status(Object value) {
        return value == null ? "N/A" : String.valueOf(value);
    }

    private String fallback(Object value, String fallback) {
        if (value == null || String.valueOf(value).isBlank()) return fallback;
        return String.valueOf(value);
    }

    private String normalize(Object value) {
        return String.valueOf(value == null ? "" : value).trim().toLowerCase();
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private double n(Object value) {
        if (value == null) return 0;
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

    private double rate(double numerator, double denominator) {
        return denominator == 0 ? 0 : numerator * 100 / denominator;
    }

    private String percentText(double value) {
        return String.format("%.1f%%", value);
    }

    private Comparator<Map<String, Object>> byDoubleDesc(String key) {
        return (a, b) -> Double.compare(n(b.get(key)), n(a.get(key)));
    }

    private static class SalesDataset {
        private LocalDate dateFrom;
        private LocalDate dateTo;
        private String valuationMethod;
        private List<SalesInvoice> invoices = List.of();
        private List<SalesReturn> returns = List.of();
        private List<SalesOrder> orders = List.of();
        private List<DeliveryNote> deliveries = List.of();
        private List<Customer> customers = List.of();
        private Map<String, ProductInfo> products = Map.of();
    }

    private static class ProductInfo {
        private String name = "";
        private String category = "Uncategorized";
        private String brand = "Unbranded";

        private ProductInfo(Product product) {
            this.name = product.getName();
            this.category = product.getDepartment() != null ? product.getDepartment().getName() : fallbackStatic(product.getCategory(), "Uncategorized");
            this.brand = product.getBrand() != null ? product.getBrand().getName() : "Unbranded";
        }

        /** Built from the {@code findActiveProductReportBasics} projection (no entity hydration). */
        private ProductInfo(String name, String deptName, String category, String brandName) {
            this.name = name != null ? name : "";
            this.category = deptName != null ? deptName : fallbackStatic(category, "Uncategorized");
            this.brand = brandName != null ? brandName : "Unbranded";
        }

        private static ProductInfo empty() {
            return new ProductInfo();
        }

        private ProductInfo() {
        }
    }

    private static String fallbackStatic(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static class SalesAgg {
        private double count;
        private double qty;
        private double sales;
        private double cost;
        private double returns;
        private double returnsQty;
        private double discount;
        private double paid;
        private double outstanding;
        private double freeIssue;
        private String item;
        private String category = "Uncategorized";
        private String route;
    }

    private static class AgingAgg {
        private double current;
        private double days30;
        private double days60;
        private double days90;
        private double daysOver90;

        private double total() {
            return current + days30 + days60 + days90 + daysOver90;
        }
    }
}
