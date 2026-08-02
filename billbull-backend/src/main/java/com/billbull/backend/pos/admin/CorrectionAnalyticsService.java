package com.billbull.backend.pos.admin;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Enterprise Console &gt; POS Administration &gt; Analytics (Phase 5 §8). Every metric here is
 * a reporting computation over existing {@link CorrectionRequest} data — nothing feeds back
 * into a financial calculation, and no new posting or workflow logic is introduced. Average
 * durations are computed in Java over a small, already-filtered (non-null timestamp) result
 * set fetched via a single SQL query each — not full-table scans.
 */
@Service
public class CorrectionAnalyticsService {

    private final CorrectionRequestRepository repo;

    public CorrectionAnalyticsService(CorrectionRequestRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public CorrectionAnalyticsResponse getAnalytics() {
        CorrectionAnalyticsResponse resp = new CorrectionAnalyticsResponse();

        resp.setTopBranches(repo.topBranches(PageRequest.of(0, 10)).getContent().stream()
                .map(row -> new CorrectionAnalyticsResponse.NamedCount(String.valueOf(row[0]), (Long) row[1]))
                .toList());
        resp.setTopRequesters(repo.topRequesters(PageRequest.of(0, 10)).getContent().stream()
                .map(row -> new CorrectionAnalyticsResponse.NamedCount((String) row[0], (Long) row[1]))
                .toList());

        Map<String, Long> typeCounts = new LinkedHashMap<>();
        for (Object[] row : repo.countByCorrectionType()) {
            typeCounts.put(((CorrectionType) row[0]).name(), (Long) row[1]);
        }
        resp.setCorrectionTypeCounts(typeCounts);

        Map<CorrectionRequestStatus, Long> statusCounts = new LinkedHashMap<>();
        for (Object[] row : repo.countByStatus()) {
            statusCounts.put((CorrectionRequestStatus) row[0], (Long) row[1]);
        }
        long applied = statusCounts.getOrDefault(CorrectionRequestStatus.APPLIED, 0L);
        long failed = statusCounts.getOrDefault(CorrectionRequestStatus.FAILED, 0L);
        long rejected = statusCounts.getOrDefault(CorrectionRequestStatus.REJECTED, 0L);
        long cancelled = statusCounts.getOrDefault(CorrectionRequestStatus.CANCELLED, 0L);
        long terminal = applied + failed + rejected + cancelled;
        resp.setAppliedCount(applied);
        resp.setFailedCount(failed);
        resp.setTerminalCount(terminal);
        resp.setSuccessRatePercent(terminal == 0 ? 0.0 : round((double) applied / terminal * 100));
        resp.setFailureRatePercent(terminal == 0 ? 0.0 : round((double) failed / terminal * 100));

        resp.setAverageApprovalMinutes(averageMinutes(repo.findApprovalDurations()));
        resp.setAverageExecutionMinutes(averageMinutes(repo.findExecutionDurations()));

        resp.setCorrectionsByBusinessDate(repo.countByBusinessDate(PageRequest.of(0, 30)).getContent().stream()
                .map(row -> new CorrectionAnalyticsResponse.DateCount(String.valueOf(row[0]), (Long) row[1]))
                .toList());
        resp.setCorrectionsByMonth(groupByMonth(repo.countByBusinessDate(PageRequest.of(0, 365)).getContent()));

        return resp;
    }

    private Double averageMinutes(List<Object[]> pairs) {
        if (pairs.isEmpty()) return null;
        long totalMinutes = 0;
        int counted = 0;
        for (Object[] pair : pairs) {
            LocalDateTime start = (LocalDateTime) pair[0];
            LocalDateTime end = (LocalDateTime) pair[1];
            if (start == null || end == null) continue;
            totalMinutes += Duration.between(start, end).toMinutes();
            counted++;
        }
        return counted == 0 ? null : round((double) totalMinutes / counted);
    }

    /** Rolls up the (already SQL-grouped) per-business-date counts into per-month counts in
     *  Java — bounded to at most 365 rows (one year of business dates), not a full scan. */
    private List<CorrectionAnalyticsResponse.DateCount> groupByMonth(List<Object[]> byDate) {
        DateTimeFormatter monthFmt = DateTimeFormatter.ofPattern("yyyy-MM");
        Map<String, Long> byMonth = new LinkedHashMap<>();
        for (Object[] row : byDate) {
            LocalDate date = (LocalDate) row[0];
            long count = (Long) row[1];
            String month = date.format(monthFmt);
            byMonth.merge(month, count, Long::sum);
        }
        return byMonth.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByKey().reversed())
                .map(e -> new CorrectionAnalyticsResponse.DateCount(e.getKey(), e.getValue()))
                .toList();
    }

    private double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
