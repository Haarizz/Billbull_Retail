package com.billbull.backend.pos.devicemanager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.device.PosDevice;
import com.billbull.backend.pos.device.PosDeviceRepository;
import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalRepository;

@ExtendWith(MockitoExtension.class)
class HardwareProfileServiceTest {

    @Mock
    private PosHardwareProfileRepository profileRepo;

    @Mock
    private PosHardwareProfileDeviceRepository profileDeviceRepo;

    @Mock
    private PosDeviceRepository deviceRepo;

    @Mock
    private PosTerminalRepository terminalRepo;

    private HardwareProfileService service;

    @BeforeEach
    void setUp() {
        service = new HardwareProfileService(profileRepo, profileDeviceRepo, deviceRepo, terminalRepo);
        lenient().when(profileRepo.save(any(PosHardwareProfile.class))).thenAnswer(inv -> {
            PosHardwareProfile p = inv.getArgument(0);
            if (p.getId() == null) p.setId(1L);
            return p;
        });
    }

    @Test
    void createRejectsBlankName() {
        HardwareProfileService.CreateRequest req = new HardwareProfileService.CreateRequest("  ", 10L, null);

        assertThrows(ResponseStatusException.class, () -> service.create(req));
    }

    @Test
    void createRejectsDuplicateNameWithinSameBranch() {
        PosHardwareProfile existing = new PosHardwareProfile();
        existing.setId(5L);
        existing.setProfileName("Standard Counter");
        existing.setBranchId(10L);
        existing.setStatus(PosHardwareProfileStatus.ACTIVE);
        when(profileRepo.findByBranchIdOrderByProfileNameAsc(10L)).thenReturn(List.of(existing));

        HardwareProfileService.CreateRequest req = new HardwareProfileService.CreateRequest("Standard Counter", 10L, null);

        assertThrows(ResponseStatusException.class, () -> service.create(req));
    }

    @Test
    void createAllowsSameNameInDifferentBranches() {
        when(profileRepo.findByBranchIdOrderByProfileNameAsc(20L)).thenReturn(List.of());

        HardwareProfileService.CreateRequest req = new HardwareProfileService.CreateRequest("Standard Counter", 20L, "desc");
        PosHardwareProfile created = service.create(req);

        assertEquals("Standard Counter", created.getProfileName());
        assertEquals(20L, created.getBranchId());
    }

    @Test
    void assignDeviceToRoleRejectsUnknownDevice() {
        PosHardwareProfile profile = new PosHardwareProfile();
        profile.setId(1L);
        when(profileRepo.findById(1L)).thenReturn(Optional.of(profile));
        when(deviceRepo.findById(99L)).thenReturn(Optional.empty());

        HardwareProfileService.AssignRoleRequest req = new HardwareProfileService.AssignRoleRequest("PRIMARY_RECEIPT_PRINTER", 99L);

        assertThrows(ResponseStatusException.class, () -> service.assignDeviceToRole(1L, req));
    }

    @Test
    void assignDeviceToRoleCreatesNewSlot() {
        PosHardwareProfile profile = new PosHardwareProfile();
        profile.setId(1L);
        when(profileRepo.findById(1L)).thenReturn(Optional.of(profile));
        PosDevice device = new PosDevice();
        device.setId(7L);
        when(deviceRepo.findById(7L)).thenReturn(Optional.of(device));
        when(profileDeviceRepo.findByHardwareProfileIdAndRole(1L, "PRIMARY_RECEIPT_PRINTER")).thenReturn(Optional.empty());
        when(profileDeviceRepo.save(any(PosHardwareProfileDevice.class))).thenAnswer(inv -> inv.getArgument(0));

        HardwareProfileService.AssignRoleRequest req = new HardwareProfileService.AssignRoleRequest("PRIMARY_RECEIPT_PRINTER", 7L);
        PosHardwareProfileDevice slot = service.assignDeviceToRole(1L, req);

        assertEquals(7L, slot.getDeviceId());
        assertEquals("PRIMARY_RECEIPT_PRINTER", slot.getRole());
        assertEquals(1L, slot.getHardwareProfileId());
    }

    @Test
    void assignDeviceToRoleReplacesExistingSlotForSameRole() {
        PosHardwareProfile profile = new PosHardwareProfile();
        profile.setId(1L);
        when(profileRepo.findById(1L)).thenReturn(Optional.of(profile));
        PosDevice device = new PosDevice();
        device.setId(8L);
        when(deviceRepo.findById(8L)).thenReturn(Optional.of(device));
        PosHardwareProfileDevice existingSlot = new PosHardwareProfileDevice();
        existingSlot.setId(42L);
        existingSlot.setHardwareProfileId(1L);
        existingSlot.setRole("PRIMARY_RECEIPT_PRINTER");
        existingSlot.setDeviceId(5L);
        when(profileDeviceRepo.findByHardwareProfileIdAndRole(1L, "PRIMARY_RECEIPT_PRINTER")).thenReturn(Optional.of(existingSlot));
        when(profileDeviceRepo.save(any(PosHardwareProfileDevice.class))).thenAnswer(inv -> inv.getArgument(0));

        HardwareProfileService.AssignRoleRequest req = new HardwareProfileService.AssignRoleRequest("PRIMARY_RECEIPT_PRINTER", 8L);
        PosHardwareProfileDevice slot = service.assignDeviceToRole(1L, req);

        assertEquals(42L, slot.getId());
        assertEquals(8L, slot.getDeviceId());
    }

    @Test
    void updateBumpsProfileVersion() {
        PosHardwareProfile profile = new PosHardwareProfile();
        profile.setId(1L);
        profile.setProfileName("Old Name");
        profile.setBranchId(10L);
        assertEquals(1, profile.getVersion());
        when(profileRepo.findById(1L)).thenReturn(Optional.of(profile));
        when(profileRepo.findByBranchIdOrderByProfileNameAsc(10L)).thenReturn(List.of());

        HardwareProfileService.CreateRequest req = new HardwareProfileService.CreateRequest("New Name", 10L, null);
        PosHardwareProfile updated = service.update(1L, req);

        assertEquals(2, updated.getVersion());
    }

    @Test
    void assignDeviceToRoleBumpsProfileVersion() {
        PosHardwareProfile profile = new PosHardwareProfile();
        profile.setId(1L);
        assertEquals(1, profile.getVersion());
        when(profileRepo.findById(1L)).thenReturn(Optional.of(profile));
        PosDevice device = new PosDevice();
        device.setId(7L);
        when(deviceRepo.findById(7L)).thenReturn(Optional.of(device));
        when(profileDeviceRepo.findByHardwareProfileIdAndRole(1L, "PRIMARY_RECEIPT_PRINTER")).thenReturn(Optional.empty());
        when(profileDeviceRepo.save(any(PosHardwareProfileDevice.class))).thenAnswer(inv -> inv.getArgument(0));

        service.assignDeviceToRole(1L, new HardwareProfileService.AssignRoleRequest("PRIMARY_RECEIPT_PRINTER", 7L));

        assertEquals(2, profile.getVersion());
    }

    @Test
    void getSyncStatusReportsInSyncWhenVersionsMatch() {
        PosTerminal terminal = new PosTerminal();
        terminal.setTerminalId("T1");
        terminal.setHardwareProfileId(1L);
        terminal.setAssignedProfileVersion(3);
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal));
        PosHardwareProfile profile = new PosHardwareProfile();
        profile.setId(1L);
        profile.setVersion(3);
        when(profileRepo.findById(1L)).thenReturn(Optional.of(profile));

        HardwareProfileService.SyncStatus status = service.getSyncStatus("T1");

        assertEquals(true, status.inSync());
        assertEquals(3, status.currentVersion());
    }

    @Test
    void getSyncStatusReportsOutOfSyncWhenProfileEditedSinceAssignment() {
        PosTerminal terminal = new PosTerminal();
        terminal.setTerminalId("T1");
        terminal.setHardwareProfileId(1L);
        terminal.setAssignedProfileVersion(2);
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal));
        PosHardwareProfile profile = new PosHardwareProfile();
        profile.setId(1L);
        profile.setVersion(3); // edited since this terminal was assigned
        when(profileRepo.findById(1L)).thenReturn(Optional.of(profile));

        HardwareProfileService.SyncStatus status = service.getSyncStatus("T1");

        assertEquals(false, status.inSync());
    }

    @Test
    void getSyncStatusReportsOutOfSyncWhenTerminalHasNoProfile() {
        PosTerminal terminal = new PosTerminal();
        terminal.setTerminalId("T1");
        when(terminalRepo.findByTerminalId("T1")).thenReturn(Optional.of(terminal));

        HardwareProfileService.SyncStatus status = service.getSyncStatus("T1");

        assertEquals(false, status.inSync());
    }
}
