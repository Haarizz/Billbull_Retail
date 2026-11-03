package com.billbull.backend.sales.quotation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.billbull.backend.sales.pricing.PricingException;
import com.billbull.backend.sales.pricing.PricingFixture;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Pricing Phase 2.1 — a quotation save re-resolves every line on the server (trusted branch,
 * customer, quotation date) through the shared resolver, exactly as the Sales Invoice save does.
 */
class QuotationPricingValidationTest {

    final PricingFixture fx = new PricingFixture();
    final QuotationRepository repo = mock(QuotationRepository.class);
    final BranchAccessService branchAccess = mock(BranchAccessService.class);
    final com.billbull.backend.sales.settings.SalesDocumentNumberingService numbering =
            mock(com.billbull.backend.sales.settings.SalesDocumentNumberingService.class);
    QuotationService service;

    @BeforeEach
    void setUp() {
        service = new QuotationService(
                repo,
                new com.fasterxml.jackson.databind.ObjectMapper(),
                mock(com.billbull.backend.inventory.product.ProductRepository.class),
                mock(com.billbull.backend.inventory.product.ProductPricingRepository.class),
                mock(com.billbull.backend.inventory.product.ProductTaxRepository.class),
                mock(com.billbull.backend.inventory.product.ProductInventoryPolicyRepository.class),
                mock(com.billbull.backend.purchase.stockmovement.StockMovementRepository.class),
                mock(com.billbull.backend.sales.salesorder.SalesOrderRepository.class),
                mock(com.billbull.backend.sales.invoice.SalesInvoiceRepository.class),
                mock(com.billbull.backend.inventory.product.ProductPackingRepository.class),
                mock(com.billbull.backend.inventory.product.ProductMediaRepository.class),
                mock(com.billbull.backend.inventory.product.ProductBarcodeRepository.class),
                mock(com.billbull.backend.customer.inquiries.CustomerInquiryRepository.class),
                mock(com.billbull.backend.customer.inquiries.InquiryFollowUpRepository.class),
                mock(com.billbull.backend.sales.settings.SalesSettingsService.class),
                numbering,
                branchAccess,
                new com.billbull.backend.common.ownership.OwnershipAccessService(
                        mock(com.billbull.backend.security.RolePermissionRepository.class), false));
        service.setPricingResolutionService(fx.service);
        Branch branch = new Branch();
        branch.setId(PricingFixture.BRANCH_A);
        when(branchAccess.getRequiredCurrentUserBranch()).thenReturn(branch);
        when(numbering.resolveNumberForCreate(any(), any())).thenReturn("QTN-1");
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(repo.findById(any())).thenReturn(Optional.empty());
    }

    @Test
    void validCustomerSpecificPriceIsRecordedAsSuch() {
        QuotationItem a = item("A", "5", "25.00");
        Quotation saved = service.createOrUpdateQuotation(quotation("ABC", a));

        assertThat(a.getPriceSource()).isEqualTo("CUSTOMER_SPECIFIC");
        assertThat(a.getPriceOverridden()).isFalse();
        assertThat(a.getCustomerPriceId()).isEqualTo(fx.abcOnA.getId());
        assertThat(a.getResolvedUnitPrice()).isEqualByComparingTo("25.00");
        assertThat(saved.getPriceLevelName()).isEqualTo("Wholesale");
        assertThat(saved.getPriceLevelSource()).isEqualTo("CUSTOMER");
    }

    @Test
    void manipulatedClientPriceAndPricingClaimsAreNotTrusted() {
        // The client claims a negotiated price it doesn't have and a mapping id of its choosing.
        QuotationItem b = item("B", "1", "20.00");
        b.setPriceSource("CUSTOMER_SPECIFIC");
        b.setCustomerPriceId(9999L);
        b.setPriceOverridden(false);
        b.setResolvedUnitPrice(new BigDecimal("20.00"));

        service.createOrUpdateQuotation(quotation("ABC", b));

        assertThat(b.getPrice()).isEqualByComparingTo("20.00");
        assertThat(b.getPriceOverridden()).isTrue();
        assertThat(b.getPriceSource()).isEqualTo("PRICE_LEVEL");
        assertThat(b.getResolvedUnitPrice()).isEqualByComparingTo("45.00");
        assertThat(b.getCustomerPriceId()).isNull();
    }

    @Test
    void missingPriceIsFilledWithTheResolvedPrice() {
        QuotationItem a = item("A", "120", null);
        service.createOrUpdateQuotation(quotation("TRADER", a));
        assertThat(a.getPrice()).isEqualByComparingTo("23.00");
        assertThat(a.getPriceSource()).isEqualTo("QUANTITY_TIER");
        assertThat(a.getTierMinQuantity()).isEqualByComparingTo("100");
        assertThat(a.getLineTotal()).isNotNull();
    }

    @Test
    void explicitTransactionLevelIsHonouredForAWalkIn() {
        QuotationItem b = item("B", "1", "45.00");
        Quotation q = quotation(null, b);
        q.setPriceLevelId(fx.wholesale.getId());

        Quotation saved = service.createOrUpdateQuotation(q);

        assertThat(b.getPriceOverridden()).isFalse();
        assertThat(saved.getPriceLevelSource()).isEqualTo("TRANSACTION");
    }

    @Test
    void inactiveExplicitLevelIsRefused() {
        fx.wholesale.setActive(false);
        Quotation q = quotation(null, item("B", "1", "45.00"));
        q.setPriceLevelId(fx.wholesale.getId());
        assertThatThrownBy(() -> service.createOrUpdateQuotation(q)).isInstanceOf(PricingException.class);
    }

    @Test
    void editingAQuotationKeepsTheAgreedPriceAfterTheNegotiatedPriceChanged() {
        QuotationItem original = item("A", "5", "25.00");
        Quotation first = quotation("ABC", original);
        service.createOrUpdateQuotation(first);
        first.setId(77L);
        when(repo.findById(77L)).thenReturn(Optional.of(first));

        // ABC's negotiated price is renegotiated to 24; the quotation is re-saved unchanged.
        fx.abcOnA.setPrice(new BigDecimal("24.00"));
        QuotationItem resent = item("A", "5", "25.00");
        Quotation edit = quotation("ABC", resent);
        edit.setId(77L);
        service.createOrUpdateQuotation(edit);

        assertThat(resent.getPrice()).isEqualByComparingTo("25.00");
        assertThat(resent.getPriceOverridden()).isFalse();
        assertThat(resent.getPriceSource()).isEqualTo("CUSTOMER_SPECIFIC");
        assertThat(resent.getResolvedUnitPrice()).isEqualByComparingTo("25.00");
    }

    private static QuotationItem item(String code, String qty, String price) {
        QuotationItem it = new QuotationItem();
        it.setItemCode(code);
        it.setQuantity(new BigDecimal(qty));
        it.setPrice(price != null ? new BigDecimal(price) : null);
        return it;
    }

    private static Quotation quotation(String customerCode, QuotationItem... items) {
        Quotation q = new Quotation();
        q.setCustomerCode(customerCode);
        q.setDate(PricingFixture.TODAY);
        q.setItems(new ArrayList<>(List.of(items)));
        return q;
    }
}
