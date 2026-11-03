package com.billbull.backend.sales.proforma;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.billbull.backend.inventory.product.ProductBarcodeRepository;
import com.billbull.backend.inventory.product.ProductMediaRepository;
import com.billbull.backend.inventory.product.ProductPackingRepository;
import com.billbull.backend.inventory.product.ProductRepository;
import com.billbull.backend.inventory.warehouse.WarehouseStockService;
import com.billbull.backend.sales.pricing.PricingFixture;
import com.billbull.backend.sales.pricing.PricingModels.CarriedPrice;
import com.billbull.backend.sales.pricing.SourceDocumentPrices;
import com.billbull.backend.sales.salesorder.SalesOrderItem;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Pricing Phase 2.1 — a pro-forma create / update re-resolves every line on the server and returns
 * how each line was priced.
 */
class ProformaPricingValidationTest {

    final PricingFixture fx = new PricingFixture();
    final ProformaRepository repo = mock(ProformaRepository.class);
    final BranchAccessService branchAccess = mock(BranchAccessService.class);
    final SourceDocumentPrices sources = mock(SourceDocumentPrices.class);
    ProformaService service;

    @BeforeEach
    void setUp() {
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        service = new ProformaService(repo, mock(ProductRepository.class), mock(ProductBarcodeRepository.class),
                mock(ProductMediaRepository.class), branchAccess,
                new com.billbull.backend.common.ownership.OwnershipAccessService(
                        mock(com.billbull.backend.security.RolePermissionRepository.class), false),
                mock(WarehouseStockService.class), mock(SalesDocumentNumberingService.class),
                mock(ProductPackingRepository.class));
        service.setPricingResolutionService(fx.service);
        service.setSourceDocumentPrices(sources);
        when(sources.forDocuments(any(), any(), any())).thenReturn(List.of());
        Branch branch = new Branch();
        branch.setId(PricingFixture.BRANCH_A);
        when(branchAccess.getRequiredCurrentUserBranch()).thenReturn(branch);
    }

    @Test
    void customerSpecificPriceOnAProforma() {
        ProformaResponse res = service.create(request("ABC", item("A", "5", "25.00")));

        ProformaItemResponse a = res.getItems().get(0);
        assertThat(a.getPriceSource()).isEqualTo("CUSTOMER_SPECIFIC");
        assertThat(a.getPriceOverridden()).isFalse();
        assertThat(a.getCustomerPriceId()).isEqualTo(fx.abcOnA.getId());
        assertThat(res.getPriceLevelName()).isEqualTo("Wholesale");
        assertThat(res.getPriceLevelSource()).isEqualTo("CUSTOMER");
    }

    @Test
    void manipulatedPriceIsKeptAsAManualPrice() {
        ProformaResponse res = service.create(request("ABC", item("A", "5", "1.00")));
        ProformaItemResponse a = res.getItems().get(0);
        assertThat(a.getPrice()).isEqualByComparingTo("1.00");
        assertThat(a.getPriceOverridden()).isTrue();
        assertThat(a.getResolvedUnitPrice()).isEqualByComparingTo("25.00");
    }

    @Test
    void tierPriceOnAProformaInBoxes() {
        // 9 BOX = 108 PCS → TRADER's Wholesale 100+ tier: 23 × 12 = 276 per BOX.
        ProformaItemRequest box = item("A", "9", "276.00");
        box.unit = "BOX";
        ProformaResponse res = service.create(request("TRADER", box));
        ProformaItemResponse a = res.getItems().get(0);
        assertThat(a.getPriceSource()).isEqualTo("QUANTITY_TIER");
        assertThat(a.getPriceOverridden()).isFalse();
        assertThat(a.getTierMinQuantity()).isEqualByComparingTo("100");
        assertThat(a.getTierEligibleQuantity()).isEqualByComparingTo("108");
    }

    @Test
    void explicitLevelOnAProforma() {
        ProformaRequest req = request(null, item("B", "1", "45.00"));
        req.priceLevelId = fx.wholesale.getId();
        ProformaResponse res = service.create(req);
        assertThat(res.getItems().get(0).getPriceOverridden()).isFalse();
        assertThat(res.getPriceLevelSource()).isEqualTo("TRANSACTION");
    }

    @Test
    void lineFromItsSalesOrderKeepsTheOrdersPrice() {
        SalesOrderItem ordered = new SalesOrderItem();
        ordered.setItemCode("B");
        ordered.setQuantity(2);
        ordered.setPrice(new BigDecimal("41.00"));
        when(sources.forDocuments(any(), any(), any())).thenReturn(List.of(CarriedPrice.of(ordered)));

        ProformaRequest req = request("TRADER", item("B", "2", "41.00"));
        req.salesOrderNo = "SO-5";
        ProformaItemResponse b = service.create(req).getItems().get(0);

        assertThat(b.getPriceSource()).isEqualTo("SOURCE_DOCUMENT");
        assertThat(b.getPriceOverridden()).isFalse();
        assertThat(b.getResolvedUnitPrice()).isEqualByComparingTo("41.00");
    }

    @Test
    void updateKeepsTheRecordOfUnchangedLines() {
        ProformaInvoice saved = new ProformaInvoice();
        saved.setId(5L);
        saved.setCustomerCode("ABC");
        Branch branch = new Branch();
        branch.setId(PricingFixture.BRANCH_A);
        saved.setBranch(branch);
        ProformaInvoiceItem line = new ProformaInvoiceItem();
        line.setItemCode("A");
        line.setQuantity(new BigDecimal("5"));
        line.setPrice(new BigDecimal("25.00"));
        line.setPriceSource("CUSTOMER_SPECIFIC");
        line.setCustomerPriceId(fx.abcOnA.getId());
        line.setPriceOverridden(false);
        line.setResolvedUnitPrice(new BigDecimal("25.00"));
        saved.setItems(new ArrayList<>(List.of(line)));
        when(repo.findById(5L)).thenReturn(Optional.of(saved));

        // The negotiated price has since been withdrawn; the unchanged line keeps its record.
        fx.abcOnA.setEnabled(false);
        ProformaResponse res = service.update(5L, request("ABC", item("A", "5", "25.00")));

        ProformaItemResponse a = res.getItems().get(0);
        assertThat(a.getPriceSource()).isEqualTo("CUSTOMER_SPECIFIC");
        assertThat(a.getPriceOverridden()).isFalse();
        assertThat(a.getCustomerPriceId()).isEqualTo(fx.abcOnA.getId());
    }

    private static ProformaItemRequest item(String code, String qty, String price) {
        ProformaItemRequest i = new ProformaItemRequest();
        i.itemCode = code;
        i.quantity = new BigDecimal(qty);
        i.price = new BigDecimal(price);
        i.taxPercent = BigDecimal.ZERO;
        i.discountPercent = BigDecimal.ZERO;
        return i;
    }

    private static ProformaRequest request(String customer, ProformaItemRequest... items) {
        ProformaRequest r = new ProformaRequest();
        r.customerCode = customer;
        r.piDate = PricingFixture.TODAY;
        r.items = List.of(items);
        return r;
    }
}
