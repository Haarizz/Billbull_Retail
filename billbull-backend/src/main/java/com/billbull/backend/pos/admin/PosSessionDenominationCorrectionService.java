package com.billbull.backend.pos.admin;

import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.util.PageResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Enterprise Console &gt; POS Administration &gt; Session Denomination Corrections (Phase 3).
 * Drives the generic {@link CorrectionRequestService} state machine for {@code
 * CorrectionTargetType.POS_SESSION} / {@code CorrectionType.DENOMINATION} requests, and keeps
 * the denomination-specific {@link PosSessionDenominationCorrection} row's mirrored status/
 * actor/timestamp columns in lockstep. Never touches {@code PosSession}, {@code
 * PosXReportSnapshot}, or {@code PosDayClose} — this service only ever reads {@code
 * PosSession.closingDenominationsJson} (to snapshot the "original") and writes rows in its own
 * table. "Applying" a denomination correction has no external financial effect (no GL, no
 * inventory, no cash movement) — it only makes the correction the new effective overlay for
 * display, so approval and apply remain two distinct, explicit actions (never auto-chained)
 * exactly like every other correction type, even though this one carries no execution risk.
 */
@Service
public class PosSessionDenominationCorrectionService {

    private static final String ENTITY_TYPE = "POS_SESSION_DENOMINATION_CORRECTION";

    private final PosSessionDenominationCorrectionRepository repo;
    private final CorrectionRequestRepository correctionRequestRepo;
    private final CorrectionRequestService correctionRequestService;
    private final PosSessionRepository posSessionRepository;
    private final FinancialAuditService auditService;
    private final ObjectMapper objectMapper;
    private final CorrectionOverlayRepository overlayRepository;

    public PosSessionDenominationCorrectionService(PosSessionDenominationCorrectionRepository repo,
                                                    CorrectionRequestRepository correctionRequestRepo,
                                                    CorrectionRequestService correctionRequestService,
                                                    PosSessionRepository posSessionRepository,
                                                    FinancialAuditService auditService,
                                                    ObjectMapper objectMapper,
                                                    CorrectionOverlayRepository overlayRepository) {
        this.repo = repo;
        this.correctionRequestRepo = correctionRequestRepo;
        this.correctionRequestService = correctionRequestService;
        this.posSessionRepository = posSessionRepository;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
        this.overlayRepository = overlayRepository;
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    // ── Denomination map parsing (flat "{denominationValue: count}" — the same shape the POS
    // terminal's close-session dialog already sends as closingDenominations, e.g. {"500": 2}) ──

    @SuppressWarnings("unchecked")
    private Map<String, Integer> parseDenominations(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            Map<String, Object> raw = objectMapper.readValue(json, Map.class);
            Map<String, Integer> result = new LinkedHashMap<>();
            raw.forEach((k, v) -> result.put(k, v == null ? 0 : Integer.parseInt(v.toString())));
            return result;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid denomination data: " + e.getMessage());
        }
    }

    private BigDecimal total(Map<String, Integer> denominations) {
        BigDecimal sum = BigDecimal.ZERO;
        for (Map.Entry<String, Integer> e : denominations.entrySet()) {
            BigDecimal value;
            try {
                value = new BigDecimal(e.getKey());
            } catch (NumberFormatException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid denomination value: " + e.getKey());
            }
            int count = e.getValue() == null ? 0 : e.getValue();
            if (count < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Denomination count cannot be negative: " + e.getKey());
            }
            sum = sum.add(value.multiply(BigDecimal.valueOf(count)));
        }
        return sum;
    }

    private String toJson(Map<String, Integer> map) {
        try {
            return objectMapper.writeValueAsString(map);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize denominations.");
        }
    }

    // ── Read ──────────────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PageResponse<PosSessionDenominationCorrectionResponse> list(Long branchId, Long sessionId,
                                                                         CorrectionRequestStatus status,
                                                                         int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), size <= 0 ? 20 : size);
        Page<PosSessionDenominationCorrection> result = repo.search(branchId, sessionId, status, pageable);
        var content = result.getContent().stream().map(this::toResponse).toList();
        return new PageResponse<>(content, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public PosSessionDenominationCorrectionResponse getById(Long id) {
        return toResponse(getEntity(id));
    }

    private PosSessionDenominationCorrection getEntity(Long id) {
        return repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Denomination correction not found: " + id));
    }

    private PosSessionDenominationCorrectionResponse toResponse(PosSessionDenominationCorrection c) {
        String requestNumber = correctionRequestRepo.findById(c.getCorrectionRequestId())
                .map(CorrectionRequest::getRequestNumber).orElse(null);
        return PosSessionDenominationCorrectionResponse.from(c, requestNumber);
    }

    /** Original / corrected (if any APPLIED correction exists) / effective overlay for a
     *  session — the presentation-only computation consumed wherever denomination data is
     *  shown. Never regenerates or touches the X/Z Report or Day Close snapshot; those stay
     *  exactly as originally persisted. */
    @Transactional(readOnly = true)
    public Map<String, Object> getEffectiveDenomination(Long sessionId) {
        PosSession session = posSessionRepository.findById(sessionId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found: " + sessionId));
        Map<String, Integer> original = parseDenominations(session.getClosingDenominationsJson());
        BigDecimal originalTotal = total(original);

        List<PosSessionDenominationCorrection> applied = repo.findAppliedForSessionOrderByAppliedAtDesc(sessionId);
        PosSessionDenominationCorrection effective = applied.isEmpty() ? null : applied.get(0);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sessionId", sessionId);
        result.put("original", original);
        result.put("originalTotal", originalTotal);
        result.put("corrected", effective != null);
        if (effective != null) {
            result.put("correctionId", effective.getId());
            result.put("correctedDenomination", parseDenominations(effective.getCorrectedDenominationJson()));
            result.put("correctedTotal", effective.getCorrectedTotal());
            result.put("effective", parseDenominations(effective.getCorrectedDenominationJson()));
            result.put("effectiveTotal", effective.getCorrectedTotal());
            result.put("appliedBy", effective.getAppliedBy());
            result.put("appliedAt", effective.getAppliedAt());
        } else {
            result.put("effective", original);
            result.put("effectiveTotal", originalTotal);
        }
        return result;
    }

    // ── Write: request lifecycle ─────────────────────────────────────────────────────────

    /** Creates a REQUESTED correction. Validates: session must be CLOSED, reason required,
     *  no negative counts, no other unresolved (non-terminal) correction already exists for
     *  this session (§ Validation). */
    @Transactional
    public PosSessionDenominationCorrectionResponse request(Long sessionId, Map<String, Integer> correctedDenominations,
                                                             String reason) {
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A correction reason is required.");
        }
        PosSession session = posSessionRepository.findById(sessionId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found: " + sessionId));
        if (session.getStatus() != PosSessionStatus.CLOSED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Denomination corrections can only be requested for a CLOSED session.");
        }
        if (!repo.findActiveForSession(sessionId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A denomination correction is already pending resolution for this session.");
        }
        if (correctedDenominations == null || correctedDenominations.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Corrected denomination counts are required.");
        }

        Map<String, Integer> original = parseDenominations(session.getClosingDenominationsJson());
        BigDecimal originalTotal = total(original);
        BigDecimal correctedTotal = total(correctedDenominations); // validates non-negative counts

        String originalJson = toJson(original);
        String correctedJson = toJson(correctedDenominations);

        var correctionRequest = correctionRequestService.create(
                CorrectionTargetType.POS_SESSION, sessionId, CorrectionType.DENOMINATION,
                originalJson, correctedJson, reason, session.getBranchId(), session.getSessionDate());

        PosSessionDenominationCorrection c = new PosSessionDenominationCorrection();
        c.setCorrectionRequestId(correctionRequest.getId());
        c.setSessionId(sessionId);
        c.setBranchId(session.getBranchId());
        c.setOriginalDenominationJson(originalJson);
        c.setCorrectedDenominationJson(correctedJson);
        c.setOriginalTotal(originalTotal);
        c.setCorrectedTotal(correctedTotal);
        c.setDifference(correctedTotal.subtract(originalTotal));
        c.setReason(reason);
        c.setStatus(CorrectionRequestStatus.REQUESTED);
        c.setRequestedBy(correctionRequest.getRequestedBy());
        c.setRequestedAt(correctionRequest.getRequestedAt());
        PosSessionDenominationCorrection saved = repo.save(c);

        auditService.logEvent(ENTITY_TYPE, correctionRequest.getRequestNumber(), "REQUESTED", currentUser(),
                "Denomination correction requested for session " + sessionId + ". Original: " + originalTotal
                        + ", Proposed: " + correctedTotal + ", Difference: " + saved.getDifference() + ". Reason: " + reason);
        return toResponse(saved);
    }

    @Transactional
    public PosSessionDenominationCorrectionResponse submitForApproval(Long id) {
        PosSessionDenominationCorrection c = getEntity(id);
        var updated = correctionRequestService.submitForApproval(c.getCorrectionRequestId());
        c.setStatus(updated.getStatus());
        PosSessionDenominationCorrection saved = repo.save(c);
        auditService.logEvent(ENTITY_TYPE, updated.getRequestNumber(), "SUBMITTED", currentUser(),
                "Denomination correction submitted for approval.");
        return toResponse(saved);
    }

    @Transactional
    public PosSessionDenominationCorrectionResponse approve(Long id, String notes) {
        PosSessionDenominationCorrection c = getEntity(id);
        var updated = correctionRequestService.approve(c.getCorrectionRequestId(), notes);
        c.setStatus(updated.getStatus());
        c.setApprovedBy(updated.getApprovedBy());
        c.setApprovedAt(updated.getApprovedAt());
        PosSessionDenominationCorrection saved = repo.save(c);
        auditService.logEvent(ENTITY_TYPE, updated.getRequestNumber(), "APPROVED", saved.getApprovedBy(),
                "Denomination correction approved.");
        return toResponse(saved);
    }

    @Transactional
    public PosSessionDenominationCorrectionResponse reject(Long id, String reason) {
        PosSessionDenominationCorrection c = getEntity(id);
        var updated = correctionRequestService.reject(c.getCorrectionRequestId(), reason);
        c.setStatus(updated.getStatus());
        c.setRejectedBy(updated.getRejectedBy());
        c.setRejectedAt(updated.getRejectedAt());
        c.setRejectionReason(updated.getRejectionReason());
        PosSessionDenominationCorrection saved = repo.save(c);
        auditService.logEvent(ENTITY_TYPE, updated.getRequestNumber(), "REJECTED", saved.getRejectedBy(),
                "Denomination correction rejected. Reason: " + reason);
        return toResponse(saved);
    }

    /** Applying a denomination correction has no external financial effect — it only makes
     *  this row the new effective overlay for the session. Still modeled as an explicit,
     *  separate action from approval (never auto-chained), consistent with every other
     *  correction type: approval and execution are independent lifecycle events. */
    @Transactional
    public PosSessionDenominationCorrectionResponse apply(Long id) {
        PosSessionDenominationCorrection c = getEntity(id);
        if (c.getStatus() != CorrectionRequestStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only APPROVED corrections can be applied. Current: " + c.getStatus());
        }
        correctionRequestService.markExecuting(c.getCorrectionRequestId());
        var applied = correctionRequestService.markApplied(c.getCorrectionRequestId());
        c.setStatus(applied.getStatus());
        c.setAppliedBy(applied.getExecutedBy());
        c.setAppliedAt(applied.getExecutedAt());
        PosSessionDenominationCorrection saved = repo.save(c);

        int version = 1;
        List<CorrectionOverlay> existing = overlayRepository.findAppliedForTargetOrderByVersionDesc(CorrectionTargetType.POS_SESSION, saved.getSessionId());
        if (!existing.isEmpty()) {
            version = existing.get(0).getVersion() + 1;
        }

        CorrectionOverlay overlay = new CorrectionOverlay();
        overlay.setTargetType(CorrectionTargetType.POS_SESSION);
        overlay.setTargetId(saved.getSessionId());
        overlay.setOriginalSnapshotJson(saved.getOriginalDenominationJson());
        overlay.setCorrectedSnapshotJson(saved.getCorrectedDenominationJson());
        overlay.setVersion(version);
        overlay.setStatus(CorrectionRequestStatus.APPLIED);
        overlayRepository.save(overlay);

        auditService.logEvent(ENTITY_TYPE, applied.getRequestNumber(), "APPLIED", saved.getAppliedBy(),
                "Denomination correction applied — now the effective overlay for session " + saved.getSessionId()
                        + ". No sales, payment, cash movement, journal, or inventory record was changed.");
        return toResponse(saved);
    }

    @Transactional
    public PosSessionDenominationCorrectionResponse cancel(Long id) {
        PosSessionDenominationCorrection c = getEntity(id);
        var updated = correctionRequestService.cancel(c.getCorrectionRequestId());
        c.setStatus(updated.getStatus());
        PosSessionDenominationCorrection saved = repo.save(c);
        auditService.logEvent(ENTITY_TYPE, updated.getRequestNumber(), "CANCELLED", currentUser(),
                "Denomination correction request cancelled.");
        return toResponse(saved);
    }
}
