package com.billbull.backend.notification;

import com.billbull.backend.role.Role;
import com.billbull.backend.user.User;
import com.billbull.backend.user.UserRepository;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Single integration point for publishing notifications from any business module.
 *
 * <p>Uses the fan-out-on-write pattern: when a notification targets a role,
 * this publisher resolves all active users with that role and creates one
 * notification row per user. This guarantees isolated read/dismiss state.</p>
 *
 * <h3>Usage from other services:</h3>
 * <pre>{@code
 *   @Autowired NotificationEventPublisher notifPublisher;
 *
 *   // Notify a specific user
 *   notifPublisher.notifyUser("admin", "Invoice Paid", "INV-0042 has been paid",
 *       "SUCCESS", "SALES", "MEDIUM", "/sales/invoice", "INV-0042", "INVOICE");
 *
 *   // Notify all users with a role
 *   notifPublisher.notifyRole("INVENTORY_MANAGER", ...);
 *
 *   // Use convenience methods
 *   notifPublisher.lowStockAlert("Widget Pro", "SKU-123", 3, 10);
 * }</pre>
 */
@Component
public class NotificationEventPublisher {

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
        notificationService.createForUser(username, title, message, type, category,
                priority, actionUrl, referenceId, referenceType, null);
    }

    /**
     * Fan-out: resolve all active users with the given role and create one
     * notification per user.
     */
    public void notifyRole(String roleName,
                           String title, String message,
                           String type, String category, String priority,
                           String actionUrl,
                           String referenceId, String referenceType) {
        List<String> usernames = resolveUsernamesForRole(roleName);
        if (!usernames.isEmpty()) {
            notificationService.createForUsers(usernames, title, message, type, category,
                    priority, actionUrl, referenceId, referenceType, null);
        }
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
        List<String> usernames = roleNames.stream()
                .flatMap(role -> resolveUsernamesForRole(role).stream())
                .distinct()
                .toList();
        if (!usernames.isEmpty()) {
            notificationService.createForUsers(usernames, title, message, type, category,
                    priority, actionUrl, referenceId, referenceType, null);
        }
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
                "/inventory/products", sku, "PRODUCT");
    }

    /** Out of stock alert → sent to ADMIN + INVENTORY_MANAGER users. */
    public void outOfStockAlert(String productName, String sku) {
        String title = "Out of Stock";
        String message = String.format("%s (%s) has reached zero stock", productName, sku);
        notifyRoles(List.of("ADMIN", "INVENTORY_MANAGER"),
                title, message, "ERROR", "INVENTORY", "CRITICAL",
                "/inventory/products", sku, "PRODUCT");
    }

    /** New sales invoice created → notify ADMIN + ACCOUNTANT. */
    public void newSalesInvoice(String invoiceNumber, String customerName,
                                String amount, String createdBy) {
        String title = "New Sales Invoice";
        String message = String.format("Invoice %s for %s — %s (by %s)",
                invoiceNumber, customerName, amount, createdBy);
        notifyRoles(List.of("ADMIN", "ACCOUNTANT"),
                title, message, "SUCCESS", "SALES", "MEDIUM",
                "/sales/invoice", invoiceNumber, "INVOICE");
    }

    /** LPO requires approval → notify ADMIN. */
    public void lpoRequiresApproval(String lpoNumber, String vendorName,
                                    String amount, String requestedBy) {
        String title = "LPO Pending Approval";
        String message = String.format("LPO %s for %s — %s (requested by %s)",
                lpoNumber, vendorName, amount, requestedBy);
        notifyRole("ADMIN",
                title, message, "WARNING", "PURCHASE", "HIGH",
                "/purchases/lpo", lpoNumber, "LPO");
    }

    /** Payment received → notify the invoice creator and ACCOUNTANT. */
    public void paymentReceived(String referenceNumber, String customerName,
                                String amount, String receivedBy) {
        String title = "Payment Received";
        String message = String.format("Payment of %s from %s (ref: %s)",
                amount, customerName, referenceNumber);
        notifyRoles(List.of("ADMIN", "ACCOUNTANT"),
                title, message, "SUCCESS", "FINANCE", "MEDIUM",
                "/sales/payment", referenceNumber, "PAYMENT");
    }

    /** GRN completed → notify ADMIN + INVENTORY_MANAGER. */
    public void grnCompleted(String grnNumber, String vendorName, String receivedBy) {
        String title = "GRN Completed";
        String message = String.format("Goods received from %s — GRN %s (by %s)",
                vendorName, grnNumber, receivedBy);
        notifyRoles(List.of("ADMIN", "INVENTORY_MANAGER"),
                title, message, "SUCCESS", "PURCHASE", "MEDIUM",
                "/purchases/grn", grnNumber, "GRN");
    }

    /** Overdue customer follow-up → notify the assigned salesperson. */
    public void overdueFollowUp(String customerName, String assignedTo,
                                String followUpId) {
        String title = "Overdue Follow-Up";
        String message = String.format("Follow-up with %s is overdue", customerName);
        notifyUser(assignedTo,
                title, message, "WARNING", "SALES", "HIGH",
                "/customer/followups", followUpId, "FOLLOW_UP");
    }

    /** Stock transfer completed → notify receiving warehouse manager. */
    public void stockTransferCompleted(String transferNumber,
                                       String fromWarehouse, String toWarehouse) {
        String title = "Stock Transfer Received";
        String message = String.format("Transfer %s from %s to %s has been completed",
                transferNumber, fromWarehouse, toWarehouse);
        notifyRoles(List.of("ADMIN", "INVENTORY_MANAGER"),
                title, message, "INFO", "INVENTORY", "MEDIUM",
                "/inventory/stock-transfer", transferNumber, "STOCK_TRANSFER");
    }

    /** System-level alert (e.g. scheduled job failure). */
    public void systemAlert(String title, String message, String priority) {
        notifyRole("ADMIN", title, message, "ERROR", "SYSTEM",
                priority != null ? priority : "HIGH", null, null, null);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private List<String> resolveUsernamesForRole(String roleName) {
        return userRepository.findAll().stream()
                .filter(User::isActive)
                .filter(u -> u.getRoles().stream()
                        .map(Role::getName)
                        .anyMatch(roleName::equals))
                .map(User::getUsername)
                .toList();
    }
}
