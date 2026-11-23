package com.billbull.backend.pos.checkout.attempt;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService.PosCheckoutClaim;

/**
 * Chaos pauses for the real multi-process checkout tests (Phase 0 / M2.1). <b>Not for production.</b>
 *
 * <p>Exists only when {@code pos.checkout.attempt.chaos} is set, and even then arms itself only if
 * the connected database's name starts with {@code billbull_m0_} (the disposable-clone convention
 * the database-backed tests already enforce). Against any other database it logs an error and does
 * nothing.
 *
 * <p>Format: rules separated by {@code ;}, each {@code <checkoutKeyPrefix>|<STEP>|<before|inside>|<ms>}.
 * {@code before} sleeps before the step's fence (between steps, holding no transaction);
 * {@code inside} sleeps inside the step's transaction after its work, holding the attempt row lock.
 * Only checkouts whose key starts with the prefix are affected, so one process can serve several
 * scenarios.
 */
@Component
@ConditionalOnProperty(name = "pos.checkout.attempt.chaos")
public class PosCheckoutChaosHook implements PosCheckoutStepHook {

    private static final Logger log = LoggerFactory.getLogger(PosCheckoutChaosHook.class);

    private record Rule(String keyPrefix, String step, boolean inside, long millis) {}

    private final List<Rule> rules = new ArrayList<>();

    public PosCheckoutChaosHook(@Value("${pos.checkout.attempt.chaos}") String spec, JdbcTemplate jdbc) {
        String db = jdbc.queryForObject("select current_database()", String.class);
        if (db == null || !db.startsWith("billbull_m0_")) {
            log.error("pos.checkout.attempt.chaos is set but the database is '{}', not a disposable billbull_m0_ clone. "
                    + "Chaos pauses are DISABLED.", db);
            return;
        }
        for (String part : spec.split(";")) {
            if (part.isBlank()) continue;
            String[] f = part.trim().split("\\|");
            if (f.length != 4) throw new IllegalArgumentException("bad chaos rule: " + part);
            rules.add(new Rule(f[0], f[1], "inside".equalsIgnoreCase(f[2]), Long.parseLong(f[3])));
        }
        log.warn("POS checkout CHAOS PAUSES ARMED on {}: {}", db, rules);
    }

    @Override
    public void beforeStep(PosCheckoutClaim claim, String step) {
        pause(claim, step, false);
    }

    @Override
    public void insideStep(PosCheckoutClaim claim, String step) {
        pause(claim, step, true);
    }

    private void pause(PosCheckoutClaim claim, String step, boolean inside) {
        for (Rule r : rules) {
            if (r.inside() == inside && r.step().equals(step) && claim.checkoutKey().startsWith(r.keyPrefix())) {
                log.warn("CHAOS: pausing {} ms {} step {} of attempt {} (key {}, fence {})", r.millis(),
                        inside ? "inside" : "before", step, claim.attemptId(), claim.checkoutKey(), claim.fence());
                try {
                    Thread.sleep(r.millis());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                log.warn("CHAOS: resuming step {} of attempt {}", step, claim.attemptId());
            }
        }
    }
}
