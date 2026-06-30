package com.billbull.backend.pos.devicemanager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.device.PosDeviceType;

@ExtendWith(MockitoExtension.class)
class DiscoveryServiceTest {

    @Mock
    private PosDiscoveredDeviceRepository repo;

    private DiscoveryService service;

    @BeforeEach
    void setUp() {
        service = new DiscoveryService(repo);
        org.mockito.Mockito.lenient().when(repo.save(any(PosDiscoveredDevice.class)))
                .thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void ingestRejectsBlankAgentIdentifier() {
        DiscoveryService.CandidateRequest candidate =
                new DiscoveryService.CandidateRequest(DiscoveryMethod.USB, "VID_1234", PosDeviceType.PRINTER);

        assertThrows(ResponseStatusException.class, () -> service.ingest(" ", candidate));
    }

    @Test
    void ingestRejectsMissingRawIdentifier() {
        DiscoveryService.CandidateRequest candidate =
                new DiscoveryService.CandidateRequest(DiscoveryMethod.USB, null, PosDeviceType.PRINTER);

        assertThrows(ResponseStatusException.class, () -> service.ingest("AGENT-1", candidate));
    }

    @Test
    void ingestCreatesNewCandidateAsNew() {
        when(repo.findByAgentIdentifierAndRawIdentifier("AGENT-1", "VID_1234")).thenReturn(Optional.empty());
        DiscoveryService.CandidateRequest candidate =
                new DiscoveryService.CandidateRequest(DiscoveryMethod.USB, "VID_1234", PosDeviceType.PRINTER);

        PosDiscoveredDevice result = service.ingest("AGENT-1", candidate);

        assertEquals(DiscoveredDeviceStatus.NEW, result.getStatus());
        assertEquals("VID_1234", result.getRawIdentifier());
    }

    @Test
    void reDiscoveryDoesNotResurrectIgnoredCandidate() {
        PosDiscoveredDevice existing = new PosDiscoveredDevice();
        existing.setStatus(DiscoveredDeviceStatus.IGNORED);
        when(repo.findByAgentIdentifierAndRawIdentifier("AGENT-1", "VID_1234")).thenReturn(Optional.of(existing));
        DiscoveryService.CandidateRequest candidate =
                new DiscoveryService.CandidateRequest(DiscoveryMethod.USB, "VID_1234", PosDeviceType.PRINTER);

        PosDiscoveredDevice result = service.ingest("AGENT-1", candidate);

        assertEquals(DiscoveredDeviceStatus.IGNORED, result.getStatus());
    }

    @Test
    void ignoreTransitionsStatus() {
        PosDiscoveredDevice existing = new PosDiscoveredDevice();
        existing.setId(1L);
        existing.setStatus(DiscoveredDeviceStatus.NEW);
        when(repo.findById(1L)).thenReturn(Optional.of(existing));

        PosDiscoveredDevice result = service.ignore(1L);

        assertEquals(DiscoveredDeviceStatus.IGNORED, result.getStatus());
    }
}
