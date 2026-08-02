package com.billbull.backend.pos.admin;

import com.billbull.backend.financials.audit.FinancialAuditService;
import com.billbull.backend.financials.chartofaccounts.Account;
import com.billbull.backend.financials.chartofaccounts.AccountRepository;
import com.billbull.backend.pos.session.PosCashMovementType;
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

import java.util.List;

/**
 * Enterprise Console &gt; POS Administration &gt; Cash Movement Categories — master-data CRUD
 * plus the two pieces of validation logic {@link com.billbull.backend.pos.session.
 * PosSessionService#addCashMovement} needs at cash-movement creation time: movement-type
 * compatibility (§ POS Integration) and optional GL account override resolution (§ GL
 * Integration — never a parallel posting mechanism, just resolving which account {@code
 * PostingEngineService} should post the non-cash leg to).
 */
@Service
public class PosCashMovementCategoryService {

    private static final String ENTITY_TYPE = "POS_CASH_MOVEMENT_CATEGORY";

    private final PosCashMovementCategoryRepository repo;
    private final AccountRepository accountRepository;
    private final FinancialAuditService auditService;

    public PosCashMovementCategoryService(PosCashMovementCategoryRepository repo,
                                           AccountRepository accountRepository,
                                           FinancialAuditService auditService) {
        this.repo = repo;
        this.accountRepository = accountRepository;
        this.auditService = auditService;
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    @Transactional(readOnly = true)
    public PageResponse<PosCashMovementCategoryResponse> list(Boolean active,
                                                                PosCashMovementCategoryMovementType movementType,
                                                                String search, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), size <= 0 ? 20 : size);
        Page<PosCashMovementCategory> result = repo.search(active, movementType,
                (search == null || search.isBlank()) ? null : search.trim(), pageable);
        var content = result.getContent().stream().map(this::toResponseWithAccount).toList();
        return new PageResponse<>(content, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public PosCashMovementCategoryResponse getById(Long id) {
        return toResponseWithAccount(getEntity(id));
    }

    /** Active categories compatible with the given movement direction — the POS Cash Drop/Out
     *  dialogs' dropdown source. Deliberately not gated by {@code pos.admin.cashmovement.
     *  category.view} in the controller — any authenticated user recording a cash movement
     *  needs this list, same as any other reference-data dropdown. */
    @Transactional(readOnly = true)
    public List<PosCashMovementCategorySelectableResponse> listSelectable(PosCashMovementType movementType) {
        PosCashMovementCategoryMovementType asCategory = movementType == PosCashMovementType.DROP_IN
                ? PosCashMovementCategoryMovementType.DROP_IN : PosCashMovementCategoryMovementType.DROP_OUT;
        return repo.findSelectable(asCategory).stream()
                .map(PosCashMovementCategorySelectableResponse::from).toList();
    }

    private PosCashMovementCategory getEntity(Long id) {
        return repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Cash movement category not found: " + id));
    }

    private PosCashMovementCategoryResponse toResponseWithAccount(PosCashMovementCategory c) {
        Account account = (c.getGlAccountId() != null && !c.getGlAccountId().isBlank())
                ? accountRepository.findById(c.getGlAccountId()).orElse(null)
                : null;
        return PosCashMovementCategoryResponse.from(c, account);
    }

    private void validate(PosCashMovementCategory c, Long excludeId) {
        if (c.getCode() == null || c.getCode().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category code is required.");
        }
        if (c.getName() == null || c.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category name is required.");
        }
        if (c.getMovementType() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Movement type is required.");
        }
        boolean codeTaken = excludeId == null
                ? repo.existsByCodeIgnoreCase(c.getCode())
                : repo.existsByCodeIgnoreCaseAndIdNot(c.getCode(), excludeId);
        if (codeTaken) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category code \"" + c.getCode() + "\" is already in use.");
        }
        // Uniqueness is only enforced among ACTIVE categories — a retired category's name can
        // be reused, matching how the entity already treats isActive as the sole soft-delete flag.
        if (c.isActive()) {
            boolean nameTaken = excludeId == null
                    ? repo.existsByNameIgnoreCaseAndIsActiveTrue(c.getName())
                    : repo.existsByNameIgnoreCaseAndIsActiveTrueAndIdNot(c.getName(), excludeId);
            if (nameTaken) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "An active category named \"" + c.getName() + "\" already exists.");
            }
        }
        if (c.getDisplayOrder() != null && c.getDisplayOrder() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Display order cannot be negative.");
        }
        if (c.getGlAccountId() != null && !c.getGlAccountId().isBlank()
                && accountRepository.findById(c.getGlAccountId()).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "GL account not found: " + c.getGlAccountId());
        }
    }

    @Transactional
    public PosCashMovementCategoryResponse create(PosCashMovementCategory input) {
        input.setId(null);
        if (input.getDisplayOrder() == null) {
            input.setDisplayOrder(0);
        }
        validate(input, null);
        PosCashMovementCategory saved = repo.save(input);
        auditService.logEvent(ENTITY_TYPE, saved.getCode(), "CREATED", currentUser(),
                "Cash movement category created: " + saved.getName() + " (" + saved.getMovementType() + ")");
        return toResponseWithAccount(saved);
    }

    @Transactional
    public PosCashMovementCategoryResponse update(Long id, PosCashMovementCategory input) {
        PosCashMovementCategory existing = getEntity(id);
        input.setId(id);
        validate(input, id);
        existing.setCode(input.getCode());
        existing.setName(input.getName());
        existing.setDescription(input.getDescription());
        existing.setMovementType(input.getMovementType());
        existing.setGlAccountId(input.getGlAccountId());
        existing.setDisplayOrder(input.getDisplayOrder());
        existing.setNotesRequired(input.isNotesRequired());
        existing.setApprovalRequired(input.isApprovalRequired());
        PosCashMovementCategory saved = repo.save(existing);
        auditService.logEvent(ENTITY_TYPE, saved.getCode(), "UPDATED", currentUser(),
                "Cash movement category updated: " + saved.getName());
        return toResponseWithAccount(saved);
    }

    @Transactional
    public PosCashMovementCategoryResponse activate(Long id) {
        PosCashMovementCategory c = getEntity(id);
        if (!c.isActive()) {
            // Reactivation must not silently collide with a category created under the same
            // active name while this one was inactive.
            if (repo.existsByNameIgnoreCaseAndIsActiveTrueAndIdNot(c.getName(), id)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "An active category named \"" + c.getName() + "\" already exists.");
            }
            c.setActive(true);
            repo.save(c);
            auditService.logEvent(ENTITY_TYPE, c.getCode(), "ACTIVATED", currentUser(),
                    "Cash movement category activated: " + c.getName());
        }
        return toResponseWithAccount(c);
    }

    @Transactional
    public PosCashMovementCategoryResponse deactivate(Long id) {
        PosCashMovementCategory c = getEntity(id);
        if (c.isActive()) {
            c.setActive(false);
            repo.save(c);
            auditService.logEvent(ENTITY_TYPE, c.getCode(), "DEACTIVATED", currentUser(),
                    "Cash movement category deactivated: " + c.getName());
        }
        return toResponseWithAccount(c);
    }

    // ── Consumed by PosSessionService.addCashMovement — never mutates the category ──────────

    /** Loads a category for use on a new cash movement; rejects unknown or inactive ids. */
    @Transactional(readOnly = true)
    public PosCashMovementCategory getActiveEntityOrThrow(Long id) {
        PosCashMovementCategory c = getEntity(id);
        if (!c.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Category \"" + c.getName() + "\" is inactive and cannot be used for new cash movements.");
        }
        return c;
    }

    /** Rejects e.g. a DROP_IN-only category being used on a DROP_OUT movement (§ POS
     *  Integration: "Drop Out -> Office Expenses ✓, Drop In -> Office Expenses ✗"). */
    public void assertCompatible(PosCashMovementCategory category, PosCashMovementType movementType) {
        PosCashMovementCategoryMovementType required = category.getMovementType();
        if (required == PosCashMovementCategoryMovementType.BOTH) {
            return;
        }
        boolean compatible = (required == PosCashMovementCategoryMovementType.DROP_IN && movementType == PosCashMovementType.DROP_IN)
                || (required == PosCashMovementCategoryMovementType.DROP_OUT && movementType == PosCashMovementType.DROP_OUT);
        if (!compatible) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Category \"" + category.getName() + "\" is only valid for " + required + ", not " + movementType + ".");
        }
    }

    /** Resolves the category's optional GL account override, or {@code null} to signal
     *  "fall back to the existing default cash-movement posting rule" (§7/§9). Never creates
     *  or posts anything — purely a lookup. */
    @Transactional(readOnly = true)
    public Account resolveGlAccount(PosCashMovementCategory category) {
        if (category == null || category.getGlAccountId() == null || category.getGlAccountId().isBlank()) {
            return null;
        }
        return accountRepository.findById(category.getGlAccountId()).orElse(null);
    }
}
