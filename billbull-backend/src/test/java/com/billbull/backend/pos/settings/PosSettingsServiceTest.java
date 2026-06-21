package com.billbull.backend.pos.settings;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.billbull.backend.settings.branch.BranchAccessService;

/**
 * ARCHFIX S5 — the POS supervisor PIN is BCrypt-hashed at rest and verified server-side.
 * Uses a REAL BCryptPasswordEncoder so the hashing/matching is genuinely exercised.
 */
@ExtendWith(MockitoExtension.class)
class PosSettingsServiceTest {

    @Mock private PosSettingsRepository repo;
    @Mock private BranchAccessService branchAccessService;

    private final PasswordEncoder encoder = new BCryptPasswordEncoder();
    private PosSettingsService service;

    @BeforeEach
    void setUp() {
        service = new PosSettingsService(repo, branchAccessService, encoder);
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

        when(branchAccessService.getCurrentUserBranchId()).thenReturn(7L);
        when(repo.findByBranchId(7L)).thenReturn(Optional.of(stored));

        assertTrue(service.verifyPin("4321"), "correct PIN verifies");
        assertFalse(service.verifyPin("0000"), "wrong PIN rejected");
    }

    @Test
    void verifyPinUpgradesLegacyPlaintextOnSuccessfulMatch() {
        PosSettings legacy = new PosSettings();
        legacy.setBranchId(7L);
        legacy.setSupervisorPin("9999"); // legacy plaintext, not a hash

        when(branchAccessService.getCurrentUserBranchId()).thenReturn(7L);
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

        when(branchAccessService.getCurrentUserBranchId()).thenReturn(7L);
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
}
