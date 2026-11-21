package com.billbull.backend.notification;

import com.billbull.backend.user.UserRepository;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Single integration point for publishing notifications from any business module.
 *
 * <p>Uses the fan-out-on-write pattern: when a notification targets a role,
 * this publisher resolves all active users with that role and creates one
 * notification row per user. This guarantees isolated read/dismiss state.</p>
 *
 * <p>Every notification also records who triggered it (JPA auditing's {@code createdBy}), the
 * branch the request was acting on, and a small {@code details} map of the event's key facts,
 * which the inbox renders as labelled chips (amount, customer, vendor, qty, ...).</p>
 *
 * <h3>Usage from other services:</h3>
 * <pre>{@code
 *   @Autowired NotificationEventPublisher notifPublisher;
 *
 *   // Notify a specific user
 *   notifPublisher.notifyUser("admin", "Invoice Paid", "INV-0042 has been paid",
 *       "SUCCESS", "SALES", "MEDIUM", "/sales/invoice", "INV-0042", "INVOICE");
 *
 *   // Notify all users with a role, with details
 *   notifPublisher.notifyRoles(List.of("ADMIN"), ..., details("Amount", "AED 120.00"));
 *
 *   // Use convenience methods
 *   notifPublisher.lowStockAlert("Widget Pro", "SKU-123", 3, 10);
 * }</pre>
 */
@Component
public class NotificationEventPublisher {

    /** A stock alert that is still unread is not repeated inside this window. */
    private static final Duration STOCK_ALERT_DEDUPE = Duration.ofHours(12);

    private final NotificationService notificationService;
    private final UserRepository userRepository;

    public NotificationEventPublisher(NotificationService notificationService,
                                      UserRepository userRepository) {
        this.notificationService = notificationService;
        this.userRepository = userRepository;
    }

    // ── Generic Methods ───────────────────────────────────────────────────────

    /** Send a notification to a single user. */
    public void notifyUser(String username,
                           String title, String message,
                           String type, String category, String priority,
                           String actionUrl,
                           String referenceId, String referenceType) {
        notifyUser(username, title, message, type, category, priority, actionUrl, referenceId, referenceType, null);
    }

    /** Send a notification with details to a single user. */
    public void notifyUser(String username,
                           String title, String message,
                           String type, String category, String priority,
                           String actionUrl,
                           String referenceId, String referenceType,
                           Map<String, ?> details) {
        if (username == null || username.isBlank()) return;
        notificationService.createForUser(username, title, message, type, category,
                priority, actionUrl, referenceId, referenceType, null, details);
    }

    /** Fan-out: one notification per active user holding the role. */
    public void notifyRole(String roleName,
                           String title, String message,
                           String type, String category, String priority,
                           String actionUrl,
                           String referenceId, String referenceType) {
        notifyRoles(List.of(roleName), title, message, type, category, priority,
                actionUrl, referenceId, referenceType, null, null);
    }

    /**
     * Fan-out to multiple roles. De-duplicates users that appear in more than
     * one role so they only receive one notification.
     */
    public void notifyRoles(List<String> roleNames,
                            String title, String message,
                            String type, String category, String priority,
                            String actionUrl,
                            String referenceId, String referenceType) {
        notifyRoles(roleNames, title, message, type, category, priority,
                actionUrl, referenceId, referenceType, null, null);
    }

    /** Fan-out to multiple roles with details and optional de-duplication of repeats. */
    public void notifyRoles(List<String> roleNames,
                            String title, String message,
                            String type, String category, String priority,
                            String actionUrl,
                            String referenceId, String referenceType,
                            Map<String, ?> details,
                            Duration dedupeWithin) {
        List<String> usernames = roleNames.stream()
                .flatMap(role -> userRepository.findActiveUsernamesByRoleName(role).stream())
                .distinct()
                .toList();
        if (!usernames.isEmpty()) {
            notificationService.createForUsers(usernames, title, message, type, category,
                    priority, actionUrl, referenceId, referenceType, null, details, dedupeWithin);
        }
    }

    /** Ordered label → value map for {@code details}; nulls are dropped when stored. */
    public static Map<String, Object> details(Object... labelValuePairs) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < labelValuePairs.length; i += 2) {
            m.put(String.valueOf(labelValuePairs[i]), labelValuePairs[i + 1]);
        }
        return m;
    }

    // ── Convenience Methods for Common Business Events ────────────────────────

    /** Low stock alert → sent to ADMIN + INVENTORY_MANAGER users. */
    public void lowStockAlert(String productName, String sku,
                              int currentQty, int reorderLevel) {
        String title = "Low Stock Alert";
        String message = String.format("%s (%s) is below reorder level — qty: %d, reorder at: %d",
                productName, sku, currentQty, reorderLevel);
        notifyRoles(List.of("ADMIN", "INVENTORY_MANAGER"),
                title, message, "WARNING", "INVENTORY", "HIGH",
                "/inventory/products", sku, "PRODUCT",
                details("Product", productName, "Code", sku, "In stock", currentQty, "Reorder level", reorderLevel),
                STOCK_ALERT_DEDUPE);
    }

    /** Out of stock alert → sent to ADMIN + INVENTORY_MANAGER users. */
    public void outOfStockAlert(String productName, String sku) {
        String title = "Out of Stock";
        String message = String.format("%s (%s) has reached zero stock", productName, sku);
        notifyRoles(List.of("ADMIN", "INVENTORY_MANAGER"),
                title, message, "ERROR", "INVENTORY", "CRITICAL",
                "/inventory/products", sku, "PRODUCT",
                details("Product", productName, "Code", sku, "In stock", 0),
                STOCK_ALERT_DEDUPE);
    }

    /** New sales invoice created → notify ADMIN + ACCOUNTANT. */
    public void newSalesInvoice(String invoiceNumber, String customerName,
                                String amount, String createdBy) {
        String title = "New Sales Invoice";
        String message = String.format("Invoice %s for %s — %s (by %s)",
                invoiceNumber, customerName, amount, createdBy);
        notifyRoles(List.of("ADMIN", "ACCOUNTANT"),
                title, message, "SUCCESS", "SALES", "MEDIUM",
                "/sales/invoice", invoiceNumber, "INVOICE",
                details("Invoice", invoiceNumber, "Customer", customerName, "Amount", amount, "Salesperson", createdBy),
                null);
    }

    /** LPO requires approval → notify ADMIN. */
    public void lpoRequiresApproval(String lpoNumber, String vendorName,
                                    String amount, String requestedBy) {
        String title = "LPO Pending Approval";
        String message = String.format("LPO %s for %s — %s (requested by %s)",
                lpoNumber, vendorName, amount, requestedBy);
        notifyRoles(List.of("ADMIN"),
                title, message, "WARNING", "PURCHASE", "HIGH",
                "/purchases/lpo", lpoNumber, "LPO",
                details("LPO", lpoNumber, "Vendor", vendorName, "Amount", amount, "Requested by", requestedBy),
                null);
    }

    /** Payment received → notify ADMIN + ACCOUNTANT. The last argument is the payment mode. */
    public void paymentReceived(String referenceNumber, String customerName,
                                String amount, String paymentMode) {
        String title = "Payment Received";
        String message = String.format("Payment of %s from %s (ref: %s)",
                amount, customerName, referenceNumber);
        notifyRoles(List.of("ADMIN", "ACCOUNTANT"),
                title, message, "SUCCESS", "FINANCE", "MEDIUM",
                "/sales/payment", referenceNumber, "PAYMENT",
                details("Payment", referenceNumber, "Customer", customerName, "Amount", amount, "Mode", paymentMode),
                null);
    }

    /** GRN completed → notify ADMIN + INVENTORY_MANAGER. */
    public void grnCompleted(String grnNumber, String vendorName, String receivedBy) {
        String title = "GRN Completed";
        String message = String.format("Goods received from %s — GRN %s (by %s)",
                vendorName, grnNumber, receivedBy);
        notifyRoles(List.of("ADMIN", "INVENTORY_MANAGER"),
                title, message, "SUCCESS", "PURCHASE", "MEDIUM",
                "/purchases/grn", grnNumber, "GRN",
                details("GRN", grnNumber, "Vendor", vendorName, "Received by", receivedBy),
                null);
    }

    /** Overdue customer follow-up → notify the assigned salesperson. */
    public void overdueFollowUp(String customerName, String assignedTo,
                                String followUpId) {
        String title = "Overdue Follow-Up";
        String message = String.format("Follow-up with %s is overdue", customerName);
        notifyUser(assignedTo,
                title, message, "WARNING", "SALES", "HIGH",
                "/customer/followups", followUpId, "FOLLOW_UP",
                details("Customer", customerName));
    }

    /** Stock transfer completed → notify ADMIN + INVENTORY_MANAGER. */
    public void stockTransferCompleted(String transferNumber,
                                       String fromWarehouse, String toWarehouse) {
        String title = "Stock Transfer Received";
        String message = String.format("Transfer %s from %s to %s has been completed",
                transferNumber, fromWarehouse, toWarehouse);
        notifyRoles(List.of("ADMIN", "INVENTORY_MANAGER"),
                title, message, "INFO", "INVENTORY", "MEDIUM",
                "/inventory/stock-transfer", transferNumber, "STOCK_TRANSFER",
                details("Transfer", transferNumber, "From", fromWarehouse, "To", toWarehouse),
                null);
    }

    /** System-level alert (e.g. scheduled job failure). */
    public void systemAlert(String title, String message, String priority) {
        notifyRole("ADMIN", title, message, "ERROR", "SYSTEM",
                priority != null ? priority : "HIGH", null, null, null);
    }

    /**
     * Terminal Auto-Archive stale warning/reminder → notify ADMIN + BRANCH_ADMIN.
     * {@code isFinal} marks the last reminder before the terminal is archived (higher priority,
     * distinct copy) — driven by the repeat-notification cadence in PosTerminalLifecycleService.
     */
    public void terminalStaleWarning(String terminalName, int daysInactive, int daysUntilArchive,
                                      String terminalId, boolean isFinal) {
        String title = isFinal ? "Final Reminder: Terminal Archiving Soon" : "Terminal Inactivity Warning";
        String message = String.format(
                "Terminal '%s' has been inactive for %d day(s) and will be archived in %d day(s).",
                terminalName, daysInactive, daysUntilArchive);
        notifyRoles(List.of("ADMIN", "BRANCH_ADMIN"),
                title, message, "WARNING", "POS", isFinal ? "CRITICAL" : "HIGH",
                "/sales/pos", terminalId, "POS_TERMINAL",
                details("Terminal", terminalName, "Inactive days", daysInactive, "Archived in (days)", daysUntilArchive),
                null);
    }

    // ── POS Administration > Correction lifecycle (Phase 5) ───────────────────
    // Single integration point for every correction type (denomination, transaction, cash
    // movement category) — all flow through the shared CorrectionRequestService state
    // machine, so wiring notifications there once covers every domain uniformly.

    /** A correction has been submitted and needs a decision → sent to every role holding
     *  approve rights on pos.admin.approvals (ADMIN, BRANCH_ADMIN, ACCOUNTANT). */
    public void correctionRequiresApproval(String requestNumber, String targetType, Long targetId) {
        String title = "Correction Requires Approval";
        String message = String.format("Correction %s (%s #%d) is pending approval.",
                requestNumber, targetType, targetId);
        notifyRoles(List.of("ADMIN", "BRANCH_ADMIN", "ACCOUNTANT"),
                title, message, "INFO", "POS", "MEDIUM",
                "/enterprise/pos-admin?tab=approvals", requestNumber, "POS_CORRECTION_REQUEST",
                correctionDetails(requestNumber, targetType, targetId), null);
    }

    /** Correction approved → sent to the original requester. */
    public void correctionApproved(String requestedByUsername, String requestNumber, String targetType, Long targetId) {
        String title = "Correction Approved";
        String message = String.format("Your correction %s (%s #%d) was approved.",
                requestNumber, targetType, targetId);
        notifyUser(requestedByUsername, title, message, "SUCCESS", "POS", "MEDIUM",
                "/enterprise/pos-admin?tab=approvals", requestNumber, "POS_CORRECTION_REQUEST",
                correctionDetails(requestNumber, targetType, targetId));
    }

    /** Correction rejected → sent to the original requester. */
    public void correctionRejected(String requestedByUsername, String requestNumber, String targetType, Long targetId, String reason) {
        String title = "Correction Rejected";
        String message = String.format("Your correction %s (%s #%d) was rejected. Reason: %s",
                requestNumber, targetType, targetId, reason);
        Map<String, Object> d = correctionDetails(requestNumber, targetType, targetId);
        d.put("Reason", reason);
        notifyUser(requestedByUsername, title, message, "ERROR", "POS", "MEDIUM",
                "/enterprise/pos-admin?tab=approvals", requestNumber, "POS_CORRECTION_REQUEST", d);
    }

    /** Correction applied — now the effective overlay → sent to the original requester. */
    public void correctionApplied(String requestedByUsername, String requestNumber, String targetType, Long targetId) {
        String title = "Correction Applied";
        String message = String.format("Correction %s (%s #%d) has been applied.",
                requestNumber, targetType, targetId);
        notifyUser(requestedByUsername, title, message, "SUCCESS", "POS", "LOW",
                "/enterprise/pos-admin?tab=approvals", requestNumber, "POS_CORRECTION_REQUEST",
                correctionDetails(requestNumber, targetType, targetId));
    }

    /** Execution failed after approval → sent to the requester and every approver role, since
     *  this needs follow-up attention (approval history is preserved, nothing was lost). */
    public void correctionFailed(String requestedByUsername, String requestNumber, String targetType, Long targetId, String failureReason) {
        String title = "Correction Failed";
        String message = String.format("Correction %s (%s #%d) failed to apply: %s",
                requestNumber, targetType, targetId, failureReason);
        Map<String, Object> d = correctionDetails(requestNumber, targetType, targetId);
        d.put("Failure", failureReason);
        notifyUser(requestedByUsername, title, message, "ERROR", "POS", "HIGH",
                "/enterprise/pos-admin?tab=approvals", requestNumber, "POS_CORRECTION_REQUEST", d);
        notifyRoles(List.of("ADMIN", "BRANCH_ADMIN", "ACCOUNTANT"),
                title, message, "ERROR", "POS", "HIGH",
                "/enterprise/pos-admin?tab=approvals", requestNumber, "POS_CORRECTION_REQUEST", d, null);
    }

    private static Map<String, Object> correctionDetails(String requestNumber, String targetType, Long targetId) {
        return details("Request", requestNumber, "Target", targetType, "Target #", targetId);
    }
}
