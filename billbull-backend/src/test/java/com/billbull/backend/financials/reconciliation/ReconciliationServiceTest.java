package com.billbull.backend.financials.reconciliation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.financials.generalledger.LedgerEntry;
import com.billbull.backend.financials.generalledger.LedgerEntryRepository;
import com.billbull.backend.settings.branch.BranchAccessService;

@ExtendWith(MockitoExtension.class)
class ReconciliationServiceTest {

    @Mock
    private ReconciliationSessionRepository sessionRepository;

    @Mock
    private LedgerEntryRepository ledgerEntryRepository;

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private BranchAccessService branchAccessService;

    private ReconciliationService service;

    @BeforeEach
    void setUp() {
        service = new ReconciliationService(sessionRepository, ledgerEntryRepository, accountRepository, branchAccessService);
    }

    @Test
    void finalizeReconciliationRejectsCashAccount() {
        ReconciliationRequest request = request("SYS-1101");
        when(accountRepository.findById("SYS-1101")).thenReturn(Optional.of(account(
                "SYS-1101", "1101", "Cash on Hand", "Assets", "Asset", false, "active")));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.finalizeReconciliation(request));

        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
        verifyNoInteractions(sessionRepository);
    }

    @Test
    void finalizeReconciliationPersistsOnlyForBankAccount() {
        ReconciliationRequest request = request("SYS-1102");
        Account bankAccount = account("SYS-1102", "1102", "Bank Account", "Assets", "Asset", false, "active");

        when(accountRepository.findById("SYS-1102")).thenReturn(Optional.of(bankAccount));
        when(sessionRepository.save(any(ReconciliationSession.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.finalizeReconciliation(request);

        ArgumentCaptor<ReconciliationSession> sessionCaptor = ArgumentCaptor.forClass(ReconciliationSession.class);
        verify(sessionRepository).save(sessionCaptor.capture());
        assertEquals("SYS-1102", sessionCaptor.getValue().getBankAccountId());
        assertEquals(LocalDate.of(2026, 5, 21), sessionCaptor.getValue().getStatementDate());
        assertEquals(new BigDecimal("2500.00"), sessionCaptor.getValue().getStatementBalance());
    }

    @Test
    void finalizeReconciliationRejectsEntriesFromAnotherAccount() {
        ReconciliationRequest request = request("SYS-1102");
        request.setLedgerEntryIds(List.of("L-1"));
        Account bankAccount = account("SYS-1102", "1102", "Bank Account", "Assets", "Asset", false, "active");
        LedgerEntry receivableEntry = new LedgerEntry();
        receivableEntry.setId("L-1");
        receivableEntry.setAccountCode("1110");
        receivableEntry.setAccountName("Accounts Receivable");

        when(accountRepository.findById("SYS-1102")).thenReturn(Optional.of(bankAccount));
        when(sessionRepository.save(any(ReconciliationSession.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(ledgerEntryRepository.findAllById(List.of("L-1"))).thenReturn(List.of(receivableEntry));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.finalizeReconciliation(request));

        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
        verify(ledgerEntryRepository, never()).saveAll(any());
    }

    private ReconciliationRequest request(String bankAccountId) {
        ReconciliationRequest request = new ReconciliationRequest();
        request.setBankAccountId(bankAccountId);
        request.setStatementDate(LocalDate.of(2026, 5, 21));
        request.setStatementBalance(new BigDecimal("2500.00"));
        return request;
    }

    private Account account(String id, String code, String name, String accountGroup, String accountType,
            boolean isGroup, String status) {
        Account account = new Account();
        account.setId(id);
        account.setCode(code);
        account.setName(name);
        account.setAccountGroup(accountGroup);
        account.setAccountType(accountType);
        account.setIsGroup(isGroup);
        account.setStatus(status);
        return account;
    }
}
