/**
 * Access control for the shared POS Functions/Actions buttons.
 *
 * Console -> Behavior -> "Action Button Access" picks one of three modes for the branch, and
 * this module is the single place that turns that choice into button behaviour. Because
 * buildPosFunctionButtons() applies it, all three screen templates (Classic, Cart Focus and
 * the compact Trade POS Functions panel) enforce it identically — the rule cannot be weakened
 * by switching layouts.
 *
 *   ALL_USERS            any POS user; buttons behave exactly as they always have.
 *   SUPERVISOR_PASSWORD  any POS user, but the supervisor credential (PIN or password, per
 *                        supervisorApprovalMode) authorizes each use. The action is held and
 *                        replayed by useSupervisorApproval's POS_FUNCTION dispatcher.
 *   SUPERVISOR_ONLY      supervisor-capable roles only; refused for everyone else, with no
 *                        credential prompt to work around.
 *
 * This is a UI gate, not the enforcement boundary. Every function it covers opens a dialog
 * whose own backend endpoint still checks permissions — restricting the button stops the
 * cashier reaching the workflow, it does not replace the server's own checks.
 */

export const POS_FUNCTION_ACCESS_ALL_USERS = 'ALL_USERS';
export const POS_FUNCTION_ACCESS_SUPERVISOR_PASSWORD = 'SUPERVISOR_PASSWORD';
export const POS_FUNCTION_ACCESS_SUPERVISOR_ONLY = 'SUPERVISOR_ONLY';

/** The roles POS already treats as supervisor-capable (see the Day Close gate in POSSales and
 *  PosSettingsService.SUPERVISOR_ROLES). Both the bare and ROLE_-prefixed spellings appear in
 *  the JWT depending on how the role was seeded, so both are listed. */
export const POS_SUPERVISOR_ROLES = [
  'ADMIN', 'ROLE_ADMIN', 'BRANCH_ADMIN', 'ROLE_BRANCH_ADMIN',
  'MANAGER', 'ROLE_MANAGER', 'SUPERVISOR', 'ROLE_SUPERVISOR',
];

/**
 * Buttons that stay available to every cashier whatever the mode, because gating them would
 * break the cashier's own shift rather than restrict a privileged operation:
 *
 *   salesperson  mandatory verification — with it gated, a cashier in a branch that requires
 *                salesperson attribution could not complete any sale at all.
 *   lock-pos     locking your own till is a security action; making a cashier fetch a
 *                supervisor to lock the terminal would simply mean nobody locks it.
 */
export const UNGATED_POS_FUNCTION_IDS = new Set(['salesperson', 'lock-pos']);

/** Unknown/absent -> ALL_USERS, so an unconfigured branch keeps today's behaviour. */
export const resolvePosFunctionAccessMode = (raw) => (
  raw === POS_FUNCTION_ACCESS_SUPERVISOR_PASSWORD || raw === POS_FUNCTION_ACCESS_SUPERVISOR_ONLY
    ? raw
    : POS_FUNCTION_ACCESS_ALL_USERS
);

/** True when the signed-in user holds any supervisor-capable role. `hasAnyRole` comes from
 *  PermissionContext; a missing one (tests, or a template rendered outside the provider)
 *  resolves to "not a supervisor", which is the safe side of this gate. */
export const isPosSupervisorUser = (hasAnyRole) => (
  typeof hasAnyRole === 'function' ? !!hasAnyRole(...POS_SUPERVISOR_ROLES) : false
);

export const posFunctionDeniedMessage = (label) =>
  `${label} is restricted to supervisors. Ask a supervisor to sign in to use it.`;

/**
 * Rewrites a built button list for the active mode. Returns the list unchanged in ALL_USERS,
 * and for supervisor users in every mode, so the common paths allocate nothing new.
 *
 * @param {Array}  buttons                    output of buildPosFunctionButtons
 * @param {string} opts.mode                  the branch's posFunctionAccessMode
 * @param {boolean} opts.isSupervisor         signed-in user holds a supervisor role
 * @param {Function} opts.requestFunctionApproval  ({ id, label, run }) => void — enqueues the
 *                   supervisor credential dialog and replays `run` once it is approved
 * @param {Function} opts.onFunctionDenied    (message) => void — surfaces the refusal
 */
export const applyPosFunctionAccess = (buttons, {
  mode, isSupervisor, requestFunctionApproval, onFunctionDenied,
} = {}) => {
  const resolved = resolvePosFunctionAccessMode(mode);
  if (resolved === POS_FUNCTION_ACCESS_ALL_USERS || isSupervisor) return buttons;

  return buttons.map((btn) => {
    if (UNGATED_POS_FUNCTION_IDS.has(btn.id)) return btn;

    if (resolved === POS_FUNCTION_ACCESS_SUPERVISOR_ONLY) {
      const message = posFunctionDeniedMessage(btn.label);
      return {
        ...btn,
        locked: true,
        lockReason: message,
        // Dimmed rather than removed: a cashier who cannot find the Return button assumes the
        // POS is broken and calls support. Seeing it greyed out with a reason is the answer.
        color: `${btn.color} opacity-60`,
        action: () => onFunctionDenied?.(message),
      };
    }

    // SUPERVISOR_PASSWORD — hold the original action and replay it after approval. The
    // original closure is captured here, so it runs with exactly the state it would have had.
    const run = btn.action;
    return {
      ...btn,
      requiresApproval: true,
      action: () => requestFunctionApproval?.({ id: btn.id, label: btn.label, run }),
    };
  });
};

export default applyPosFunctionAccess;
