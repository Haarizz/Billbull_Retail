package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

import com.billbull.backend.config.JwtUtil;
import com.billbull.backend.pos.businessdate.BusinessDayWindowService;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionStatus;
import com.billbull.backend.pos.terminal.PosTerminal;
import com.billbull.backend.pos.terminal.PosTerminalRepository;
import com.billbull.backend.pos.terminal.PosTerminalStatus;
import com.billbull.backend.user.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * Phase 0 regression test, real database and real HTTP: checkouts against sessions that are not
 * OPEN must be refused before anything is written.
 *
 * <h3>History</h3>
 * <b>M0 (2026-11-12)</b> created this class as a diagnostic. On a disposable clone it proved that
 * a cash checkout naming a CLOSED or SUSPENDED session was accepted in full: HTTP 200, invoice
 * PAID, Delivery Note, stock movement, invoice and receipt GL, Payment and Receipt Voucher all
 * written, with the Payment attributed to the closed or suspended session, the session's totals
 * left at 0, and the same-key retry answering 200 with that invoice.
 * <b>M1</b> added {@link PosCheckoutSessionGuard} and turned this class into its regression test.
 * Every assertion states the safe behaviour, so before M1 the CLOSED and SUSPENDED cases failed
 * (the M0 reproduction) and after M1 they pass. The OPEN control must pass in both.
 *
 * <h3>Scenarios</h3>
 * <ol>
 *   <li>OPEN control: the sale completes. The session is then closed, and a matching replay of
 *       the completed sale still returns it, a new checkout on the closed session is refused, and
 *       the same key with a different sale is a conflict.</li>
 *   <li>CLOSED and SUSPENDED: 409 {@code SESSION_NOT_OPEN}, no business writes, and the same-key
 *       retry is refused the same way.</li>
 *   <li>Missing session: 409 {@code SESSION_NOT_FOUND}. Session of another branch: 409
 *       {@code SESSION_BRANCH_MISMATCH}. No session but cash: 409 {@code SESSION_REQUIRED}.</li>
 *   <li>Caller compatibility: the till's delivery-order payload (no session, no tender, no
 *       checkout key, as {@code POSSales.jsx} sends it) still posts.</li>
 * </ol>
 * "No business writes" is checked against a whole-database row count. Only the HTTP access log
 * ({@code audit_logs}) and the POS audit trail ({@code pos_audit_log}) may grow.
 *
 * <h3>Not covered here</h3>
 * The concurrent race, where a session is closed by another request while a checkout is between
 * the guard and its payment, is not tested and not prevented by M1. That needs M2's session-row
 * lock and attempt claim.
 *
 * <h3>Running it</h3>
 * Refuses to run unless {@code -Dm0.disposableDatabase} names the connected database, that
 * database is not {@code testdb}, and its name starts with {@code billbull_m0_}. Checkouts commit
 * their own transactions, so {@link #cleanup()} deletes every row this run created, keyed on its
 * invoices and fixtures, and the whole-database count must return to the baseline.
 *
 * <pre>
 * mvn -o test -Dtest=PosCheckoutClosedSessionDefectTest \
 *   -Dm0.disposableDatabase=billbull_m0_checkout_20261112 -Dm0.evidenceDir=&lt;dir outside repo&gt; \
 *   -Dspring.datasource.url=jdbc:postgresql://localhost:5432/billbull_m0_checkout_20261112 \
 *   -Dspring.datasource.username=m0_diag -Dspring.datasource.password=*** \
 *   -Dspring.flyway.locations=filesystem:src/main/resources/db/migration
 * </pre>
 * Named {@code *Test}, not {@code *IT}: there is no failsafe plugin, so {@code *IT} never runs.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT,
        properties = {"server.port=8081", "spring.jpa.show-sql=false", "logging.level.org.hibernate.SQL=OFF"})
// Skipped entirely (before any Spring context or port binding) unless a disposable clone is named.
@EnabledIfSystemProperty(named = "m0.disposableDatabase", matches = "billbull_m0_.+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Phase 0 — checkout session guard (real database, real HTTP)")
class PosCheckoutClosedSessionDefectTest {

    private static final long BRANCH_ID = 1L;
    private static final long OTHER_BRANCH_ID = 2L;
    private static final String PRODUCT_CODE = "08747";
    private static final String SALESPERSON = "EMP1257";
    private static final String DELIVERY_PERSON = "EMP7361";
    private static final String DELIVERY_CUSTOMER = "02650";
    private static final double PRICE = 100.0;
    /** Tables a refused checkout may still write to: the access log and the POS audit trail. */
    private static final Set<String> NON_BUSINESS_TABLES = Set.of("audit_logs", "pos_audit_log");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private TransactionTemplate tx;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private UserRepository userRepository;
    @Autowired private PosTerminalRepository terminalRepository;
    @Autowired private PosSessionRepository sessionRepository;
    @Autowired private BusinessDayWindowService businessDayWindowService;
    @LocalServerPort private int port;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private final String runId = "m0-" + UUID.randomUUID().toString().substring(0, 8);
    private final List<Long> sessionIds = new ArrayList<>();
    private final List<Long> terminalIds = new ArrayList<>();
    private final List<Long> createdInvoiceIds = new ArrayList<>();
    private final Map<String, Object> evidence = new LinkedHashMap<>();
    private Map<String, Long> baselineCounts;
    private long baselineAuditLogId;
    private Path evidenceFile;
    private String token;
    private LocalDate tradingDate;

    // ------------------------------------------------------------------ guard and fixtures

    @BeforeAll
    void guardAndPrepare() throws Exception {
        String db = jdbc.queryForObject("select current_database()", String.class);
        String expected = System.getProperty("m0.disposableDatabase");
        assertNotNull(expected, "-Dm0.disposableDatabase must name the disposable clone");
        assertEquals(expected, db, "connected to an unexpected database");
        assertNotEquals("testdb", db, "refusing to run against the shared testdb");
        assertTrue(db.startsWith("billbull_m0_"), "refusing to run against a non-disposable database: " + db);
        assertEquals(8081, port, "the disposable backend must listen on 8081");

        String dir = System.getProperty("m0.evidenceDir");
        assertNotNull(dir, "-Dm0.evidenceDir must point outside the repository");
        evidenceFile = Path.of(dir, "m1-evidence-" + runId + ".json");

        token = tx.execute(s -> jwtUtil.generateToken(userRepository.findByUsername("admin").orElseThrow(), BRANCH_ID));
        tradingDate = businessDayWindowService.resolveCurrent(BRANCH_ID).window().tradingDate();

        evidence.put("runId", runId);
        evidence.put("database", db);
        evidence.put("port", port);
        evidence.put("tradingDate", String.valueOf(tradingDate));
        evidence.put("businessDayState", String.valueOf(businessDayWindowService.resolveCurrent(BRANCH_ID)));
        evidence.put("salesSettings", jdbc.queryForList(
                "select stock_check_required, sales_mode, monthly_target_required from sales_settings"));
        baselineCounts = tableCounts();
        baselineAuditLogId = jdbc.queryForObject("select coalesce(max(id), 0) from audit_logs", Long.class);
        writeEvidence();
    }

    private PosTerminal newTerminal(String label, long branchId) {
        PosTerminal t = new PosTerminal();
        t.setBranchId(branchId);
        t.setTerminalId(runId + "-" + label);
        t.setTerminalName("M0 " + label);
        t.setCounterName("M0");
        t.setStatus(PosTerminalStatus.ACTIVE);
        t.setRegisteredBy("admin");
        PosTerminal saved = terminalRepository.save(t);
        terminalIds.add(saved.getId());
        return saved;
    }

    private PosSession newOpenSession(PosTerminal terminal) {
        LocalDateTime now = businessDayWindowService.clock().now();
        PosSession s = new PosSession();
        s.setBranchId(terminal.getBranchId());
        s.setTerminalId(terminal.getTerminalId());
        s.setTerminalPk(terminal.getId());
        s.setCounterName("M0");
        s.setOpenedBy("admin");
        s.setOwnerUserId(1L);
        s.setOpenedAt(now);
        s.setLastActivityAt(now);
        s.setSessionDate(tradingDate);
        s.setTradingDate(tradingDate);
        s.setOpeningCash(BigDecimal.ZERO);
        s.setStatus(PosSessionStatus.OPEN);
        PosSession saved = sessionRepository.save(s);
        sessionIds.add(saved.getId());
        return saved;
    }

    // ------------------------------------------------------------------ scenarios

    @Test
    @Order(1)
    @DisplayName("OPEN control, then replay after close, new sale on the closed session, and key reuse")
    void openSessionControlAndReplayAfterClose() throws Exception {
        PosTerminal terminal = newTerminal("OPEN", BRANCH_ID);
        PosSession session = newOpenSession(terminal);
        Map<String, Object> s = runScenario("OPEN", session.getId(), terminal.getTerminalId(), null);
        JsonNode first = (JsonNode) s.get("_firstBody");

        // The till's session is then closed through the real endpoint.
        Map<String, Object> close = post("/api/pos/sessions/" + session.getId() + "/close", "{}");
        s.put("closeAfterSale", withoutJson(close));
        String key = (String) s.get("checkoutKey");

        Map<String, Long> beforeReplay = tableCounts();
        Map<String, Object> replay = post("/api/pos/checkout", checkoutBody(key, session.getId(), terminal.getTerminalId(), 1));
        s.put("replayAfterClose", withoutJson(replay));
        s.put("replayAfterCloseDelta", delta(beforeReplay, tableCounts()));

        Map<String, Long> beforeNew = tableCounts();
        Map<String, Object> newSale = post("/api/pos/checkout",
                checkoutBody(key + "-NEW", session.getId(), terminal.getTerminalId(), 1));
        s.put("newSaleOnClosedSession", withoutJson(newSale));
        s.put("newSaleOnClosedSessionDelta", delta(beforeNew, tableCounts()));

        Map<String, Long> beforeReuse = tableCounts();
        Map<String, Object> reuse = post("/api/pos/checkout", checkoutBody(key, session.getId(), terminal.getTerminalId(), 2));
        s.put("sameKeyDifferentSale", withoutJson(reuse));
        s.put("sameKeyDifferentSaleDelta", delta(beforeReuse, tableCounts()));
        writeEvidence();

        assertAll("OPEN control and replay",
                () -> assertEquals(200, s.get("firstStatus"), "control checkout must succeed: " + s.get("firstBody")),
                () -> assertEquals("PAID", text(first, "status")),
                () -> assertEquals(0, new BigDecimal(text(first, "balance")).compareTo(BigDecimal.ZERO)),
                () -> assertEquals(1, ((List<?>) s.get("payments")).size(), "one cash payment row"),
                () -> assertEquals(200, s.get("retryStatus"), "an immediate same-key retry returns the sale"),
                () -> assertEquals(text(first, "id"), text((JsonNode) s.get("_retryBody"), "id")),
                () -> assertEquals(200, close.get("status"), "fixture: the session closes"),
                () -> assertEquals(200, replay.get("status"), "a matching replay after close returns the completed sale"),
                () -> assertEquals(text(first, "id"), text((JsonNode) replay.get("json"), "id")),
                () -> assertNoBusinessWrites("replay after close", s.get("replayAfterCloseDelta")),
                () -> assertEquals(409, newSale.get("status"), "a new sale on the closed session is refused"),
                () -> assertEquals("SESSION_NOT_OPEN", text((JsonNode) newSale.get("json"), "code")),
                () -> assertNoBusinessWrites("new sale on closed session", s.get("newSaleOnClosedSessionDelta")),
                () -> assertEquals(409, reuse.get("status"), "the same key with a different sale is a conflict"),
                () -> assertEquals("CHECKOUT_KEY_REUSED", text((JsonNode) reuse.get("json"), "code")),
                () -> assertNoBusinessWrites("same key different sale", s.get("sameKeyDifferentSaleDelta")));
    }

    @Test
    @Order(2)
    @DisplayName("CLOSED session — 409 SESSION_NOT_OPEN, nothing written")
    void closedSession() throws Exception {
        PosTerminal terminal = newTerminal("CLOSED", BRANCH_ID);
        PosSession session = newOpenSession(terminal);
        Map<String, Object> transition = post("/api/pos/sessions/" + session.getId() + "/close", "{}");
        Map<String, Object> s = runScenario("CLOSED", session.getId(), terminal.getTerminalId(), transition);
        assertRefusedBeforeWriting("CLOSED", s, "SESSION_NOT_OPEN");
    }

    @Test
    @Order(3)
    @DisplayName("SUSPENDED session — 409 SESSION_NOT_OPEN, nothing written")
    void suspendedSession() throws Exception {
        PosTerminal terminal = newTerminal("SUSPENDED", BRANCH_ID);
        PosSession session = newOpenSession(terminal);
        Map<String, Object> transition = post("/api/pos/sessions/" + session.getId() + "/suspend", "{}");
        Map<String, Object> s = runScenario("SUSPENDED", session.getId(), terminal.getTerminalId(), transition);
        assertRefusedBeforeWriting("SUSPENDED", s, "SESSION_NOT_OPEN");
    }

    @Test
    @Order(4)
    @DisplayName("Missing session — 409 SESSION_NOT_FOUND, nothing written")
    void missingSession() throws Exception {
        long missingId = jdbc.queryForObject("select coalesce(max(id), 0) + 100000 from pos_sessions", Long.class);
        Map<String, Object> s = runScenario("MISSING", missingId, runId + "-MISSING", null);
        assertRefusedBeforeWriting("MISSING", s, "SESSION_NOT_FOUND");
    }

    @Test
    @Order(5)
    @DisplayName("Session of another branch — 409 SESSION_BRANCH_MISMATCH, nothing written")
    void otherBranchSession() throws Exception {
        PosTerminal terminal = newTerminal("OTHERBRANCH", OTHER_BRANCH_ID);
        PosSession session = newOpenSession(terminal);
        Map<String, Object> s = runScenario("OTHER_BRANCH", session.getId(), terminal.getTerminalId(), null);
        assertRefusedBeforeWriting("OTHER_BRANCH", s, "SESSION_BRANCH_MISMATCH");
    }

    @Test
    @Order(6)
    @DisplayName("No session but cash — 409 SESSION_REQUIRED, nothing written")
    void sessionlessCashSale() throws Exception {
        Map<String, Object> s = runScenario("SESSIONLESS_CASH", null, runId + "-NOSESSION", null);
        assertRefusedBeforeWriting("SESSIONLESS_CASH", s, "SESSION_REQUIRED");
    }

    @Test
    @Order(7)
    @DisplayName("Caller compatibility: the till's sessionless delivery-order payload still posts (with the key it "
            + "sends since M2.2; M2.2.1 refuses it without one)")
    void sessionlessDeliveryOrderStillPosts() throws Exception {
        Map<String, Object> s = new LinkedHashMap<>();
        evidence.put("DELIVERY_ORDER", s);
        // The exact shape of POSSales.jsx's delivery-order builder: paymentMode 'Delivery', no
        // allocations or tender scalars, sessionId null, and a checkoutKey (M2.2.1 requires it).
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("checkoutKey", runId + "-delivery-order");
        b.put("customerCode", DELIVERY_CUSTOMER);
        b.put("customerName", "M1 delivery compatibility");
        b.put("paymentMode", "Delivery");
        b.put("sessionId", null);
        b.put("terminalId", runId + "-DELIVERY");
        b.put("branchId", BRANCH_ID);
        b.put("billDiscountAmount", 0);
        b.put("taxInclusive", true);
        b.put("shippingAddress", "M1 compatibility address");
        b.put("deliveryPersonEmployeeCode", DELIVERY_PERSON);
        b.put("salespersonEmployeeCode", SALESPERSON);
        b.put("deliveryDate", tradingDate.plusDays(1).toString());
        b.put("deliveryTimeSlot", "10:00-12:00");
        b.put("deliveryNotes", "M1 caller-compatibility check");
        b.put("items", List.of(item()));
        String body = json.writeValueAsString(b);
        s.put("requestBody", json.readTree(body));
        Map<String, Long> before = tableCounts();
        Map<String, Object> res = post("/api/pos/checkout", body);
        s.put("status", res.get("status"));
        s.put("body", res.get("body"));
        JsonNode node = (JsonNode) res.get("json");
        if (node != null && node.get("id") != null && !node.get("id").isNull()) {
            createdInvoiceIds.add(node.get("id").asLong());
            s.put("invoice", jdbc.queryForList("select id, invoice_number, status, pos_proforma_pending, pos_session_id, "
                    + "invoice_total, amount_paid from sales_invoices where id = ?", node.get("id").asLong()));
        }
        s.put("rowCountDelta", delta(before, tableCounts()));
        writeEvidence();
        assertEquals(200, res.get("status"), "the sessionless delivery order must not be refused: " + res.get("body"));
        assertTrue(node == null || node.get("code") == null, "no guard refusal code expected");
    }

    // ------------------------------------------------------------------ assertions

    private void assertRefusedBeforeWriting(String label, Map<String, Object> s, String code) {
        assertAll(label + " — refused before writing",
                () -> assertEquals(409, s.get("firstStatus"), "checkout must be refused with 409: " + s.get("firstBody")),
                () -> assertEquals(code, text((JsonNode) s.get("_firstBody"), "code")),
                () -> assertTrue(((List<?>) s.get("invoices")).isEmpty(), "no invoice may be written"),
                () -> assertNoBusinessWrites(label + " first", s.get("rowCountDeltaAfterFirst")),
                () -> assertEquals(409, s.get("retryStatus"), "the same-key retry is refused the same way"),
                () -> assertEquals(code, text((JsonNode) s.get("_retryBody"), "code")),
                () -> assertNoBusinessWrites(label + " retry", s.get("rowCountDeltaAfterRetry")));
    }

    @SuppressWarnings("unchecked")
    private static void assertNoBusinessWrites(String label, Object delta) {
        Map<String, Long> d = (Map<String, Long>) delta;
        List<String> business = d.keySet().stream().filter(t -> !NON_BUSINESS_TABLES.contains(t)).toList();
        assertTrue(business.isEmpty(), label + ": business tables changed: " + business + " " + d);
    }

    // ------------------------------------------------------------------ scenario runner and evidence

    private Map<String, Object> runScenario(String label, Long sessionId, String terminalId,
                                            Map<String, Object> transition) throws Exception {
        Map<String, Object> s = new LinkedHashMap<>();
        evidence.put(label, s);
        String key = runId + "-" + label;
        s.put("checkoutKey", key);
        s.put("sessionId", sessionId);
        s.put("terminalId", terminalId);
        if (transition != null) s.put("sessionTransition", withoutJson(transition));
        if (sessionId != null) {
            s.put("sessionStatusAtCheckout", jdbc.queryForList(
                    "select status from pos_sessions where id = ?", String.class, sessionId).stream().findFirst().orElse("MISSING"));
            s.put("sessionRowBefore", sessionRow(sessionId));
        }

        Map<String, Long> before = tableCounts();
        String body = checkoutBody(key, sessionId, terminalId, 1);
        s.put("requestBody", json.readTree(body));

        Map<String, Object> first = post("/api/pos/checkout", body);
        s.put("firstStatus", first.get("status"));
        s.put("firstBody", first.get("body"));
        s.put("_firstBody", first.get("json"));
        collectRows(s, key, sessionId);
        s.put("rowCountDeltaAfterFirst", delta(before, tableCounts()));

        Map<String, Long> beforeRetry = tableCounts();
        Map<String, Object> retry = post("/api/pos/checkout", body);
        s.put("retryStatus", retry.get("status"));
        s.put("retryBody", retry.get("body"));
        s.put("_retryBody", retry.get("json"));
        s.put("rowCountDeltaAfterRetry", delta(beforeRetry, tableCounts()));
        writeEvidence();
        return s;
    }

    private Map<String, Object> item() {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("itemCode", PRODUCT_CODE);
        item.put("itemName", "M0 diagnostic line");
        item.put("quantity", 1);
        item.put("unit", "Each");
        item.put("price", PRICE);
        item.put("discount", 0);
        item.put("taxRate", 5);
        return item;
    }

    private String checkoutBody(String key, Long sessionId, String terminalId, int quantity) throws Exception {
        Map<String, Object> line = item();
        line.put("quantity", quantity);
        Map<String, Object> cash = new LinkedHashMap<>();
        cash.put("type", "CASH");
        cash.put("amount", PRICE * quantity);
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("checkoutKey", key);
        b.put("customerName", "Walk-in Customer");
        b.put("paymentMode", "Cash");
        b.put("amountTendered", PRICE * quantity);
        b.put("cashAmount", PRICE * quantity);
        b.put("branchId", BRANCH_ID);
        b.put("branchCode", "BR-01");
        b.put("sessionId", sessionId);
        b.put("terminalId", terminalId);
        b.put("counterName", "M0");
        b.put("salespersonEmployeeCode", SALESPERSON);
        b.put("taxInclusive", true);
        b.put("items", List.of(line));
        b.put("paymentAllocations", List.of(cash));
        return json.writeValueAsString(b);
    }

    private void collectRows(Map<String, Object> s, String key, Long sessionId) {
        List<Map<String, Object>> invoices = jdbc.queryForList(
                "select id, invoice_number, status, delivery_status, invoice_total, amount_paid, balance, payment_mode, "
                        + "pos_session_id, pos_terminal_id, invoice_date from sales_invoices where pos_checkout_key = ?", key);
        s.put("invoices", invoices);
        List<String> invoiceNumbers = invoices.stream().map(r -> (String) r.get("invoice_number")).toList();
        s.put("payments", invoiceNumbers.isEmpty() ? List.of() : jdbc.queryForList(
                "select id, payment_number, amount, payment_mode, status, pos_session_id "
                        + "from sales_payments where linked_invoice in (" + quoted(invoiceNumbers) + ")"));
        if (sessionId != null && !jdbc.queryForList("select id from pos_sessions where id = ?", Long.class, sessionId).isEmpty()) {
            s.put("sessionRowAfter", sessionRow(sessionId));
        }
    }

    private Map<String, Object> sessionRow(Long sessionId) {
        List<Map<String, Object>> rows = jdbc.queryForList("select id, status, branch_id, closed_at, total_sales, "
                + "total_cash_sales, invoice_count from pos_sessions where id = ?", sessionId);
        return rows.isEmpty() ? Map.of("missing", true) : rows.get(0);
    }

    private Map<String, Long> tableCounts() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String t : jdbc.queryForList("select table_name from information_schema.tables where table_schema = 'public' "
                + "and table_type = 'BASE TABLE' order by table_name", String.class)) {
            counts.put(t, jdbc.queryForObject("select count(*) from \"" + t + "\"", Long.class));
        }
        return counts;
    }

    private static Map<String, Long> delta(Map<String, Long> before, Map<String, Long> after) {
        Map<String, Long> d = new LinkedHashMap<>();
        after.forEach((t, n) -> {
            long diff = n - before.getOrDefault(t, 0L);
            if (diff != 0) d.put(t, diff);
        });
        return d;
    }

    private Map<String, Object> post(String path, String body) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .timeout(Duration.ofSeconds(60))
                .header("Authorization", "Bearer " + token)
                .header("X-Branch-Id", String.valueOf(BRANCH_ID))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("path", path);
        out.put("status", res.statusCode());
        String text = res.body() == null ? "" : res.body();
        out.put("body", text.length() > 3000 ? text.substring(0, 3000) + "…" : text);
        try { out.put("json", json.readTree(text)); } catch (Exception notJson) { out.put("json", null); }
        return out;
    }

    private static Map<String, Object> withoutJson(Map<String, Object> res) {
        Map<String, Object> copy = new LinkedHashMap<>(res);
        copy.remove("json");
        return copy;
    }

    private static String text(JsonNode node, String field) {
        return node == null || node.get(field) == null || node.get(field).isNull() ? null : node.get(field).asText();
    }

    private static String inList(List<Long> ids) {
        return ids.isEmpty() ? "-1" : String.join(",", ids.stream().map(String::valueOf).toList());
    }

    private static String quoted(List<String> values) {
        return String.join(",", values.stream().map(v -> "'" + v.replace("'", "''") + "'").toList());
    }

    private void writeEvidence() throws Exception {
        Map<String, Object> printable = new LinkedHashMap<>();
        evidence.forEach((k, v) -> printable.put(k, v instanceof Map<?, ?> m ? withoutPrivate(m) : v));
        Files.createDirectories(evidenceFile.getParent());
        Files.writeString(evidenceFile, json.writerWithDefaultPrettyPrinter().writeValueAsString(printable));
    }

    private static Map<Object, Object> withoutPrivate(Map<?, ?> m) {
        Map<Object, Object> copy = new LinkedHashMap<>();
        m.forEach((k, v) -> { if (!String.valueOf(k).startsWith("_")) copy.put(k, v); });
        return copy;
    }

    // ------------------------------------------------------------------ cleanup

    @AfterAll
    void cleanup() throws Exception {
        Thread.sleep(1500); // let @Async audit writes land before deleting
        String keyLike = runId + "-%";
        List<Long> invoiceIds = new ArrayList<>(jdbc.queryForList(
                "select id from sales_invoices where pos_checkout_key like ?", Long.class, keyLike));
        createdInvoiceIds.stream().filter(id -> !invoiceIds.contains(id)).forEach(invoiceIds::add);
        String ids = inList(invoiceIds);
        List<String> invoiceNumbers = jdbc.queryForList(
                "select invoice_number from sales_invoices where id in (" + ids + ")", String.class);
        Map<String, Object> report = new LinkedHashMap<>();
        tx.executeWithoutResult(status -> {
            List<Long> dnIds = jdbc.queryForList("select id from delivery_notes where sales_invoice_id in (" + ids + ")", Long.class);
            List<String> dnNumbers = jdbc.queryForList("select dn_number from delivery_notes where sales_invoice_id in (" + ids + ")", String.class);
            List<String> rvNumbers = jdbc.queryForList("select voucher_id from sales_receipt_vouchers where sales_invoice_id in (" + ids + ")", String.class);
            List<String> refs = new ArrayList<>();
            invoiceNumbers.forEach(n -> { refs.add(n); refs.add("FS-" + n); });
            refs.addAll(dnNumbers);
            refs.addAll(rvNumbers);
            String dn = inList(dnIds);
            String sess = inList(sessionIds);
            String term = inList(terminalIds);
            Map<String, Integer> deleted = new LinkedHashMap<>();
            // Non-financial trail rows first, keyed on this run's document numbers and endpoints.
            List<String> auditKeys = new ArrayList<>(refs);
            if (!refs.isEmpty()) {
                auditKeys.addAll(jdbc.queryForList("select entry_number from journal_entries where reference in ("
                        + quoted(refs) + ")", String.class));
            }
            List<String> paymentNumbers = invoiceNumbers.isEmpty() ? List.of() : jdbc.queryForList(
                    "select payment_number from sales_payments where linked_invoice in (" + quoted(invoiceNumbers) + ")", String.class);
            auditKeys.addAll(paymentNumbers);
            if (!auditKeys.isEmpty()) {
                deleted.put("financial_audit_logs", jdbc.update("delete from financial_audit_logs where entity_id in ("
                        + quoted(auditKeys) + ")"));
            }
            if (!paymentNumbers.isEmpty()) {
                deleted.put("notifications", jdbc.update("delete from notifications where reference_id in ("
                        + quoted(paymentNumbers) + ")"));
            }
            List<String> endpoints = new ArrayList<>();
            sessionIds.forEach(id -> endpoints.add("/api/pos/sessions/" + id + "/%"));
            endpoints.add("/api/pos/checkout");
            for (String ep : endpoints) {
                deleted.merge("audit_logs", jdbc.update("delete from audit_logs where id > ? and endpoint like ?",
                        baselineAuditLogId, ep), Integer::sum);
            }
            if (!refs.isEmpty()) {
                String r = quoted(refs);
                deleted.put("ledger_entries", jdbc.update("delete from ledger_entries where journal_id in "
                        + "(select id::text from journal_entries where reference in (" + r + "))"));
                deleted.put("journal_lines", jdbc.update("delete from journal_lines where journal_entry_id in "
                        + "(select id from journal_entries where reference in (" + r + "))"));
                deleted.put("journal_entries", jdbc.update("delete from journal_entries where reference in (" + r + ")"));
            }
            if (!invoiceNumbers.isEmpty()) {
                deleted.put("sales_payments", jdbc.update("delete from sales_payments where linked_invoice in (" + quoted(invoiceNumbers) + ")"));
            }
            deleted.put("sales_receipt_vouchers", jdbc.update("delete from sales_receipt_vouchers where sales_invoice_id in (" + ids + ")"));
            deleted.put("stock_movements", jdbc.update("delete from stock_movements where source_type = 'DELIVERY_NOTE' and source_id in (" + dn + ")"));
            deleted.put("delivery_note_batch_consumptions", jdbc.update("delete from delivery_note_batch_consumptions where delivery_note_id in (" + dn + ")"));
            deleted.put("batch_allocation", jdbc.update("delete from batch_allocation where (source_document_type in ('SALES_INVOICE') and source_document_id in (" + ids + ")) "
                    + "or (source_document_type in ('DELIVERY_NOTE') and source_document_id in (" + dn + "))"));
            // A PI-flow delivery order reserves its stock against the pro-forma invoice.
            deleted.put("pos_stock_reservations", jdbc.update("delete from pos_stock_reservations "
                    + "where source_document_type = 'POS_PROFORMA' and source_document_id in (" + ids + ")"));
            deleted.put("delivery_note_items", jdbc.update("delete from delivery_note_items where delivery_note_id in (" + dn + ")"));
            deleted.put("delivery_notes", jdbc.update("delete from delivery_notes where id in (" + dn + ")"));
            deleted.put("sales_invoice_history_events", jdbc.update("delete from sales_invoice_history_events where invoice_id in (" + ids + ")"));
            deleted.put("sales_invoice_items", jdbc.update("delete from sales_invoice_items where sales_invoice_id in (" + ids + ")"));
            deleted.put("sales_invoices", jdbc.update("delete from sales_invoices where id in (" + ids + ")"));
            // Phase 0 / M2: each claimed checkout leaves a durable attempt-journal row.
            deleted.put("pos_checkout_attempts", jdbc.update("delete from pos_checkout_attempts where checkout_key like ? "
                    + "or session_id in (" + sess + ")", keyLike));
            deleted.put("pos_session_terminal_history", jdbc.update("delete from pos_session_terminal_history where session_id in (" + sess + ")"));
            deleted.put("pos_audit_log", jdbc.update("delete from pos_audit_log where session_id in (" + sess + ") or terminal_id like ?", runId + "-%"));
            deleted.put("pos_sessions", jdbc.update("delete from pos_sessions where id in (" + sess + ")"));
            deleted.put("pos_terminals", jdbc.update("delete from pos_terminals where id in (" + term + ")"));
            report.put("deleted", deleted);
        });
        Map<String, Long> residue = new LinkedHashMap<>();
        residue.put("sales_invoices", jdbc.queryForObject("select count(*) from sales_invoices where id in (" + ids + ") "
                + "or pos_checkout_key like ?", Long.class, keyLike));
        residue.put("sales_payments", invoiceNumbers.isEmpty() ? 0L : jdbc.queryForObject(
                "select count(*) from sales_payments where linked_invoice in (" + quoted(invoiceNumbers) + ")", Long.class));
        residue.put("pos_sessions", jdbc.queryForObject("select count(*) from pos_sessions where id in (" + inList(sessionIds) + ")", Long.class));
        residue.put("pos_terminals", jdbc.queryForObject("select count(*) from pos_terminals where id in (" + inList(terminalIds) + ")", Long.class));
        report.put("residue", residue);
        Map<String, Long> remaining = delta(baselineCounts, tableCounts());
        report.put("rowCountDeltaVsBaselineAfterCleanup", remaining);
        evidence.put("cleanup", report);
        writeEvidence();
        residue.forEach((t, n) -> assertEquals(0L, n, "cleanup left rows in " + t));
        assertTrue(remaining.isEmpty(), "rows left behind after cleanup: " + remaining);
    }
}
