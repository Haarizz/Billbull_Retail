package com.billbull.backend.sales.returns;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.pos.businessdate.BusinessDayClock;
import com.billbull.backend.pos.businessdate.BusinessDayWindowService;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.sales.invoice.SalesInvoice;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.sales.settings.SalesDocumentNumberingService;
import com.billbull.backend.sales.settings.SalesDocumentType;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * What the creation endpoint will and will not accept from a client.
 *
 * <p>Two things used to be the client's to decide and should never have been: the status, and the
 * accounting date.
 *
 * <p><b>Status.</b> {@code POST /api/sales/returns} applied its DRAFT default only when the field
 * arrived null, so a caller could create a return already marked APPROVED. Approval is the
 * transition that locks the row, resolves authorization, revalidates quantities under the invoice
 * lock, restocks, posts the GL and pays cash out — none of which a POST runs. The result was a
 * phantom credit note: a document claiming every effect and carrying none.
 *
 * <p><b>Date.</b> The frontend derived {@code returnDate} as
 * {@code new Date().toISOString().slice(0,10)} — a UTC date. In the UTC+4 branch these cases model,
 * every return taken between midnight and 04:00 local was dated to the previous calendar day,
 * splitting it from the drawer payout that funded it.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SalesReturnCreationGuardTest {

    private static final String INVOICE = "INV-2026-04812";
    private static final LocalDate BUSINESS_DAY = LocalDate.of(2026, 9, 30);
    /** What a UTC+4 browser would compute at 00:30 local on 1 October — the day before. */
    private static final LocalDate CLIENT_UTC_DATE = LocalDate.of(2026, 9, 30);

    @Mock private SalesReturnRepository salesReturnRepository;
    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @Mock private BranchAccessService branchAccessService;
    @Mock private SalesDocumentNumberingService numberingService;
    @Mock private PosSessionRepository posSessionRepository;
    @Mock private BusinessDayWindowService businessDayWindowService;
    @Mock private BusinessDayClock businessDayClock;
    @Mock private PosAuditService posAuditService;
    @Mock private com.billbull.backend.common.ownership.OwnershipAccessService ownershipAccessService;

    @InjectMocks private SalesReturnService service;

    private Branch branch;

    @BeforeEach
    void setUp() {
        branch = branch(1L, "Dubai Main");

        ReflectionTestUtils.setField(service, "salesReturnRepository", salesReturnRepository);
        ReflectionTestUtils.setField(service, "salesInvoiceRepository", salesInvoiceRepository);
        ReflectionTestUtils.setField(service, "branchAccessService", branchAccessService);
        ReflectionTestUtils.setField(service, "numberingService", numberingService);
        ReflectionTestUtils.setField(service, "posSessionRepository", posSessionRepository);
        ReflectionTestUtils.setField(service, "businessDayWindowService", businessDayWindowService);
        ReflectionTestUtils.setField(service, "businessDayClock", businessDayClock);
        ReflectionTestUtils.setField(service, "posAuditService", posAuditService);
        ReflectionTestUtils.setField(service, "ownershipAccessService", ownershipAccessService);

        when(branchAccessService.getRequiredCurrentUserBranch()).thenReturn(branch);
        when(numberingService.resolveNumberForCreate(eq(SalesDocumentType.SALES_RETURN), anyString()))
                .thenAnswer(inv -> inv.getArgument(1));
        when(numberingService.resolveNumberForCreate(eq(SalesDocumentType.SALES_RETURN), eq(null)))
                .thenReturn("SR-2026-0001");
        when(salesReturnRepository.save(any(SalesReturn.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        when(businessDayWindowService.currentTradingDate(anyLong())).thenReturn(BUSINESS_DAY);
        lenient().when(businessDayClock.now())
                .thenReturn(LocalDateTime.of(2026, 10, 1, 0, 30));
        stubInvoiceOnBranch(1L);
    }

    // ── status ──────────────────────────────────────────────────────────────────────

    @Test
    void aClientSuppliedApprovedStatusIsRejected() {
        SalesReturn incoming = draft();
        incoming.setStatus(SalesReturnStatus.APPROVED);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.saveReturn(incoming));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("cannot be created or saved as APPROVED"), ex.getReason());
        verify(salesReturnRepository, never()).save(any());
    }

    @Test
    void anOmittedStatusStillDefaultsToDraft() {
        SalesReturn saved = service.saveReturn(draft());

        assertEquals(SalesReturnStatus.DRAFT, saved.getStatus());
    }

    @Test
    void anExplicitDraftIsAcceptedUnchanged() {
        SalesReturn incoming = draft();
        incoming.setStatus(SalesReturnStatus.DRAFT);

        assertEquals(SalesReturnStatus.DRAFT, service.saveReturn(incoming).getStatus());
    }

    @Test
    void cancellingADraftIsStillAPlainSave() {
        // CANCELLED has no side effect, so it is not the endpoint's business to refuse it.
        SalesReturn incoming = draft();
        incoming.setStatus(SalesReturnStatus.CANCELLED);

        assertEquals(SalesReturnStatus.CANCELLED, service.saveReturn(incoming).getStatus());
    }

    // ── business date ───────────────────────────────────────────────────────────────

    @Test
    void aBackOfficeReturnTakesTheBranchBusinessDay() {
        SalesReturn saved = service.saveReturn(draft());

        assertEquals(BUSINESS_DAY, saved.getReturnDate());
        assertEquals(BUSINESS_DAY, saved.getTradingDate());
    }

    @Test
    void aPosReturnTakesTheOpenSessionsTradingDate() {
        LocalDate sessionTradingDate = LocalDate.of(2026, 9, 29);
        stubSession(55L, sessionTradingDate, LocalDate.of(2026, 9, 28));

        SalesReturn incoming = draft();
        incoming.setPosSessionId(55L);

        SalesReturn saved = service.saveReturn(incoming);

        assertEquals(sessionTradingDate, saved.getReturnDate(),
                "A POS return must land on the same business day as the sale it reverses");
        assertEquals(sessionTradingDate, saved.getTradingDate());
    }

    @Test
    void aSessionWithNoTradingDateFallsBackToItsAccountingBucket() {
        stubSession(55L, null, LocalDate.of(2026, 9, 28));

        SalesReturn incoming = draft();
        incoming.setPosSessionId(55L);

        assertEquals(LocalDate.of(2026, 9, 28), service.saveReturn(incoming).getReturnDate());
    }

    @Test
    void aMissingSessionFallsBackToTheBranchBusinessDayRatherThanFailing() {
        when(posSessionRepository.findById(55L)).thenReturn(Optional.empty());

        SalesReturn incoming = draft();
        incoming.setPosSessionId(55L);

        assertEquals(BUSINESS_DAY, service.saveReturn(incoming).getReturnDate());
    }

    @Test
    void theBusinessDayClockIsTheLastResortAndReadsThePosTimezoneNotUtc() {
        when(businessDayWindowService.currentTradingDate(anyLong())).thenReturn(null);
        // 00:30 on 1 October in the configured POS zone. A UTC-derived date would be 30 September.
        when(businessDayClock.now()).thenReturn(LocalDateTime.of(2026, 10, 1, 0, 30));

        assertEquals(LocalDate.of(2026, 10, 1), service.saveReturn(draft()).getReturnDate());
    }

    @Test
    void aFailureResolvingTheBusinessDayDoesNotFailTheSave() {
        when(businessDayWindowService.currentTradingDate(anyLong()))
                .thenThrow(new IllegalStateException("POS settings unreadable"));
        when(businessDayClock.now()).thenReturn(LocalDateTime.of(2026, 10, 1, 9, 0));

        assertEquals(LocalDate.of(2026, 10, 1), service.saveReturn(draft()).getReturnDate());
    }

    @Test
    void aClientSuppliedReturnDateIsIgnoredEvenWhenItLooksPlausible() {
        // What the old frontend sent at 00:30 local in a UTC+4 branch: yesterday's calendar date.
        stubSession(55L, LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 1));

        SalesReturn incoming = draft();
        incoming.setPosSessionId(55L);
        incoming.setReturnDate(CLIENT_UTC_DATE);
        incoming.setTradingDate(CLIENT_UTC_DATE);

        SalesReturn saved = service.saveReturn(incoming);

        assertEquals(LocalDate.of(2026, 10, 1), saved.getReturnDate(),
                "The server's business day must win over whatever the browser computed");
        assertEquals(LocalDate.of(2026, 10, 1), saved.getTradingDate());
    }

    @Test
    void bothDateColumnsCarryTheSameValueSoEveryLegAgrees() {
        // The dashboard POS badge matches COALESCE(tradingDate, returnDate); the GL journals, the
        // statement and the X/Z reports key on returnDate. Equal columns make those one date.
        stubSession(55L, LocalDate.of(2026, 9, 29), LocalDate.of(2026, 9, 28));
        SalesReturn incoming = draft();
        incoming.setPosSessionId(55L);

        SalesReturn saved = service.saveReturn(incoming);

        assertEquals(saved.getTradingDate(), saved.getReturnDate());
    }

    @Test
    void reSavingADraftCannotMoveItsAccountingDate() {
        SalesReturn existing = draft();
        existing.setId(42L);
        existing.setReturnNumber("SR-2026-0001");
        existing.setStatus(SalesReturnStatus.DRAFT);
        existing.setBranch(branch);
        existing.setReturnDate(LocalDate.of(2026, 9, 20));
        existing.setTradingDate(LocalDate.of(2026, 9, 20));
        when(salesReturnRepository.findByIdWithItems(42L)).thenReturn(Optional.of(existing));
        when(numberingService.resolveNumberForUpdate(any(), anyString(), anyString()))
                .thenReturn("SR-2026-0001");

        SalesReturn incoming = draft();
        incoming.setId(42L);
        incoming.setReturnNumber("SR-2026-0001");
        incoming.setReturnDate(LocalDate.of(2026, 10, 5)); // a client trying to re-date it

        SalesReturn saved = service.saveReturn(incoming);

        assertEquals(LocalDate.of(2026, 9, 20), saved.getReturnDate());
        assertEquals(LocalDate.of(2026, 9, 20), saved.getTradingDate());
    }

    // ── POS audit on creation ───────────────────────────────────────────────────────

    @Test
    void aNewPosReturnIsRecordedOnTheTerminalsAuditTrail() {
        stubSession(55L, BUSINESS_DAY, BUSINESS_DAY);
        SalesReturn incoming = draft();
        incoming.setPosSessionId(55L);
        incoming.setPosTerminalId("TERM-01");
        incoming.setEntryPoint(SalesReturnEntryPoint.POS);

        service.saveReturn(incoming);

        verify(posAuditService).logReturnInitiated(eq(55L), eq("TERM-01"), eq(1L), any(), eq(INVOICE));
    }

    @Test
    void aBackOfficeReturnDoesNotWriteAPosAuditEntry() {
        SalesReturn incoming = draft();
        incoming.setEntryPoint(SalesReturnEntryPoint.SALES_RETURN);

        service.saveReturn(incoming);

        verify(posAuditService, never()).logReturnInitiated(any(), any(), any(), any(), any());
    }

    // ── fixtures ────────────────────────────────────────────────────────────────────

    private void stubSession(Long id, LocalDate tradingDate, LocalDate sessionDate) {
        PosSession session = new PosSession();
        session.setId(id);
        session.setBranchId(1L);
        session.setTradingDate(tradingDate);
        session.setSessionDate(sessionDate);
        when(posSessionRepository.findById(id)).thenReturn(Optional.of(session));
    }

    private void stubInvoiceOnBranch(Long branchId) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNumber(INVOICE);
        invoice.setBranchId(branchId);
        invoice.setBranchName("Dubai Main");
        when(salesInvoiceRepository.findByInvoiceNumber(INVOICE)).thenReturn(Optional.of(invoice));
    }

    private static Branch branch(Long id, String name) {
        Branch b = new Branch();
        b.setId(id);
        b.setName(name);
        return b;
    }

    private SalesReturn draft() {
        SalesReturn r = new SalesReturn();
        r.setLinkedInvoice(INVOICE);
        SalesReturnItem item = new SalesReturnItem();
        item.setItemCode("ITEM-A");
        item.setReturnQty(1);
        item.setCondition(SalesReturnCondition.GOOD);
        item.setDiscountAmount(java.math.BigDecimal.ZERO);
        r.setItems(new ArrayList<>(List.of(item)));
        return r;
    }
}
