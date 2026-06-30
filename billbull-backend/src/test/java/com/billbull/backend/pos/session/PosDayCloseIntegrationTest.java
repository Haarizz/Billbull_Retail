package com.billbull.backend.pos.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.pos.dayclose.PosDayClose;
import com.billbull.backend.pos.dayclose.PosDayCloseRepository;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.fasterxml.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class PosDayCloseIntegrationTest {

    @Mock private PosSessionRepository posSessionRepository;
    @Mock private SalesInvoiceRepository invoiceRepository;
    @Mock private PosDayCloseRepository posDayCloseRepository;
    @Mock private BranchAccessService branchAccessService;
    @Mock private ObjectMapper objectMapper;

    @InjectMocks
    private PosSessionService posSessionService;

    @Test
    void testCloseDayThrowsExceptionIfAlreadyClosed() {
        Long branchId = 1L;
        LocalDate date = LocalDate.now();

        when(posDayCloseRepository.existsByBranchIdAndCloseDate(branchId, date)).thenReturn(true);

        ResponseStatusException exception = assertThrows(ResponseStatusException.class, () -> {
            posSessionService.closeDay(branchId, date);
        });
        
        assertEquals("409 CONFLICT \"Business day has already been closed.\"", exception.getMessage());
    }
}
