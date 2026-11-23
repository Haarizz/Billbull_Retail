package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
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
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

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
 * Phase 0 / M2.1 — the attempt journal across two genuinely separate backend JVM processes.
 *
 * <p>This JVM serves no requests (its random-port server exists only because SecurityConfig needs a
 * servlet context). It starts the packaged application twice as child processes
 * ({@code java -jar}): JVM-A on 8091 and JVM-B on 8092, each with its own
 * {@code pos.checkout.attempt.instance-id}, its own Hikari pool (tagged with a PostgreSQL
 * {@code application_name}) and the same disposable database. Every checkout, close and suspend
 * below is an HTTP request to one of those processes; this JVM only creates fixtures, reads the
 * database and kills a process.
 *
 * <p>JVM-A runs with chaos pauses ({@link com.billbull.backend.pos.checkout.attempt.PosCheckoutChaosHook})
 * keyed by checkout-key prefix, so each scenario can hold A between or inside a step for as long
 * as it needs. JVM-B runs without any.
 *
 * <pre>
 * mvn -o package -DskipTests   (then copy target/billbull-backend-*.jar somewhere stable)
 * mvn -o test -Dtest=PosCheckoutTwoJvmTest -Dm0.twoJvm.jar=&lt;jar&gt; \
 *   -Dm0.disposableDatabase=billbull_m0_... -Dm0.evidenceDir=&lt;dir outside repo&gt; \
 *   -Dspring.datasource.url=... -Dspring.datasource.username=... -Dspring.datasource.password=... \
 *   -Dspring.flyway.locations=filesystem:src/main/resources/db/migration
 * </pre>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, // its own server is never called
        properties = {"spring.jpa.show-sql=false", "logging.level.org.hibernate.SQL=OFF"})
@EnabledIfSystemProperty(named = "m0.twoJvm.jar", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Phase 0 / M2.1 — checkout attempt journal across two backend JVMs")
class PosCheckoutTwoJvmTest {

    private static final long BRANCH_ID = 1L;
    private static final String PRODUCT_CODE = "08747";
    private static final String SALESPERSON = "EMP1257";
    private static final double PRICE = 100.0;
    private static final int PORT_A = 8091;
    private static final int PORT_B = 8092;
    private static final long LEASE_SECONDS = 10;

    @Autowired private JdbcTemplate jdbc;
    @Autowired private TransactionTemplate tx;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private UserRepository userRepository;
    @Autowired private PosTerminalRepository terminalRepository;
    @Autowired private PosSessionRepository sessionRepository;
    @Autowired private BusinessDayWindowService businessDayWindowService;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private final String runId = "j2-" + UUID.randomUUID().toString().substring(0, 8);
    private final List<Long> sessionIds = Collections.synchronizedList(new ArrayList<>());
    private final List<Long> terminalIds = Collections.synchronizedList(new ArrayList<>());
    private final Map<String, Object> evidence = Collections.synchronizedMap(new LinkedHashMap<>());
    private Map<String, Long> baselineCounts;
    private long baselineAuditLogId;
    private Path evidenceDir;
    private String token;
    private LocalDate tradingDate;
    private Process jvmA;
    private Process jvmB;

    // ------------------------------------------------------------------ lifecycle

    @BeforeAll
    void startTwoBackends() throws Exception {
        String db = jdbc.queryForObject("select current_database()", String.class);
        assertEquals(System.getProperty("m0.disposableDatabase"), db, "connected to an unexpected database");
        assertNotEquals("testdb", db, "refusing to run against the shared testdb");
        assertTrue(db.startsWith("billbull_m0_"), "refusing to run against a non-disposable database: " + db);
        evidenceDir = Path.of(System.getProperty("m0.evidenceDir"));
        Files.createDirectories(evidenceDir);
        token = tx.execute(s -> jwtUtil.generateToken(userRepository.findByUsername("admin").orElseThrow(), BRANCH_ID));
        tradingDate = businessDayWindowService.resolveCurrent(BRANCH_ID).window().tradingDate();
        baselineCounts = tableCounts();
        baselineAuditLogId = jdbc.queryForObject("select coalesce(max(id), 0) from audit_logs", Long.class);
        evidence.put("runId", runId);
        evidence.put("database", db);

        String chaos = runId + "-s1-|SESSION_RECORD|before|8000;"
                + runId + "-s6-|INVOICE_SAVE|before|25000;"
                + runId + "-s4-|INVOICE_SAVE|inside|90000";
        jvmA = launch("JVM-A", PORT_A, chaos);
        awaitReady(PORT_A, jvmA);
        jvmB = launch("JVM-B", PORT_B, null);
        awaitReady(PORT_B, jvmB);
        evidence.put("processes", Map.of("A", Map.of("pid", jvmA.pid(), "port", PORT_A),
                "B", Map.of("pid", jvmB.pid(), "port", PORT_B), "testJvmPid", ProcessHandle.current().pid()));
        evidence.put("connectionsPerProcess", jdbc.queryForList("select application_name, count(*) as connections "
                + "from pg_stat_activity where datname = current_database() and application_name like 'JVM-%' group by 1"));
        writeEvidence();
    }

    private Process launch(String name, int port, String chaos) throws Exception {
        String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        String migrations = new File("src/main/resources/db/migration").getAbsolutePath().replace('\\', '/');
        List<String> cmd = new ArrayList<>(List.of(java, "-Xmx1g", "-jar", System.getProperty("m0.twoJvm.jar"),
                "--server.port=" + port,
                "--spring.datasource.url=" + System.getProperty("spring.datasource.url"),
                "--spring.datasource.username=" + System.getProperty("spring.datasource.username"),
                "--spring.datasource.password=" + System.getProperty("spring.datasource.password"),
                "--spring.datasource.hikari.data-source-properties.ApplicationName=" + name,
                "--spring.flyway.locations=filesystem:" + migrations,
                "--pos.checkout.attempt.instance-id=" + name,
                "--pos.checkout.attempt.lease-seconds=" + LEASE_SECONDS,
                "--pos.checkout.attempt.claim-lock-timeout-ms=3000",
                "--pos.session.lock-timeout-ms=3000",
                "--spring.jpa.show-sql=false"));
        if (chaos != null) cmd.add("--pos.checkout.attempt.chaos=" + chaos);
        File log = evidenceDir.resolve(runId + "-" + name + ".log").toFile();
        return new ProcessBuilder(cmd).redirectErrorStream(true).redirectOutput(log).start();
    }

    private void awaitReady(int port, Process p) throws Exception {
        long deadline = System.currentTimeMillis() + 240_000;
        while (System.currentTimeMillis() < deadline) {
            assertTrue(p.isAlive(), "backend on " + port + " exited during startup; see its log in " + evidenceDir);
            try {
                if (((Integer) get(port, "/api/pos/checkout/capabilities").get("status")) == 200) return;
            } catch (Exception notYet) { /* still starting */ }
            Thread.sleep(1000);
        }
        throw new AssertionError("backend on " + port + " did not become ready");
    }

    @AfterAll
    void stopBackendsAndClean() throws Exception {
        for (Process p : new Process[] {jvmA, jvmB}) {
            if (p != null && p.isAlive()) {
                p.destroy();
                if (!p.waitFor(30, TimeUnit.SECONDS)) p.destroyForcibly().waitFor(30, TimeUnit.SECONDS);
            }
        }
        cleanup();
    }

    // ------------------------------------------------------------------ 1-3

    @Test
    @Order(1)
    @DisplayName("1-3: A claims; B's close and suspend are refused; A completes; B then closes with the sale counted")
    void processBCannotCloseWhileProcessAHoldsTheSession() throws Exception {
        Map<String, Object> e = section("s1_closeAcrossProcesses");
        PosSession session = openSession("S1");
        String k = runId + "-s1-sale";
        CompletableFuture<Map<String, Object>> a = async(PORT_A, "/api/pos/checkout", cashSale(k, session));
        // A pauses before SESSION_RECORD (chaos), its lease live.
        awaitTrue(() -> "PAYMENT_LEG_1".equals(lastStep(k)), 20_000, "A reached its payment leg");
        e.put("attemptWhileAHolds", attempt(k));
        Map<String, Object> close = post(PORT_B, "/api/pos/sessions/" + session.getId() + "/close", "{}");
        Map<String, Object> suspend = post(PORT_B, "/api/pos/sessions/" + session.getId() + "/suspend", "{}");
        e.put("B_close", strip(close));
        e.put("B_suspend", strip(suspend));
        assertEquals(409, close.get("status"), String.valueOf(close.get("body")));
        assertEquals(409, suspend.get("status"), String.valueOf(suspend.get("body")));
        assertTrue(String.valueOf(close.get("body")).contains("SESSION_CHECKOUT_IN_PROGRESS"));
        assertTrue(String.valueOf(suspend.get("body")).contains("SESSION_CHECKOUT_IN_PROGRESS"));
        assertEquals("OPEN", sessionStatus(session.getId()));

        Map<String, Object> done = a.get(60, TimeUnit.SECONDS);
        e.put("A_checkout", strip(done));
        assertEquals(200, done.get("status"), String.valueOf(done.get("body")));
        Map<String, Object> row = attempt(k);
        e.put("attemptAfterA", row);
        assertEquals("COMPLETED", row.get("state"));
        assertTrue(String.valueOf(row.get("owner_instance")).startsWith("JVM-A@"), String.valueOf(row.get("owner_instance")));
        Map<String, Object> closeAfter = post(PORT_B, "/api/pos/sessions/" + session.getId() + "/close", "{}");
        e.put("B_closeAfter", strip(closeAfter));
        assertEquals(200, closeAfter.get("status"));
        assertEquals(1, ((Number) jdbc.queryForObject("select invoice_count from pos_sessions where id = ?",
                Integer.class, session.getId())).intValue(), "the closed session includes A's sale");
        writeEvidence();
    }

    // ------------------------------------------------------------------ 7

    @Test
    @Order(2)
    @DisplayName("7: the same key sent to both processes at once creates exactly one invoice")
    void sameKeyAcrossProcessesCreatesOneInvoice() throws Exception {
        Map<String, Object> e = section("s7_sameKeyAcrossProcesses");
        List<Map<String, Object>> rounds = new ArrayList<>();
        e.put("rounds", rounds);
        for (int i = 0; i < 5; i++) {
            PosSession session = openSession("S7-" + i);
            String k = runId + "-s7-" + i;
            String body = cashSale(k, session);
            CompletableFuture<Map<String, Object>> a = async(PORT_A, "/api/pos/checkout", body);
            CompletableFuture<Map<String, Object>> b = async(PORT_B, "/api/pos/checkout", body);
            Map<String, Object> ra = a.get(60, TimeUnit.SECONDS);
            Map<String, Object> rb = b.get(60, TimeUnit.SECONDS);
            List<Long> invoices = jdbc.queryForList("select id from sales_invoices where pos_checkout_key = ?", Long.class, k);
            Map<String, Object> round = new LinkedHashMap<>();
            round.put("A", ra.get("status") + code(ra));
            round.put("B", rb.get("status") + code(rb));
            round.put("invoices", invoices);
            round.put("attempt", attempt(k));
            rounds.add(round);
            assertEquals(1, invoices.size(), "exactly one invoice: " + round);
            for (Map<String, Object> r : List.of(ra, rb)) {
                assertTrue(((Integer) r.get("status")) == 200 || "CHECKOUT_IN_PROGRESS".equals(code(r).replace(":", "")),
                        "only 200 or CHECKOUT_IN_PROGRESS: " + r.get("body"));
            }
            Map<String, Object> retry = post(PORT_B, "/api/pos/checkout", body);
            assertEquals(200, retry.get("status"));
            assertEquals(invoices.get(0), ((JsonNode) retry.get("json")).get("id").asLong());
        }
        writeEvidence();
    }

    // ------------------------------------------------------------------ 5-6 (paused, superseded, resumes)

    @Test
    @Order(3)
    @DisplayName("5-6: A pauses before its first write; after the lease B reclaims and completes; A resumes and is fenced out")
    void processBReclaimsAndProcessAIsFencedOut() throws Exception {
        Map<String, Object> e = section("s6_reclaimAcrossProcesses");
        PosSession session = openSession("S6");
        String k = runId + "-s6-sale";
        String body = cashSale(k, session);
        CompletableFuture<Map<String, Object>> a = async(PORT_A, "/api/pos/checkout", body);
        awaitTrue(() -> attemptOrNull(k) != null, 20_000, "A claimed");
        Map<String, Object> claimedByA = attempt(k);
        e.put("1_claimedByA", claimedByA);
        assertTrue(String.valueOf(claimedByA.get("owner_instance")).startsWith("JVM-A@"));
        assertEquals(1L, ((Number) claimedByA.get("fence")).longValue());
        awaitTrue(() -> Boolean.TRUE.equals(attempt(k).get("lease_expired")), (LEASE_SECONDS + 5) * 1000, "A's lease expired");
        e.put("2_leaseExpired", attempt(k));

        Map<String, Object> b = post(PORT_B, "/api/pos/checkout", body);
        e.put("3_B_retry", strip(b));
        assertEquals(200, b.get("status"), String.valueOf(b.get("body")));
        Map<String, Object> reclaimed = attempt(k);
        e.put("4_afterB", reclaimed);
        assertEquals("COMPLETED", reclaimed.get("state"));
        assertTrue(String.valueOf(reclaimed.get("owner_instance")).startsWith("JVM-B@"), String.valueOf(reclaimed.get("owner_instance")));
        assertEquals(2L, ((Number) reclaimed.get("fence")).longValue());
        assertEquals(2, ((Number) reclaimed.get("attempt_count")).intValue());
        assertTrue(String.valueOf(reclaimed.get("outcome_detail")).contains("reclaimed from FAILED"), String.valueOf(reclaimed.get("outcome_detail")));

        Map<String, Object> resumed = a.get(60, TimeUnit.SECONDS);
        e.put("5_A_resumed", strip(resumed));
        assertEquals(409, resumed.get("status"), String.valueOf(resumed.get("body")));
        assertEquals("CHECKOUT_ATTEMPT_SUPERSEDED", code(resumed).replace(":", ""));
        List<Long> invoices = jdbc.queryForList("select id from sales_invoices where pos_checkout_key = ?", Long.class, k);
        e.put("6_invoices", invoices);
        assertEquals(1, invoices.size(), "only B's sale exists; A wrote nothing with its old token");
        Map<String, Object> finalRow = attempt(k);
        assertEquals(reclaimed.get("fence"), finalRow.get("fence"));
        assertEquals("COMPLETED", finalRow.get("state"), "A's late failure did not overwrite B's record");
        writeEvidence();
    }

    // ------------------------------------------------------------------ 4-5 (killed mid-step)

    @Test
    @Order(4)
    @DisplayName("4-5: A is killed in the middle of a step; its writes roll back; B recovers and completes the sale")
    void processAKilledMidStepThenProcessBRecovers() throws Exception {
        Map<String, Object> e = section("s4_killMidStep");
        PosSession session = openSession("S4");
        String k = runId + "-s4-sale";
        String body = cashSale(k, session);
        CompletableFuture<Map<String, Object>> a = async(PORT_A, "/api/pos/checkout", body);
        awaitTrue(() -> attemptOrNull(k) != null, 20_000, "A claimed");
        // A is inside INVOICE_SAVE: its transaction is open (idle in transaction, holding the attempt row).
        awaitTrue(() -> jdbc.queryForObject("select count(*) from pg_stat_activity where datname = current_database() "
                + "and application_name = 'JVM-A' and state = 'idle in transaction'", Integer.class) >= 1, 20_000,
                "A is mid-step with an open transaction");
        Thread.sleep(500);
        e.put("1_beforeKill_attempt", attempt(k));
        e.put("1_beforeKill_backends", jdbc.queryForList("select pid, state, xact_start::text as xact_start from pg_stat_activity "
                + "where datname = current_database() and application_name = 'JVM-A' and state like 'idle in transaction%'"));
        boolean rowLocked = jdbc.queryForObject("select count(*) from pg_locks l join pg_stat_activity a on a.pid = l.pid "
                + "where a.application_name = 'JVM-A' and l.locktype = 'transactionid'", Integer.class) > 0;
        e.put("1_A_holdsTransaction", rowLocked);

        jvmA.destroyForcibly();
        assertTrue(jvmA.waitFor(30, TimeUnit.SECONDS), "JVM-A terminated");
        e.put("2_killed", Map.of("pid", jvmA.pid(), "exitValue", jvmA.exitValue()));
        awaitTrue(() -> jdbc.queryForObject("select count(*) from pg_stat_activity where datname = current_database() "
                + "and application_name = 'JVM-A'", Integer.class) == 0, 30_000, "A's backends are gone");
        Map<String, Object> afterKill = attempt(k);
        e.put("3_afterKill_attempt", afterKill);
        assertEquals("ACTIVE", afterKill.get("state"), "the claim survives the process");
        assertEquals("CLAIMED", afterKill.get("last_step"), "A's in-flight step (fence + save + evidence) rolled back");
        assertTrue(jdbc.queryForList("select id from sales_invoices where pos_checkout_key = ?", Long.class, k).isEmpty(),
                "A's half-written invoice did not survive");
        assertTrue(a.handle((r, ex) -> ex != null || r == null || !Integer.valueOf(200).equals(r.get("status")))
                .get(30, TimeUnit.SECONDS), "A never answered with a sale");

        Map<String, Object> early = post(PORT_B, "/api/pos/checkout", body);
        e.put("4_B_beforeLeaseExpiry", strip(early));
        if (!Boolean.TRUE.equals(attempt(k).get("lease_expired"))) {
            assertEquals(409, early.get("status"), "a live lease is respected even though its owner is dead");
            assertEquals("CHECKOUT_IN_PROGRESS", code(early).replace(":", ""));
        }
        awaitTrue(() -> Boolean.TRUE.equals(attempt(k).get("lease_expired")), (LEASE_SECONDS + 5) * 1000, "lease expired");
        Map<String, Object> b = post(PORT_B, "/api/pos/checkout", body);
        e.put("5_B_afterLeaseExpiry", strip(b));
        assertEquals(200, b.get("status"), String.valueOf(b.get("body")));
        Map<String, Object> recovered = attempt(k);
        e.put("6_recovered", recovered);
        assertEquals("COMPLETED", recovered.get("state"));
        assertTrue(String.valueOf(recovered.get("owner_instance")).startsWith("JVM-B@"));
        assertEquals(2L, ((Number) recovered.get("fence")).longValue());
        assertEquals(1, jdbc.queryForList("select id from sales_invoices where pos_checkout_key = ?", Long.class, k).size());
        assertEquals(200, post(PORT_B, "/api/pos/sessions/" + session.getId() + "/close", "{}").get("status"));
        writeEvidence();
    }

    // ------------------------------------------------------------------ helpers

    private PosSession openSession(String label) {
        PosTerminal t = new PosTerminal();
        t.setBranchId(BRANCH_ID);
        t.setTerminalId(runId + "-" + label);
        t.setTerminalName("M2.1 " + label);
        t.setCounterName("M2");
        t.setStatus(PosTerminalStatus.ACTIVE);
        t.setRegisteredBy("admin");
        PosTerminal terminal = terminalRepository.save(t);
        terminalIds.add(terminal.getId());
        LocalDateTime now = businessDayWindowService.clock().now();
        PosSession s = new PosSession();
        s.setBranchId(BRANCH_ID);
        s.setTerminalId(terminal.getTerminalId());
        s.setTerminalPk(terminal.getId());
        s.setCounterName("M2");
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
        jdbc.update("update pos_terminals set current_open_session_id = ? where id = ?", saved.getId(), terminal.getId());
        return saved;
    }

    private String cashSale(String key, PosSession session) throws Exception {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("itemCode", PRODUCT_CODE);
        item.put("itemName", "M2.1 two-JVM line");
        item.put("quantity", 1);
        item.put("unit", "Each");
        item.put("price", PRICE);
        item.put("discount", 0);
        item.put("taxRate", 5);
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("checkoutKey", key);
        b.put("customerName", "Walk-in Customer");
        b.put("paymentMode", "Cash");
        b.put("branchId", BRANCH_ID);
        b.put("branchCode", "BR-01");
        b.put("sessionId", session.getId());
        b.put("terminalId", session.getTerminalId());
        b.put("counterName", "M2");
        b.put("salespersonEmployeeCode", SALESPERSON);
        b.put("taxInclusive", true);
        b.put("items", List.of(item));
        b.put("paymentAllocations", List.of(Map.of("type", "CASH", "amount", PRICE)));
        return json.writeValueAsString(b);
    }

    private Map<String, Object> attempt(String key) {
        Map<String, Object> row = attemptOrNull(key);
        assertNotNull(row, "no attempt for " + key);
        return row;
    }

    private Map<String, Object> attemptOrNull(String key) {
        List<Map<String, Object>> rows = jdbc.queryForList("select id::text as id, state, fence, owner_instance, "
                + "owner_token::text as owner_token, attempt_count, last_step, lease_expires_at::text as lease_expires_at, "
                + "(lease_expires_at < now()) as lease_expired, invoice_id, invoice_number, session_recorded_at::text as "
                + "session_recorded_at, completed_at::text as completed_at, outcome_detail from pos_checkout_attempts "
                + "where checkout_key = ?", key);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private String lastStep(String key) {
        Map<String, Object> a = attemptOrNull(key);
        return a == null ? null : (String) a.get("last_step");
    }

    private String sessionStatus(Long id) {
        return jdbc.queryForObject("select status from pos_sessions where id = ?", String.class, id);
    }

    private static void awaitTrue(BooleanSupplier condition, long timeoutMs, String what) throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) return;
            Thread.sleep(200);
        }
        throw new AssertionError("timed out waiting until " + what);
    }

    private CompletableFuture<Map<String, Object>> async(int port, String path, String body) {
        return CompletableFuture.supplyAsync(() -> {
            try { return post(port, path, body); } catch (Exception ex) { throw new RuntimeException(ex); }
        });
    }

    private Map<String, Object> post(int port, String path, String body) throws Exception {
        return send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .POST(HttpRequest.BodyPublishers.ofString(body)), port, path);
    }

    private Map<String, Object> get(int port, String path) throws Exception {
        return send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET(), port, path);
    }

    private Map<String, Object> send(HttpRequest.Builder b, int port, String path) throws Exception {
        HttpResponse<String> res = http.send(b.timeout(Duration.ofSeconds(120))
                .header("Authorization", "Bearer " + token)
                .header("X-Branch-Id", String.valueOf(BRANCH_ID))
                .header("Content-Type", "application/json").build(), HttpResponse.BodyHandlers.ofString());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("process", port == PORT_A ? "JVM-A" : "JVM-B");
        out.put("path", path);
        out.put("status", res.statusCode());
        String text = res.body() == null ? "" : res.body();
        out.put("body", text.length() > 1200 ? text.substring(0, 1200) + "…" : text);
        try { out.put("json", json.readTree(text)); } catch (Exception notJson) { out.put("json", null); }
        return out;
    }

    private static String code(Map<String, Object> r) {
        JsonNode n = (JsonNode) r.get("json");
        return n != null && n.get("code") != null ? ":" + n.get("code").asText() : "";
    }

    private static Map<String, Object> strip(Map<String, Object> r) {
        Map<String, Object> c = new LinkedHashMap<>(r);
        c.remove("json");
        return c;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> section(String name) {
        return (Map<String, Object>) evidence.computeIfAbsent(name, x -> Collections.synchronizedMap(new LinkedHashMap<>()));
    }

    private void writeEvidence() throws Exception {
        synchronized (evidence) {
            Files.writeString(evidenceDir.resolve("twojvm-evidence-" + runId + ".json"),
                    json.writerWithDefaultPrettyPrinter().writeValueAsString(evidence));
        }
    }

    private Map<String, Long> tableCounts() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String t : jdbc.queryForList("select table_name from information_schema.tables where table_schema = 'public' "
                + "and table_type = 'BASE TABLE' order by table_name", String.class)) {
            counts.put(t, jdbc.queryForObject("select count(*) from \"" + t + "\"", Long.class));
        }
        return counts;
    }

    private static String inList(List<Long> ids) {
        return ids.isEmpty() ? "-1" : String.join(",", ids.stream().map(String::valueOf).toList());
    }

    private static String quoted(List<String> values) {
        return values.isEmpty() ? "'-'" : String.join(",", values.stream().map(v -> "'" + v.replace("'", "''") + "'").toList());
    }

    /** Same deletion recipe as PosCheckoutAttemptConcurrencyTest, keyed on this run. */
    private void cleanup() throws Exception {
        Thread.sleep(1500);
        String keyLike = runId + "-%";
        List<Long> invoiceIds = new ArrayList<>(jdbc.queryForList("select id from sales_invoices where pos_checkout_key like ? "
                + "or pos_session_id in (" + inList(sessionIds) + ")", Long.class, keyLike));
        invoiceIds.addAll(jdbc.queryForList("select invoice_id from pos_checkout_attempts where invoice_id is not null "
                + "and checkout_key like ?", Long.class, keyLike));
        String ids = inList(invoiceIds.stream().distinct().toList());
        List<String> invoiceNumbers = jdbc.queryForList("select invoice_number from sales_invoices where id in (" + ids + ")", String.class);
        Map<String, Object> report = new LinkedHashMap<>();
        tx.executeWithoutResult(status -> {
            List<Long> dnIds = jdbc.queryForList("select id from delivery_notes where sales_invoice_id in (" + ids + ")", Long.class);
            List<String> refs = new ArrayList<>();
            invoiceNumbers.forEach(n -> { refs.add(n); refs.add("FS-" + n); });
            refs.addAll(jdbc.queryForList("select dn_number from delivery_notes where sales_invoice_id in (" + ids + ")", String.class));
            refs.addAll(jdbc.queryForList("select voucher_id from sales_receipt_vouchers where sales_invoice_id in (" + ids + ")", String.class));
            sessionIds.forEach(id -> refs.add("SCL-" + id));
            String dn = inList(dnIds), sess = inList(sessionIds), term = inList(terminalIds), r = quoted(refs);
            List<String> paymentNumbers = invoiceNumbers.isEmpty() ? List.of() : jdbc.queryForList(
                    "select payment_number from sales_payments where linked_invoice in (" + quoted(invoiceNumbers) + ")", String.class);
            List<String> auditKeys = new ArrayList<>(refs);
            auditKeys.addAll(jdbc.queryForList("select entry_number from journal_entries where reference in (" + r + ")", String.class));
            auditKeys.addAll(paymentNumbers);
            Map<String, Integer> d = new LinkedHashMap<>();
            d.put("financial_audit_logs", jdbc.update("delete from financial_audit_logs where entity_id in (" + quoted(auditKeys) + ")"));
            d.put("notifications", jdbc.update("delete from notifications where reference_id in (" + quoted(paymentNumbers) + ")"));
            d.put("audit_logs", jdbc.update("delete from audit_logs where id > ?", baselineAuditLogId));
            d.put("ledger_entries", jdbc.update("delete from ledger_entries where journal_id in (select id::text from journal_entries where reference in (" + r + "))"));
            d.put("journal_lines", jdbc.update("delete from journal_lines where journal_entry_id in (select id from journal_entries where reference in (" + r + "))"));
            d.put("journal_entries", jdbc.update("delete from journal_entries where reference in (" + r + ")"));
            d.put("sales_payments", jdbc.update("delete from sales_payments where linked_invoice in (" + quoted(invoiceNumbers) + ")"));
            d.put("sales_receipt_vouchers", jdbc.update("delete from sales_receipt_vouchers where sales_invoice_id in (" + ids + ")"));
            d.put("stock_movements", jdbc.update("delete from stock_movements where source_type = 'DELIVERY_NOTE' and source_id in (" + dn + ")"));
            d.put("delivery_note_batch_consumptions", jdbc.update("delete from delivery_note_batch_consumptions where delivery_note_id in (" + dn + ")"));
            d.put("batch_allocation", jdbc.update("delete from batch_allocation where (source_document_type = 'SALES_INVOICE' and source_document_id in (" + ids + ")) "
                    + "or (source_document_type = 'DELIVERY_NOTE' and source_document_id in (" + dn + "))"));
            d.put("delivery_note_items", jdbc.update("delete from delivery_note_items where delivery_note_id in (" + dn + ")"));
            d.put("delivery_notes", jdbc.update("delete from delivery_notes where id in (" + dn + ")"));
            d.put("sales_invoice_history_events", jdbc.update("delete from sales_invoice_history_events where invoice_id in (" + ids + ")"));
            d.put("sales_invoice_items", jdbc.update("delete from sales_invoice_items where sales_invoice_id in (" + ids + ")"));
            d.put("sales_invoices", jdbc.update("delete from sales_invoices where id in (" + ids + ")"));
            d.put("pos_checkout_attempts", jdbc.update("delete from pos_checkout_attempts where checkout_key like ? or session_id in (" + sess + ")", keyLike));
            d.put("pos_session_terminal_history", jdbc.update("delete from pos_session_terminal_history where session_id in (" + sess + ")"));
            d.put("pos_audit_log", jdbc.update("delete from pos_audit_log where session_id in (" + sess + ") or terminal_id like ?", keyLike));
            jdbc.update("update pos_terminals set current_open_session_id = null where id in (" + term + ")");
            d.put("pos_sessions", jdbc.update("delete from pos_sessions where id in (" + sess + ")"));
            d.put("pos_terminals", jdbc.update("delete from pos_terminals where id in (" + term + ")"));
            report.put("deleted", d);
        });
        Map<String, Long> after = tableCounts();
        Map<String, Long> remaining = new LinkedHashMap<>();
        after.forEach((t, n) -> { long diff = n - baselineCounts.getOrDefault(t, 0L); if (diff != 0) remaining.put(t, diff); });
        report.put("rowCountDeltaVsBaselineAfterCleanup", remaining);
        evidence.put("cleanup", report);
        writeEvidence();
        assertTrue(remaining.isEmpty(), "rows left behind after cleanup: " + remaining);
    }
}
