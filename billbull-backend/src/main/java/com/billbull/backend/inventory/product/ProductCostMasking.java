package com.billbull.backend.inventory.product;

import com.billbull.backend.security.ModulePermissionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;

/**
 * Removes internal costing from product responses for callers who have no screen that shows it.
 *
 * <p>The product aggregate carries purchase cost, landing cost and the costing method on its
 * pricing, branch pricing and packing rows. Every product read returns that aggregate, including
 * reads open to any signed-in user. Cost stays visible to anyone who can view a screen that
 * displays or edits it: the product master, stock and stock reports, and purchase orders, goods
 * receipts and purchase invoices ({@link #COST_READERS}). Everyone else gets the response
 * without those fields.
 *
 * <p>Masking works on a serialized copy, never on the entities, so it cannot be flushed back to
 * the database.
 *
 * <p>The till enforces a selling-price floor of {@code minPrice}, or {@code cost} when no positive
 * minimum is set (the same rule the backend applies at checkout). For till responses
 * ({@code keepPriceFloor}) a pricing row's {@code cost} is therefore kept only when it is that
 * floor, so the till warns at the same price as before and never sees cost otherwise.
 */
@Component
public class ProductCostMasking {

    /** Screens that show or edit product cost. Viewing any one of them admits cost. */
    static final List<String> COST_READERS = List.of(
            "inventory.product", "inventory.stock", "inventory.reports",
            "purchases.lpo", "purchases.grn", "purchases.invoice");

    /** Always removed for callers who may not see cost. */
    private static final Set<String> COST_ONLY_FIELDS = Set.of(
            "landingCost", "costMethod", "averageCost", "lastPurchasePrice", "lastPurchaseCost");

    private final ModulePermissionService modulePermissionService;
    private final ObjectMapper objectMapper;

    public ProductCostMasking(ModulePermissionService modulePermissionService, ObjectMapper objectMapper) {
        this.modulePermissionService = modulePermissionService;
        this.objectMapper = objectMapper;
    }

    public boolean callerMaySeeCost() {
        for (String module : COST_READERS) {
            if (modulePermissionService.canView(module)) return true;
        }
        return false;
    }

    /** {@code body} unchanged for a cost reader; otherwise a JSON copy without cost fields. */
    public Object forCaller(Object body, boolean keepPriceFloor) {
        if (body == null || callerMaySeeCost()) return body;
        JsonNode tree = objectMapper.valueToTree(body);
        strip(tree, keepPriceFloor);
        return tree;
    }

    private static void strip(JsonNode node, boolean keepPriceFloor) {
        if (node == null) return;
        if (node.isArray()) {
            node.forEach(child -> strip(child, keepPriceFloor));
            return;
        }
        if (!node.isObject()) return;
        ObjectNode object = (ObjectNode) node;
        object.remove(COST_ONLY_FIELDS);
        if (object.has("cost") && !(keepPriceFloor && costIsPriceFloor(object))) {
            object.remove("cost");
        }
        object.forEach(child -> strip(child, keepPriceFloor));
    }

    /** True when this row's floor is its cost: no positive minimum price is set. */
    private static boolean costIsPriceFloor(ObjectNode row) {
        JsonNode min = row.get("minPrice");
        if (min == null || min.isNull()) return true;
        if (min.isNumber()) return min.decimalValue().signum() <= 0;
        try {
            return new java.math.BigDecimal(min.asText().trim()).signum() <= 0;
        } catch (NumberFormatException e) {
            return true;
        }
    }
}
