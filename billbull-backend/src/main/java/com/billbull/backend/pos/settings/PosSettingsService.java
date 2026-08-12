package com.billbull.backend.pos.settings;

import com.billbull.backend.pos.businessdate.BusinessDayClock;
import com.billbull.backend.pos.businessdate.BusinessDayPhase;
import com.billbull.backend.pos.businessdate.BusinessDaySettings;
import com.billbull.backend.pos.businessdate.PosOperatingHoursCalculator;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionService;
import com.billbull.backend.security.AuditLogService;
import com.billbull.backend.settings.branch.BranchAccessService;
import com.billbull.backend.user.UserRepository;
import com.billbull.backend.pos.auth.PosCredentialVerificationService;
import com.billbull.backend.pos.auth.CredentialVerificationResult;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

@Service
public class PosSettingsService {

    private final PosSettingsRepository repo;
    private final BranchAccessService branchAccessService;
    private final PasswordEncoder passwordEncoder;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;
    private final PosSessionService posSessionService;
    private final PosCredentialVerificationService credentialVerificationService;
    private final BusinessDayClock businessDayClock;

    public PosSettingsService(PosSettingsRepository repo, BranchAccessService branchAccessService,
                              PasswordEncoder passwordEncoder, UserRepository userRepository,
                              AuditLogService auditLogService, PosSessionService posSessionService,
                              PosCredentialVerificationService credentialVerificationService,
                              BusinessDayClock businessDayClock) {
        this.repo = repo;
        this.branchAccessService = branchAccessService;
        this.passwordEncoder = passwordEncoder;
        this.userRepository = userRepository;
        this.auditLogService = auditLogService;
        this.posSessionService = posSessionService;
        this.credentialVerificationService = credentialVerificationService;
        this.businessDayClock = businessDayClock;
    }

    /** A stored PIN already BCrypt-hashed? BCrypt hashes start with $2a/$2b/$2y. */
    private boolean isHashed(String value) {
        return value != null && value.startsWith("$2");
    }

    /** Hash a raw PIN unless it is already hashed (idempotent on re-save of an unchanged hash). */
    private String hashPinIfNeeded(String pin) {
        if (pin == null || pin.isBlank()) return pin;
        return isHashed(pin) ? pin : passwordEncoder.encode(pin);
    }

    /** Uses {@link BranchAccessService#getActiveBranchId()} (not {@code getCurrentUserBranchId()})
     *  so this resolves against the Branch Selector's active branch, not always the user's
     *  primary/HQ branch — same rationale as {@code BranchTaxConfigurationService.getForCurrentBranch()}.
     *  Otherwise an admin viewing/editing another branch's POS Console would silently read and
     *  save settings (including the supervisor PIN) against their home branch instead. */
    @Transactional(readOnly = true)
    public PosSettings getForCurrentBranch() {
        Long branchId = branchAccessService.getActiveBranchId();
        if (branchId == null) return defaultSettings();
        return getForBranch(branchId);
    }

    @Transactional(readOnly = true)
    public PosSettings getForBranch(Long branchId) {
        PosSettings settings = repo.findByBranchId(branchId).orElseGet(() -> {
            PosSettings s = defaultSettings();
            s.setBranchId(branchId);
            return s;
        });
        return withBusinessDayScheduleLock(settings);
    }

    /** Stamps the read-only schedule-lock projection onto a settings view. Uses the same
     *  {@code PosSessionService} definition of a locking session that {@link #save} enforces
     *  with, so the console can never disagree with the backend about whether the Business Day
     *  schedule is editable. Never persisted — the fields are {@code @Transient}. */
    private PosSettings withBusinessDayScheduleLock(PosSettings settings) {
        int locking = posSessionService.findBusinessDayScheduleLockingSessions(settings.getBranchId()).size();
        settings.setBusinessDayScheduleLockingSessionCount(locking);
        settings.setBusinessDayScheduleLocked(locking > 0);
        settings.setBusinessDayScheduleLockReason(locking > 0 ? SCHEDULE_LOCKED_MESSAGE : null);
        return settings;
    }

    /**
     * Validate Terminal Auto Archive configuration before it can be saved. Rejecting at save time
     * (rather than letting the scheduler cope with nonsense config) keeps the sweep job simple and
     * prevents a branch from silently never warning admins or archiving terminals immediately.
     */
    private void validateTerminalAutoArchiveConfig(PosSettings settings) {
        Integer archiveAfterDays = settings.getTerminalArchiveAfterDays();
        Integer warningDays = settings.getTerminalArchiveWarningDays();
        if (archiveAfterDays != null && archiveAfterDays <= 0) {
            throw new IllegalArgumentException("Archive after days must be greater than zero.");
        }
        if (warningDays != null && warningDays < 0) {
            throw new IllegalArgumentException("Warning period days cannot be negative.");
        }
        boolean notifyEnabled = Boolean.TRUE.equals(settings.getTerminalArchiveNotifyBefore());
        if (Boolean.TRUE.equals(settings.getTerminalAutoArchiveEnabled()) && notifyEnabled
                && archiveAfterDays != null && warningDays != null
                && warningDays >= archiveAfterDays) {
            throw new IllegalArgumentException("Warning period days must be less than archive after days.");
        }
    }

    /** Business Day window (UI label) / operatingHours* (backend field names) — when enabled,
     *  both a start and end time are required. End &lt; start is allowed and represents an
     *  overnight Business Day; only presence is validated here. */
    private void validateOperatingHoursConfig(PosSettings settings) {
        if (Boolean.TRUE.equals(settings.getOperatingHoursEnabled())) {
            if (settings.getOperatingStartTime() == null) {
                throw new IllegalArgumentException("Business Day Start Time is required when the Business Day Window is enabled.");
            }
            if (settings.getOperatingEndTime() == null) {
                throw new IllegalArgumentException("Business Day Scheduled End Time is required when the Business Day Window is enabled.");
            }
            Integer extension = settings.getBusinessDayExtensionMinutes();
            if (extension != null && extension < 0) {
                throw new IllegalArgumentException("Business Day extension cannot be negative.");
            }
            // The extension must expire before the next Business Day opens. Otherwise
            // two Business Days would claim the same instant and the phase at that
            // moment would be genuinely ambiguous — far better to reject the
            // configuration here, where an admin can see and fix it, than to resolve
            // the ambiguity arbitrarily at every session-open for months afterward.
            if (!com.billbull.backend.pos.businessdate.PosOperatingHoursCalculator.isExtensionWithinBounds(
                    settings.getOperatingStartTime(), settings.getOperatingEndTime(),
                    extension != null ? extension : 0)) {
                throw new IllegalArgumentException(
                        "The Business Day extension is too long: it would run past the next Business Day's start time. "
                                + "Shorten the extension or adjust the scheduled times.");
            }
        }
    }

    // ── Business Day schedule change guard ───────────────────────────────────────
    //
    // An administrator must not be able to re-time the accounting window underneath
    // sessions that are already trading against it. PosSession.tradingDate is immutable
    // by design and is resolved once, at open, from windowStart — which is anchored on
    // the Start Time. Move Start or End (or switch the window off entirely) while a
    // session is live and the Candidate Business Day computed a moment later can differ
    // from that session's stored tradingDate, retroactively turning an in-progress
    // session into a "previous Business Day" one for BusinessDayContinuationGate.
    //
    // The fix is refusal, never repair: nothing here recalculates, rewrites, or
    // migrates an existing session's tradingDate, and BusinessDayWindowService /
    // PosOperatingHoursCalculator are untouched — they remain the sole window authority
    // and are only *read* below.

    /** The message the API returns and the console displays — one wording for both. */
    static final String SCHEDULE_LOCKED_MESSAGE =
            "Business Day timing cannot be changed while a POS session is open or undergoing closure. "
                    + "Close all active sessions before changing the Business Day schedule.";

    /**
     * Whether {@code incoming} re-times the Business Day relative to {@code existing}.
     *
     * <p>Covers the enable/disable switch as well as the two times: turning the window off
     * substitutes the plain calendar day for the configured window, which shifts the
     * Candidate Business Day exactly as moving Start would, and leaving it unguarded would
     * also make the Start/End rule trivially bypassable (disable, then re-time).
     *
     * <p>The extension is deliberately NOT part of this — see
     * {@link #rejectsExtensionChange}.
     */
    private boolean changesBusinessDaySchedule(PosSettings existing, PosSettings incoming) {
        boolean existingEnabled = Boolean.TRUE.equals(existing.getOperatingHoursEnabled());
        boolean incomingEnabled = Boolean.TRUE.equals(incoming.getOperatingHoursEnabled());
        return existingEnabled != incomingEnabled
                || !Objects.equals(existing.getOperatingStartTime(), incoming.getOperatingStartTime())
                || !Objects.equals(existing.getOperatingEndTime(), incoming.getOperatingEndTime());
    }

    /**
     * Whether an extension change must be refused.
     *
     * <p><b>Why the extension is not simply treated like Start/End.</b> The Trading Date comes
     * from {@code windowStart.toLocalDate()}, and {@code windowStart} is derived from the Start
     * Time alone; the extension only shifts {@code closureAt = scheduledEnd + extension}.
     * Changing it therefore <i>cannot</i> change any session's Business Day — open sessions keep
     * trading on the same Trading Date, which is precisely what an operator needs when the shop
     * is still serving customers at closing time. Blocking it would make the one setting that
     * exists to be adjusted late in the day unadjustable exactly when it is needed.
     *
     * <p><b>The one case that is unsafe.</b> The documented lifecycle
     * (ACTIVE → EXTENSION → CLOSED) is one-way: "once the configured extension has elapsed the
     * Business Day is CLOSED until the next window starts. There is deliberately no supervisor
     * path that reopens it." Lengthening the extension after closure would push {@code closureAt}
     * back past {@code now} and move the current Business Day CLOSED → EXTENSION — reopening a
     * day that may already have been Day-Closed, and resurrecting it as an alternative,
     * back-door supervisor override. That, and only that, is refused.
     *
     * <p>Shortening the extension is allowed even mid-extension: it moves the day forward to
     * CLOSED, which is the legitimate "we are closing now" action, leaves every tradingDate
     * untouched, and never blocks closing a session (neither the closure workflow nor Day Close
     * is gated by the Business Day phase).
     */
    private boolean rejectsExtensionChange(PosSettings existing, PosSettings incoming) {
        if (incoming.getBusinessDayExtensionMinutes() == null) return false; // field absent from request
        if (Objects.equals(existing.getBusinessDayExtensionMinutes(),
                incoming.getBusinessDayExtensionMinutes())) return false;

        java.time.LocalDateTime now = businessDayClock.now();
        BusinessDayPhase before = PosOperatingHoursCalculator
                .resolveWindow(now, BusinessDaySettings.from(existing)).phase();
        if (before != BusinessDayPhase.CLOSED) return false;

        // Same stored schedule, only the proposed extension differs — so any phase change
        // observed here is attributable to the extension alone.
        PosSettings proposed = new PosSettings();
        proposed.setOperatingHoursEnabled(existing.getOperatingHoursEnabled());
        proposed.setOperatingStartTime(existing.getOperatingStartTime());
        proposed.setOperatingEndTime(existing.getOperatingEndTime());
        proposed.setBusinessDayExtensionMinutes(incoming.getBusinessDayExtensionMinutes());
        BusinessDayPhase after = PosOperatingHoursCalculator
                .resolveWindow(now, BusinessDaySettings.from(proposed)).phase();

        return after != BusinessDayPhase.CLOSED;
    }

    /**
     * Refuses a Business Day re-timing while the branch has sessions that are OPEN or in the
     * closure workflow, and refuses an extension change that would reopen a closed Business Day.
     *
     * <p>Called from inside {@link #save}'s transaction, <i>after</i> the settings row has been
     * locked FOR UPDATE — see the race note there.
     */
    private void validateBusinessDayScheduleChange(PosSettings existing, PosSettings incoming) {
        boolean scheduleChange = changesBusinessDaySchedule(existing, incoming);
        boolean extensionReopens = rejectsExtensionChange(existing, incoming);
        if (!scheduleChange && !extensionReopens) return;

        if (extensionReopens && !scheduleChange) {
            String message = "The Business Day for this branch has already closed. Increasing the extension "
                    + "now would reopen a closed Business Day, which is not permitted. It can be changed "
                    + "again when the next Business Day starts.";
            auditRejection(incoming.getBranchId(), "extension " + existing.getBusinessDayExtensionMinutes()
                    + "min -> " + incoming.getBusinessDayExtensionMinutes() + "min would reopen a CLOSED Business Day");
            throw new IllegalArgumentException(message);
        }

        List<PosSession> blocking = posSessionService.findBusinessDayScheduleLockingSessions(existing.getBranchId());
        if (!blocking.isEmpty()) {
            PosSession oldest = blocking.get(0);
            auditRejection(existing.getBranchId(), String.format(
                    "attempted schedule change (enabled %s->%s, start %s->%s, end %s->%s) refused: %d session(s) "
                            + "open or in closure, oldest #%d on terminal %s",
                    existing.getOperatingHoursEnabled(), incoming.getOperatingHoursEnabled(),
                    existing.getOperatingStartTime(), incoming.getOperatingStartTime(),
                    existing.getOperatingEndTime(), incoming.getOperatingEndTime(),
                    blocking.size(), oldest.getId(), oldest.getTerminalId()));
            throw new IllegalArgumentException(SCHEDULE_LOCKED_MESSAGE
                    + String.format(" %d session(s) are still active (oldest: session #%d on terminal %s).",
                            blocking.size(), oldest.getId(), oldest.getTerminalId()));
        }

        if (extensionReopens) {
            // Schedule change with no active sessions, but the extension would still reopen a
            // closed day. Refuse for the lifecycle reason.
            auditRejection(existing.getBranchId(),
                    "schedule change refused: proposed extension would reopen a CLOSED Business Day");
            throw new IllegalArgumentException("The Business Day for this branch has already closed. "
                    + "The proposed extension would reopen it, which is not permitted.");
        }

        auditAccepted(existing, incoming);
    }

    /** Same AuditLogService domain-event channel PosSettingsService already uses for
     *  supervisor handovers — no separate audit mechanism is introduced. */
    private void auditRejection(Long branchId, String detail) {
        auditLogService.logDomainEvent("POS_SETTINGS", String.valueOf(branchId),
                "BUSINESS_DAY_SCHEDULE_CHANGE_REJECTED", detail);
    }

    private void auditAccepted(PosSettings existing, PosSettings incoming) {
        auditLogService.logDomainEvent("POS_SETTINGS", String.valueOf(existing.getBranchId()),
                "BUSINESS_DAY_SCHEDULE_CHANGED", String.format(
                        "enabled %s->%s, start %s->%s, end %s->%s (no sessions open or in closure)",
                        existing.getOperatingHoursEnabled(), incoming.getOperatingHoursEnabled(),
                        existing.getOperatingStartTime(), incoming.getOperatingStartTime(),
                        existing.getOperatingEndTime(), incoming.getOperatingEndTime()));
    }

    /** Roles allowed to act as a supervisor (for configuration, day close, void gate, mode, PIN). */
    public static final List<String> SUPERVISOR_ROLES = List.of(
            "ADMIN", "ROLE_ADMIN", "BRANCH_ADMIN", "ROLE_BRANCH_ADMIN",
            "MANAGER", "ROLE_MANAGER", "SUPERVISOR", "ROLE_SUPERVISOR");

    private boolean currentUserCanConfigureSupervisorSettings() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return false;
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(SUPERVISOR_ROLES::contains);
    }

    @Transactional
    public PosSettings save(PosSettings settings) {
        if (settings.getBranchId() == null) {
            // Same Branch Selector-aware resolution as getForCurrentBranch() — a save posted
            // without an explicit branchId must land on the branch the admin is looking at.
            Long branchId = branchAccessService.getActiveBranchId();
            settings.setBranchId(branchId);
        }
        validateTerminalAutoArchiveConfig(settings);
        validateOperatingHoursConfig(settings);
        // Upsert by branchId.
        //
        // Race safety: this read takes a PESSIMISTIC_WRITE (FOR UPDATE) lock on the branch's
        // settings row and holds it for the rest of this transaction. PosSessionService's
        // openSession() takes the conflicting PESSIMISTIC_READ (FOR SHARE) lock on the same row
        // before it resolves a Trading Date, so a session cannot come into existence between
        // the active-session check below and this save committing: whichever transaction
        // acquires the row first, the other blocks until it commits and then sees its result.
        // The check is therefore made inside, not merely before, the update flow, and calling
        // the API directly changes nothing — every write goes through here.
        return repo.findByBranchIdForUpdate(settings.getBranchId())
                .map(existing -> {
                    validateBusinessDayScheduleChange(existing, settings);
                    boolean changesSupervisorConfig =
                            !Objects.equals(existing.getRequireSupervisorForVoid(), settings.getRequireSupervisorForVoid())
                            || !Objects.equals(existing.getSupervisorApprovalMode(), settings.getSupervisorApprovalMode())
                            || !Objects.equals(existing.getRequirePriceOverrideApproval(), settings.getRequirePriceOverrideApproval())
                            || !Objects.equals(existing.getRequireSupervisorForDayClose(), settings.getRequireSupervisorForDayClose())
                            || (settings.getSupervisorPin() != null && !settings.getSupervisorPin().isBlank());
                    if (changesSupervisorConfig && !currentUserCanConfigureSupervisorSettings()) {
                        throw new AccessDeniedException(
                                "Only supervisors/managers/admins may change supervisor approval settings.");
                    }
                    existing.setMaxTerminalsPerBranch(settings.getMaxTerminalsPerBranch());
                    existing.setRequireSupervisorForVoid(settings.getRequireSupervisorForVoid());
                    existing.setRequireSupervisorForDayClose(settings.getRequireSupervisorForDayClose());
                    existing.setRequireCashMovementCategory(settings.getRequireCashMovementCategory());
                    existing.setSupervisorApprovalMode(settings.getSupervisorApprovalMode());
                    existing.setRequirePriceOverrideApproval(settings.getRequirePriceOverrideApproval());
                    // ARCHFIX S5: hash a newly supplied PIN; a blank/absent PIN leaves the stored hash untouched.
                    if (settings.getSupervisorPin() != null && !settings.getSupervisorPin().isBlank()) {
                        existing.setSupervisorPin(hashPinIfNeeded(settings.getSupervisorPin()));
                    }
                    existing.setVoidMode(settings.getVoidMode());
                    existing.setProductEntryMode(settings.getProductEntryMode());
                    existing.setCartViewMode(settings.getCartViewMode());
                    existing.setCartShowBarcode(settings.getCartShowBarcode());
                    existing.setCartShowProductCode(settings.getCartShowProductCode());
                    existing.setCartShowBatchNumber(settings.getCartShowBatchNumber());
                    existing.setCartShowSerialNumber(settings.getCartShowSerialNumber());
                    existing.setCartShowExpiryDate(settings.getCartShowExpiryDate());
                    existing.setPriceCheckShowStock(settings.getPriceCheckShowStock());
                    existing.setZReportAccess(settings.getZReportAccess());
                    existing.setCashDrawerTriggers(settings.getCashDrawerTriggers());
                    existing.setReceiptShareEnabled(settings.getReceiptShareEnabled());
                    existing.setReceiptShareWhatsapp(settings.getReceiptShareWhatsapp());
                    existing.setReceiptShareSms(settings.getReceiptShareSms());
                    existing.setReceiptShareEmail(settings.getReceiptShareEmail());
                    existing.setDefaultLayout(settings.getDefaultLayout());
                    existing.setLayoutHideCategoryPanel(settings.getLayoutHideCategoryPanel());
                    existing.setLayoutHideItemsPanel(settings.getLayoutHideItemsPanel());
                    existing.setLayoutHiddenPanelButtons(settings.getLayoutHiddenPanelButtons());
                    existing.setPrintTemplateConfig(settings.getPrintTemplateConfig());
                    existing.setWalkInCustomerCode(settings.getWalkInCustomerCode());
                    existing.setAutoPrintReceipt(settings.getAutoPrintReceipt());
                    existing.setTerminalAutoArchiveEnabled(settings.getTerminalAutoArchiveEnabled());
                    existing.setTerminalArchiveAfterDays(settings.getTerminalArchiveAfterDays());
                    existing.setTerminalArchiveNotifyBefore(settings.getTerminalArchiveNotifyBefore());
                    existing.setTerminalArchiveWarningDays(settings.getTerminalArchiveWarningDays());
                    existing.setOperatingHoursEnabled(settings.getOperatingHoursEnabled());
                    existing.setOperatingStartTime(settings.getOperatingStartTime());
                    existing.setOperatingEndTime(settings.getOperatingEndTime());
                    // Null means "field absent from this request", not "no extension" — several
                    // callers POST a partial settings object, and silently resetting a configured
                    // extension to 0 would close the Business Day early for the rest of that
                    // evening. An explicit 0 is a real choice (closure exactly at the Scheduled
                    // End Time) and is honored.
                    if (settings.getBusinessDayExtensionMinutes() != null) {
                        existing.setBusinessDayExtensionMinutes(settings.getBusinessDayExtensionMinutes());
                    }
                    // Same lock projection the GET paths return, so the console's copy of the
                    // settings stays accurate after a save instead of appearing unlocked until
                    // the next fetch.
                    return withBusinessDayScheduleLock(repo.save(existing));
                })
                .orElseGet(() -> {
                    // First-ever save for this branch. The same guard applies — configuring a
                    // window for the first time while sessions are trading on the calendar day
                    // moves the Candidate Business Day just as any later re-timing would — but
                    // there is no row to lock yet, so this path is guarded, not race-proof. The
                    // window it leaves open is narrow and benign: a branch with no settings row
                    // has no configured Business Day at all, so a session opening concurrently
                    // resolves the unrestricted calendar day, which differs from the newly
                    // configured window's Trading Date only when "now" is before the new Start
                    // Time. Every subsequent save is fully locked.
                    PosSettings none = new PosSettings();
                    none.setBranchId(settings.getBranchId());
                    validateBusinessDayScheduleChange(none, settings);
                    settings.setSupervisorPin(hashPinIfNeeded(settings.getSupervisorPin()));
                    return withBusinessDayScheduleLock(repo.save(settings));
                });
    }

    /**
     * Verify a raw supervisor PIN against the stored value for the current branch (ARCHFIX S5).
     * The PIN is never returned to the client; verification happens server-side. Handles legacy
     * plaintext rows transparently: if the stored value is not yet a BCrypt hash, compare plainly
     * and opportunistically upgrade it to a hash on a successful match.
     */
    @Transactional
    public boolean verifyPin(String rawPin) {
        if (rawPin == null || rawPin.isBlank()) return false;
        // Must match the branch getForCurrentBranch()/save() resolve to (the active/selected
        // branch), not the user's home branch, or a PIN saved while viewing another branch's
        // console would never verify against the branch actually enforcing it at checkout.
        Long branchId = branchAccessService.getActiveBranchId();
        if (branchId == null) return false;
        return repo.findByBranchId(branchId)
                .map(settings -> {
                    String stored = settings.getSupervisorPin();
                    if (stored == null || stored.isBlank()) return false;
                    if (isHashed(stored)) {
                        return passwordEncoder.matches(rawPin, stored);
                    }
                    // Legacy plaintext: compare directly, then upgrade to a hash if it matched.
                    if (stored.equals(rawPin)) {
                        settings.setSupervisorPin(passwordEncoder.encode(rawPin));
                        repo.save(settings);
                        return true;
                    }
                    return false;
                })
                .orElse(false);
    }

    /**
     * Verify supervisor identity by email/username + password and role membership.
     * Roles that qualify as supervisor: ADMIN, BRANCH_ADMIN, MANAGER, SUPERVISOR.
     * On success, logs a SUPERVISOR_HANDOVER domain event for audit trail.
     */
    @Transactional
    public SupervisorAuthResult verifySupervisorCredentials(String emailOrUsername, String password,
                                                            String terminalId, String lockedBy) {
        CredentialVerificationResult result = credentialVerificationService.verifyCredentials(emailOrUsername, password);
        
        if (!result.valid()) {
            return SupervisorAuthResult.invalid(result.message());
        }

        var user = result.user();

        boolean hasSupervisorRole = user.getRoles().stream()
                .anyMatch(r -> List.of("ADMIN", "BRANCH_ADMIN", "MANAGER", "SUPERVISOR").contains(r.getName()));

        if (!hasSupervisorRole) {
            auditLogService.logDomainEvent("POS_TERMINAL", terminalId,
                    "SUPERVISOR_HANDOVER_DENIED",
                    String.format("User '%s' attempted terminal handover but lacks supervisor role. Locked by: %s",
                            user.getUsername(), lockedBy));
            return SupervisorAuthResult.invalid("This account does not have supervisor privileges.");
        }

        String displayName = (user.getFullName() != null && !user.getFullName().isBlank())
                ? user.getFullName() : user.getUsername();

        auditLogService.logDomainEvent("POS_TERMINAL", terminalId,
                "SUPERVISOR_HANDOVER",
                String.format("Supervisor '%s' (%s) authorized shift handover from cashier '%s'.",
                        displayName, user.getUsername(), lockedBy));

        // Reassign the open session to whoever is actually logged into this browser
        // (the incoming cashier), so they resume the existing session instead of
        // being forced into "Start Session".
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String incomingCashier = auth != null ? auth.getName() : null;
        if (incomingCashier != null) {
            posSessionService.reassignSessionOwner(terminalId, incomingCashier);
        }

        return SupervisorAuthResult.valid(displayName, user.getUsername());
    }

    /** Result type for {@link #verifySupervisorCredentials}. */
    public static class SupervisorAuthResult {
        private final boolean valid;
        private final String supervisorName;
        private final String supervisorUsername;
        private final String reason;

        private SupervisorAuthResult(boolean valid, String supervisorName, String supervisorUsername, String reason) {
            this.valid = valid;
            this.supervisorName = supervisorName;
            this.supervisorUsername = supervisorUsername;
            this.reason = reason;
        }

        public static SupervisorAuthResult valid(String name, String username) {
            return new SupervisorAuthResult(true, name, username, null);
        }

        public static SupervisorAuthResult invalid(String reason) {
            return new SupervisorAuthResult(false, null, null, reason);
        }

        public boolean isValid() { return valid; }
        public String getSupervisorName() { return supervisorName; }
        public String getSupervisorUsername() { return supervisorUsername; }
        public String getReason() { return reason; }
    }

    private PosSettings defaultSettings() {
        return new PosSettings();
    }
}
