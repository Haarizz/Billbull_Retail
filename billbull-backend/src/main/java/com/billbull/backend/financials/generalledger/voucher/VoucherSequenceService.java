package com.billbull.backend.financials.generalledger.voucher;

import java.time.LocalDate;
import java.time.Year;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

/**
 * Issues voucher numbers in the format {@code {TYPE}-{BRANCH}-{YYYY}-{NNNNNN}}
 * (e.g. {@code SI-DXB-2026-000123}), with an independent running counter per
 * {@code (transactionType, branchCode, fiscalYear)} triple.
 *
 * Concurrency: {@link #nextVoucherNumber} runs in its own {@code REQUIRES_NEW}
 * transaction and locks the counter row ({@code SELECT ... FOR UPDATE}) before
 * incrementing, so two threads posting against the same triple are serialized
 * and never produce duplicate numbers. The first use of a triple creates the
 * row; a concurrent create losing the unique-constraint race retries the
 * locked read.
 */
@Service
@Slf4j
public class VoucherSequenceService {

    public static final String DEFAULT_BRANCH_CODE = "HO";

    private final VoucherSequenceRepository repository;

    public VoucherSequenceService(VoucherSequenceRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String nextVoucherNumber(String transactionType, String branchCode, LocalDate date) {
        String type = (transactionType == null || transactionType.isBlank())
                ? "JV" : transactionType.trim().toUpperCase();
        String branch = (branchCode == null || branchCode.isBlank())
                ? DEFAULT_BRANCH_CODE : branchCode.trim().toUpperCase();
        int fiscalYear = date != null ? date.getYear() : Year.now().getValue();

        VoucherSequence seq = lockOrCreate(type, branch, fiscalYear);
        seq.setLastNumber(seq.getLastNumber() + 1);
        repository.save(seq);

        return String.format("%s-%s-%d-%06d", type, branch, fiscalYear, seq.getLastNumber());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String nextGlobalVoucherNumber(String transactionType, LocalDate date) {
        String type = (transactionType == null || transactionType.isBlank())
                ? "JV" : transactionType.trim().toUpperCase();
        int fiscalYear = date != null ? date.getYear() : Year.now().getValue();

        VoucherSequence seq = lockOrCreate(type, "GLOBAL", fiscalYear);
        seq.setLastNumber(seq.getLastNumber() + 1);
        repository.save(seq);

        return String.format("%s-%d-%05d", type, fiscalYear, seq.getLastNumber());
    }

    private VoucherSequence lockOrCreate(String type, String branch, int fiscalYear) {
        return repository.findForUpdate(type, branch, fiscalYear)
                .orElseGet(() -> createRow(type, branch, fiscalYear));
    }

    private VoucherSequence createRow(String type, String branch, int fiscalYear) {
        try {
            return repository.saveAndFlush(new VoucherSequence(type, branch, fiscalYear, 0L));
        } catch (DataIntegrityViolationException raceLost) {
            // Another thread created the same triple first — re-read under lock.
            log.debug("[VoucherSequence] Lost create race for {}-{}-{}, re-reading.", type, branch, fiscalYear);
            return repository.findForUpdate(type, branch, fiscalYear)
                    .orElseThrow(() -> raceLost);
        }
    }
}
