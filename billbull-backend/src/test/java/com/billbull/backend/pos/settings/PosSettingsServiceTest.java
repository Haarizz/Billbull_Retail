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

    private final PasswordEncoder encoder = new BCryptPasswordEncoder();
    private PosSettingsService service;

    @BeforeEach
    void setUp() {
        service = new PosSettingsService(repo, branchAccessService, encoder, userRepository, auditLogService, posSessionService);
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
        when(repo.findByBranchId(1L)).thenReturn(Optional.of(existing));

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
        when(repo.findByBranchId(1L)).thenReturn(Optional.of(existing));

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
        when(repo.findByBranchId(1L)).thenReturn(Optional.of(existing));
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
        when(repo.findByBranchId(1L)).thenReturn(Optional.of(existing));
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
        when(repo.findByBranchId(1L)).thenReturn(Optional.of(existing));

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
        when(repo.findByBranchId(1L)).thenReturn(Optional.of(existing));
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
        when(repo.findByBranchId(1L)).thenReturn(Optional.of(existing));
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
        when(repo.findByBranchId(1L)).thenReturn(Optional.of(existing));
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
        when(repo.findByBranchId(99L)).thenReturn(Optional.empty());
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

        when(repo.findByBranchId(7L)).thenReturn(Optional.empty()); // new record path
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
        lenient().when(repo.findByBranchId(1L)).thenReturn(Optional.empty());
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings saved = service.save(s);

        assertEquals(5, saved.getTerminalArchiveAfterDays());
    }

    @Test
    void validConfigPersistsAllFourFieldsThroughUpsert() {
        PosSettings existing = new PosSettings();
        existing.setBranchId(1L);
        when(repo.findByBranchId(1L)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PosSettings incoming = autoArchiveSettings(1L, true, 45, true, 7);
        PosSettings saved = service.save(incoming);

        assertTrue(saved.getTerminalAutoArchiveEnabled());
        assertEquals(45, saved.getTerminalArchiveAfterDays());
        assertTrue(saved.getTerminalArchiveNotifyBefore());
        assertEquals(7, saved.getTerminalArchiveWarningDays());
    }
}
