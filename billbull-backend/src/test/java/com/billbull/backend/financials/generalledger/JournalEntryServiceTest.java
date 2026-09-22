package com.billbull.backend.financials.generalledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.common.ownership.OwnershipAccessService;
import com.billbull.backend.financials.period.AccountingPeriodService;
import com.billbull.backend.financials.audit.FinancialAuditService;

@ExtendWith(MockitoExtension.class)
class JournalEntryServiceTest {

    @Mock
    private JournalEntryRepository journalEntryRepo;

    @Mock
    private LedgerService ledgerService;

    @Mock
    private OwnershipAccessService ownershipAccessService;

    @Mock
    private AccountingPeriodService periodService;

    @Mock
    private FinancialAuditService auditService;

    @Mock
    private LedgerEntryRepository ledgerEntryRepository; // Assuming it exists if needed, or LedgerService does it

    @InjectMocks
    private JournalEntryService journalEntryService;

    @Captor
    private ArgumentCaptor<LedgerEntry> ledgerEntryCaptor;

    @BeforeEach
    void setUp() {
        // JournalEntryService requires historyService, userService, etc. for full context, but we are testing postEntry
    }

    @Test
    void postEntryPropagatesBranchToLedgerEntries() {
        // Arrange
        Branch branch = new Branch();
        branch.setId(99L);
        branch.setCode("BR-01");

        JournalEntry entry = new JournalEntry();
        entry.setId(100L);
        entry.setEntryNumber("JV-001");
        entry.setDate(LocalDate.now());
        entry.setBranch(branch);
        entry.setStatus(JournalEntry.STATUS_APPROVED);

        JournalLine line1 = new JournalLine();
        line1.setAccountCode("1000");
        line1.setDebit(new BigDecimal("100.00"));
        line1.setCredit(BigDecimal.ZERO);

        JournalLine line2 = new JournalLine();
        line2.setAccountCode("2000");
        line2.setDebit(BigDecimal.ZERO);
        line2.setCredit(new BigDecimal("100.00"));

        List<JournalLine> lines = new ArrayList<>();
        lines.add(line1);
        lines.add(line2);
        entry.setLines(lines);

        when(journalEntryRepo.findByIdWithLinesAndBranch(100L)).thenReturn(Optional.of(entry));
        when(journalEntryRepo.save(any(JournalEntry.class))).thenReturn(entry);

        // Act
        journalEntryService.postEntry(100L, "test_user");

        // Assert
        verify(ledgerService, times(2)).recordTransaction(ledgerEntryCaptor.capture());
        
        List<LedgerEntry> ledgerEntries = ledgerEntryCaptor.getAllValues();
        assertEquals(2, ledgerEntries.size());

        for (LedgerEntry le : ledgerEntries) {
            assertNotNull(le.getBranch(), "Branch should be propagated to LedgerEntry");
            assertEquals(99L, le.getBranch().getId());
            assertEquals("JV-001", le.getVoucherNo());
            assertEquals("100", le.getJournalId());
        }

        LedgerEntry debitEntry = ledgerEntries.get(0);
        assertEquals("1000", debitEntry.getAccountCode());
        assertEquals(new BigDecimal("100.00"), debitEntry.getDebitAmount());
        assertEquals(BigDecimal.ZERO, debitEntry.getCreditAmount());

        LedgerEntry creditEntry = ledgerEntries.get(1);
        assertEquals("2000", creditEntry.getAccountCode());
        assertEquals(BigDecimal.ZERO, creditEntry.getDebitAmount());
        assertEquals(new BigDecimal("100.00"), creditEntry.getCreditAmount());
    }

    @Test
    void submitRejectsJournalVoucherWithoutLines() {
        JournalVoucher jv = draftVoucher(new ArrayList<>());
        when(journalEntryRepo.findByIdWithLinesAndBranch(200L)).thenReturn(Optional.of(jv));

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> journalEntryService.submitForApproval(200L, "test_user"));
        assertTrue(ex.getMessage().contains("at least two lines"));
        verify(journalEntryRepo, never()).save(any(JournalEntry.class));
    }

    @Test
    void submitRejectsJournalVoucherLineWithoutAccount() {
        JournalLine debit = line("1000", "100.00", "0");
        JournalLine noAccount = line(null, "0", "100.00");
        JournalVoucher jv = draftVoucher(new ArrayList<>(List.of(debit, noAccount)));
        when(journalEntryRepo.findByIdWithLinesAndBranch(200L)).thenReturn(Optional.of(jv));

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> journalEntryService.submitForApproval(200L, "test_user"));
        assertTrue(ex.getMessage().startsWith("Line 2"));
    }

    private JournalVoucher draftVoucher(List<JournalLine> lines) {
        JournalVoucher jv = new JournalVoucher();
        jv.setId(200L);
        jv.setEntryNumber("JE-000200");
        jv.setDate(LocalDate.now());
        jv.setStatus(JournalEntry.STATUS_DRAFT);
        jv.setLines(lines);
        return jv;
    }

    private JournalLine line(String accountCode, String debit, String credit) {
        JournalLine line = new JournalLine();
        line.setAccountCode(accountCode);
        line.setDebit(new BigDecimal(debit));
        line.setCredit(new BigDecimal(credit));
        return line;
    }
}
