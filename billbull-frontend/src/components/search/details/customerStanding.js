/**
 * The account standing a customer record states, shared by the result row and the detail
 * header so a customer reads the same in both places.
 *
 * <p>A credit block outranks the plain status. Nothing here is derived from balances: the
 * search payload carries none, and overdue is shown only where the server reported it.
 */
export const customerStanding = ({ status, blockCredit } = {}) => {
  if (blockCredit) return { label: "Credit blocked", tone: "negative" };
  if (status) {
    const label = String(status);
    return { label, tone: label.toUpperCase() === "ACTIVE" ? "positive" : "neutral" };
  }
  return null;
};
