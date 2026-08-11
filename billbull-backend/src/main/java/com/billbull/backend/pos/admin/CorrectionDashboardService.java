package com.billbull.backend.pos.admin;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Enterprise Console &gt; POS Administration &gt; Dashboard (Phase 5 §2). Read-only aggregate
 * counts, computed via SQL-side GROUP BY on {@link CorrectionRequest} — the single backbone
 * table every correction type (denomination, transaction, cash-movement category) already
 * writes to via {@link CorrectionRequestService}, so no per-domain aggregation is needed here.
 * Never loads/counts rows in memory; every number comes from a bounded database query.
 */
@Service
public class CorrectionDashboardService {

    private final CorrectionRequestRepository repo;
    private final PosCashMovementCategoryRepository categoryRepository;
    /** "Today" and "this month" on the correction dashboard are business periods — they
     *  must match the Business Day the branch is actually trading in. */
    private final com.billbull.backend.pos.businessdate.BusinessDayClock clock;

    public CorrectionDashboardService(CorrectionRequestRepository repo,
                                       PosCashMovementCategoryRepository categoryRepository,
                                      com.billbull.backend.pos.businessdate.BusinessDayClock clock) {
        this.repo = repo;
        this.categoryRepository = categoryRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public CorrectionDashboardResponse getDashboard() {
        CorrectionDashboardResponse resp = new CorrectionDashboardResponse();

        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (CorrectionRequestStatus s : CorrectionRequestStatus.values()) {
            statusCounts.put(s.name(), 0L);
        }
        for (Object[] row : repo.countByStatus()) {
            statusCounts.put(((CorrectionRequestStatus) row[0]).name(), (Long) row[1]);
        }
        resp.setStatusCounts(statusCounts);

        Map<String, Long> typeCounts = new LinkedHashMap<>();
        for (Object[] row : repo.countByCorrectionType()) {
            typeCounts.put(((CorrectionType) row[0]).name(), (Long) row[1]);
        }
        resp.setCorrectionTypeCounts(typeCounts);

        LocalDateTime startOfToday = clock.now().toLocalDate().atStartOfDay();
        LocalDateTime startOfMonth = clock.now().toLocalDate().withDayOfMonth(1).atStartOfDay();
        resp.setTodayCount(repo.countRequestedSince(startOfToday));
        resp.setThisMonthCount(repo.countRequestedSince(startOfMonth));

        resp.setActiveCategoriesCount(categoryRepository.countByIsActiveTrue());

        resp.setTopRequesters(repo.topRequesters(PageRequest.of(0, 10)).getContent().stream()
                .map(row -> new CorrectionDashboardResponse.NamedCount((String) row[0], (Long) row[1]))
                .toList());
        resp.setTopBranches(repo.topBranches(PageRequest.of(0, 10)).getContent().stream()
                .map(row -> new CorrectionDashboardResponse.NamedCount(String.valueOf(row[0]), (Long) row[1]))
                .toList());

        return resp;
    }
}
