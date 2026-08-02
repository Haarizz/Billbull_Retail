package com.billbull.backend.pos.reports;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Issues immutable POS report numbers in the format {@code {TYPE}-{yyyyMMdd}-{NNNNNN}}
 * (e.g. {@code XR-20260728-000001}), with an independent per-day counter per
 * {@code (reportType, branchId, businessDate)} triple — mirrors
 * {@code VoucherSequenceService}'s locking pattern (own {@code REQUIRES_NEW} transaction,
 * {@code SELECT ... FOR UPDATE}) so concurrent X-Report generations on the same branch/date
 * never collide.
 */
@Service
public class PosReportNumberService {

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final PosReportSequenceRepository repository;

    public PosReportNumberService(PosReportSequenceRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String nextReportNumber(String reportType, Long branchId, LocalDate businessDate) {
        PosReportSequence seq = lockOrCreate(reportType, branchId, businessDate);
        seq.setLastNumber(seq.getLastNumber() + 1);
        repository.save(seq);
        return String.format("%s-%s-%06d", reportType, businessDate.format(DATE_FORMAT), seq.getLastNumber());
    }

    private PosReportSequence lockOrCreate(String reportType, Long branchId, LocalDate businessDate) {
        return repository.findForUpdate(reportType, branchId, businessDate)
                .orElseGet(() -> createRow(reportType, branchId, businessDate));
    }

    private PosReportSequence createRow(String reportType, Long branchId, LocalDate businessDate) {
        try {
            return repository.saveAndFlush(new PosReportSequence(reportType, branchId, businessDate, 0L));
        } catch (DataIntegrityViolationException raceLost) {
            return repository.findForUpdate(reportType, branchId, businessDate)
                    .orElseThrow(() -> raceLost);
        }
    }
}
