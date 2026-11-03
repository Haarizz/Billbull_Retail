package com.billbull.backend.sales.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

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

import com.billbull.backend.sales.pricing.CustomerProductPriceService.PriceRequest;
import com.billbull.backend.sales.settings.SalesSettingsService;
import com.billbull.backend.security.BranchContextHolder;
import com.billbull.backend.security.ModulePermissionService;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * Pricing Phase 2 — negotiated-price APIs are gated by the existing {@code sales.customer} module
 * (edit to manage, delete to remove, view to read), and the effective-price lookup never prices on
 * a branch the caller can't access.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CustomerProductPriceControllerAuthorizationTest {

    @Mock CustomerProductPriceService service;
    @Mock ModulePermissionService permissions;
    @Mock BranchAccessService branchAccessService;
    @Mock SalesSettingsService salesSettingsService;

    CustomerProductPriceController controller;

    @BeforeEach
    void setUp() {
        controller = new CustomerProductPriceController(service, permissions, branchAccessService, salesSettingsService);
    }

    @AfterEach
    void clear() {
        BranchContextHolder.clear();
    }

    @Test
    void managingNegotiatedPricesNeedsCustomerEdit() {
        doThrow(new AccessDeniedException("no")).when(permissions).requireCanEdit("sales.customer");

        assertThatThrownBy(() -> controller.create(new PriceRequest())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.update(1L, new PriceRequest())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.setEnabled(1L, false)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.discontinue(1L)).isInstanceOf(AccessDeniedException.class);
        verify(service, never()).create(any());
        verify(service, never()).update(anyLong(), any());
        verify(service, never()).setEnabled(anyLong(), anyBoolean());
        verify(service, never()).discontinue(anyLong());
    }

    @Test
    void removingNeedsCustomerDelete() {
        doThrow(new AccessDeniedException("no")).when(permissions).requireCanDelete("sales.customer");

        assertThatThrownBy(() -> controller.delete(1L)).isInstanceOf(AccessDeniedException.class);
        verify(service, never()).delete(anyLong());
    }

    @Test
    void readingNeedsCustomerOrSalesSettingsView() {
        doThrow(new AccessDeniedException("no")).when(permissions).requireCanViewAny("sales.customer", "sales.settings");

        assertThatThrownBy(() -> controller.list(null, null, false, 0, 25)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.forCustomer(1L, null, false, 0, 25)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.get(1L)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.effective(1L, "10", null, null)).isInstanceOf(AccessDeniedException.class);
        verify(service, never()).search(any(), any(), anyBoolean(), anyInt(), anyInt());
    }

    @Test
    void effectivePriceForAnotherBranchIsRefused() {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(1L, Set.of(1L), false));

        assertThatThrownBy(() -> controller.effective(501L, "10", 2L, null))
                .isInstanceOf(ResponseStatusException.class);
        verify(service, never()).effective(any(), any(), any(), any(), any());
    }

    @Test
    void effectivePriceDefaultsToTheCallersCurrentBranch() {
        BranchContextHolder.set(new BranchContextHolder.BranchContext(1L, Set.of(1L), false));

        controller.effective(501L, "10, 11,10", null, null);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Long>> ids = ArgumentCaptor.forClass(List.class);
        verify(service).effective(eq(501L), ids.capture(), eq(1L), any(), any());
        assertThat(ids.getValue()).containsExactly(10L, 11L);
    }
}
