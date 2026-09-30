package com.billbull.backend.financials.generalledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;

import com.billbull.backend.security.ModulePermissionService;

/**
 * The two account-detail endpoints behind the global search details panel.
 *
 * <p>The point of these tests is the authorization gate: both endpoints must run
 * {@code requireCanView("finance.ledger")} <em>before</em> touching the service, so a
 * denied user never reaches a balance or a ledger line.
 */
@ExtendWith(MockitoExtension.class)
class GeneralLedgerControllerAccountDetailTest {

    private static final String MODULE = "finance.ledger";

    @Mock
    private LedgerService ledgerService;

    @Mock
    private ModulePermissionService modulePermissionService;

    @InjectMocks
    private GeneralLedgerController controller;

    @Test
    void summaryRequiresTheLedgerViewPermission() {
        doThrow(new AccessDeniedException("denied")).when(modulePermissionService).requireCanView(MODULE);

        assertThatThrownBy(() -> controller.getAccountSummary("1100"))
                .isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(ledgerService);
    }

    @Test
    void summaryReturnsTheServiceValue() {
        LedgerAccountSummaryResponse summary = new LedgerAccountSummaryResponse();
        summary.setAccountCode("1100");
        when(ledgerService.getAccountSummary("1100")).thenReturn(summary);

        ResponseEntity<LedgerAccountSummaryResponse> response = controller.getAccountSummary("1100");

        verify(modulePermissionService).requireCanView(MODULE);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getAccountCode()).isEqualTo("1100");
    }

    @Test
    void summaryOfAnUnknownAccountIs404RatherThanAnEmptyBody() {
        when(ledgerService.getAccountSummary("0000")).thenReturn(null);

        assertThat(controller.getAccountSummary("0000").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void transactionsRequireTheLedgerViewPermission() {
        doThrow(new AccessDeniedException("denied")).when(modulePermissionService).requireCanView(MODULE);

        assertThatThrownBy(() -> controller.getAccountTransactions("1100", 5))
                .isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(ledgerService);
    }

    @Test
    void transactionsPassTheRequestedSizeThroughToTheService() {
        when(ledgerService.getAccountTransactions(anyString(), anyInt())).thenReturn(List.of());

        controller.getAccountTransactions("1100", 8);

        verify(modulePermissionService).requireCanView(MODULE);
        // Clamping lives in the service (SearchLimit), so the controller forwards verbatim.
        verify(ledgerService).getAccountTransactions("1100", 8);
    }
}
