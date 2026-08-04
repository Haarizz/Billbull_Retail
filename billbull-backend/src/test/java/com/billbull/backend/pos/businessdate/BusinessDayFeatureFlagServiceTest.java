package com.billbull.backend.pos.businessdate;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link BusinessDayFeatureFlagService} — Stage 3B.2A.5
 * infrastructure only. This service is not called from any production path yet;
 * these tests only verify the lookup itself is correct so Stage 3B.2B has a
 * trustworthy building block to wire in later.
 */
@ExtendWith(MockitoExtension.class)
class BusinessDayFeatureFlagServiceTest {

    @Mock private PosSettingsRepository settingsRepository;

    private BusinessDayFeatureFlagService service;

    @BeforeEach
    void setUp() {
        service = new BusinessDayFeatureFlagService(settingsRepository);
    }

    @Test
    void defaultsToDisabledWhenBranchHasNoSettingsRow() {
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.empty());

        assertFalse(service.isLoginGateV2Enabled(1L));
    }

    @Test
    void defaultsToDisabledWhenSettingsRowExistsButFlagIsNull() {
        PosSettings settings = new PosSettings();
        settings.setBusinessDayLoginGateV2Enabled(null);
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.of(settings));

        assertFalse(service.isLoginGateV2Enabled(1L));
    }

    @Test
    void defaultsToDisabledOnANewlyConstructedPosSettings() {
        // Entity-level default — matches the "OFF by default" requirement without
        // any repository stubbing at all.
        PosSettings settings = new PosSettings();
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.of(settings));

        assertFalse(service.isLoginGateV2Enabled(1L));
    }

    @Test
    void returnsTrueOnlyWhenExplicitlyEnabledForThatBranch() {
        PosSettings settings = new PosSettings();
        settings.setBusinessDayLoginGateV2Enabled(true);
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.of(settings));

        assertTrue(service.isLoginGateV2Enabled(1L));
    }

    @Test
    void isPerBranchNotGlobal() {
        PosSettings enabledBranch = new PosSettings();
        enabledBranch.setBusinessDayLoginGateV2Enabled(true);
        PosSettings disabledBranch = new PosSettings();
        disabledBranch.setBusinessDayLoginGateV2Enabled(false);
        when(settingsRepository.findByBranchId(1L)).thenReturn(Optional.of(enabledBranch));
        when(settingsRepository.findByBranchId(2L)).thenReturn(Optional.of(disabledBranch));

        assertTrue(service.isLoginGateV2Enabled(1L));
        assertFalse(service.isLoginGateV2Enabled(2L));
    }
}
