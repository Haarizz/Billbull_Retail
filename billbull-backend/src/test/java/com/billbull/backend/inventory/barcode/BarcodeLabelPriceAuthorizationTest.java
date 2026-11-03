package com.billbull.backend.inventory.barcode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.inventory.scope.InventoryBranchScopeResolver;
import com.billbull.backend.security.ModulePermissionService;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Pricing Phase 4 — who may read label prices, and what a template may store as its source. */
class BarcodeLabelPriceAuthorizationTest {

    final BarcodeTemplateService templates = new BarcodeTemplateService(
            mock(BarcodeTemplateRepository.class), new ObjectMapper(), mock(InventoryBranchScopeResolver.class));
    final ModulePermissionService permissions = mock(ModulePermissionService.class);
    final BarcodeLabelPriceService prices = mock(BarcodeLabelPriceService.class);
    final BarcodeTemplateController controller = new BarcodeTemplateController(templates, permissions, prices);

    @Test
    void labelPricesNeedBarcodeViewAccess() {
        doThrow(new AccessDeniedException("no")).when(permissions).requireCanView("inventory.barcode");

        assertThatThrownBy(() -> controller.labelPrices(new LabelPriceModels.Request()))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(controller::priceSources).isInstanceOf(AccessDeniedException.class);
        verify(prices, never()).resolve(any());
    }

    @Test
    void customerPricesAlsoNeedCustomerPriceViewAccess() {
        doThrow(new AccessDeniedException("no")).when(permissions)
                .requireCanViewAny(BarcodeTemplateController.CUSTOMER_PRICE_MODULES);
        LabelPriceModels.Request customer = new LabelPriceModels.Request();
        customer.setSource("CUSTOMER");
        LabelPriceModels.Request shelf = new LabelPriceModels.Request();
        shelf.setSource("LEVEL:2");

        assertThatThrownBy(() -> controller.labelPrices(customer)).isInstanceOf(AccessDeniedException.class);
        assertThatCode(() -> controller.labelPrices(shelf)).doesNotThrowAnyException();
    }

    @Test
    void aTemplateMayStoreOnlyAKnownPriceSource() {
        assertThatCode(() -> templates.validatePriceSource("{\"price\":true}")).doesNotThrowAnyException();
        assertThatCode(() -> templates.validatePriceSource("{\"_priceSource\":\"LEVEL:7\"}")).doesNotThrowAnyException();
        assertThatCode(() -> templates.validatePriceSource("{\"_priceSource\":\"FIELD:MAX\"}")).doesNotThrowAnyException();
        assertThatCode(() -> templates.validatePriceSource("not json")).doesNotThrowAnyException();
        assertThatThrownBy(() -> templates.validatePriceSource("{\"_priceSource\":\"FIELD:COST\"}"))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> templates.validatePriceSource("{\"_priceSource\":\"LEVEL:abc\"}"))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(LabelPriceSource.parse(null)).isEqualTo(LabelPriceSource.DEFAULT);
    }
}
