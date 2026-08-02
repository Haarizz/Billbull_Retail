package com.billbull.backend.pos.reports;

import com.billbull.backend.pos.dayclose.PosDayClose;
import com.billbull.backend.pos.dayclose.PosDayCloseRepository;
import com.billbull.backend.util.PageResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.Map;

/**
 * Back-office "POS Reports" module — read-only browser over already-generated,
 * immutable X-Report snapshots ({@link PosXReportSnapshot}) and Z-Report snapshots
 * ({@link PosDayClose#getzReportJson()}). Never recomputes a report from live
 * transactional data; every value returned here is exactly what was persisted at
 * generation/close time.
 */
@Service
public class PosReportsService {

    private final PosXReportSnapshotRepository xRepo;
    private final PosDayCloseRepository zRepo;
    private final ObjectMapper objectMapper;

    public PosReportsService(PosXReportSnapshotRepository xRepo, PosDayCloseRepository zRepo, ObjectMapper objectMapper) {
        this.xRepo = xRepo;
        this.zRepo = zRepo;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public PageResponse<PosReportSummary> listX(Long branchId, LocalDate dateFrom, LocalDate dateTo,
                                                 String reportNumber, String generatedBy, String terminalId,
                                                 Long counterId, String cashier, Long sessionId,
                                                 int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), size <= 0 ? 20 : size);
        Page<PosXReportSnapshot> result = xRepo.search(branchId, dateFrom, dateTo, blankToNull(reportNumber),
                blankToNull(generatedBy), blankToNull(terminalId), counterId, blankToNull(cashier), sessionId, pageable);
        var content = result.getContent().stream().map(PosReportSummary::fromX).toList();
        return new PageResponse<>(content, result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public PageResponse<PosReportSummary> listZ(Long branchId, LocalDate dateFrom, LocalDate dateTo,
                                                 String reportNumber, String generatedBy,
                                                 int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), size <= 0 ? 20 : size);
        Page<PosDayClose> result = zRepo.search(branchId, dateFrom, dateTo, blankToNull(reportNumber), blankToNull(generatedBy), pageable);
        var content = result.getContent().stream().map(PosReportSummary::fromZ).toList();
        return new PageResponse<>(content, result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public PosReportDetail getXDetail(Long id) {
        PosXReportSnapshot snapshot = xRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "X-Report snapshot not found: " + id));
        return PosReportDetail.fromX(snapshot, parseJson(snapshot.getReportJson()));
    }

    @Transactional(readOnly = true)
    public PosReportDetail getZDetail(Long id) {
        PosDayClose dayClose = zRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Z-Report not found: " + id));
        return PosReportDetail.fromZ(dayClose, parseJson(dayClose.getzReportJson()));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseJson(String json) {
        if (json == null || json.isBlank()) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Report snapshot is missing its stored payload");
        }
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to parse stored report snapshot");
        }
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
