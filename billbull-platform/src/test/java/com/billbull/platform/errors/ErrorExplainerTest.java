package com.billbull.platform.errors;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.billbull.platform.errors.ErrorExplainer.Category;
import com.billbull.platform.errors.ErrorExplainer.Explanation;
import com.billbull.platform.errors.ErrorExplainer.Severity;

class ErrorExplainerTest {

    @Test
    void postingCodesExplainAccountingControls() {
        Explanation x = ErrorExplainer.explain(server("com.billbull.backend.financials.generalledger.postingengine.PostingException",
                null, null, "PERIOD_LOCKED", "Period is closed", "POST", "/api/financials/journal-vouchers", 422));
        assertThat(x.ruleCode()).isEqualTo("ACC_PERIOD_LOCKED");
        assertThat(x.category()).isEqualTo(Category.ACCOUNTING_RULE);
        assertThat(x.module()).isEqualTo(ErpModule.FINANCIALS);
        assertThat(x.businessImpact()).startsWith("Nothing was saved");

        Explanation db = ErrorExplainer.explain(server("org.springframework.dao.DataIntegrityViolationException",
                "org.postgresql.util.PSQLException", "P0001", null,
                "PERIOD_LOCKED: Posting date 2026-10-31 falls in a closed accounting period.", "POST", "/api/sales/invoices", 400));
        assertThat(db.ruleCode()).isEqualTo("ACC_PERIOD_LOCKED");
    }

    @Test
    void duplicateDocumentNumberIsSeparatedFromOrdinaryDuplicates() {
        Explanation num = ErrorExplainer.explain(server("org.springframework.dao.DataIntegrityViolationException",
                "org.postgresql.util.PSQLException", "23505", null,
                "duplicate key value violates unique constraint \"uk_sales_invoices_invoice_number\"", "POST", "/api/sales/invoices", 409));
        assertThat(num.ruleCode()).isEqualTo("DB_DUPLICATE_DOC_NUMBER");
        assertThat(num.severity()).isEqualTo(Severity.HIGH);
        assertThat(num.module()).isEqualTo(ErpModule.SALES);

        Explanation dup = ErrorExplainer.explain(server("org.springframework.dao.DataIntegrityViolationException",
                "org.postgresql.util.PSQLException", "23505", null,
                "duplicate key value violates unique constraint \"uk_products_code\"", "POST", "/api/products", 409));
        assertThat(dup.ruleCode()).isEqualTo("DB_DUPLICATE");
        assertThat(dup.module()).isEqualTo(ErpModule.INVENTORY);
    }

    @Test
    void defectOnCheckoutIsCriticalAndExplainsTheSaleWasNotRecorded() {
        Explanation x = ErrorExplainer.explain(server("java.lang.NullPointerException", null, null, null,
                "Cannot invoke \"Unit.getFactor()\" because \"unit\" is null", "POST", "/api/pos/checkout", 400));
        assertThat(x.ruleCode()).isEqualTo("NULL_VALUE");
        assertThat(x.severity()).isEqualTo(Severity.CRITICAL);
        assertThat(x.module()).isEqualTo(ErpModule.POS);
        assertThat(x.businessImpact()).contains("sale was not recorded");
        assertThat(x.technicalSummary()).contains("NullPointerException").contains("/api/pos/checkout");
    }

    @Test
    void businessRefusalsAreRecognisedByMessage() {
        Explanation stock = ErrorExplainer.explain(server("java.lang.RuntimeException", null, null, null,
                "Insufficient stock for item 1001 in warehouse Main", "POST", "/api/sales/invoices", 400));
        assertThat(stock.ruleCode()).isEqualTo("BIZ_STOCK_SHORT");
        assertThat(stock.category()).isEqualTo(Category.BUSINESS_RULE);

        Explanation generic = ErrorExplainer.explain(server("java.lang.IllegalArgumentException", null, null, null,
                "Customer is required", "POST", "/api/sales/invoices", 400));
        assertThat(generic.ruleCode()).isEqualTo("BIZ_RULE");

        // The same class with a 5xx or a cause is not a deliberate refusal.
        Explanation crash = ErrorExplainer.explain(server("java.lang.IllegalStateException", null, null, null,
                "Unexpected state", "POST", "/api/sales/invoices", 500));
        assertThat(crash.category()).isNotEqualTo(Category.BUSINESS_RULE);
    }

    @Test
    void schemaMismatchIsCriticalDeployment() {
        Explanation x = ErrorExplainer.explain(server("org.springframework.jdbc.BadSqlGrammarException",
                "org.postgresql.util.PSQLException", "42703", null, "column p.home_bin_id does not exist", "GET", "/api/products", 400));
        assertThat(x.ruleCode()).isEqualTo("DB_SCHEMA_MISMATCH");
        assertThat(x.category()).isEqualTo(Category.DATABASE_SCHEMA);
        assertThat(x.severity()).isEqualTo(Severity.CRITICAL);
    }

    @Test
    void browserErrorsMapToScreensAndKinds() {
        Explanation chunk = ErrorExplainer.explain(client("TypeError",
                "Failed to fetch dynamically imported module: https://x/assets/GRN-abc.js", "/purchase/grn", null));
        assertThat(chunk.ruleCode()).isEqualTo("CLIENT_STALE_BUNDLE");
        assertThat(chunk.module()).isEqualTo(ErpModule.PURCHASE);

        Explanation crash = ErrorExplainer.explain(client("TypeError",
                "Cannot read properties of undefined (reading 'map')", "/pos/", "at render\n\nReact component stack:\n at Cart"));
        assertThat(crash.ruleCode()).isEqualTo("CLIENT_CRASH");
        assertThat(crash.module()).isEqualTo(ErpModule.POS);
    }

    @Test
    void backgroundJobsGetJobSpecificImpact() {
        ErrorFacts f = new ErrorFacts(ErrorFacts.Source.JOB, null, null, null, "GL balance rebuild failed", null, null, null,
                null, null, null, "com.billbull.backend.config.GlBalanceRebuildJob", null, null);
        Explanation x = ErrorExplainer.explain(f);
        assertThat(x.ruleCode()).isEqualTo("JOB_FAILED");
        assertThat(x.module()).isEqualTo(ErpModule.FINANCIALS);
        assertThat(x.businessImpact()).contains("trial balance");
    }

    @Test
    void requestFormatWinsOverItsCause() {
        // Seen end-to-end: GET /api/products/not-a-number is a bad request, not bad master data.
        Explanation x = ErrorExplainer.explain(server(
                "org.springframework.web.method.annotation.MethodArgumentTypeMismatchException",
                "java.lang.NumberFormatException", null, null, "For input string: \"not-a-number\"", "GET",
                "/api/products/not-a-number", 400));
        assertThat(x.ruleCode()).isEqualTo("BAD_PARAMETER");
    }

    @Test
    void networkPrinterOnPrintPath() {
        Explanation x = ErrorExplainer.explain(server("java.net.SocketTimeoutException", null, null, null,
                "Connect timed out", "POST", "/api/pos/printers/{id}/print-escpos", 400));
        assertThat(x.ruleCode()).isEqualTo("NETWORK_PRINTER");
        assertThat(x.businessImpact()).contains("sale itself is complete");
    }

    @Test
    void modulePrefixesUseLongestMatch() {
        assertThat(ErpModule.fromApiPath("/api/purchase-invoices/{id}")).isEqualTo(ErpModule.PURCHASE);
        assertThat(ErpModule.fromApiPath("/api/pricing-workspace/x")).isEqualTo(ErpModule.SALES);
        assertThat(ErpModule.fromApiPath("/api/platform/errors")).isEqualTo(ErpModule.PLATFORM);
        assertThat(ErpModule.fromApiPath("/api/unknown")).isEqualTo(ErpModule.GENERAL);
        assertThat(ErpModule.fromScreen("/sales/pos")).isEqualTo(ErpModule.POS);
        assertThat(ErpModule.fromLogger("com.billbull.backend.inventory.stocktake.StockTakeService")).isEqualTo(ErpModule.INVENTORY);
    }

    @Test
    void everyRuleIsDocumentedAndUnique() {
        Set<String> codes = new HashSet<>();
        for (Map<String, Object> r : ErrorExplainer.catalogue()) {
            assertThat(codes.add((String) r.get("code"))).as("duplicate rule %s", r.get("code")).isTrue();
            assertThat((String) r.get("title")).isNotBlank();
            assertThat((String) r.get("whatHappened")).isNotBlank();
            assertThat((java.util.List<?>) r.get("recommendedActions")).isNotEmpty();
        }
        assertThat(codes).contains("UNCLASSIFIED");
        Explanation any = ErrorExplainer.explain(server("com.example.WeirdException", null, null, null, "x", "GET", "/api/x", 500));
        assertThat(any.ruleCode()).isEqualTo("UNCLASSIFIED");
        assertThat(any.title()).contains("WeirdException");
    }

    private static ErrorFacts server(String ex, String root, String sqlState, String code, String msg, String method,
                                     String path, Integer status) {
        String chain = ErrorFacts.simple(ex) + (root != null ? " > " + ErrorFacts.simple(root) : "");
        return new ErrorFacts(ErrorFacts.Source.SERVER, ex, root, chain, msg, root != null ? msg : null, code, sqlState,
                method, path, status, null, "com.billbull.backend.X.y:1", null);
    }

    private static ErrorFacts client(String ex, String msg, String path, String stack) {
        return new ErrorFacts(ErrorFacts.Source.CLIENT, ex, null, null, msg, null, null, null, null, path, null,
                "window.onerror", null, stack);
    }
}
