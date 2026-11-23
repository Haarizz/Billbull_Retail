package com.billbull.backend.pos.counter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.settings.branch.BranchAccessService;

@ExtendWith(MockitoExtension.class)
class PosCounterServiceTest {

    @Mock private PosCounterRepository repo;
    @Mock private PosTerminalRepository terminalRepo;
    @Mock private BranchAccessService branchAccessService;

    private PosCounterService service;

    @BeforeEach
    void setUp() {
        service = new PosCounterService(repo, terminalRepo, branchAccessService);
        lenient().when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private PosCounter counter(Long id, String name) {
        PosCounter c = new PosCounter();
        c.setId(id);
        c.setBranchId(1L);
        c.setCounterCode("CTR-001");
        c.setCounterName(name);
        c.setStatus(PosCounterStatus.ACTIVE);
        return c;
    }

    @Test
    void deleteIgnoresArchivedTerminalsAndReleasesThem() {
        when(repo.findById(5L)).thenReturn(Optional.of(counter(5L, "Counter 1")));
        when(terminalRepo.countLiveByCounterIdExcluding(5L, -1L)).thenReturn(0L);

        service.delete(5L);

        verify(terminalRepo).detachRetiredFromCounter(5L);
        verify(repo).save(any());
    }

    @Test
    void deleteStillBlockedByAnInServiceTerminal() {
        PosCounter c = counter(5L, "Counter 1");
        when(repo.findById(5L)).thenReturn(Optional.of(c));
        when(terminalRepo.countLiveByCounterIdExcluding(5L, -1L)).thenReturn(1L);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.delete(5L));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(terminalRepo, never()).detachRetiredFromCounter(anyLong());
        assertTrue(c.isActive());
    }

    @Test
    void renameCarriesTheNewNameToItsTerminals() {
        when(repo.findById(5L)).thenReturn(Optional.of(counter(5L, "Counter 1")));

        PosCounter saved = service.update(5L, " Front Till ", null, null, null, null);

        assertEquals("Front Till", saved.getCounterName());
        verify(terminalRepo).syncCounterName(5L, "Front Till");
    }

    @Test
    void updateWithoutANameChangeLeavesTerminalsAlone() {
        when(repo.findById(5L)).thenReturn(Optional.of(counter(5L, "Counter 1")));

        service.update(5L, "Counter 1", "desc", null, null, null);

        verify(terminalRepo, never()).syncCounterName(anyLong(), anyString());
    }

    @Test
    void nextCounterCodeContinuesAfterTheHighest() {
        when(repo.findMaxCounterCodeByBranchId(1L)).thenReturn("CTR-007");
        assertEquals("CTR-008", PosCounterService.nextCounterCode(repo, 1L));
    }
}
