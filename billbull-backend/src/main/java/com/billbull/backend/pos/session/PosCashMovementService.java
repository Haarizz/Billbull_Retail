package com.billbull.backend.pos.session;

import com.billbull.backend.financials.generalledger.postingengine.PostingEngineService;
import com.billbull.backend.pos.admin.PosCashMovementCategory;
import com.billbull.backend.pos.admin.PosCashMovementCategoryRepository;
import com.billbull.backend.pos.audit.PosAuditService;
import com.billbull.backend.settings.branch.Branch;
import com.billbull.backend.settings.branch.BranchRepository;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Back-office CRUD surface for the Cash Drop / Outs Management module — list/view/limited-edit/
 * void on top of {@link PosCashMovement}, which remains a financial ledger record: amount,
 * movement type, session, and business date are immutable once created (see the architectural
 * review, §4/§5/§6). Session-scoped *creation* still runs through {@link PosSessionService#
 * addCashMovement}, the same code path the POS terminal's "Cash Drawer" quick action already
 * uses, so both entry points share one source of truth for validation/GL posting/audit.
 */
@Service
public class PosCashMovementService {

    private final PosCashMovementRepository repo;
    private final PosSessionService posSessionService;
    private final PostingEngineService postingEngine;
    private final BranchRepository branchRepository;
    private final PosAuditService auditService;
    private final ObjectMapper objectMapper;
    private final PosCashMovementCategoryRepository categoryRepository;
    private final jakarta.persistence.EntityManager entityManager;
    private final com.billbull.backend.pos.admin.EffectiveCorrectionViewService effectiveCorrectionViewService;
    /** Edit/void of a cash movement is a business audit event, so its timestamp belongs to
     *  the Business Day timezone — the same clock that stamped performedAt on creation. */
    private final com.billbull.backend.pos.businessdate.BusinessDayClock clock;

    public PosCashMovementService(PosCashMovementRepository repo,
                                   PosSessionService posSessionService,
                                   PostingEngineService postingEngine,
                                   BranchRepository branchRepository,
                                   PosAuditService auditService,
                                   ObjectMapper objectMapper,
                                   PosCashMovementCategoryRepository categoryRepository,
                                   jakarta.persistence.EntityManager entityManager,
                                   com.billbull.backend.pos.admin.EffectiveCorrectionViewService effectiveCorrectionViewService,
                                   com.billbull.backend.pos.businessdate.BusinessDayClock clock) {
        this.repo = repo;
        this.posSessionService = posSessionService;
        this.postingEngine = postingEngine;
        this.branchRepository = branchRepository;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
        this.categoryRepository = categoryRepository;
        this.entityManager = entityManager;
        this.effectiveCorrectionViewService = effectiveCorrectionViewService;
        this.clock = clock;
    }

    /** The business date a void reversal posts to: the movement's own businessDate (copied
     *  from the session at creation), so the reversal lands in the same Business Day as the
     *  entry it reverses. Falls back to the Business Day clock's date for legacy rows that
     *  predate the column — never the JVM calendar date. */
    private LocalDate reversalBusinessDate(PosCashMovement m) {
        if (m.getBusinessDate() != null) return m.getBusinessDate();
        PosSession s = m.getPosSession();
        if (s != null && s.getTradingDate() != null) return s.getTradingDate();
        return clock.now().toLocalDate();
    }

    /** Batch-resolves category names for a page of responses (same lazy-enrichment pattern as
     *  {@code setBranchName}) — never guesses a name for a null categoryId, which the UI
     *  renders as "Uncategorized (Legacy)". */
    private List<PosCashMovementResponse> withCategoryNames(List<PosCashMovementResponse> rows) {
        List<Long> categoryIds = rows.stream().map(PosCashMovementResponse::getCategoryId)
                .filter(java.util.Objects::nonNull).distinct().toList();
        if (categoryIds.isEmpty()) return rows;
        Map<Long, String> names = categoryRepository.findAllById(categoryIds).stream()
                .collect(Collectors.toMap(PosCashMovementCategory::getId, PosCashMovementCategory::getName));
        rows.forEach(r -> {
            if (r.getCategoryId() != null) {
                r.setCategoryName(names.get(r.getCategoryId()));
            }
        });
        return rows;
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    @Transactional(readOnly = true)
    public PageResponse<PosCashMovementResponse> list(Long branchId, Long sessionId, PosCashMovementStatus status,
                                                        PosCashMovementType movementType, LocalDate fromDate,
                                                        LocalDate toDate, String performedBy, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), size <= 0 ? 20 : size);
        Page<PosCashMovement> result = repo.search(branchId, sessionId, status, movementType, fromDate, toDate,
                performedBy, pageable);
        
        List<PosCashMovement> contentEntities = result.getContent().stream()
                .map(PosCashMovement::detachedCopy).toList();
        contentEntities = effectiveCorrectionViewService.resolveOverlays(
                com.billbull.backend.pos.admin.CorrectionTargetType.CASH_MOVEMENT, 
                contentEntities, 
                PosCashMovement::getId);

        var content = withCategoryNames(contentEntities.stream().map(PosCashMovementResponse::from).collect(Collectors.toList()));
        return new PageResponse<>(content, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public PosCashMovementResponse getById(Long id) {
        PosCashMovement entity = getEntity(id).detachedCopy();
        entity = effectiveCorrectionViewService.resolveOverlay(
                com.billbull.backend.pos.admin.CorrectionTargetType.CASH_MOVEMENT,
                entity.getId(),
                entity);
        return withCategoryNames(List.of(PosCashMovementResponse.from(entity))).get(0);
    }

    private PosCashMovement getEntity(Long id) {
        return repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Cash movement not found: " + id));
    }

    /** Back-office "Add New" — same validation/GL/audit path as the POS terminal quick action
     *  (see {@link PosSessionService#addCashMovement}); session must still be OPEN. */
    @Transactional
    public PosCashMovementResponse create(Long sessionId, String movementType, BigDecimal amount,
                                           String description, String reference, Long categoryId) {
        PosCashMovement movement = posSessionService.addCashMovement(sessionId, movementType, amount, description, reference, categoryId);
        return withCategoryNames(List.of(PosCashMovementResponse.from(movement))).get(0);
    }

    /** Limited edit: description/reference only. Amount, movement type, session, performed-by
     *  and business date are never mutable (§4) — correcting those requires void + recreate. */
    @Transactional
    public PosCashMovementResponse edit(Long id, String description, String reference) {
        PosCashMovement m = getEntity(id);
        assertEditable(m);

        String oldJson = toJson(m);
        if (m.getEditCount() == null || m.getEditCount() == 0) {
            // Snapshot the as-created values exactly once, on the first edit.
            m.setOriginalDescription(m.getDescription());
            m.setOriginalReference(m.getReference());
        }
        m.setDescription(description);
        m.setReference(reference);
        m.setEditedBy(currentUser());
        m.setEditedAt(clock.now());
        m.setEditCount((m.getEditCount() == null ? 0 : m.getEditCount()) + 1);
        PosCashMovement saved = repo.save(m);
        String newJson = toJson(saved);

        PosSession session = saved.getPosSession();
        auditService.logCashMovementEdited(
                session != null ? session.getId() : null,
                session != null ? session.getTerminalId() : null,
                saved.getBranchId(), saved.getId(), oldJson, newJson);

        return PosCashMovementResponse.from(saved);
    }

    /** Void: status flag only, original row preserved, GL reversed via a new posted journal —
     *  never deletes/mutates the original financial record or its journal (§5). */
    @Transactional
    public PosCashMovementResponse voidMovement(Long id, String voidReason) {
        if (voidReason == null || voidReason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Void reason is required.");
        }
        PosCashMovement m = getEntity(id);
        assertVoidable(m);

        String oldJson = toJson(m);
        m.setStatus(PosCashMovementStatus.VOIDED);
        m.setVoidReason(voidReason);
        m.setVoidedBy(currentUser());
        m.setVoidedAt(clock.now());
        PosCashMovement saved = repo.save(m);

        Branch branch = saved.getBranchId() != null
                ? branchRepository.findById(saved.getBranchId()).orElse(null)
                : null;
        // Reverse against the exact account originally posted to (category override or
        // default, denormalized at creation) — never re-resolve from the category's current
        // state, which may have changed or been deactivated since.
        postingEngine.reverseJournalFromCashMovementVoid(saved.getId(), saved.getMovementType().name(),
                                saved.getAmount(), saved.getDescription(), reversalBusinessDate(saved), branch,
                saved.getPostedAccountCode(), saved.getPostedAccountName());

        String newJson = toJson(saved);
        PosSession session = saved.getPosSession();
        auditService.logCashMovementVoided(
                session != null ? session.getId() : null,
                session != null ? session.getTerminalId() : null,
                saved.getBranchId(), saved.getId(), voidReason, oldJson, newJson);

        return PosCashMovementResponse.from(saved);
    }

    private void assertEditable(PosCashMovement m) {
        if (m.getStatus() == PosCashMovementStatus.VOIDED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot edit a voided cash movement.");
        }
        assertDayNotClosed(m);
    }

    private void assertVoidable(PosCashMovement m) {
        if (m.getStatus() == PosCashMovementStatus.VOIDED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cash movement is already voided.");
        }
        assertDayNotClosed(m);
    }

    /** Once the owning session's business day has been Day-Closed, the movement becomes fully
     *  read-only (§6) — the correct workflow is a new correcting movement on the current
     *  business date, never a retroactive edit/void of a closed day's figures. */
    private void assertDayNotClosed(PosCashMovement m) {
        PosSession session = m.getPosSession();
        if (session != null && session.getDayCloseId() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This cash movement belongs to a closed business day and can no longer be modified. " +
                    "Post a new correcting cash movement on the current business date instead.");
        }
    }

    private String toJson(PosCashMovement m) {
        try {
            Map<String, Object> snapshot = new LinkedHashMap<>();
            snapshot.put("movementType", m.getMovementType());
            snapshot.put("amount", m.getAmount());
            snapshot.put("description", m.getDescription());
            snapshot.put("reference", m.getReference());
            snapshot.put("status", m.getStatus());
            snapshot.put("voidReason", m.getVoidReason());
            return objectMapper.writeValueAsString(snapshot);
        } catch (Exception e) {
            return null;
        }
    }
}
