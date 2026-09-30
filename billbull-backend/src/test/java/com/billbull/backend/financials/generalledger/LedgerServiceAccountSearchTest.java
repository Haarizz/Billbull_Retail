package com.billbull.backend.financials.generalledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.chartofaccounts.AccountSearchResponse;
import com.billbull.backend.util.SearchLimit;

/** Chart-of-accounts typeahead search. */
@ExtendWith(MockitoExtension.class)
class LedgerServiceAccountSearchTest {

    @Mock
    private AccountRepository accountRepository;

    @InjectMocks
    private LedgerService ledgerService;

    @Test
    void searchReturnsMatchingAccounts() {
        AccountSearchResponse row = new AccountSearchResponse(
                "acc-1", "1100", "Accounts Receivable", "Asset", "Assets", "active", false);
        when(accountRepository.searchAccounts(eq("receiv"), any(Pageable.class))).thenReturn(List.of(row));

        List<AccountSearchResponse> result = ledgerService.searchAccounts("receiv", 5);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getCode()).isEqualTo("1100");
        assertThat(result.get(0).getName()).isEqualTo("Accounts Receivable");
        assertThat(result.get(0).getAccountType()).isEqualTo("Asset");
    }

    @Test
    void searchMatchesByAccountCode() {
        AccountSearchResponse row = new AccountSearchResponse(
                "acc-2", "4000", "Sales Revenue", "Income", "Income", "active", false);
        when(accountRepository.searchAccounts(eq("4000"), any(Pageable.class))).thenReturn(List.of(row));

        assertThat(ledgerService.searchAccounts("4000", 5))
                .extracting(AccountSearchResponse::getName)
                .containsExactly("Sales Revenue");
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "   " })
    void blankQueryReturnsEmptyWithoutTouchingTheDatabase(String query) {
        assertThat(ledgerService.searchAccounts(query, 5)).isEmpty();
        verifyNoInteractions(accountRepository);
    }

    @Test
    void nullQueryReturnsEmptyWithoutTouchingTheDatabase() {
        assertThat(ledgerService.searchAccounts(null, 5)).isEmpty();
        verifyNoInteractions(accountRepository);
    }

    @Test
    void queryIsTrimmedBeforeItReachesTheDatabase() {
        when(accountRepository.searchAccounts(eq("cash"), any(Pageable.class))).thenReturn(List.of());

        ledgerService.searchAccounts("  cash ", 5);

        verify(accountRepository).searchAccounts(eq("cash"), any(Pageable.class));
    }

    @Test
    void sizeIsCappedServerSide() {
        when(accountRepository.searchAccounts(any(), any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        ledgerService.searchAccounts("cash", 9_999);

        verify(accountRepository).searchAccounts(any(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(SearchLimit.MAX_SIZE);
    }

    @Test
    void nonPositiveSizeFallsBackToTheDefault() {
        when(accountRepository.searchAccounts(any(), any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        ledgerService.searchAccounts("cash", -3);

        verify(accountRepository).searchAccounts(any(), pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(SearchLimit.DEFAULT_SIZE);
    }
    // ── Empty-query preview ───────────────────────────────────────

    @Test
    void previewIsBoundedInTheDatabase() {
        when(accountRepository.previewAccounts(any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        ledgerService.previewAccounts(2);

        verify(accountRepository).previewAccounts(pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(2);
        assertThat(pageable.getValue().getPageNumber()).isZero();
    }

    @Test
    void previewSizeIsCappedServerSide() {
        when(accountRepository.previewAccounts(any(Pageable.class))).thenReturn(List.of());
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);

        ledgerService.previewAccounts(10_000);

        verify(accountRepository).previewAccounts(pageable.capture());
        assertThat(pageable.getValue().getPageSize()).isEqualTo(com.billbull.backend.util.SearchLimit.MAX_SIZE);
    }

    @Test
    void previewNeverFallsBackToTheUnboundedAccountsRead() {
        when(accountRepository.previewAccounts(any(Pageable.class))).thenReturn(List.of());

        ledgerService.previewAccounts(2);

        verify(accountRepository, never()).findAll();
    }
}
