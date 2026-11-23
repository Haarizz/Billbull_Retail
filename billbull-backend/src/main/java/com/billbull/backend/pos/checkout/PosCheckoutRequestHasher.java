package com.billbull.backend.pos.checkout;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * The canonical request hash a checkout key is bound to (Phase 0 / M2).
 *
 * <h3>Why a server-side encoding</h3>
 * The hash is computed from the deserialised {@link PosCheckoutRequest}, by this class, with its
 * own fixed encoding. It never depends on a JSON serializer, on the client's property order, or on
 * how the client wrote a number. A browser and a Java serializer will never be asked to agree on a
 * byte stream. The client does not send a hash and is never trusted to.
 *
 * <h3>What is in it</h3>
 * Every field that can change the financial, inventory, customer, session or tender outcome:
 * customer, branch, session, terminal and counter; pricing inputs (price level, tax mode, bill
 * discount, charges); delivery and salesperson attribution; the Sales Order take-up; every line
 * field, in order; and the complete tender plan, both the progressive {@code paymentAllocations}
 * (type, subtype, amount, reference, bank account, metadata) and every legacy tender scalar and
 * card leg. A tender-only change therefore changes the hash.
 *
 * <h3>What is not</h3>
 * The checkout key itself (it is what the hash is bound to) and the supervisor PIN, email and
 * password. Credentials are how a refused attempt is retried, not part of the sale, which is also
 * how the till's own key fingerprint ({@code useCheckout.js checkoutKeyFor}) treats them.
 *
 * <h3>Encoding (version {@value #VERSION})</h3>
 * <ul>
 *   <li>Objects are maps with keys in sorted order; every known field is always present, so an
 *       omitted field and an explicit {@code null} encode identically ({@code null}).</li>
 *   <li>Numbers go through {@link BigDecimal}: {@code Double} via {@link BigDecimal#valueOf(double)}
 *       (the shortest decimal that round-trips, so 0.1 is {@code 0.1}, not its binary expansion),
 *       then trailing zeros are stripped and the plain string is used. 100, 100.0 and 1e2 are all
 *       {@code 100}; -0.0 is {@code 0}. Non-finite doubles are refused.</li>
 *   <li>Strings are kept exactly as received (no trimming or case folding) and JSON-escaped.</li>
 *   <li>Lists keep their order. A reordered cart or tender plan is a different request: order
 *       decides which allocation settles first.</li>
 *   <li>Free-form {@code metadata} maps are encoded recursively by the same rules.</li>
 * </ul>
 * The UTF-8 bytes of {@code "pos-checkout-v1:" + canonical} are hashed with SHA-256 and rendered as
 * lower-case hex. Changing the encoding or the field set means bumping {@link #VERSION}; a stored
 * hash is only ever compared with one of the same version.
 */
public final class PosCheckoutRequestHasher {

    public static final int VERSION = 1;
    private static final String PREFIX = "pos-checkout-v" + VERSION + ":";

    private PosCheckoutRequestHasher() {}

    /** SHA-256 (hex) of the canonical form. */
    public static String hash(PosCheckoutRequest request) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            byte[] digest = sha.digest((PREFIX + canonical(request)).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** The canonical string. Exposed for the hash test vectors. */
    public static String canonical(PosCheckoutRequest r) {
        StringBuilder out = new StringBuilder(512);
        encode(out, requestMap(r));
        return out.toString();
    }

    private static Map<String, Object> requestMap(PosCheckoutRequest r) {
        Map<String, Object> m = new TreeMap<>();
        m.put("advanceAmount", r.getAdvanceAmount());
        m.put("amountTendered", r.getAmountTendered());
        m.put("bankAccountName", r.getBankAccountName());
        m.put("billDiscountAmount", r.getBillDiscountAmount());
        m.put("branchCode", r.getBranchCode());
        m.put("branchId", r.getBranchId());
        m.put("branchName", r.getBranchName());
        m.put("cardAmount", r.getCardAmount());
        m.put("cardLegs", list(r.getCardLegs(), PosCheckoutRequestHasher::cardLegMap));
        m.put("cardReference", r.getCardReference());
        m.put("cardType", r.getCardType());
        m.put("cashAmount", r.getCashAmount());
        m.put("combinedPaymentMode", r.getCombinedPaymentMode());
        m.put("counterName", r.getCounterName());
        m.put("customerCode", r.getCustomerCode());
        m.put("customerName", r.getCustomerName());
        m.put("deliveryCharge", r.getDeliveryCharge());
        m.put("deliveryDate", r.getDeliveryDate());
        m.put("deliveryNotes", r.getDeliveryNotes());
        m.put("deliveryPersonEmployeeCode", r.getDeliveryPersonEmployeeCode());
        m.put("deliveryPersonEmployeeId", r.getDeliveryPersonEmployeeId());
        m.put("deliveryTimeSlot", r.getDeliveryTimeSlot());
        m.put("driverName", r.getDriverName());
        m.put("items", list(r.getItems(), PosCheckoutRequestHasher::itemMap));
        m.put("linkedSalesOrder", r.getLinkedSalesOrder());
        m.put("notes", r.getNotes());
        m.put("onlineAmount", r.getOnlineAmount());
        m.put("paymentAllocations", list(r.getPaymentAllocations(), PosCheckoutRequestHasher::allocationMap));
        m.put("paymentMode", r.getPaymentMode());
        m.put("priceLevelId", r.getPriceLevelId());
        m.put("salespersonEmployeeCode", r.getSalespersonEmployeeCode());
        m.put("salespersonEmployeeId", r.getSalespersonEmployeeId());
        m.put("sessionId", r.getSessionId());
        m.put("shippingAddress", r.getShippingAddress());
        m.put("shippingCharge", r.getShippingCharge());
        m.put("taxInclusive", r.getTaxInclusive());
        m.put("terminalId", r.getTerminalId());
        return m;
    }

    private static Map<String, Object> itemMap(PosCheckoutRequest.PosCheckoutItem i) {
        Map<String, Object> m = new TreeMap<>();
        m.put("batchNumber", i.getBatchNumber());
        m.put("discount", i.getDiscount());
        m.put("itemCode", i.getItemCode());
        m.put("itemName", i.getItemName());
        m.put("price", i.getPrice());
        m.put("quantity", i.getQuantity());
        m.put("salesOrderItemId", i.getSalesOrderItemId());
        m.put("serialNumber", i.getSerialNumber());
        m.put("taxRate", i.getTaxRate());
        m.put("unit", i.getUnit());
        m.put("voidReason", i.getVoidReason());
        m.put("voided", i.getVoided());
        return m;
    }

    private static Map<String, Object> allocationMap(PosPaymentAllocation a) {
        Map<String, Object> m = new TreeMap<>();
        m.put("amount", a.getAmount());
        m.put("bankAccountName", a.getBankAccountName());
        m.put("metadata", a.getMetadata());
        m.put("reference", a.getReference());
        m.put("subtype", a.getSubtype());
        m.put("type", a.getType());
        return m;
    }

    private static Map<String, Object> cardLegMap(PosCheckoutRequest.PosCardLeg l) {
        Map<String, Object> m = new TreeMap<>();
        m.put("amount", l.getAmount());
        m.put("cardType", l.getCardType());
        m.put("referenceNumber", l.getReferenceNumber());
        return m;
    }

    private static <T> List<Object> list(List<T> values, java.util.function.Function<T, Map<String, Object>> fn) {
        if (values == null) return null;
        List<Object> out = new ArrayList<>(values.size());
        for (T v : values) out.add(v == null ? null : fn.apply(v));
        return out;
    }

    // ------------------------------------------------------------------ encoder

    private static void encode(StringBuilder out, Object v) {
        if (v == null) {
            out.append("null");
        } else if (v instanceof String s) {
            string(out, s);
        } else if (v instanceof Boolean b) {
            out.append(b ? "true" : "false");
        } else if (v instanceof Number n) {
            out.append(number(n));
        } else if (v instanceof Map<?, ?> map) {
            TreeMap<String, Object> sorted = new TreeMap<>();
            map.forEach((k, val) -> sorted.put(String.valueOf(k), val));
            out.append('{');
            boolean first = true;
            for (Map.Entry<String, Object> e : sorted.entrySet()) {
                if (!first) out.append(',');
                first = false;
                string(out, e.getKey());
                out.append(':');
                encode(out, e.getValue());
            }
            out.append('}');
        } else if (v instanceof List<?> list) {
            out.append('[');
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) out.append(',');
                encode(out, list.get(i));
            }
            out.append(']');
        } else {
            // Anything else a free-form metadata map can carry after Jackson deserialisation is a
            // map, list, string, number, boolean or null. Refuse rather than guess an encoding.
            throw new IllegalArgumentException("Unsupported value in checkout request: " + v.getClass().getName());
        }
    }

    static String number(Number n) {
        BigDecimal d;
        if (n instanceof BigDecimal b) {
            d = b;
        } else if (n instanceof Double || n instanceof Float) {
            double x = n.doubleValue();
            if (Double.isNaN(x) || Double.isInfinite(x)) {
                throw new IllegalArgumentException("Non-finite number in checkout request: " + x);
            }
            d = BigDecimal.valueOf(x);
        } else if (n instanceof java.math.BigInteger bi) {
            d = new BigDecimal(bi);
        } else {
            d = BigDecimal.valueOf(n.longValue());
        }
        if (d.signum() == 0) return "0";
        return d.stripTrailingZeros().toPlainString();
    }

    private static void string(StringBuilder out, String s) {
        out.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        out.append('"');
    }
}
