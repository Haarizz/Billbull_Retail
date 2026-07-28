package com.billbull.backend.pos.session;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
import com.billbull.backend.util.PageResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link PosCashMovementService} — the Cash Drop / Outs Management back-office
 * module. Covers: limited editing (description/reference only), void (status flag + GL
 * reversal, never delete), the closed-business-day read-only boundary, and list filtering.
 * Create is delegated to {@link PosSessionService#addCashMovement}; its own guards (session
 * must be OPEN, ACTIVE filtering of reconciliation totals) are covered by
 * {@link PosSessionServiceTest}.
 */
@ExtendWith(MockitoExtension.class)
class PosCashMovementServiceTest {

    @Mock private PosCashMovementRepository repo;
    @Mock private PosSessionService posSessionService;
    @Mock private PostingEngineService postingEngine;
    @Mock private BranchRepository branchRepository;
    @Mock private PosAuditService auditService;
    @Mock private ObjectMapper objectMapper;

    private PosCashMovementService service;

    @BeforeEach
    void setUp() {
        service = new PosCashMovementService(repo, posSessionService, postingEngine,
                branchRepository, auditService, objectMapper);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("supervisor1", null, List.of()));
        lenient().when(repo.save(any(PosCashMovement.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private PosSession openSessionForDay(boolean dayClosed) {
        PosSession s = new PosSession();
        s.setId(1L);
        s.setBranchId(7L);
        s.setTerminalId("T1");
        s.setCounterName("Main Counter");
        s.setStatus(PosSessionStatus.OPEN);
        s.setSessionDate(LocalDate.now());
        if (dayClosed) s.setDayCloseId(99L);
        return s;
    }

    private PosCashMovement activeMovement(PosSession session, PosCashMovementType type, BigDecimal amount) {
        PosCashMovement m = new PosCashMovement();
        m.setId(10L);
        m.setPosSession(session);
        m.setMovementType(type);
        m.setAmount(amount);
        m.setDescription("Original description");
        m.setReference("REF-1");
        m.setPerformedBy("cashierA");
        m.setPerformedAt(LocalDateTime.now());
        m.setStatus(PosCashMovementStatus.ACTIVE);
        m.setBranchId(session.getBranchId());
        m.setEditCount(0);
        return m;
    }

    // ---------------------------------------------------------------------
    // edit()
    // ---------------------------------------------------------------------

    @Test
    void editUpdatesDescriptionAndReferenceAndSnapshotsOriginalsOnFirstEdit() {
        PosSession session = openSessionForDay(false);
        PosCashMovement m = activeMovement(session, PosCashMovementType.DROP_IN, new BigDecimal("50"));
        when(repo.findById(10L)).thenReturn(Optional.of(m));

        PosCashMovementResponse result = service.edit(10L, "Corrected description", "REF-2");

        assertEquals("Corrected description", result.getDescription());
        assertEquals("REF-2", result.getReference());
        assertEquals("Original description", result.getOriginalDescription());
        assertEquals("REF-1", result.getOriginalReference());
        assertEquals(1, result.getEditCount());
        assertEquals("supervisor1", result.getEditedBy());
        assertNotNull(result.getEditedAt());
        // Amount/type/session must never change via edit.
        assertEquals(new BigDecimal("50"), m.getAmount());
        assertEquals(PosCashMovementType.DROP_IN, m.getMovementType());
        verify(auditService).logCashMovementEdited(eq(1L), eq("T1"), eq(7L), eq(10L), any(), any());
    }

    @Test
    void secondEditDoesNotOverwriteOriginalSnapshot() {
        PosSession session = openSessionForDay(false);
        PosCashMovement m = activeMovement(session, PosCashMovementType.DROP_IN, new BigDecimal("50"));
        m.setEditCount(1);
        m.setOriginalDescription("Original description");
        m.setOriginalReference("REF-1");
        m.setDescription("First correction");
        when(repo.findById(10L)).thenReturn(Optional.of(m));

        PosCashMovementResponse result = service.edit(10L, "Second correction", "REF-3");

        assertEquals("Second correction", result.getDescription());
        assertEquals("Original description", result.getOriginalDescription()); // unchanged
        assertEquals(2, result.getEditCount());
    }

    @Test
    void editRejectsVoidedMovement() {
        PosSession session = openSessionForDay(false);
        PosCashMovement m = activeMovement(session, PosCashMovementType.DROP_IN, new BigDecimal("50"));
        m.setStatus(PosCashMovementStatus.VOIDED);
        when(repo.findById(10L)).thenReturn(Optional.of(m));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.edit(10L, "new", "new-ref"));
        assertTrue(ex.getReason().toLowerCase().contains("voided"));
        verify(repo, never()).save(any());
    }

    @Test
    void editRejectsWhenBusinessDayIsClosed() {
        PosSession session = openSessionForDay(true);
        PosCashMovement m = activeMovement(session, PosCashMovementType.DROP_IN, new BigDecimal("50"));
        when(repo.findById(10L)).thenReturn(Optional.of(m));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.edit(10L, "new", "new-ref"));
        assertTrue(ex.getReason().toLowerCase().contains("closed business day"));
        verify(repo, never()).save(any());
    }

    // ---------------------------------------------------------------------
    // voidMovement()
    // ---------------------------------------------------------------------

    @Test
    void voidRequiresNonBlankReason() {
        assertThrows(ResponseStatusException.class, () -> service.voidMovement(10L, ""));
        assertThrows(ResponseStatusException.class, () -> service.voidMovement(10L, null));
        verifyNoInteractions(repo);
    }

    @Test
    void voidSetsStatusAndPreservesOriginalRowAndReversesGlJournal() {
        PosSession session = openSessionForDay(false);
        PosCashMovement m = activeMovement(session, PosCashMovementType.DROP_OUT, new BigDecimal("75"));
        when(repo.findById(10L)).thenReturn(Optional.of(m));
        when(branchRepository.findById(7L)).thenReturn(Optional.of(branch(7L)));

        PosCashMovementResponse result = service.voidMovement(10L, "Cashier miscounted the drop");

        assertEquals(PosCashMovementStatus.VOIDED, result.getStatus());
        assertEquals("Cashier miscounted the drop", result.getVoidReason());
        assertEquals("supervisor1", result.getVoidedBy());
        assertNotNull(result.getVoidedAt());
        // Original financial fields untouched — never deleted, never mutated.
        assertEquals(new BigDecimal("75"), m.getAmount());
        assertEquals(PosCashMovementType.DROP_OUT, m.getMovementType());

        verify(postingEngine).reverseJournalFromCashMovementVoid(eq(10L), eq("DROP_OUT"),
                eq(new BigDecimal("75")), any(), any(LocalDate.class), any(Branch.class));
        verify(auditService).logCashMovementVoided(eq(1L), eq("T1"), eq(7L), eq(10L),
                eq("Cashier miscounted the drop"), any(), any());
        verify(repo).save(m);
    }

    @Test
    void voidRejectsAlreadyVoidedMovement() {
        PosSession session = openSessionForDay(false);
        PosCashMovement m = activeMovement(session, PosCashMovementType.DROP_IN, new BigDecimal("50"));
        m.setStatus(PosCashMovementStatus.VOIDED);
        when(repo.findById(10L)).thenReturn(Optional.of(m));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.voidMovement(10L, "duplicate void attempt"));
        assertTrue(ex.getReason().toLowerCase().contains("already voided"));
        verifyNoInteractions(postingEngine);
    }

    @Test
    void voidRejectsWhenBusinessDayIsClosed() {
        PosSession session = openSessionForDay(true);
        PosCashMovement m = activeMovement(session, PosCashMovementType.DROP_IN, new BigDecimal("50"));
        when(repo.findById(10L)).thenReturn(Optional.of(m));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.voidMovement(10L, "too late"));
        assertTrue(ex.getReason().toLowerCase().contains("closed business day"));
        verifyNoInteractions(postingEngine);
    }

    // ---------------------------------------------------------------------
    // create() — delegates to PosSessionService, keeping one source of truth
    // ---------------------------------------------------------------------

    @Test
    void createDelegatesToPosSessionServiceAddCashMovement() {
        PosSession session = openSessionForDay(false);
        PosCashMovement created = activeMovement(session, PosCashMovementType.DROP_IN, new BigDecimal("100"));
        when(posSessionService.addCashMovement(1L, "DROP_IN", new BigDecimal("100"), "Float top-up", "SLIP-1"))
                .thenReturn(created);

        PosCashMovementResponse result = service.create(1L, "DROP_IN", new BigDecimal("100"), "Float top-up", "SLIP-1");

        assertEquals(PosCashMovementType.DROP_IN, result.getMovementType());
        verify(posSessionService).addCashMovement(1L, "DROP_IN", new BigDecimal("100"), "Float top-up", "SLIP-1");
    }

    // ---------------------------------------------------------------------
    // list() / getById() — ACTIVE filtering happens in the repository query; here we
    // just confirm the service wires filters through and maps pages correctly.
    // ---------------------------------------------------------------------

    @Test
    void listMapsRepositoryPageIntoPageResponse() {
        PosSession session = openSessionForDay(false);
        PosCashMovement m = activeMovement(session, PosCashMovementType.DROP_IN, new BigDecimal("20"));
        Page<PosCashMovement> page = new PageImpl<>(List.of(m));
        when(repo.search(eq(7L), isNull(), eq(PosCashMovementStatus.ACTIVE), isNull(), isNull(), isNull(), isNull(), any()))
                .thenReturn(page);

        PageResponse<PosCashMovementResponse> result = service.list(7L, null, PosCashMovementStatus.ACTIVE,
                null, null, null, null, 0, 20);

        assertEquals(1, result.getTotalElements());
        assertEquals(10L, result.getContent().get(0).getId());
    }

    @Test
    void getByIdReturns404ForMissingMovement() {
        when(repo.findById(999L)).thenReturn(Optional.empty());
        assertThrows(ResponseStatusException.class, () -> service.getById(999L));
    }

    private static Branch branch(Long id) {
        Branch b = new Branch();
        b.setId(id);
        b.setName("Main Branch");
        b.setCode("MB");
        return b;
    }
}
