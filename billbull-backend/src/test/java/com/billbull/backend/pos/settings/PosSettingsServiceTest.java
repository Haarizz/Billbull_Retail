package com.billbull.backend.pos.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.user.UserRepository;

/**
 * ARCHFIX S5 — the POS supervisor PIN is BCrypt-hashed at rest and verified server-side.
 * Uses a REAL BCryptPasswordEncoder so the hashing/matching is genuinely exercised.
 */
@ExtendWith(MockitoExtension.class)
class PosSettingsServiceTest {

    @Mock private PosSettingsRepository repo;
    @Mock private BranchAccessService branchAccessService;
    @Mock private UserRepository userRepository;
    @Mock private AuditLogService auditLogService;
    @Mock private PosSessionService posSessionService;
    @Mock private com.billbull.backend.pos.auth.PosCredentialVerificationService posCredentialVerificationService;

    private final PasswordEncoder encoder = new BCryptPasswordEncoder();
    private PosSettingsService service;

    /**
     * The Business Day clock, pinned so the schedule guard's phase decisions are
     * deterministic. A real {@link com.billbull.backend.pos.businessdate.BusinessDayClock}
     * subclass rather than a mock or a parallel time source — the production class stays the
     * only clock, tests merely fix its reading. Default 2026-08-11 12:00 sits inside a
     * 09:00→21:00 window (phase ACTIVE); tests that need a closed day move it.
     */
    private java.time.LocalDateTime now = java.time.LocalDateTime.of(2026, 8, 11, 12, 0);

    @BeforeEach
    void setUp() {
        var clock = new com.billbull.backend.pos.businessdate.BusinessDayClock("Asia/Dubai") {
            @Override public java.time.LocalDateTime now() { return now; }
        };
        service = new PosSettingsService(repo, branchAccessService, encoder, userRepository,
                auditLogService, posSessionService, posCredentialVerificationService, clock);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(String... authorities) {
        List<GrantedAuthority> granted = java.util.Arrays.stream(authorities)
                .map(SimpleGrantedAuthority::new)
                .map(GrantedAuthority.class::cast)
                .toList();
        SecurityContextHolder.getContext().setAuthentication(
                new TestingAuthenticationToken("testuser", "n/a", granted));
    }

    // ── Supervisor-config role gate ─────────────────────────────────────────

    @Test
    void nonSupervisorCannotEnableRequireSupervisorForVoid() {
        PosSettings existing = new PosSettings();
        existing.setBranchId(1L);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));

        authenticateAs("CASHIER");

        PosSettings incoming = new PosSettings();
        incoming.setBranchId(1L);
        incoming.setRequireSupervisorForVoid(true);

        assertThrows(AccessDeniedException.class, () -> service.save(incoming));
        verify(repo, never()).save(any());
    }

    @Test
    void nonSupervisorCannotChangeSupervisorPin() {
        PosSettings existing = new PosSettings();
        existing.setBranchId(1L);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));

        authenticateAs("CASHIER");

        PosSettings incoming = new PosSettings();
        incoming.setBranchId(1L);
        incoming.setSupervisorPin("1234");

        assertThrows(AccessDeniedException.class, () -> service.save(incoming));
    }

    @Test
    void supervisorCanChangeSupervisorConfig() {
        PosSettings existing = new PosSettings();
        existing.setBranchId(1L);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        authenticateAs("ROLE_ADMIN");

        PosSettings incoming = new PosSettings();
        incoming.setBranchId(1L);
        incoming.setRequireSupervisorForVoid(true);
        incoming.setSupervisorPin("1234");

        PosSettings saved = service.save(incoming);

        assertTrue(saved.getRequireSupervisorForVoid());
        assertTrue(encoder.matches("1234", saved.getSupervisorPin()));
    }

    @Test
    void nonSupervisorCanStillSaveUnrelatedSettings() {
        PosSettings existing = new PosSettings();
        existing.setBranchId(1L);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        authenticateAs("CASHIER");

        PosSettings incoming = new PosSettings();
        incoming.setBranchId(1L);
        incoming.setDefaultLayout("compact");

        PosSettings saved = service.save(incoming);

        assertEquals("compact", saved.getDefaultLayout());
    }

    @Test
    void nonSupervisorCannotEnableRequirePriceOverrideApproval() {
        PosSettings existing = new PosSettings();
        existing.setBranchId(1L);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));

        authenticateAs("CASHIER");

        PosSettings incoming = new PosSettings();
        incoming.setBranchId(1L);
        incoming.setRequirePriceOverrideApproval(true);

        assertThrows(AccessDeniedException.class, () -> service.save(incoming));
    }

    @Test
    void supervisorCanEnableRequirePriceOverrideApproval() {
        PosSettings existing = new PosSettings();
        existing.setBranchId(1L);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        authenticateAs("ROLE_MANAGER");

        PosSettings incoming = new PosSettings();
        incoming.setBranchId(1L);
        incoming.setRequirePriceOverrideApproval(true);

        PosSettings saved = service.save(incoming);

        assertTrue(saved.getRequirePriceOverrideApproval());
    }

    // ── Product Entry Mode ───────────────────────────────────────────────────

    @Test
    void productEntryModePersistsThroughUpsert() {
        PosSettings existing = new PosSettings();
        existing.setBranchId(1L);
        existing.setProductEntryMode("DIRECT_ADD");
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings incoming = new PosSettings();
        incoming.setBranchId(1L);
        incoming.setProductEntryMode("OPEN_ENTRY_DIALOG");

        PosSettings saved = service.save(incoming);

        assertEquals("OPEN_ENTRY_DIALOG", saved.getProductEntryMode());
    }

    @Test
    void nonSupervisorCanChangeProductEntryMode() {
        PosSettings existing = new PosSettings();
        existing.setBranchId(1L);
        existing.setProductEntryMode("DIRECT_ADD");
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        authenticateAs("CASHIER");

        PosSettings incoming = new PosSettings();
        incoming.setBranchId(1L);
        incoming.setProductEntryMode("OPEN_ENTRY_DIALOG");

        PosSettings saved = service.save(incoming);

        assertEquals("OPEN_ENTRY_DIALOG", saved.getProductEntryMode());
    }

    // ── Branch resolution must follow the Branch Selector, not the user's home branch ──────
    // (mirrors BranchTaxConfigurationService — see getForCurrentBranch()/save()/verifyPin())

    @Test
    void getForCurrentBranchUsesActiveBranchNotHomeBranch() {
        PosSettings hilite = new PosSettings();
        hilite.setBranchId(99L);
        hilite.setSupervisorPin(encoder.encode("5555"));
        when(branchAccessService.getActiveBranchId()).thenReturn(99L);
        // Home branch (getCurrentUserBranchId) deliberately left unstubbed/different — if the
        // service still called it, this would return null and getForCurrentBranch() would
        // fall through to defaultSettings() instead of the real HILITE row.
        when(repo.findByBranchId(99L)).thenReturn(Optional.of(hilite));

        PosSettings result = service.getForCurrentBranch();

        assertEquals(99L, result.getBranchId());
    }

    @Test
    void saveWithoutExplicitBranchIdTargetsActiveBranch() {
        when(branchAccessService.getActiveBranchId()).thenReturn(99L);
        when(repo.findByBranchIdForUpdate(99L)).thenReturn(Optional.empty());
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings incoming = new PosSettings(); // no branchId set — mimics a POST with none

        PosSettings saved = service.save(incoming);

        assertEquals(99L, saved.getBranchId());
    }

    @Test
    void verifyPinChecksActiveBranchNotHomeBranch() {
        PosSettings hilite = new PosSettings();
        hilite.setBranchId(99L);
        hilite.setSupervisorPin(encoder.encode("5555"));
        when(branchAccessService.getActiveBranchId()).thenReturn(99L);
        when(repo.findByBranchId(99L)).thenReturn(Optional.of(hilite));

        assertTrue(service.verifyPin("5555"), "PIN configured on the active branch must verify");
    }

    @Test
    void saveHashesRawPinAndNeverStoresPlaintext() {
        PosSettings incoming = new PosSettings();
        incoming.setBranchId(7L);
        incoming.setSupervisorPin("1234");

        when(repo.findByBranchIdForUpdate(7L)).thenReturn(Optional.empty()); // new record path
        when(repo.save(any(PosSettings.class))).thenAnswer(inv -> inv.getArgument(0));

        PosSettings saved = service.save(incoming);

        assertNotEquals("1234", saved.getSupervisorPin(), "PIN must not be stored as plaintext");
        assertTrue(saved.getSupervisorPin().startsWith("$2"), "PIN must be a BCrypt hash");
        assertTrue(encoder.matches("1234", saved.getSupervisorPin()), "hash must verify the original PIN");
    }

    @Test
    void verifyPinMatchesAgainstStoredHash() {
        PosSettings stored = new PosSettings();
        stored.setBranchId(7L);
        stored.setSupervisorPin(encoder.encode("4321"));

        when(branchAccessService.getActiveBranchId()).thenReturn(7L);
        when(repo.findByBranchId(7L)).thenReturn(Optional.of(stored));

        assertTrue(service.verifyPin("4321"), "correct PIN verifies");
        assertFalse(service.verifyPin("0000"), "wrong PIN rejected");
    }

    @Test
    void verifyPinUpgradesLegacyPlaintextOnSuccessfulMatch() {
        PosSettings legacy = new PosSettings();
        legacy.setBranchId(7L);
        legacy.setSupervisorPin("9999"); // legacy plaintext, not a hash

        when(branchAccessService.getActiveBranchId()).thenReturn(7L);
        when(repo.findByBranchId(7L)).thenReturn(Optional.of(legacy));
        when(repo.save(any(PosSettings.class))).thenAnswer(inv -> inv.getArgument(0));

        assertTrue(service.verifyPin("9999"), "legacy plaintext PIN still verifies");

        // and it was opportunistically re-hashed
        ArgumentCaptor<PosSettings> captor = ArgumentCaptor.forClass(PosSettings.class);
        verify(repo).save(captor.capture());
        assertTrue(captor.getValue().getSupervisorPin().startsWith("$2"), "legacy PIN upgraded to a hash");
    }

    @Test
    void verifyPinFalseWhenNoPinConfigured() {
        PosSettings noPin = new PosSettings();
        noPin.setBranchId(7L);
        noPin.setSupervisorPin(null);

        when(branchAccessService.getActiveBranchId()).thenReturn(7L);
        when(repo.findByBranchId(7L)).thenReturn(Optional.of(noPin));

        assertFalse(service.verifyPin("anything"), "no configured PIN -> verification fails");
        verify(repo, never()).save(any());
    }

    @Test
    void verifyPinFalseForBlankInput() {
        // No branch lookup should even happen for blank input.
        lenient().when(branchAccessService.getCurrentUserBranchId()).thenReturn(7L);
        assertFalse(service.verifyPin(""), "blank PIN rejected");
        assertFalse(service.verifyPin(null), "null PIN rejected");
    }

    // ── Terminal Auto-Archive config validation ─────────────────────────────

    private PosSettings autoArchiveSettings(Long branchId, boolean enabled, int archiveAfterDays,
                                             boolean notifyBefore, int warningDays) {
        PosSettings s = new PosSettings();
        s.setBranchId(branchId);
        s.setTerminalAutoArchiveEnabled(enabled);
        s.setTerminalArchiveAfterDays(archiveAfterDays);
        s.setTerminalArchiveNotifyBefore(notifyBefore);
        s.setTerminalArchiveWarningDays(warningDays);
        return s;
    }

    @Test
    void rejectsArchiveAfterDaysZeroOrLess() {
        PosSettings s = autoArchiveSettings(1L, true, 0, true, 5);
        assertThrows(IllegalArgumentException.class, () -> service.save(s));
    }

    @Test
    void rejectsNegativeWarningDays() {
        PosSettings s = autoArchiveSettings(1L, true, 30, true, -1);
        assertThrows(IllegalArgumentException.class, () -> service.save(s));
    }

    @Test
    void rejectsWarningDaysGreaterThanOrEqualToArchiveAfterDaysWhenEnabled() {
        PosSettings s = autoArchiveSettings(1L, true, 5, true, 10);
        assertThrows(IllegalArgumentException.class, () -> service.save(s));
    }

    @Test
    void allowsWarningGreaterThanArchiveWhenAutoArchiveDisabled() {
        PosSettings s = autoArchiveSettings(1L, false, 5, true, 10);
        lenient().when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.empty());
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings saved = service.save(s);

        assertEquals(5, saved.getTerminalArchiveAfterDays());
    }

    // ── Business Day window (operating hours + extension) ───────────────────
    // The extension is the one field of the four that used to be dropped by the
    // update branch of the upsert, so a branch could never move off its stored value.

    private PosSettings businessDay(Long branchId, String start, String end, Integer extensionMinutes) {
        PosSettings s = new PosSettings();
        s.setBranchId(branchId);
        s.setOperatingHoursEnabled(true);
        s.setOperatingStartTime(java.time.LocalTime.parse(start));
        s.setOperatingEndTime(java.time.LocalTime.parse(end));
        s.setBusinessDayExtensionMinutes(extensionMinutes);
        return s;
    }

    @Test
    void businessDayExtensionPersistsThroughUpsertOnExistingBranch() {
        PosSettings existing = businessDay(1L, "09:00", "21:00", 0);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings saved = service.save(businessDay(1L, "09:00", "21:00", 120));

        ArgumentCaptor<PosSettings> captor = ArgumentCaptor.forClass(PosSettings.class);
        verify(repo).save(captor.capture());
        assertEquals(120, captor.getValue().getBusinessDayExtensionMinutes(), "repository must receive the new extension");
        assertEquals(120, saved.getBusinessDayExtensionMinutes(), "response must carry the new extension");
    }

    @Test
    void businessDayExtensionCanBeSetBackToZero() {
        // Zero is a legitimate configured value — "closes exactly at the Scheduled End Time" —
        // not an absent field, so it must overwrite a previously configured extension.
        PosSettings existing = businessDay(1L, "09:00", "21:00", 120);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings saved = service.save(businessDay(1L, "09:00", "21:00", 0));

        assertEquals(0, saved.getBusinessDayExtensionMinutes());
    }

    @Test
    void explicitNullBusinessDayExtensionPreservesTheConfiguredValue() {
        // A JSON field omitted from the body deserializes to the entity's own default of 0
        // (indistinguishable from an explicit 0), so "absent" is not detectable there — the
        // same contract operatingStartTime/EndTime already have, and every real caller
        // spreads the full settings object loaded from GET. An explicit null IS detectable,
        // and must not blank a configured value into a NOT NULL column.
        PosSettings existing = businessDay(1L, "09:00", "21:00", 120);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings incoming = businessDay(1L, "09:00", "21:00", null);

        PosSettings saved = service.save(incoming);

        assertEquals(120, saved.getBusinessDayExtensionMinutes(), "null extension must not blank the stored value");
    }

    @Test
    void businessDayWindowPersistsAllFourFieldsThroughUpsert() {
        PosSettings existing = businessDay(1L, "09:00", "21:00", 0);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings saved = service.save(businessDay(1L, "10:00", "22:00", 120));

        assertTrue(saved.getOperatingHoursEnabled());
        assertEquals(java.time.LocalTime.of(10, 0), saved.getOperatingStartTime());
        assertEquals(java.time.LocalTime.of(22, 0), saved.getOperatingEndTime());
        assertEquals(120, saved.getBusinessDayExtensionMinutes());
    }

    @Test
    void savedBusinessDayWindowDrivesScheduledEndAndClosure() {
        // Ties the persisted settings to the window arithmetic that consumes them:
        // 10:00 -> 22:00 with a 120-minute extension must close at 00:00 the next day.
        PosSettings existing = businessDay(1L, "09:00", "21:00", 0);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings saved = service.save(businessDay(1L, "10:00", "22:00", 120));

        var window = com.billbull.backend.pos.businessdate.PosOperatingHoursCalculator.resolveWindow(
                java.time.LocalDateTime.of(2026, 8, 11, 23, 0),
                com.billbull.backend.pos.businessdate.BusinessDaySettings.from(saved));

        assertEquals(java.time.LocalDate.of(2026, 8, 11), window.tradingDate());
        assertEquals(java.time.LocalDateTime.of(2026, 8, 11, 22, 0), window.scheduledEnd());
        assertEquals(java.time.LocalDateTime.of(2026, 8, 12, 0, 0), window.closureAt());
        assertEquals(com.billbull.backend.pos.businessdate.BusinessDayPhase.EXTENSION, window.phase());
    }

    // ── Business Day schedule guard: no re-timing under live sessions ───────────
    //
    // The rule: Start Time, End Time and the enable switch are frozen while the branch has
    // any session that is OPEN or in the closure workflow (closingStartedAt set, status still
    // OPEN/SUSPENDED), on any terminal. Enforced in the service, so a direct API call — which
    // reaches exactly this method — cannot bypass it.

    private com.billbull.backend.pos.session.PosSession openSession(long id, String terminalId) {
        var s = new com.billbull.backend.pos.session.PosSession();
        s.setId(id);
        s.setBranchId(1L);
        s.setTerminalId(terminalId);
        s.setStatus(com.billbull.backend.pos.session.PosSessionStatus.OPEN);
        s.setTradingDate(java.time.LocalDate.of(2026, 8, 11));
        return s;
    }

    private com.billbull.backend.pos.session.PosSession closureWorkflowSession(long id, String terminalId) {
        var s = openSession(id, terminalId);
        s.setClosingStartedAt(java.time.LocalDateTime.of(2026, 8, 11, 20, 30));
        return s;
    }

    private void withLockingSessions(com.billbull.backend.pos.session.PosSession... sessions) {
        when(posSessionService.findBusinessDayScheduleLockingSessions(1L)).thenReturn(List.of(sessions));
    }

    @Test
    void startTimeChangeRejectedWhileASessionIsOpen() {
        PosSettings existing = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        withLockingSessions(openSession(500L, "POS-1"));

        var error = assertThrows(IllegalArgumentException.class,
                () -> service.save(businessDay(1L, "10:00", "21:00", 60)));

        assertTrue(error.getMessage().startsWith(PosSettingsService.SCHEDULE_LOCKED_MESSAGE));
        verify(repo, never()).save(any());
    }

    @Test
    void endTimeChangeRejectedWhileASessionIsOpen() {
        PosSettings existing = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        withLockingSessions(openSession(500L, "POS-1"));

        assertThrows(IllegalArgumentException.class,
                () -> service.save(businessDay(1L, "09:00", "23:00", 60)));
        verify(repo, never()).save(any());
    }

    @Test
    void startTimeChangeRejectedWhileASessionIsInTheClosureWorkflow() {
        // Status is still OPEN during closure — the guard must key off closingStartedAt too,
        // exactly as PosSessionClosureWorkflowGate does.
        PosSettings existing = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        withLockingSessions(closureWorkflowSession(501L, "POS-2"));

        assertThrows(IllegalArgumentException.class,
                () -> service.save(businessDay(1L, "08:00", "21:00", 60)));
        verify(repo, never()).save(any());
    }

    @Test
    void endTimeChangeRejectedWhileASessionIsInTheClosureWorkflow() {
        PosSettings existing = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        withLockingSessions(closureWorkflowSession(501L, "POS-2"));

        assertThrows(IllegalArgumentException.class,
                () -> service.save(businessDay(1L, "09:00", "20:00", 60)));
        verify(repo, never()).save(any());
    }

    @Test
    void disablingTheWindowIsRejectedWhileASessionIsOpen() {
        // Switching the window off substitutes the calendar day for the configured window —
        // the same hazard as moving Start, and the obvious way to bypass the rule otherwise.
        PosSettings existing = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        withLockingSessions(openSession(500L, "POS-1"));

        PosSettings incoming = businessDay(1L, "09:00", "21:00", 60);
        incoming.setOperatingHoursEnabled(false);

        assertThrows(IllegalArgumentException.class, () -> service.save(incoming));
        verify(repo, never()).save(any());
    }

    @Test
    void startAndEndChangeAllowedWhenNoSessionsAreActive() {
        PosSettings existing = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        // posSessionService returns an empty list by default — no OPEN/closure sessions.

        PosSettings saved = service.save(businessDay(1L, "11:00", "23:00", 60));

        assertEquals(java.time.LocalTime.of(11, 0), saved.getOperatingStartTime());
        assertEquals(java.time.LocalTime.of(23, 0), saved.getOperatingEndTime());
        verify(auditLogService).logDomainEvent(org.mockito.ArgumentMatchers.eq("POS_SETTINGS"),
                org.mockito.ArgumentMatchers.eq("1"),
                org.mockito.ArgumentMatchers.eq("BUSINESS_DAY_SCHEDULE_CHANGED"),
                org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void rejectedScheduleChangeLeavesTheOpenSessionsTradingDateUntouched() {
        // The fix prevents an inconsistent state; it never repairs sessions afterwards.
        PosSettings existing = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        var live = openSession(500L, "POS-1");
        withLockingSessions(live);

        assertThrows(IllegalArgumentException.class,
                () -> service.save(businessDay(1L, "03:00", "21:00", 60)));

        assertEquals(java.time.LocalDate.of(2026, 8, 11), live.getTradingDate(),
                "an existing session's tradingDate must never be recalculated by a settings change");
        assertEquals(java.time.LocalTime.of(9, 0), existing.getOperatingStartTime(),
                "the stored schedule must be left exactly as it was");
    }

    @Test
    void rejectedScheduleChangeIsAudited() {
        PosSettings existing = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        withLockingSessions(openSession(500L, "POS-1"));

        assertThrows(IllegalArgumentException.class,
                () -> service.save(businessDay(1L, "10:00", "21:00", 60)));

        verify(auditLogService).logDomainEvent(org.mockito.ArgumentMatchers.eq("POS_SETTINGS"),
                org.mockito.ArgumentMatchers.eq("1"),
                org.mockito.ArgumentMatchers.eq("BUSINESS_DAY_SCHEDULE_CHANGE_REJECTED"),
                org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void unrelatedSettingsStillSaveWhileSessionsAreOpen() {
        // The guard must freeze the Business Day schedule only — nothing else on this screen.
        PosSettings existing = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(posSessionService.findBusinessDayScheduleLockingSessions(1L))
                .thenReturn(List.of(openSession(500L, "POS-1")));

        PosSettings incoming = businessDay(1L, "09:00", "21:00", 60);
        incoming.setDefaultLayout("compact");

        assertEquals("compact", service.save(incoming).getDefaultLayout());
    }

    // ── Extension rule ──────────────────────────────────────────────────────────
    //
    // Allowed while sessions are open (it cannot move any tradingDate — only closureAt),
    // refused only when it would drag the current Business Day back out of CLOSED.

    @Test
    void extensionChangeAllowedWhileSessionsAreOpen() {
        PosSettings existing = businessDay(1L, "09:00", "21:00", 0);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(posSessionService.findBusinessDayScheduleLockingSessions(1L))
                .thenReturn(List.of(openSession(500L, "POS-1"), closureWorkflowSession(501L, "POS-2")));

        PosSettings saved = service.save(businessDay(1L, "09:00", "21:00", 120));

        assertEquals(120, saved.getBusinessDayExtensionMinutes());
    }

    @Test
    void extensionMayBeShortenedDuringTheExtensionPeriod() {
        // 21:30 with a 120-minute extension → phase EXTENSION. Cutting it to 15 minutes closes
        // the day now, which is a legitimate forward move and leaves tradingDate alone.
        now = java.time.LocalDateTime.of(2026, 8, 11, 21, 30);
        PosSettings existing = businessDay(1L, "09:00", "21:00", 120);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(posSessionService.findBusinessDayScheduleLockingSessions(1L))
                .thenReturn(List.of(openSession(500L, "POS-1")));

        assertEquals(15, service.save(businessDay(1L, "09:00", "21:00", 15)).getBusinessDayExtensionMinutes());
    }

    @Test
    void extensionCannotBeLengthenedOnceTheBusinessDayHasClosed() {
        // 22:30, window 09:00→21:00 + 60min → closed at 22:00. Extending to 180 minutes would
        // push closure to 00:00 and move the day CLOSED → EXTENSION: a back-door reopen.
        now = java.time.LocalDateTime.of(2026, 8, 11, 22, 30);
        PosSettings existing = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));

        var error = assertThrows(IllegalArgumentException.class,
                () -> service.save(businessDay(1L, "09:00", "21:00", 180)));

        assertTrue(error.getMessage().contains("already closed"));
        verify(repo, never()).save(any());
    }

    @Test
    void extensionMayStillBeShortenedAfterTheBusinessDayHasClosed() {
        // Still CLOSED afterwards — nothing is reopened, so there is nothing to refuse.
        now = java.time.LocalDateTime.of(2026, 8, 11, 22, 30);
        PosSettings existing = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertEquals(0, service.save(businessDay(1L, "09:00", "21:00", 0)).getBusinessDayExtensionMinutes());
    }

    // ── Blank / invalid values keep their existing behavior ─────────────────────

    @Test
    void enabledWindowWithBlankStartStillRejectedByTheExistingValidation() {
        PosSettings incoming = new PosSettings();
        incoming.setBranchId(1L);
        incoming.setOperatingHoursEnabled(true);
        incoming.setOperatingEndTime(java.time.LocalTime.of(21, 0));

        var error = assertThrows(IllegalArgumentException.class, () -> service.save(incoming));
        assertTrue(error.getMessage().contains("Start Time is required"));
        verify(repo, never()).save(any());
    }

    @Test
    void enabledWindowWithBlankEndStillRejectedByTheExistingValidation() {
        PosSettings incoming = new PosSettings();
        incoming.setBranchId(1L);
        incoming.setOperatingHoursEnabled(true);
        incoming.setOperatingStartTime(java.time.LocalTime.of(9, 0));

        var error = assertThrows(IllegalArgumentException.class, () -> service.save(incoming));
        assertTrue(error.getMessage().contains("End Time is required"));
        verify(repo, never()).save(any());
    }

    @Test
    void disabledWindowWithNoTimesStillSavesUnrestricted() {
        PosSettings existing = new PosSettings();
        existing.setBranchId(1L);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings incoming = new PosSettings();
        incoming.setBranchId(1L);
        incoming.setOperatingHoursEnabled(false);

        PosSettings saved = service.save(incoming);

        assertFalse(saved.getOperatingHoursEnabled());
        assertFalse(com.billbull.backend.pos.businessdate.BusinessDaySettings.from(saved).isConfigured());
    }

    // ── Read path exposes the lock to the console ───────────────────────────────

    @Test
    void getForBranchReportsTheScheduleLockWhenSessionsAreActive() {
        PosSettings stored = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchId(1L)).thenReturn(Optional.of(stored));
        withLockingSessions(openSession(500L, "POS-1"), closureWorkflowSession(501L, "POS-2"));

        PosSettings view = service.getForBranch(1L);

        assertTrue(view.isBusinessDayScheduleLocked());
        assertEquals(2, view.getBusinessDayScheduleLockingSessionCount());
        assertEquals(PosSettingsService.SCHEDULE_LOCKED_MESSAGE, view.getBusinessDayScheduleLockReason());
    }

    @Test
    void getForBranchReportsNoLockWhenNothingIsActive() {
        PosSettings stored = businessDay(1L, "09:00", "21:00", 60);
        when(repo.findByBranchId(1L)).thenReturn(Optional.of(stored));

        PosSettings view = service.getForBranch(1L);

        assertFalse(view.isBusinessDayScheduleLocked());
        assertEquals(0, view.getBusinessDayScheduleLockingSessionCount());
    }

    @Test
    void validConfigPersistsAllFourFieldsThroughUpsert() {
        PosSettings existing = new PosSettings();
        existing.setBranchId(1L);
        when(repo.findByBranchIdForUpdate(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings incoming = autoArchiveSettings(1L, true, 45, true, 7);
        PosSettings saved = service.save(incoming);

        assertTrue(saved.getTerminalAutoArchiveEnabled());
        assertEquals(45, saved.getTerminalArchiveAfterDays());
        assertTrue(saved.getTerminalArchiveNotifyBefore());
        assertEquals(7, saved.getTerminalArchiveWarningDays());
    }
}
