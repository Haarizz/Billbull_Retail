package com.billbull.backend.pos.admin;

import com.billbull.backend.common.UuidV7;
import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.notification.NotificationEventPublisher;
import com.billbull.backend.util.PageResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Enterprise Console &gt; POS Administration — generic correction-request lifecycle engine
 * (architectural review §5/§8). Modeled directly on {@code JournalEntryService}'s
 * submit/approve/reject state machine (the closest existing precedent): fetch, guard the
 * current status, mutate, save, then log a structured financial-audit event via {@link
 * FinancialAuditService} — the same subsystem {@code ReceiptVoucherService} and {@code
 * JournalEntryService} already use for financial-governance events (distinct from the
 * general security {@code AuditLogService} and the POS-specific {@code PosAuditLog}, per the
 * three-audit-subsystem split noted in CLAUDE.md).
 *
 * <p>Phase 1 only implements the REQUESTED -&gt; PENDING_APPROVAL -&gt; APPROVED/REJECTED/
 * CANCELLED transitions. No executor exists yet for any correction type, so EXECUTING/
 * APPLIED/FAILED are never reached here — those transitions are reserved for the Phase 3/4
 * executors that will call into this service once denomination/transaction correction logic
 * exists. This service never touches the record a correction targets — it only ever
 * inserts/updates rows in {@code pos_correction_requests} itself.
 */
@Service
public class CorrectionRequestService {

    private static final String ENTITY_TYPE = "POS_CORRECTION_REQUEST";

    private final CorrectionRequestRepository repo;
    private final FinancialAuditService auditService;
    private final NotificationEventPublisher notifPublisher;
    private final CorrectionAuditEntryRepository correctionAuditEntryRepository;

    public CorrectionRequestService(CorrectionRequestRepository repo, FinancialAuditService auditService,
                                     NotificationEventPublisher notifPublisher,
                                     CorrectionAuditEntryRepository correctionAuditEntryRepository) {
        this.repo = repo;
        this.auditService = auditService;
        this.notifPublisher = notifPublisher;
        this.correctionAuditEntryRepository = correctionAuditEntryRepository;
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    @Transactional(readOnly = true)
    public PageResponse<CorrectionRequestResponse> list(Long branchId, CorrectionRequestStatus status,
                                                          CorrectionTargetType targetType,
                                                          CorrectionType correctionType,
                                                          int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), size <= 0 ? 20 : size);
        Page<CorrectionRequest> result = repo.search(branchId,
                status != null ? status.name() : null,
                targetType != null ? targetType.name() : null,
                correctionType != null ? correctionType.name() : null,
                pageable);
        var content = result.getContent().stream().map(CorrectionRequestResponse::from).toList();
        return new PageResponse<>(content, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public CorrectionRequestResponse getById(Long id) {
        return CorrectionRequestResponse.from(getEntity(id));
    }

    private CorrectionRequest getEntity(Long id) {
        return repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Correction request not found: " + id));
    }

    /** Creates a new REQUESTED correction — never touches the target record itself. Callers
     *  (later phases' domain-specific request forms) are responsible for populating {@code
     *  originalValuesJson} from the target's current state at request time. */
    @Transactional
    public CorrectionRequestResponse create(CorrectionTargetType targetType, Long targetId,
                                             CorrectionType correctionType, String originalValuesJson,
                                             String proposedValuesJson, String reason,
                                             Long branchId, LocalDate businessDate) {
        if (targetType == null || targetId == null || correctionType == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "targetType, targetId and correctionType are required.");
        }
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A correction reason is required.");
        }

        CorrectionRequest c = new CorrectionRequest();
        c.setRequestNumber(UuidV7.generate());
        c.setTargetType(targetType);
        c.setTargetId(targetId);
        c.setCorrectionType(correctionType);
        c.setOriginalValuesJson(originalValuesJson);
        c.setProposedValuesJson(proposedValuesJson);
        c.setReason(reason);
        c.setBranchId(branchId);
        c.setBusinessDate(businessDate);
        c.setStatus(CorrectionRequestStatus.REQUESTED);
        c.setRequestedBy(currentUser());
        c.setRequestedAt(LocalDateTime.now());
        CorrectionRequest saved = repo.save(c);

        saveAuditEntry(saved, "REQUESTED", saved.getRequestedBy(), reason);
        auditService.logEvent(ENTITY_TYPE, saved.getRequestNumber(), "REQUESTED", saved.getRequestedBy(),
                "Correction requested for " + targetType + " #" + targetId + " (" + correctionType + "). Reason: " + reason);
        return CorrectionRequestResponse.from(saved);
    }

    @Transactional
    public CorrectionRequestResponse submitForApproval(Long id) {
        CorrectionRequest c = getEntity(id);
        if (c.getStatus() != CorrectionRequestStatus.REQUESTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only REQUESTED correction requests can be submitted for approval. Current: " + c.getStatus());
        }
        c.setStatus(CorrectionRequestStatus.PENDING_APPROVAL);
        CorrectionRequest saved = repo.save(c);
        saveAuditEntry(saved, "SUBMITTED", currentUser(), "Submitted for approval.");
        auditService.logEvent(ENTITY_TYPE, saved.getRequestNumber(), "SUBMITTED", currentUser(),
                "Submitted for approval.");
        notifPublisher.correctionRequiresApproval(saved.getRequestNumber(), saved.getTargetType().name(), saved.getTargetId());
        return CorrectionRequestResponse.from(saved);
    }

    @Transactional
    public CorrectionRequestResponse approve(Long id, String notes) {
        CorrectionRequest c = getEntity(id);
        if (c.getStatus() != CorrectionRequestStatus.PENDING_APPROVAL) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only PENDING_APPROVAL correction requests can be approved. Current: " + c.getStatus());
        }
        if (currentUser().equals(c.getRequestedBy())) {
            throw new com.billbull.backend.exception.PermissionDeniedException("You cannot approve or reject your own correction request.");
        }
        c.setStatus(CorrectionRequestStatus.APPROVED);
        c.setApprovedBy(currentUser());
        c.setApprovedAt(LocalDateTime.now());
        c.setApprovalNotes(notes);
        CorrectionRequest saved = repo.save(c);
        saveAuditEntry(saved, "APPROVED", saved.getApprovedBy(), notes);
        auditService.logEvent(ENTITY_TYPE, saved.getRequestNumber(), "APPROVED", saved.getApprovedBy(),
                "Correction approved." + (notes != null && !notes.isBlank() ? " Notes: " + notes : ""));
        notifPublisher.correctionApproved(saved.getRequestedBy(), saved.getRequestNumber(), saved.getTargetType().name(), saved.getTargetId());
        return CorrectionRequestResponse.from(saved);
    }

    @Transactional
    public CorrectionRequestResponse reject(Long id, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A rejection reason is required.");
        }
        CorrectionRequest c = getEntity(id);
        if (c.getStatus() != CorrectionRequestStatus.PENDING_APPROVAL) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only PENDING_APPROVAL correction requests can be rejected. Current: " + c.getStatus());
        }
        if (currentUser().equals(c.getRequestedBy())) {
            throw new com.billbull.backend.exception.PermissionDeniedException("You cannot approve or reject your own correction request.");
        }
        c.setStatus(CorrectionRequestStatus.REJECTED);
        c.setRejectedBy(currentUser());
        c.setRejectedAt(LocalDateTime.now());
        c.setRejectionReason(reason);
        CorrectionRequest saved = repo.save(c);
        saveAuditEntry(saved, "REJECTED", saved.getRejectedBy(), reason);
        auditService.logEvent(ENTITY_TYPE, saved.getRequestNumber(), "REJECTED", saved.getRejectedBy(),
                "Rejected. Reason: " + reason);
        notifPublisher.correctionRejected(saved.getRequestedBy(), saved.getRequestNumber(), saved.getTargetType().name(), saved.getTargetId(), reason);
        return CorrectionRequestResponse.from(saved);
    }

    @Transactional
    public CorrectionRequestResponse cancel(Long id) {
        CorrectionRequest c = getEntity(id);
        boolean cancellable = c.getStatus() == CorrectionRequestStatus.REQUESTED
                || c.getStatus() == CorrectionRequestStatus.PENDING_APPROVAL;
        if (!cancellable) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only REQUESTED or PENDING_APPROVAL correction requests can be cancelled. Current: " + c.getStatus());
        }
        c.setStatus(CorrectionRequestStatus.CANCELLED);
        c.setCancelledBy(currentUser());
        c.setCancelledAt(LocalDateTime.now());
        CorrectionRequest saved = repo.save(c);
        saveAuditEntry(saved, "CANCELLED", saved.getCancelledBy(), null);
        auditService.logEvent(ENTITY_TYPE, saved.getRequestNumber(), "CANCELLED", saved.getCancelledBy(),
                "Correction request cancelled.");
        return CorrectionRequestResponse.from(saved);
    }

    // ── Reserved for later-phase executors (Phase 3/4) — not reachable via any Phase 1 endpoint ──

    /** Marks an APPROVED request as EXECUTING. Execution is a separate lifecycle event from
     *  approval by design (§8) — approval never implies success. */
    @Transactional
    protected CorrectionRequest markExecuting(Long id) {
        CorrectionRequest c = getEntity(id);
        if (c.getStatus() != CorrectionRequestStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only APPROVED correction requests can start execution. Current: " + c.getStatus());
        }
        c.setStatus(CorrectionRequestStatus.EXECUTING);
        CorrectionRequest saved = repo.save(c);
        saveAuditEntry(saved, "EXECUTING", currentUser(), null);
        auditService.logEvent(ENTITY_TYPE, saved.getRequestNumber(), "EXECUTING", currentUser(),
                "Execution started.");
        return saved;
    }

    @Transactional
    protected CorrectionRequest markApplied(Long id) {
        CorrectionRequest c = getEntity(id);
        if (c.getStatus() != CorrectionRequestStatus.EXECUTING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only EXECUTING correction requests can be marked APPLIED. Current: " + c.getStatus());
        }
        c.setStatus(CorrectionRequestStatus.APPLIED);
        c.setExecutedBy(currentUser());
        c.setExecutedAt(LocalDateTime.now());
        CorrectionRequest saved = repo.save(c);
        saveAuditEntry(saved, "APPLIED", saved.getExecutedBy(), null);
        auditService.logEvent(ENTITY_TYPE, saved.getRequestNumber(), "APPLIED", saved.getExecutedBy(),
                "Correction applied.");
        notifPublisher.correctionApplied(saved.getRequestedBy(), saved.getRequestNumber(), saved.getTargetType().name(), saved.getTargetId());
        return saved;
    }

    /** Execution failures never lose approval history (§ Correction Workflow) — the row keeps
     *  its {@code approvedBy}/{@code approvedAt} stamps, only status and failureReason change. */
    @Transactional
    protected CorrectionRequest markFailed(Long id, String failureReason) {
        CorrectionRequest c = getEntity(id);
        if (c.getStatus() != CorrectionRequestStatus.EXECUTING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only EXECUTING correction requests can be marked FAILED. Current: " + c.getStatus());
        }
        c.setStatus(CorrectionRequestStatus.FAILED);
        c.setFailureReason(failureReason);
        CorrectionRequest saved = repo.save(c);
        saveAuditEntry(saved, "FAILED", currentUser(), failureReason);
        auditService.logEvent(ENTITY_TYPE, saved.getRequestNumber(), "FAILED", currentUser(),
                "Execution failed: " + failureReason);
        notifPublisher.correctionFailed(saved.getRequestedBy(), saved.getRequestNumber(), saved.getTargetType().name(), saved.getTargetId(), failureReason);
        return saved;
    }

    private void saveAuditEntry(CorrectionRequest request, String action, String actor, String notes) {
        CorrectionAuditEntry entry = new CorrectionAuditEntry(
                request.getId(),
                action,
                actor,
                LocalDateTime.now(),
                notes
        );
        correctionAuditEntryRepository.save(entry);
    }
}
