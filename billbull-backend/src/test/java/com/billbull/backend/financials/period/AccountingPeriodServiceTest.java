package com.billbull.backend.financials.period;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class AccountingPeriodServiceTest {

    @Mock
    private AccountingPeriodRepository repository;

    @InjectMocks
    private AccountingPeriodService service;

    @Test
    void rejectsAnEndDateBeforeTheStartDate() {
        AccountingPeriod period = period("August 2026", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 7, 3));

        assertThatThrownBy(() -> service.createPeriod(period))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("cannot be before start date");

        verify(repository, never()).save(any());
    }

    @Test
    void rejectsARangeThatOverlapsAnExistingPeriod() {
        LocalDate start = LocalDate.of(2026, 8, 1);
        LocalDate end   = LocalDate.of(2026, 8, 31);
        when(repository.findOverlapping(start, end))
                .thenReturn(List.of(period("August 2026", start, end)));

        AccountingPeriod duplicate = period("August 2026", start, end);

        assertThatThrownBy(() -> service.createPeriod(duplicate))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("overlap the existing period 'August 2026'");

        verify(repository, never()).save(any());
    }

    @Test
    void rejectsABlankPeriodName() {
        AccountingPeriod period = period("   ", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31));

        assertThatThrownBy(() -> service.createPeriod(period))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Period name is required");

        verify(repository, never()).save(any());
    }

    @Test
    void savesANonOverlappingPeriodAsOpen() {
        LocalDate start = LocalDate.of(2026, 9, 1);
        LocalDate end   = LocalDate.of(2026, 9, 30);
        when(repository.findOverlapping(start, end)).thenReturn(List.of());
        AccountingPeriod period = period("  September 2026  ", start, end);
        when(repository.save(period)).thenReturn(period);

        AccountingPeriod saved = service.createPeriod(period);

        assertThat(saved.getStatus()).isEqualTo(AccountingPeriod.STATUS_OPEN);
        assertThat(saved.getPeriodName()).isEqualTo("September 2026");
        verify(repository).save(period);
    }

    private AccountingPeriod period(String name, LocalDate start, LocalDate end) {
        AccountingPeriod p = new AccountingPeriod();
        p.setPeriodName(name);
        p.setStartDate(start);
        p.setEndDate(end);
        return p;
    }
}
