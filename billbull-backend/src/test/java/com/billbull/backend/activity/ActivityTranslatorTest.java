package com.billbull.backend.activity;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ActivityTranslatorTest {

    @Test
    void explicitRulesReadAsSentencesWithReferenceAndLink() {
        var r = ActivityTranslator.translate("POST", "/api/pos/sessions/412/close");
        assertThat(r.module()).isEqualTo("POS");
        assertThat(r.summary()).isEqualTo("Closed POS session #412");
        assertThat(r.reference()).isEqualTo("412");
        assertThat(r.link()).isEqualTo("/sales/pos");

        assertThat(ActivityTranslator.translate("POST", "/api/pos/checkout").summary()).isEqualTo("Completed a POS sale");
        assertThat(ActivityTranslator.translate("POST", "/api/auth/login").summary()).isEqualTo("Signed in");
        assertThat(ActivityTranslator.translate("POST", "/api/auth/login").module()).isEqualTo("AUTH");
    }

    @Test
    void phrasesWithAnArticleDoNotGetAReferenceAppended() {
        var r = ActivityTranslator.translate("POST", "/api/pos/sessions/412/x-report/generate");
        assertThat(r.summary()).isEqualTo("Generated an X report");
        assertThat(r.reference()).isEqualTo("412");
    }

    @Test
    void queryStringIsIgnored() {
        assertThat(ActivityTranslator.translate("POST", "/api/sales/invoices?draft=true").summary())
                .isEqualTo("Created a sales invoice");
    }

    @Test
    void genericReadingUsesTrailingActionWordAndResource() {
        var r = ActivityTranslator.translate("POST", "/api/purchase-invoices/77/approve");
        assertThat(r.module()).isEqualTo("PURCHASE");
        assertThat(r.action()).isEqualTo("Approved");
        assertThat(r.summary()).isEqualTo("Approved purchase invoice #77");

        assertThat(ActivityTranslator.translate("POST", "/api/sales/quotations/5/send-email").summary())
                .isEqualTo("Emailed quotation #5");
        assertThat(ActivityTranslator.translate("DELETE", "/api/brands/9").summary()).isEqualTo("Deleted brand #9");
        assertThat(ActivityTranslator.translate("PUT", "/api/vendors/3").summary()).isEqualTo("Updated vendor #3");
    }

    @Test
    void genericCreateGetsAnArticle() {
        assertThat(ActivityTranslator.translate("POST", "/api/expenses").summary()).isEqualTo("Created an expense");
        assertThat(ActivityTranslator.translate("POST", "/api/grns").summary()).isEqualTo("Created a GRN");
        assertThat(ActivityTranslator.translate("POST", "/api/departments").summary()).isEqualTo("Created a department");
    }

    @Test
    void codedIdentifiersAreReferencesNotSubjects() {
        var r = ActivityTranslator.translate("POST", "/api/inventory/stock-take/sessions/STK-13544/items");
        assertThat(r.module()).isEqualTo("INVENTORY");
        assertThat(r.reference()).isEqualTo("STK-13544");
        assertThat(r.summary()).isEqualTo("Created an item in session #STK-13544");

        assertThat(ActivityTranslator.translate("PATCH", "/api/inventory/stock-take/items/55/bin").summary())
                .isEqualTo("Updated bin of item #55");
    }

    @Test
    void moduleMatchingIsSegmentExact() {
        assertThat(ActivityTranslator.moduleOf("/api/purchase-invoices/1")).isEqualTo("PURCHASE");
        assertThat(ActivityTranslator.moduleOf("/api/pricing-workspace/x")).isEqualTo("INVENTORY");
        assertThat(ActivityTranslator.moduleOf("/api/auth/pos/login")).isEqualTo("AUTH");
        assertThat(ActivityTranslator.moduleOf("/api/salesforce")).isEqualTo("OTHER");
        assertThat(ActivityTranslator.moduleOf(null)).isEqualTo("OTHER");
    }

    @Test
    void humanizeSingularizes() {
        assertThat(ActivityTranslator.humanize("purchase-invoices")).isEqualTo("purchase invoice");
        assertThat(ActivityTranslator.humanize("categories")).isEqualTo("category");
        assertThat(ActivityTranslator.humanize("addresses")).isEqualTo("address");
        assertThat(ActivityTranslator.humanize("lpos")).isEqualTo("LPO");
        assertThat(ActivityTranslator.humanize("status")).isEqualTo("status");
    }

    @Test
    void businessEventsReadAsTitles() {
        assertThat(ActivityTranslator.describeBusinessEvent("SALES_RETURN", "RETURN_APPROVED", "SR-0007"))
                .isEqualTo("Sales return SR-0007 · return approved");
        assertThat(ActivityTranslator.describeBusinessEvent("ROLE_PERMISSION", "UPSERTED", "-"))
                .isEqualTo("Role permission · upserted");
    }

    @Test
    void deviceLabels() {
        assertThat(ActivityTranslator.deviceOf(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"))
                .isEqualTo("Chrome on Windows");
        assertThat(ActivityTranslator.deviceOf(
                "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Electron/33.0 Safari/537.36"))
                .isEqualTo("BillBull POS app");
        assertThat(ActivityTranslator.deviceOf(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"))
                .isEqualTo("Safari on iPhone");
        assertThat(ActivityTranslator.deviceOf(null)).isNull();
    }
}
