// Approval Credential (POS settings → Approvals & Access): how a supervisor proves an approval.
//   PIN           the branch's shared supervisor PIN
//   PASSWORD      the supervisor's own username/email + password
//   PERSONAL_PIN  the supervisor picks themselves, then enters their own till PIN
// Anything else (missing, legacy, typo) is treated as PIN, as before this module existed.
export const APPROVAL_MODES = Object.freeze(['PIN', 'PASSWORD', 'PERSONAL_PIN']);

export const normalizeApprovalMode = (mode) => (APPROVAL_MODES.includes(mode) ? mode : 'PIN');

/** Short label for summaries ("Approvals by …"). */
export const approvalModeLabel = (mode) => ({
  PIN: 'Branch PIN',
  PASSWORD: 'Password',
  PERSONAL_PIN: 'Personal PIN',
}[normalizeApprovalMode(mode)]);
