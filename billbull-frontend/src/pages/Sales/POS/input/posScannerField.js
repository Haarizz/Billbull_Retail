/**
 * Field-level scanner ownership: which text fields a barcode scanner may type into.
 *
 * POLICY
 *  - Default = HUMAN_ONLY. A field that says nothing is a field a person types into. A
 *    scanner-speed burst landing on it is dropped: the characters (including the first one,
 *    which reached the field before the burst could be recognised — its value is put back)
 *    and the burst's Enter. A person's typing, and a person's Enter, are untouched.
 *  - Scanner input needs an explicit opt-in on the field itself, through scannerInputProps.
 *    Nothing infers it — not the field's name, placeholder, type, class or position. A field
 *    is scanner-enabled because someone decided the till has a real scan workflow for it.
 *  - Scanner submission follows the same opt-in: a burst's Enter reaches a field only if that
 *    field accepts scanner input. A HUMAN_ONLY field never sees a scanner's Enter, so a scan
 *    can never confirm the dialog it lands in.
 *  - Financial amount fields (cash/credit received, amounts, approval and reference numbers)
 *    stay HUMAN_ONLY.
 *
 * Opted in today (every opt-in is pinned by posScannerFieldP26.test.jsx; adding one is a
 * deliberate change to that test, not a side effect):
 *  - the Credit Voucher code — the voucher is printed with a barcode and the field is built to
 *    take a wedge scan (lookup on Enter);
 *  - the delivery settlement search — receipts print the invoice number as a Code 128 barcode
 *    (bilingualReceiptCanvas) and the field matches on invoice number. It only filters the
 *    order list; its Enter does nothing.
 *
 * WHERE IT APPLIES: the input controller (usePosInputController) enforces it in the payment
 * scopes — PAYMENT (a payment modal) and the payment-panel screens (CHECKOUT, LAYAWAY_DEPOSIT,
 * DELIVERY_SETTLEMENT). Everywhere else the controller leaves a focused field alone, as it
 * did before; RETURN and the MODAL dialogs have scan fields of their own (receipt lookup,
 * price check, batch search, salesperson badge) that have not been through this audit.
 * With posInputV2 off nothing is enforced.
 */
export const SCANNER_INPUT_MODES = Object.freeze({
  HUMAN_ONLY: 'HUMAN_ONLY',
  SCANNER_ALLOWED: 'SCANNER_ALLOWED',
});

export const POS_SCANNER_INPUT_ATTR = 'data-pos-scanner-input';

/** Spread onto a field: <input {...scannerInputProps(SCANNER_INPUT_MODES.SCANNER_ALLOWED)} />. */
export const scannerInputProps = (mode) => ({ [POS_SCANNER_INPUT_ATTR]: mode });

/**
 * The field's declared mode. Read from the field element itself only — a container cannot opt
 * a group of fields in. Anything undeclared or unrecognised is HUMAN_ONLY.
 */
export function scannerInputModeOf(target) {
  const el = target && target.nodeType === 3 ? target.parentElement : target;
  const declared = el && typeof el.getAttribute === 'function' ? el.getAttribute(POS_SCANNER_INPUT_ATTR) : null;
  return declared === SCANNER_INPUT_MODES.SCANNER_ALLOWED
    ? SCANNER_INPUT_MODES.SCANNER_ALLOWED
    : SCANNER_INPUT_MODES.HUMAN_ONLY;
}

export const acceptsScannerInput = (target) => (
  scannerInputModeOf(target) === SCANNER_INPUT_MODES.SCANNER_ALLOWED
);
