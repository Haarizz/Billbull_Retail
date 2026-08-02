package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.pos.terminal.PosTerminal;

/**
 * Session Roaming Phase 9 — {@link PosSessionTransferPolicy} unit tests. Only exercises rules the
 * policy actually evaluates (same-terminal, destination occupancy, cross-branch); no cash-drawer
 * or unpaid-transaction rules exist to test since the domain has no queryable state for them yet.
 */
@ExtendWith(MockitoExtension.class)
class PosSessionTransferPolicyTest {

    @Mock private PosSettingsRepository posSettingsRepository;

    private PosSessionTransferPolicy policy;

    @BeforeEach
    void setUp() {
        policy = new PosSessionTransferPolicy(posSettingsRepository);
    }

    private static PosSession session(Long terminalPk, Long branchId) {
        PosSession s = new PosSession();
        s.setId(1L);
        s.setTerminalPk(terminalPk);
        s.setBranchId(branchId);
        return s;
    }

    private static PosTerminal terminal(Long id, Long branchId, Long currentOpenSessionId) {
        PosTerminal t = new PosTerminal();
        t.setId(id);
        t.setBranchId(branchId);
        t.setCurrentOpenSessionId(currentOpenSessionId);
        return t;
    }

    @Test
    void deniesWhenDestinationTerminalNotFound() {
        PosSessionTransferDecision decision = policy.evaluate(session(99L, 7L), null);

        assertEquals(PosSessionTransferAuthorization.DENIED, decision.getAuthorization());
        assertEquals(PosSessionTransferReasonCode.DESTINATION_TERMINAL_NOT_FOUND, decision.getReasonCode());
    }

    @Test
    void allowsSameTerminalAsNotApplicable() {
        PosSession session = session(200L, 7L);
        PosTerminal destination = terminal(200L, 7L, null);

        PosSessionTransferDecision decision = policy.evaluate(session, destination);

        assertEquals(PosSessionTransferAuthorization.ALLOWED, decision.getAuthorization());
        assertEquals(PosSessionTransferReasonCode.SAME_TERMINAL_NOT_APPLICABLE, decision.getReasonCode());
    }

    @Test
    void deniesWhenDestinationTerminalAlreadyOccupied() {
        PosSession session = session(99L, 7L);
        PosTerminal destination = terminal(200L, 7L, 555L);

        PosSessionTransferDecision decision = policy.evaluate(session, destination);

        assertEquals(PosSessionTransferAuthorization.DENIED, decision.getAuthorization());
        assertEquals(PosSessionTransferReasonCode.DESTINATION_TERMINAL_OCCUPIED, decision.getReasonCode());
    }

    @Test
    void allowsSameBranchTransferWithoutSupervisor() {
        PosSession session = session(99L, 7L);
        PosTerminal destination = terminal(200L, 7L, null);

        PosSessionTransferDecision decision = policy.evaluate(session, destination);

        assertEquals(PosSessionTransferAuthorization.ALLOWED, decision.getAuthorization());
        assertEquals(PosSessionTransferReasonCode.SAME_BRANCH_TRANSFER, decision.getReasonCode());
    }

    @Test
    void treatsUnknownDestinationBranchAsSameBranch() {
        PosSession session = session(99L, 7L);
        PosTerminal destination = terminal(200L, null, null);

        PosSessionTransferDecision decision = policy.evaluate(session, destination);

        assertEquals(PosSessionTransferAuthorization.ALLOWED, decision.getAuthorization());
        assertEquals(PosSessionTransferReasonCode.SAME_BRANCH_TRANSFER, decision.getReasonCode());
    }

    @Test
    void requiresSupervisorForCrossBranchTransferByDefault() {
        PosSession session = session(99L, 7L);
        PosTerminal destination = terminal(200L, 8L, null);
        when(posSettingsRepository.findByBranchId(7L)).thenReturn(Optional.empty());

        PosSessionTransferDecision decision = policy.evaluate(session, destination);

        assertEquals(PosSessionTransferAuthorization.SUPERVISOR_REQUIRED, decision.getAuthorization());
        assertEquals(PosSessionTransferReasonCode.CROSS_BRANCH_TRANSFER, decision.getReasonCode());
    }

    @Test
    void requiresSupervisorForCrossBranchTransferWhenSettingIsTrue() {
        PosSession session = session(99L, 7L);
        PosTerminal destination = terminal(200L, 8L, null);
        PosSettings settings = new PosSettings();
        settings.setRequireSupervisorForCrossBranchTransfer(true);
        when(posSettingsRepository.findByBranchId(7L)).thenReturn(Optional.of(settings));

        PosSessionTransferDecision decision = policy.evaluate(session, destination);

        assertEquals(PosSessionTransferAuthorization.SUPERVISOR_REQUIRED, decision.getAuthorization());
    }

    @Test
    void allowsCrossBranchTransferWhenSettingIsFalse() {
        PosSession session = session(99L, 7L);
        PosTerminal destination = terminal(200L, 8L, null);
        PosSettings settings = new PosSettings();
        settings.setRequireSupervisorForCrossBranchTransfer(false);
        when(posSettingsRepository.findByBranchId(7L)).thenReturn(Optional.of(settings));

        PosSessionTransferDecision decision = policy.evaluate(session, destination);

        assertEquals(PosSessionTransferAuthorization.ALLOWED, decision.getAuthorization());
        assertEquals(PosSessionTransferReasonCode.CROSS_BRANCH_TRANSFER, decision.getReasonCode());
    }
}
