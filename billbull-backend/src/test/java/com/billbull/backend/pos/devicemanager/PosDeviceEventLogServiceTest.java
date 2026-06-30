package com.billbull.backend.pos.devicemanager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PosDeviceEventLogServiceTest {

    @Mock
    private PosDeviceEventLogRepository repository;

    private PosDeviceEventLogService service;

    @BeforeEach
    void setUp() {
        service = new PosDeviceEventLogService(repository);
    }

    @Test
    void recordSavesEventWithGivenFields() {
        when(repository.save(any(PosDeviceEventLog.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PosDeviceEventLog saved = service.record(7L, PosDeviceEventType.DEVICE_REGISTERED,
                PosDeviceEventResult.SUCCESS, "register", null, 1L, "T001");

        assertEquals(7L, saved.getDeviceId());
        assertEquals(PosDeviceEventType.DEVICE_REGISTERED, saved.getEventType());
        assertEquals(PosDeviceEventResult.SUCCESS, saved.getResult());
        assertEquals("register", saved.getOperation());
        assertEquals(1L, saved.getBranchId());
        assertEquals("T001", saved.getTerminalId());
    }

    @Test
    void tailForDelegatesToRepository() {
        PosDeviceEventLog event = new PosDeviceEventLog();
        when(repository.findTop50ByDeviceIdOrderByCreatedAtDesc(7L)).thenReturn(List.of(event));

        List<PosDeviceEventLog> result = service.tailFor(7L);

        assertEquals(1, result.size());
        verify(repository).findTop50ByDeviceIdOrderByCreatedAtDesc(7L);
    }
}
