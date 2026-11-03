package com.billbull.backend.sales.salesorder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.billbull.backend.sales.pricing.PricingFixture;
import com.billbull.backend.sales.pricing.PricingModels.CarriedPrice;
import com.billbull.backend.sales.pricing.SourceDocumentPrices;
import com.billbull.backend.sales.quotation.QuotationItem;
import com.billbull.backend.settings.branch.Branch;

/**
 * Pricing Phase 2.1 — a sales order save re-resolves every line on the order's trusted branch,
 * customer and date; a line carried from its quotation keeps the quotation's price.
 */
class SalesOrderPricingValidationTest {

    final PricingFixture fx = new PricingFixture();
    final SourceDocumentPrices sources = mock(SourceDocumentPrices.class);
    final SalesOrderService service = new SalesOrderService(
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);

    @BeforeEach
    void setUp() {
        service.setPricingResolutionService(fx.service);
        service.setSourceDocumentPrices(sources);
        when(sources.forDocuments(any(), any(), any())).thenReturn(List.of());
    }

    @Test
    void customerSpecificPriceOnASalesOrder() {
        SalesOrderItem a = item("A", 5, "25.00");
        SalesOrder order = order("ABC", PricingFixture.BRANCH_A, a);

        service.applyPricing(order, null, List.of());

        assertThat(a.getPriceSource()).isEqualTo("CUSTOMER_SPECIFIC");
        assertThat(a.getPriceOverridden()).isFalse();
        assertThat(order.getPriceLevelName()).isEqualTo("Wholesale");
    }

    @Test
    void branchSpecificNegotiatedPriceAppliesOnlyAtItsBranch() {
        fx.mapping(fx.abc, 11L, PricingFixture.BRANCH_A, "40.00");

        SalesOrderItem atA = item("B", 1, "40.00");
        service.applyPricing(order("ABC", PricingFixture.BRANCH_A, atA), null, List.of());
        assertThat(atA.getPriceSource()).isEqualTo("CUSTOMER_SPECIFIC_BRANCH");
        assertThat(atA.getPriceOverridden()).isFalse();

        SalesOrderItem atB = item("B", 1, "40.00");
        service.applyPricing(order("ABC", PricingFixture.BRANCH_B, atB), null, List.of());
        assertThat(atB.getPriceOverridden()).isTrue();
        assertThat(atB.getResolvedUnitPrice()).isEqualByComparingTo("45.00");
    }

    @Test
    void expiredNegotiatedPriceNoLongerValidatesTheOldPrice() {
        fx.abcOnA.setEffectiveTo(PricingFixture.TODAY.minusDays(1));
        SalesOrderItem a = item("A", 5, "25.00");
        service.applyPricing(order("ABC", PricingFixture.BRANCH_A, a), null, List.of());
        assertThat(a.getPriceOverridden()).isTrue();
        assertThat(a.getResolvedUnitPrice()).isEqualByComparingTo("27.00");
        assertThat(a.getCustomerPriceId()).isNull();
    }

    @Test
    void disabledNegotiatedPriceNoLongerValidatesTheOldPrice() {
        fx.abcOnA.setEnabled(false);
        SalesOrderItem a = item("A", 5, "25.00");
        service.applyPricing(order("ABC", PricingFixture.BRANCH_A, a), null, List.of());
        assertThat(a.getPriceOverridden()).isTrue();
        assertThat(a.getPriceSource()).isEqualTo("PRICE_LEVEL");
    }

    @Test
    void explicitLevelOnTheOrder() {
        SalesOrderItem b = item("B", 1, "45.00");
        SalesOrder order = order(null, PricingFixture.BRANCH_A, b);
        order.setPriceLevelId(fx.wholesale.getId());
        service.applyPricing(order, null, List.of());
        assertThat(b.getPriceOverridden()).isFalse();
        assertThat(order.getPriceLevelSource()).isEqualTo("TRANSACTION");
    }

    @Test
    void authorisedManualPriceIsKeptAndFlagged() {
        SalesOrderItem b = item("B", 1, "39.99");
        service.applyPricing(order("TRADER", PricingFixture.BRANCH_A, b), null, List.of());
        assertThat(b.getPrice()).isEqualByComparingTo("39.99");
        assertThat(b.getPriceOverridden()).isTrue();
        assertThat(b.getResolvedUnitPrice()).isEqualByComparingTo("45.00");
    }

    @Test
    void lineConvertedFromItsQuotationKeepsTheQuotationsPrice() {
        // The quotation agreed 25 on A; ABC's negotiated price has since been raised to 26.
        QuotationItem quoted = new QuotationItem();
        quoted.setItemCode("A");
        quoted.setQuantity(new BigDecimal("5"));
        quoted.setPrice(new BigDecimal("25.00"));
        quoted.setPriceSource("CUSTOMER_SPECIFIC");
        quoted.setCustomerPriceId(fx.abcOnA.getId());
        when(sources.forDocuments(any(), isNull(), any())).thenReturn(List.of(CarriedPrice.of(quoted)));
        fx.abcOnA.setPrice(new BigDecimal("26.00"));

        SalesOrderItem a = item("A", 5, "25.00");
        SalesOrder order = order("ABC", PricingFixture.BRANCH_A, a);
        order.setLinkedQuotation("QTN-9");
        service.applyPricing(order, null, List.of());

        assertThat(a.getPrice()).isEqualByComparingTo("25.00");
        assertThat(a.getPriceSource()).isEqualTo("SOURCE_DOCUMENT");
        assertThat(a.getPriceOverridden()).isFalse();
        assertThat(a.getCustomerPriceId()).isEqualTo(fx.abcOnA.getId());
    }

    @Test
    void aConvertedLineWhosePriceWasChangedIsResolvedAgain() {
        QuotationItem quoted = new QuotationItem();
        quoted.setItemCode("B");
        quoted.setQuantity(BigDecimal.ONE);
        quoted.setPrice(new BigDecimal("44.00"));
        when(sources.forDocuments(any(), isNull(), any())).thenReturn(List.of(CarriedPrice.of(quoted)));

        SalesOrderItem b = item("B", 1, "40.00");
        SalesOrder order = order("TRADER", PricingFixture.BRANCH_A, b);
        order.setLinkedQuotation("QTN-9");
        service.applyPricing(order, null, List.of());

        assertThat(b.getPriceSource()).isEqualTo("PRICE_LEVEL");
        assertThat(b.getPriceOverridden()).isTrue();
    }

    @Test
    void tierOnASalesOrderCountsBothLinesOfTheProduct() {
        SalesOrderItem one = item("A", 15, "25.00");
        SalesOrderItem two = item("A", 10, "25.00");
        service.applyPricing(order("TRADER", PricingFixture.BRANCH_A, one, two), null, List.of());
        assertThat(one.getPriceOverridden()).isFalse();
        assertThat(two.getPriceOverridden()).isFalse();
        assertThat(one.getTierEligibleQuantity()).isEqualByComparingTo("25");
    }

    private static SalesOrderItem item(String code, int qty, String price) {
        SalesOrderItem it = new SalesOrderItem();
        it.setItemCode(code);
        it.setQuantity(qty);
        it.setPrice(new BigDecimal(price));
        return it;
    }

    private static SalesOrder order(String customer, long branchId, SalesOrderItem... items) {
        SalesOrder o = new SalesOrder();
        o.setCustomerCode(customer);
        o.setOrderDate(PricingFixture.TODAY);
        Branch b = new Branch();
        b.setId(branchId);
        o.setBranch(b);
        o.setItems(new ArrayList<>(List.of(items)));
        return o;
    }
}
