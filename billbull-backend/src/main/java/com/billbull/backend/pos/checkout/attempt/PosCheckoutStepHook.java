package com.billbull.backend.pos.checkout.attempt;

import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService.PosCheckoutClaim;

/**
 * Observer of the fenced checkout steps (Phase 0 / M2.1), used only to force interleavings in
 * tests: pause a worker between steps, pause it inside a step, or have "another owner" take the
 * attempt over just before a step. No implementation is registered in a normal deployment, see
 * {@link PosCheckoutChaosHook}.
 *
 * <p>{@link #beforeStep} runs outside any transaction, before the fence. {@link #insideStep} runs
 * inside the step's transaction after its work and evidence, while the attempt row is locked.
 */
public interface PosCheckoutStepHook {

    default void beforeStep(PosCheckoutClaim claim, String step) {}

    default void insideStep(PosCheckoutClaim claim, String step) {}
}
