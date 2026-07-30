package com.billbull.backend.pos.admin;

import com.billbull.backend.util.PageResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Enterprise Console &gt; POS Administration &gt; Correction History (Phase 5 §3). Unified,
 * cross-domain search over {@link CorrectionRequest} — the one table every correction type
 * already writes to, so "session", "receipt voucher", and "cash movement" corrections are all
 * searchable from one screen via {@code targetType}+{@code targetId} rather than needing three
 * separate history views. Reuses the existing {@link CorrectionRequestResponse} DTO — no new
 * response shape, no duplicated projection logic.
 */
@Service
public class CorrectionHistoryService {

    private final CorrectionRequestRepository repo;

    public CorrectionHistoryService(CorrectionRequestRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public PageResponse<CorrectionRequestResponse> search(Long branchId, CorrectionRequestStatus status,
                                                           CorrectionTargetType targetType, CorrectionType correctionType,
                                                           Long targetId, String requestedBy, String approvedBy,
                                                           LocalDate fromDate, LocalDate toDate, String search,
                                                           int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), size <= 0 ? 20 : size);
        LocalDateTime from = fromDate != null ? fromDate.atStartOfDay() : null;
        LocalDateTime to = toDate != null ? toDate.atTime(23, 59, 59) : null;

        Page<CorrectionRequest> result = repo.searchHistory(branchId, status, targetType, correctionType, targetId,
                blankToNull(requestedBy), blankToNull(approvedBy), from, to, blankToNull(search), pageable);
        var content = result.getContent().stream().map(CorrectionRequestResponse::from).toList();
        return new PageResponse<>(content, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    private String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }
}
