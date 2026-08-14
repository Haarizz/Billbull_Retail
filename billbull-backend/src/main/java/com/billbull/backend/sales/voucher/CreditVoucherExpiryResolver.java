package com.billbull.backend.sales.voucher;

import com.billbull.backend.pos.settings.PosSettings;
import com.billbull.backend.pos.settings.PosSettingsRepository;
import com.billbull.backend.settings.branch.Branch;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Optional;

/**
 * Decides when a voucher issued today should expire (§9–§17).
 *
 * <p>Two policies are supported, configured per branch on {@code PosSettings}:
 *
 * <ul>
 *   <li>{@link #MODE_AUTO} — a rolling window: {@code issueDate + N months}. This is what the
 *       system has always done, and remains the behaviour of every branch that never touches
 *       the setting.</li>
 *   <li>{@link #MODE_MANUAL} — a fixed calendar date every voucher expires on, regardless of
 *       when it was issued. Retailers use this to align store credit with a financial year or
 *       the end of a promotion.</li>
 * </ul>
 *
 * <p><b>Why this resolves on the server and nowhere else (§15).</b> The expiry date is the
 * moment a liability the business owes a customer stops being owed. A client-supplied date
 * would let a terminal decide how long the business is on the hook for, so the frontend sends
 * nothing about expiry at all — it only displays what was persisted.
 *
 * <p><b>Backward compatibility (§17).</b> An unconfigured branch has {@code null} in all three
 * columns, and falls through to {@link CreditVoucherPolicy}'s {@code sales.voucher.expiry-months}
 * property, which defaults to 12. No migration or backfill changes any existing branch's
 * behaviour.
 */
@Component
@Slf4j
public class CreditVoucherExpiryResolver {

    public static final String MODE_AUTO = "AUTO";
    public static final String MODE_MANUAL = "MANUAL";

    private final PosSettingsRepository posSettingsRepository;
    private final CreditVoucherPolicy policy;

    public CreditVoucherExpiryResolver(PosSettingsRepository posSettingsRepository,
                                       CreditVoucherPolicy policy) {
        this.posSettingsRepository = posSettingsRepository;
        this.policy = policy;
    }

    /**
     * The expiry date for a voucher issued at {@code branch} on {@code issueDate}, or
     * {@code null} when the policy in force is "never expires".
     *
     * <p>A configured MANUAL date that has since lapsed does <em>not</em> fail the return. The
     * till is mid-refund by the time this runs, and refusing here would strand a customer at
     * the counter over a stale admin setting. Instead the automatic policy is used and the
     * lapse is logged loudly, because the two possible mistakes are not symmetric: issuing a
     * voucher valid for the default window is recoverable, while issuing one that is already
     * expired hands the customer a worthless piece of paper.
     */
    public LocalDate resolveExpiryDate(Branch branch, LocalDate issueDate) {
        if (issueDate == null) return null;

        PosSettings settings = branch == null || branch.getId() == null
                ? null
                : posSettingsRepository.findByBranchId(branch.getId()).orElse(null);

        if (settings == null || settings.getCreditVoucherExpiryMode() == null) {
            return policy.resolveExpiryDate(issueDate);
        }

        String mode = settings.getCreditVoucherExpiryMode().trim().toUpperCase();

        if (MODE_MANUAL.equals(mode)) {
            LocalDate manual = settings.getCreditVoucherExpiryDate();
            if (manual != null && manual.isAfter(issueDate)) {
                return manual;
            }
            log.warn("[CreditVoucher] Branch {} is on MANUAL expiry but its configured date ({}) is not "
                            + "after today ({}). Falling back to the automatic policy for this voucher. "
                            + "Update the branch's Credit Voucher expiry setting.",
                    branch.getId(), manual, issueDate);
            return policy.resolveExpiryDate(issueDate);
        }

        if (MODE_AUTO.equals(mode)) {
            Integer months = settings.getCreditVoucherExpiryMonths();
            if (months == null) {
                return policy.resolveExpiryDate(issueDate);
            }
            // 0 is a deliberate policy, not a missing value: several jurisdictions prohibit
            // expiring store credit at all.
            return months <= 0 ? null : issueDate.plusMonths(months);
        }

        log.warn("[CreditVoucher] Branch {} has an unrecognised expiry mode '{}'. Using the default policy.",
                branch.getId(), settings.getCreditVoucherExpiryMode());
        return policy.resolveExpiryDate(issueDate);
    }

    /**
     * Validates an expiry policy as an administrator is saving it (§13).
     *
     * <p>Rejects rather than silently corrects: a policy that does not mean what the admin typed
     * is worse than one they have to retype. Called from {@code PosSettingsService.save}.
     *
     * @param today the branch's current business date, so validation is done in the business's
     *              own reckoning of "past" rather than the server's
     * @return the problem, or empty when the configuration is valid
     */
    public static Optional<String> validate(String mode, Integer months, LocalDate manualDate, LocalDate today) {
        if (mode == null || mode.isBlank()) return Optional.empty();

        String m = mode.trim().toUpperCase();

        if (MODE_AUTO.equals(m)) {
            if (months == null) {
                return Optional.of("Enter how many months a credit voucher stays valid, or 0 for no expiry.");
            }
            if (months < 0) {
                return Optional.of("Credit voucher expiry cannot be a negative number of months.");
            }
            if (months > 600) {
                return Optional.of("Credit voucher expiry cannot exceed 600 months (50 years).");
            }
            return Optional.empty();
        }

        if (MODE_MANUAL.equals(m)) {
            if (manualDate == null) {
                return Optional.of("Choose the date credit vouchers should expire on.");
            }
            // Strictly after today: a voucher issued today that expires today is expired the
            // moment it is printed, which is never what anyone means to configure.
            if (!manualDate.isAfter(today)) {
                return Optional.of("The credit voucher expiry date must be later than " + today + ".");
            }
            return Optional.empty();
        }

        return Optional.of("Credit voucher expiry mode must be AUTO or MANUAL.");
    }
}
