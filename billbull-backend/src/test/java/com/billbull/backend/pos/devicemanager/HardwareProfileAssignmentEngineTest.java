package com.billbull.backend.pos.devicemanager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.cashdrawer.PosCashDrawer;
import com.billbull.backend.pos.cashdrawer.PosCashDrawerRepository;
import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.device.PosDeviceStatus;
import com.billbull.backend.pos.device.PosDeviceType;
import com.billbull.backend.pos.printer.PosPrinter;
import com.billbull.backend.pos.printer.PosPrinterRepository;
import com.billbull.backend.pos.scanner.PosScanner;
import com.billbull.backend.pos.scanner.PosScannerRepository;
import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.pos.terminal.PosTerminalStatus;
import org.springframework.context.ApplicationEventPublisher;

@ExtendWith(MockitoExtension.class)
class HardwareProfileAssignmentEngineTest {

    @Mock
    private PosHardwareProfileRepository profileRepo;
    @Mock
    private PosHardwareProfileDeviceRepository profileDeviceRepo;
    @Mock
    private PosTerminalRepository terminalRepo;
    @Mock
    private PosDeviceRepository deviceRepo;
    @Mock
    private PosPrinterRepository printerRepo;
    @Mock
    private PosScannerRepository scannerRepo;
    @Mock
    private PosCashDrawerRepository cashDrawerRepo;
    @Mock
    private PosDeviceEventLogService eventLogService;
    @Mock
    private ApplicationEventPublisher eventPublisher;

    private HardwareProfileAssignmentEngine engine;

    @BeforeEach
    void setUp() {
        engine = new HardwareProfileAssignmentEngine(profileRepo, profileDeviceRepo, terminalRepo, deviceRepo,
                printerRepo, scannerRepo, cashDrawerRepo, eventLogService, eventPublisher);
        lenient().when(terminalRepo.save(any(PosTerminal.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void rejectsUnknownTerminal() {
        when(terminalRepo.findByTerminalId("T-X")).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> engine.assign("T-X", 1L));
    }

    @Test
    void rejectsBlockedTerminal() {
        PosTerminal terminal = terminal("T1", 10L, PosTerminalStatus.BLOCKED);
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal));

        assertThrows(ResponseStatusException.class, () -> engine.assign("T1", 1L));
    }

    @Test
    void rejectsUnknownProfile() {
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal("T1", 10L, PosTerminalStatus.ACTIVE)));
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> engine.assign("T1", 1L));
    }

    @Test
    void rejectsInactiveProfile() {
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal("T1", 10L, PosTerminalStatus.ACTIVE)));
        PosHardwareProfile profile = profile(1L, PosHardwareProfileStatus.DECOMMISSIONED);
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(profile));

        assertThrows(ResponseStatusException.class, () -> engine.assign("T1", 1L));
    }

    @Test
    void rejectsProfileWithNoDevices() {
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal("T1", 10L, PosTerminalStatus.ACTIVE)));
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(profile(1L, PosHardwareProfileStatus.ACTIVE)));
        when(profileDeviceRepo.findByHardwareProfileId(1L)).thenReturn(List.of());

        assertThrows(ResponseStatusException.class, () -> engine.assign("T1", 1L));
    }

    @Test
    void rejectsWhenDeviceInactive() {
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal("T1", 10L, PosTerminalStatus.ACTIVE)));
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(profile(1L, PosHardwareProfileStatus.ACTIVE)));
        PosHardwareProfileDevice slot = slot(1L, "PRIMARY_RECEIPT_PRINTER", 7L);
        when(profileDeviceRepo.findByHardwareProfileId(1L)).thenReturn(List.of(slot));
        PosDevice device = device(7L, PosDeviceType.PRINTER, PosDeviceStatus.INACTIVE);
        when(deviceRepo.findById(7L)).thenReturn(Optional.of(device));

        assertThrows(ResponseStatusException.class, () -> engine.assign("T1", 1L));
    }

    @Test
    void rejectsConflictWithAnotherActiveTerminalsProfile() {
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal("T1", 10L, PosTerminalStatus.ACTIVE)));
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(profile(1L, PosHardwareProfileStatus.ACTIVE)));
        PosHardwareProfileDevice slot = slot(1L, "PRIMARY_RECEIPT_PRINTER", 7L);
        when(profileDeviceRepo.findByHardwareProfileId(1L)).thenReturn(List.of(slot));
        PosDevice device = device(7L, PosDeviceType.PRINTER, PosDeviceStatus.ACTIVE);
        when(deviceRepo.findById(7L)).thenReturn(Optional.of(device));

        // The same physical device (7L) is also slotted into a DIFFERENT profile (2L)...
        PosHardwareProfileDevice otherSlot = slot(2L, "PRIMARY_RECEIPT_PRINTER", 7L);
        when(profileDeviceRepo.findByDeviceId(7L)).thenReturn(List.of(slot, otherSlot));
        // ...and that other profile is currently bound to a DIFFERENT, active terminal.
        PosTerminal otherTerminal = terminal("T2", 10L, PosTerminalStatus.ACTIVE);
        otherTerminal.setId(99L);
        when(terminalRepo.findByHardwareProfileId(2L)).thenReturn(List.of(otherTerminal));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> engine.assign("T1", 1L));
        assertEquals(409, ex.getStatusCode().value());
    }

    @Test
    void allowsReassigningSameTerminalToSameProfileWithoutConflict() {
        PosTerminal terminal = terminal("T1", 10L, PosTerminalStatus.ACTIVE);
        terminal.setId(55L);
        terminal.setHardwareProfileId(1L); // already on this profile
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal));
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(profile(1L, PosHardwareProfileStatus.ACTIVE)));
        PosHardwareProfileDevice slot = slot(1L, "PRIMARY_RECEIPT_PRINTER", 7L);
        when(profileDeviceRepo.findByHardwareProfileId(1L)).thenReturn(List.of(slot));
        PosDevice device = device(7L, PosDeviceType.PRINTER, PosDeviceStatus.ACTIVE);
        when(deviceRepo.findById(7L)).thenReturn(Optional.of(device));
        // Same profile slot only — findByDeviceId returns just this one slot, no conflict possible.
        when(profileDeviceRepo.findByDeviceId(7L)).thenReturn(List.of(slot));

        PosTerminal result = engine.assign("T1", 1L);

        assertEquals(1L, result.getHardwareProfileId());
    }

    @Test
    void ignoresConflictFromDecommissionedTerminal() {
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal("T1", 10L, PosTerminalStatus.ACTIVE)));
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(profile(1L, PosHardwareProfileStatus.ACTIVE)));
        PosHardwareProfileDevice slot = slot(1L, "PRIMARY_RECEIPT_PRINTER", 7L);
        when(profileDeviceRepo.findByHardwareProfileId(1L)).thenReturn(List.of(slot));
        PosDevice device = device(7L, PosDeviceType.PRINTER, PosDeviceStatus.ACTIVE);
        when(deviceRepo.findById(7L)).thenReturn(Optional.of(device));
        PosHardwareProfileDevice otherSlot = slot(2L, "PRIMARY_RECEIPT_PRINTER", 7L);
        when(profileDeviceRepo.findByDeviceId(7L)).thenReturn(List.of(slot, otherSlot));
        PosTerminal decommissioned = terminal("T2", 10L, PosTerminalStatus.DECOMMISSIONED);
        decommissioned.setId(98L);
        when(terminalRepo.findByHardwareProfileId(2L)).thenReturn(List.of(decommissioned));

        PosTerminal result = engine.assign("T1", 1L);

        assertEquals(1L, result.getHardwareProfileId());
    }

    @Test
    void successfulAssignmentPersistsLogsEventsAndRefreshesPrinterRuntimeState() {
        PosTerminal terminal = terminal("T1", 10L, PosTerminalStatus.ACTIVE);
        terminal.setCounterName("Counter 1");
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal));
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(profile(1L, PosHardwareProfileStatus.ACTIVE)));
        PosHardwareProfileDevice slot = slot(1L, "PRIMARY_RECEIPT_PRINTER", 7L);
        when(profileDeviceRepo.findByHardwareProfileId(1L)).thenReturn(List.of(slot));
        PosDevice device = device(7L, PosDeviceType.PRINTER, PosDeviceStatus.ACTIVE);
        when(deviceRepo.findById(7L)).thenReturn(Optional.of(device));
        when(profileDeviceRepo.findByDeviceId(7L)).thenReturn(List.of(slot));
        PosPrinter printer = new PosPrinter();
        printer.setDeviceId(7L);
        when(printerRepo.findByDeviceId(7L)).thenReturn(Optional.of(printer));

        PosTerminal result = engine.assign("T1", 1L);

        assertEquals(1L, result.getHardwareProfileId());
        verify(eventLogService, times(1)).record(eq(7L), eq(PosDeviceEventType.CONFIGURATION_UPDATED),
                any(), any(), any(), any(), any());
        verify(printerRepo).save(printer);
        assertEquals("T1", printer.getTerminalId());
        assertEquals("Counter 1", printer.getCounterName());
    }

    @Test
    void successfulAssignmentStampsAssignedProfileVersionAndPublishesConfigurationChangedEvent() {
        PosTerminal terminal = terminal("T1", 10L, PosTerminalStatus.ACTIVE);
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal));
        PosHardwareProfile profile = profile(1L, PosHardwareProfileStatus.ACTIVE);
        profile.setVersion(4);
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(profile));
        PosHardwareProfileDevice slot = slot(1L, "PRIMARY_RECEIPT_PRINTER", 7L);
        when(profileDeviceRepo.findByHardwareProfileId(1L)).thenReturn(List.of(slot));
        PosDevice device = device(7L, PosDeviceType.PRINTER, PosDeviceStatus.ACTIVE);
        when(deviceRepo.findById(7L)).thenReturn(Optional.of(device));
        when(profileDeviceRepo.findByDeviceId(7L)).thenReturn(List.of(slot));

        PosTerminal result = engine.assign("T1", 1L);

        assertEquals(4, result.getAssignedProfileVersion());
        org.mockito.ArgumentCaptor<PosConfigurationChangedEvent> captor =
                org.mockito.ArgumentCaptor.forClass(PosConfigurationChangedEvent.class);
        verify(eventPublisher).publishEvent(captor.capture());
        PosConfigurationChangedEvent event = captor.getValue();
        assertEquals("T1", event.getTerminalId());
        assertEquals(1L, event.getHardwareProfileId());
        assertEquals(4, event.getProfileVersion());
    }

    @Test
    void scannerDeviceTypeRuntimeStateIsRefreshed() {
        PosTerminal terminal = terminal("T1", 10L, PosTerminalStatus.ACTIVE);
        terminal.setCounterName("Counter 1");
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal));
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(profile(1L, PosHardwareProfileStatus.ACTIVE)));
        PosHardwareProfileDevice slot = slot(1L, "SCANNER_1", 8L);
        when(profileDeviceRepo.findByHardwareProfileId(1L)).thenReturn(List.of(slot));
        PosDevice device = device(8L, PosDeviceType.SCANNER, PosDeviceStatus.ACTIVE);
        when(deviceRepo.findById(8L)).thenReturn(Optional.of(device));
        when(profileDeviceRepo.findByDeviceId(8L)).thenReturn(List.of(slot));
        PosScanner scanner = new PosScanner();
        scanner.setDeviceId(8L);
        when(scannerRepo.findByDeviceId(8L)).thenReturn(Optional.of(scanner));

        engine.assign("T1", 1L);

        verify(scannerRepo).save(scanner);
        assertEquals("T1", scanner.getTerminalId());
        assertEquals("Counter 1", scanner.getCounterName());
    }

    @Test
    void cashDrawerDeviceTypeRuntimeStateIsRefreshed() {
        PosTerminal terminal = terminal("T1", 10L, PosTerminalStatus.ACTIVE);
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal));
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(profile(1L, PosHardwareProfileStatus.ACTIVE)));
        PosHardwareProfileDevice slot = slot(1L, "CASH_DRAWER_1", 9L);
        when(profileDeviceRepo.findByHardwareProfileId(1L)).thenReturn(List.of(slot));
        PosDevice device = device(9L, PosDeviceType.CASH_DRAWER, PosDeviceStatus.ACTIVE);
        when(deviceRepo.findById(9L)).thenReturn(Optional.of(device));
        when(profileDeviceRepo.findByDeviceId(9L)).thenReturn(List.of(slot));
        PosCashDrawer drawer = new PosCashDrawer();
        drawer.setDeviceId(9L);
        when(cashDrawerRepo.findByDeviceId(9L)).thenReturn(Optional.of(drawer));

        engine.assign("T1", 1L);

        verify(cashDrawerRepo).save(drawer);
        assertEquals("T1", drawer.getTerminalId());
    }

    @Test
    void cardTerminalDeviceTypeIsStillNotRefreshed() {
        PosTerminal terminal = terminal("T1", 10L, PosTerminalStatus.ACTIVE);
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal));
        when(profileRepo.findByIdAndIsActiveTrue(1L)).thenReturn(Optional.of(profile(1L, PosHardwareProfileStatus.ACTIVE)));
        PosHardwareProfileDevice slot = slot(1L, "CARD_TERMINAL_1", 10L);
        when(profileDeviceRepo.findByHardwareProfileId(1L)).thenReturn(List.of(slot));
        PosDevice device = device(10L, PosDeviceType.CARD_TERMINAL, PosDeviceStatus.ACTIVE);
        when(deviceRepo.findById(10L)).thenReturn(Optional.of(device));
        when(profileDeviceRepo.findByDeviceId(10L)).thenReturn(List.of(slot));

        engine.assign("T1", 1L);

        verify(printerRepo, never()).findByDeviceId(any());
        verify(scannerRepo, never()).findByDeviceId(any());
        verify(cashDrawerRepo, never()).findByDeviceId(any());
    }

    private PosTerminal terminal(String terminalId, Long branchId, PosTerminalStatus status) {
        PosTerminal t = new PosTerminal();
        t.setId(1L);
        t.setTerminalId(terminalId);
        t.setBranchId(branchId);
        t.setBranchName("Main Branch");
        t.setStatus(status);
        return t;
    }

    private PosHardwareProfile profile(Long id, PosHardwareProfileStatus status) {
        PosHardwareProfile p = new PosHardwareProfile();
        p.setId(id);
        p.setProfileName("Standard Counter");
        p.setStatus(status);
        return p;
    }

    private PosHardwareProfileDevice slot(Long profileId, String role, Long deviceId) {
        PosHardwareProfileDevice s = new PosHardwareProfileDevice();
        s.setHardwareProfileId(profileId);
        s.setRole(role);
        s.setDeviceId(deviceId);
        return s;
    }

    private PosDevice device(Long id, PosDeviceType type, PosDeviceStatus status) {
        PosDevice d = new PosDevice();
        d.setId(id);
        d.setDeviceName("Device " + id);
        d.setDeviceType(type);
        d.setStatus(status);
        return d;
    }
}
