package com.billbull.backend.sales.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.sales.pricing.PricingModels.Context;
import com.billbull.backend.sales.pricing.PricingModels.Resolution;
import com.billbull.backend.sales.settings.SalesItemPricePolicy;
import com.billbull.backend.sales.settings.SalesSettings;
import com.billbull.backend.sales.settings.SalesSettingsService;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Pricing Phase 1 — the price-level APIs are gated by existing RBAC modules, and the resolve API
 * prices on a branch it derives itself (the POS session's, or the caller's current branch).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PricingControllersAuthorizationTest {

    @Mock PriceLevelService levelService;
    @Mock ProductLevelPriceService priceService;
    @Mock ModulePermissionService permissions;
    @Mock PricingResolutionService resolver;
    @Mock BranchAccessService branchAccessService;
    @Mock PosSessionService sessionService;
    @Mock SalesSettingsService salesSettingsService;
    @Mock ProductQuantityTierService tierService;

    PriceLevelController levels;
    PricingController pricing;

    @BeforeEach
    void setUp() {
        levels = new PriceLevelController(levelService, priceService, permissions);
        levels.setTierService(tierService);
        pricing = new PricingController(resolver, permissions, branchAccessService, sessionService, salesSettingsService);
        when(resolver.resolve(any(), anyList())).thenReturn(new Resolution(null, null, List.of()));
    }

    @AfterEach
    void clear() {
        BranchContextHolder.clear();
    }

    @Test
    void managingLevelsNeedsSalesSettingsEdit() {
        doThrow(new AccessDeniedException("no")).when(permissions).requireCanEdit("sales.settings");

        assertThatThrownBy(() -> levels.create(new PriceLevelService.PriceLevelRequest()))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> levels.update(1L, new PriceLevelService.PriceLevelRequest()))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> levels.setActive(1L, false)).isInstanceOf(AccessDeniedException.class);
        verify(levelService, never()).create(any());
        verify(levelService, never()).setActive(any(), anyBoolean());
    }

    @Test
    void editingProductLevelPricesNeedsProductEdit() {
        doThrow(new AccessDeniedException("no")).when(permissions).requireCanEdit("inventory.product");

        assertThatThrownBy(() -> levels.upsertProductPrices(List.of())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> levels.replaceProductPrices(10L, List.of())).isInstanceOf(AccessDeniedException.class);
        verify(priceService, never()).upsert(any());
    }

    @Test
    void listingLevelsIsOpenToEverySellingScreen() {
        levels.list(false);
        verify(permissions).requireCanViewAny(PriceLevelController.LIST_MODULES);
        assertThat(PriceLevelController.LIST_MODULES).contains("sales.pos", "sales.invoice", "sales.customer");
    }

    @Test
    void resolvingNeedsASellingModule() {
        doThrow(new AccessDeniedException("no")).when(permissions).requireCanViewAny(PricingController.SELLING_MODULES);
        assertThatThrownBy(() -> pricing.resolve(new PricingController.ResolveRequest()))
                .isInstanceOf(AccessDeniedException.class);
        verify(resolver, never()).resolve(any(), anyList());
    }

    @Test
    void posResolutionPricesOnTheSessionsBranchAtRetail() {
        PosSession session = new PosSession();
        session.setBranchId(7L);
        when(sessionService.getById(55L)).thenReturn(session);
        BranchContextHolder.set(new BranchContextHolder.BranchContext(7L, Set.of(7L), false));
        PricingController.ResolveRequest req = new PricingController.ResolveRequest();
        req.setChannel("POS");
        req.setSessionId(55L);
        req.setPriceLevelId(3L);

        pricing.resolve(req);

        ArgumentCaptor<Context> ctx = ArgumentCaptor.forClass(Context.class);
        verify(resolver).resolve(ctx.capture(), anyList());
        assertThat(ctx.getValue().branchId()).isEqualTo(7L);
        assertThat(ctx.getValue().explicitPriceLevelId()).isEqualTo(3L);
        assertThat(ctx.getValue().basePolicy()).isEqualTo(SalesItemPricePolicy.RETAIL);
    }

    @Test
    void anotherBranchsSessionIsRefused() {
        PosSession session = new PosSession();
        session.setBranchId(9L);
        when(sessionService.getById(55L)).thenReturn(session);
        BranchContextHolder.set(new BranchContextHolder.BranchContext(7L, Set.of(7L), false));
        PricingController.ResolveRequest req = new PricingController.ResolveRequest();
        req.setSessionId(55L);

        assertThatThrownBy(() -> pricing.resolve(req)).isInstanceOf(ResponseStatusException.class);
        verify(resolver, never()).resolve(any(), anyList());
    }

    @Test
    void backOfficeResolutionUsesTheActiveBranchAndSalesSettingsPolicy() {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(4L, Set.of(4L), false));
        SalesSettings settings = new SalesSettings();
        settings.setSalesItemPricePolicy(SalesItemPricePolicy.MAX_SALE);
        when(salesSettingsService.getSettings()).thenReturn(settings);

        pricing.resolve(new PricingController.ResolveRequest());

        ArgumentCaptor<Context> ctx = ArgumentCaptor.forClass(Context.class);
        verify(resolver).resolve(ctx.capture(), anyList());
        assertThat(ctx.getValue().branchId()).isEqualTo(4L);
        assertThat(ctx.getValue().basePolicy()).isEqualTo(SalesItemPricePolicy.MAX_SALE);
    }

    @Test
    void oversizedRequestsAreRefused() {
        PricingController.ResolveRequest req = new PricingController.ResolveRequest();
        req.setItems(java.util.Collections.nCopies(501, new PricingController.ResolveLine()));
        assertThatThrownBy(() -> pricing.resolve(req)).isInstanceOf(PricingException.class);
    }

    @Test
    void editingQuantityTiersNeedsProductEdit() {
        doThrow(new AccessDeniedException("no")).when(permissions).requireCanEdit("inventory.product");

        assertThatThrownBy(() -> levels.createQuantityTier(new ProductQuantityTierService.TierRequest()))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> levels.updateQuantityTier(1L, new ProductQuantityTierService.TierRequest()))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> levels.setQuantityTierActive(1L, false, null))
                .isInstanceOf(AccessDeniedException.class);
        verify(tierService, never()).create(any());
        verify(tierService, never()).update(any(), any());
        verify(tierService, never()).setActive(any(), anyBoolean(), any());
    }

    @Test
    void readingQuantityTiersNeedsProductOrSettingsView() {
        doThrow(new AccessDeniedException("no")).when(permissions).requireCanViewAny("inventory.product", "sales.settings");
        assertThatThrownBy(() -> levels.quantityTiers("10", false)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> levels.tieredProducts(null, null, 0, 25)).isInstanceOf(AccessDeniedException.class);
        verify(tierService, never()).listForProducts(any(), anyBoolean());
    }
}
