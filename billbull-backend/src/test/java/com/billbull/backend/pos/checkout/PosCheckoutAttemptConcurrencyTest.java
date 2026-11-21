package com.billbull.backend.pos.checkout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import javax.sql.DataSource;

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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.billbull.backend.config.JwtUtil;
import com.billbull.backend.pos.businessdate.BusinessDayWindowService;
import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptRepository;
import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService;
import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService.ClaimRequest;
import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService.ClaimResult;
import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService.Claimed;
import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService.Conflict;
import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService.ConflictKind;
import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService.PosCheckoutClaim;
import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService.SessionRefused;
import com.billbull.backend.pos.checkout.attempt.PosCheckoutAttemptService.SupersededException;
import com.billbull.backend.pos.session.PosSession;
import com.billbull.backend.pos.session.PosSessionRepository;
import com.billbull.backend.pos.session.PosSessionScheduler;
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
 * Phase 0 / M2 — the checkout attempt journal against real PostgreSQL, with independent
 * connections and threads. Every race here is a real one: two transactions contending for the
 * same session row, not a mocked repository.
 *
 * <h3>How interleavings are forced</h3>
 * Where a test needs two operations to arrive at the session lock together, it first takes that
 * lock itself on a raw JDBC connection ({@code SELECT ... FOR UPDATE}), starts both operations
 * (they queue behind it, which is checked in {@code pg_stat_activity}), then releases it. Which one
 * PostgreSQL grants next is up to PostgreSQL; the assertions only state the invariant that must hold
 * either way. Lease expiry is simulated by moving {@code lease_expires_at} into the past, and a
 * crash by {@code pg_terminate_backend} on the worker's connection.
 *
 * <h3>Running it</h3>
 * Same guard as {@link PosCheckoutClosedSessionDefectTest}: refuses to run unless
 * {@code -Dm0.disposableDatabase} names the connected database, which must start with
 * {@code billbull_m0_} and not be {@code testdb}. The context runs with a 10 s lease and a 2 s claim
 * lock timeout so lease and lock-wait behaviour can be observed in seconds.
 *
 * <pre>
 * mvn -o test -Dtest=PosCheckoutAttemptConcurrencyTest \
 *   -Dm0.disposableDatabase=billbull_m0_m2_20261112 -Dm0.evidenceDir=&lt;dir outside repo&gt; \
 *   -Dspring.datasource.url=jdbc:postgresql://localhost:5432/billbull_m0_m2_20261112 \
 *   -Dspring.datasource.username=... -Dspring.datasource.password=... \
 *   -Dspring.flyway.locations=filesystem:src/main/resources/db/migration
 * </pre>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT,
        properties = {"server.port=8081", "spring.jpa.show-sql=false", "logging.level.org.hibernate.SQL=OFF",
                "pos.checkout.attempt.lease-seconds=10", "pos.checkout.attempt.claim-lock-timeout-ms=2000",
                "pos.session.lock-timeout-ms=2000"})
@EnabledIfSystemProperty(named = "m0.disposableDatabase", matches = "billbull_m0_.+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@DisplayName("Phase 0 / M2 — checkout attempt journal (real PostgreSQL, real concurrency)")
class PosCheckoutAttemptConcurrencyTest {

    private static final long BRANCH_ID = 1L;
    private static final long OTHER_BRANCH_ID = 2L;
    private static final String PRODUCT_CODE = "08747";
    private static final String SALESPERSON = "EMP1257";
    private static final String DELIVERY_PERSON = "EMP7361";
    private static final String DELIVERY_CUSTOMER = "02650";
    private static final double PRICE = 100.0;
    private static final String TEST_SUPERVISOR_PIN = "8642";
    private static final String TEST_SUPERVISOR_PASSWORD = "M22-supervisor-pass";
    private static final String CASHIER = "cashier1@test.com";
    /** Product 08747's minimum price is 50: a line at 40 needs a supervisor override for a cashier. */
    private static final double BELOW_MIN_PRICE = 40.0;
    private static final Set<String> NON_BUSINESS_TABLES = Set.of("audit_logs", "pos_audit_log");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private DataSource dataSource;
    @Autowired private TransactionTemplate tx;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private UserRepository userRepository;
    @Autowired private PosTerminalRepository terminalRepository;
    @Autowired private PosSessionRepository sessionRepository;
    @Autowired private BusinessDayWindowService businessDayWindowService;
    @Autowired private PosCheckoutAttemptService attemptService;
    @Autowired private PosCheckoutAttemptRepository attemptRepository;
    @Autowired private PosSessionScheduler scheduler;
    @Autowired private com.billbull.backend.pos.session.PosSessionService sessionService;
    @Autowired private SupersedeHook supersede;
    @LocalServerPort private int port;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private final ExecutorService pool = Executors.newFixedThreadPool(12);

    private final String runId = "m2-" + UUID.randomUUID().toString().substring(0, 8);
    private final List<Long> sessionIds = Collections.synchronizedList(new ArrayList<>());
    private final List<Long> terminalIds = Collections.synchronizedList(new ArrayList<>());
    private final List<Long> createdInvoiceIds = Collections.synchronizedList(new ArrayList<>());
    private final Map<String, Object> evidence = Collections.synchronizedMap(new LinkedHashMap<>());
    private final AtomicLong seq = new AtomicLong();
    private Map<String, Long> baselineCounts;
    private long baselineAuditLogId;
    private Path evidenceFile;
    private String token;
    private LocalDate tradingDate;
    private String originalSupervisorPin;
    private String originalAdminPassword;
    private String originalDeliveryMode;
    private Map<String, Object> originalSalesOrder;
    /** An invoice that exists, used as "write evidence" by the fencing tests. */
    private Long evidenceInvoiceId;

    // ------------------------------------------------------------------ guard

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
        evidenceFile = Path.of(dir, "m2-evidence-" + runId + ".json");

        token = tx.execute(s -> jwtUtil.generateToken(userRepository.findByUsername("admin").orElseThrow(), BRANCH_ID));
        tradingDate = businessDayWindowService.resolveCurrent(BRANCH_ID).window().tradingDate();

        evidence.put("runId", runId);
        evidence.put("database", db);
        evidence.put("flywayV138", jdbc.queryForList("select version, description, success from flyway_schema_history "
                + "where version = '138'"));
        evidence.put("serverTimeouts", jdbc.queryForMap("select current_setting('lock_timeout') as lock_timeout, "
                + "current_setting('statement_timeout') as statement_timeout, "
                + "current_setting('deadlock_timeout') as deadlock_timeout, "
                + "current_setting('idle_in_transaction_session_timeout') as idle_in_tx_timeout"));
        evidence.put("attemptServiceInstance", attemptService.instanceId());
        evidence.put("leaseSeconds", attemptService.leaseSeconds());

        originalSalesOrder = jdbc.queryForMap("select so.status, i.delivered_quantity from sales_orders so "
                + "join sales_order_items i on i.sales_order_id = so.id where so.so_number = ? and i.id = ?",
                SALES_ORDER, SALES_ORDER_ITEM_ID);
        evidence.put("salesOrderFixtureBefore", originalSalesOrder);
        originalSupervisorPin = jdbc.queryForObject("select supervisor_pin from pos_settings where branch_id = ?",
                String.class, BRANCH_ID);
        // Must run before the baseline: the pin is restored in cleanup, so it is not a row-count change.
        jdbc.update("update pos_settings set supervisor_pin = ? where branch_id = ?",
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode(TEST_SUPERVISOR_PIN), BRANCH_ID);
        // M2.2: a known supervisor password for the admin account (email/password approvals) and the
        // branch's delivery workflow, both restored in cleanup. Neither changes a row count.
        originalAdminPassword = jdbc.queryForObject("select password from users where username = 'admin'", String.class);
        jdbc.update("update users set password = ? where username = 'admin'",
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode(TEST_SUPERVISOR_PASSWORD));
        originalDeliveryMode = jdbc.queryForObject("select delivery_workflow_mode from pos_settings where branch_id = ?",
                String.class, BRANCH_ID);
        evidence.put("deliveryWorkflowModeBefore", originalDeliveryMode);
        baselineCounts = tableCounts();
        baselineAuditLogId = jdbc.queryForObject("select coalesce(max(id), 0) from audit_logs", Long.class);
        writeEvidence();
    }

    // ------------------------------------------------------------------ 1. claim on OPEN, and the HTTP journal end to end

    @Test
    @Order(1)
    @DisplayName("1/16: claim succeeds on an OPEN session; an HTTP checkout leaves a COMPLETED attempt with full evidence")
    void claimOnOpenSessionAndHttpJournal() throws Exception {
        PosSession session = openSession("OPEN");
        String key = key("claim-open");
        ClaimResult result = claim(key, hash(), session.getId(), BRANCH_ID);
        PosCheckoutClaim claim = assertInstanceOf(Claimed.class, result).claim();
        Map<String, Object> row = attemptRow(key);
        Map<String, Object> e = section("1_claimOnOpen");
        e.put("row", row);
        assertEquals("ACTIVE", row.get("state"));
        assertEquals(1L, ((Number) row.get("fence")).longValue());
        assertEquals(claim.ownerToken().toString(), String.valueOf(row.get("owner_token")));
        assertEquals(attemptService.instanceId(), row.get("owner_instance"));
        assertEquals(session.getId(), ((Number) row.get("session_id")).longValue());
        assertEquals(BRANCH_ID, ((Number) row.get("branch_id")).longValue());
        assertEquals("CLIENT", row.get("key_source"));
        assertEquals(System.getProperty("m0.disposableDatabase"), row.get("tenant_db"));
        assertEquals(Boolean.FALSE, row.get("lease_expired"));
        attemptService.complete(claim);
        assertEquals("COMPLETED", attemptRow(key).get("state"));

        // End to end through the real endpoint.
        PosSession till = openSession("HTTP");
        String httpKey = key("http");
        Map<String, Object> res = post("/api/pos/checkout", cashSale(httpKey, till.getId(), till.getTerminalId(), 1, "CASH"));
        assertEquals(200, res.get("status"), String.valueOf(res.get("body")));
        long invoiceId = ((JsonNode) res.get("json")).get("id").asLong();
        createdInvoiceIds.add(invoiceId);
        evidenceInvoiceId = invoiceId;
        Map<String, Object> journal = attemptRow(httpKey);
        e.put("httpAttempt", journal);
        assertEquals("COMPLETED", journal.get("state"));
        assertEquals(invoiceId, ((Number) journal.get("invoice_id")).longValue());
        assertNotNull(journal.get("invoice_saved_at"));
        assertNotNull(journal.get("invoice_posted_at"));
        assertEquals(1, ((Number) journal.get("payment_legs_expected")).intValue());
        assertEquals(1, ((Number) journal.get("payment_legs_recorded")).intValue());
        assertEquals(Boolean.TRUE, journal.get("session_step_required"));
        assertNotNull(journal.get("session_recorded_at"));
        assertNotNull(journal.get("completed_at"));
        assertEquals(1, ((Number) sessionRow(till.getId()).get("invoice_count")).intValue());

        Map<String, Object> retry = post("/api/pos/checkout", cashSale(httpKey, till.getId(), till.getTerminalId(), 1, "CASH"));
        assertEquals(200, retry.get("status"));
        assertEquals(invoiceId, ((JsonNode) retry.get("json")).get("id").asLong(), "same key + same request replays");
        assertEquals(200, post("/api/pos/sessions/" + till.getId() + "/close", "{}").get("status"),
                "a session whose only attempt is COMPLETED closes");
        writeEvidence();
    }

    // ------------------------------------------------------------------ 2 + 5. claim refused on CLOSED / SUSPENDED / other branch / missing

    @Test
    @Order(2)
    @DisplayName("2/16 + 5/16: claim refused for CLOSED (close first), SUSPENDED, other-branch and missing sessions; nothing written")
    void claimRefusedOnNonOpenSessions() throws Exception {
        Map<String, Object> e = section("2_claimRefused");
        PosSession closed = openSession("CLOSED");
        assertEquals(200, post("/api/pos/sessions/" + closed.getId() + "/close", "{}").get("status"));
        PosSession suspended = openSession("SUSPENDED");
        assertEquals(200, post("/api/pos/sessions/" + suspended.getId() + "/suspend", "{}").get("status"));
        PosSession other = openSession("OTHERBRANCH", OTHER_BRANCH_ID);
        long missing = jdbc.queryForObject("select coalesce(max(id), 0) + 100000 from pos_sessions", Long.class);

        Map<String, PosCheckoutSessionGuard.Code> expected = new LinkedHashMap<>();
        Map<String, Long> sessions = new LinkedHashMap<>();
        sessions.put("closed", closed.getId());       expected.put("closed", PosCheckoutSessionGuard.Code.SESSION_NOT_OPEN);
        sessions.put("suspended", suspended.getId()); expected.put("suspended", PosCheckoutSessionGuard.Code.SESSION_NOT_OPEN);
        sessions.put("otherBranch", other.getId());   expected.put("otherBranch", PosCheckoutSessionGuard.Code.SESSION_BRANCH_MISMATCH);
        sessions.put("missing", missing);             expected.put("missing", PosCheckoutSessionGuard.Code.SESSION_NOT_FOUND);
        for (var entry : sessions.entrySet()) {
            String k = key("refused-" + entry.getKey());
            ClaimResult r = claim(k, hash(), entry.getValue(), BRANCH_ID);
            PosCheckoutSessionGuard.Refusal refusal = (PosCheckoutSessionGuard.Refusal)
                    assertInstanceOf(SessionRefused.class, r, entry.getKey()).refusal();
            e.put(entry.getKey(), refusal.auditDetail());
            assertEquals(expected.get(entry.getKey()), refusal.code(), entry.getKey());
            assertTrue(attemptRowOrNull(k) == null, entry.getKey() + ": a refused claim writes no attempt");
        }
        writeEvidence();
    }

    // ------------------------------------------------------------------ 3, 4, 6. transitions after a committed claim

    @Test
    @Order(3)
    @DisplayName("3/16, 4/16, 6/16: close, suspend and begin-closure are refused while a committed claim is ACTIVE")
    void transitionsRefusedWhileClaimActive() throws Exception {
        PosSession session = openSession("BLOCKED");
        String k = key("blocking");
        PosCheckoutClaim claim = assertInstanceOf(Claimed.class, claim(k, hash(), session.getId(), BRANCH_ID)).claim();
        Map<String, Object> e = section("3_4_6_transitionsBlocked");

        Map<String, Object> close = post("/api/pos/sessions/" + session.getId() + "/close", "{}");
        Map<String, Object> suspend = post("/api/pos/sessions/" + session.getId() + "/suspend", "{}");
        Map<String, Object> begin = post("/api/pos/sessions/" + session.getId() + "/begin-closure", "{}");
        e.put("close", withoutJson(close));
        e.put("suspend", withoutJson(suspend));
        e.put("beginClosure", withoutJson(begin));
        for (Map<String, Object> r : List.of(close, suspend, begin)) {
            assertEquals(409, r.get("status"), String.valueOf(r.get("body")));
            assertTrue(String.valueOf(r.get("body")).contains("SESSION_CHECKOUT_IN_PROGRESS"), String.valueOf(r.get("body")));
        }
        Map<String, Object> row = sessionRow(session.getId());
        assertEquals("OPEN", row.get("status"));
        assertEquals(null, row.get("closing_started_at"));

        attemptService.complete(claim);
        Map<String, Object> closeAfter = post("/api/pos/sessions/" + session.getId() + "/close", "{}");
        e.put("closeAfterComplete", withoutJson(closeAfter));
        assertEquals(200, closeAfter.get("status"), "once the attempt completes, close proceeds");
        writeEvidence();
    }

    // ------------------------------------------------------------------ 7, 8. concurrent claim vs close / suspend

    @Test
    @Order(4)
    @DisplayName("7/16: concurrent claim and close — exactly one wins, every time")
    void concurrentClaimAndClose() throws Exception {
        raceClaimAgainst("close", 8);
    }

    @Test
    @Order(5)
    @DisplayName("8/16: concurrent claim and suspend — exactly one wins, every time")
    void concurrentClaimAndSuspend() throws Exception {
        raceClaimAgainst("suspend", 8);
    }

    private void raceClaimAgainst(String transition, int rounds) throws Exception {
        List<Map<String, Object>> log = new ArrayList<>();
        section("7_8_race_" + transition).put("rounds", log);
        int claimWins = 0, transitionWins = 0;
        for (int i = 0; i < rounds; i++) {
            PosSession session = openSession("RACE-" + transition + "-" + i);
            String k = key("race-" + transition + "-" + i);
            boolean claimFirst = i % 2 == 0;
            Map<String, Object> round = new LinkedHashMap<>();
            round.put("sessionId", session.getId());
            round.put("claimQueuedFirst", claimFirst);
            Future<ClaimResult> claimF;
            Future<Map<String, Object>> transitionF;
            try (Connection holder = holdSessionLock(session.getId())) {
                Callable<ClaimResult> c = () -> claim(k, hash(), session.getId(), BRANCH_ID);
                Callable<Map<String, Object>> t = () -> post("/api/pos/sessions/" + session.getId() + "/" + transition, "{}");
                if (claimFirst) {
                    claimF = pool.submit(c);
                    awaitLockWaiters(1);
                    transitionF = pool.submit(t);
                } else {
                    transitionF = pool.submit(t);
                    awaitLockWaiters(1);
                    claimF = pool.submit(c);
                }
                round.put("lockWaitersWhileHeld", awaitLockWaiters(2));
                holder.rollback(); // release: both proceed, in whatever order PostgreSQL grants
            }
            ClaimResult cr = claimF.get(30, TimeUnit.SECONDS);
            Map<String, Object> tr = transitionF.get(30, TimeUnit.SECONDS);
            boolean claimWon = cr instanceof Claimed;
            boolean transitionWon = ((Integer) tr.get("status")) == 200;
            round.put("claim", cr.getClass().getSimpleName()
                    + (cr instanceof SessionRefused sr ? ":" + ((PosCheckoutSessionGuard.Refusal) sr.refusal()).code() : ""));
            round.put("transitionStatus", tr.get("status"));
            round.put("transitionBody", abbreviate(String.valueOf(tr.get("body"))));
            String status = (String) sessionRow(session.getId()).get("status");
            round.put("sessionStatusAfter", status);
            Map<String, Object> attempt = attemptRowOrNull(k);
            round.put("attemptAfter", attempt == null ? null : attempt.get("state"));
            log.add(round);

            assertTrue(claimWon ^ transitionWon, "exactly one must win: " + round);
            if (claimWon) {
                claimWins++;
                assertEquals("OPEN", status, "the claim won, so the session stayed OPEN: " + round);
                assertEquals("ACTIVE", attempt.get("state"));
                assertEquals(409, tr.get("status"));
                assertTrue(String.valueOf(tr.get("body")).contains("SESSION_CHECKOUT_IN_PROGRESS"));
                attemptService.complete(((Claimed) cr).claim());
            } else {
                transitionWins++;
                assertEquals("close".equals(transition) ? "CLOSED" : "SUSPENDED", status, round.toString());
                assertTrue(attempt == null, "the transition won, so no attempt may exist: " + round);
                // Refused under the lock once the transition committed — or, if the transition held
                // the lock past the claim's lock_timeout, given up on with nothing written.
                if (cr instanceof SessionRefused sr) {
                    assertEquals(PosCheckoutSessionGuard.Code.SESSION_NOT_OPEN,
                            ((PosCheckoutSessionGuard.Refusal) sr.refusal()).code());
                } else {
                    assertInstanceOf(PosCheckoutAttemptService.Busy.class, cr, round.toString());
                }
            }
        }
        section("7_8_race_" + transition).put("claimWins", claimWins);
        section("7_8_race_" + transition).put("transitionWins", transitionWins);
        writeEvidence();
    }

    // ------------------------------------------------------------------ HTTP race, no artificial lock

    @Test
    @Order(6)
    @DisplayName("7/16 (end to end): concurrent HTTP checkout and close never leave a sale outside a closed session's totals")
    void httpCheckoutRacingClose() throws Exception {
        List<Map<String, Object>> log = new ArrayList<>();
        section("7_http_race").put("rounds", log);
        // Close is much quicker to reach the session lock than a checkout (which validates and
        // prices first), so the close is held back by a spread of delays to land on both sides of
        // the checkout's claim.
        long[] closeDelaysMs = {0, 150, 300, 450, 600, 800, 1000, 1500};
        for (int i = 0; i < closeDelaysMs.length; i++) {
            PosSession session = openSession("HTTPRACE-" + i);
            String k = key("httprace-" + i);
            long delay = closeDelaysMs[i];
            CountDownLatch go = new CountDownLatch(1);
            Future<Map<String, Object>> checkout = pool.submit(() -> {
                go.await();
                return post("/api/pos/checkout", cashSale(k, session.getId(), session.getTerminalId(), 1, "CASH"));
            });
            Future<Map<String, Object>> close = pool.submit(() -> {
                go.await();
                Thread.sleep(delay);
                return post("/api/pos/sessions/" + session.getId() + "/close", "{}");
            });
            go.countDown();
            Map<String, Object> co = checkout.get(60, TimeUnit.SECONDS);
            Map<String, Object> cl = close.get(60, TimeUnit.SECONDS);
            JsonNode body = (JsonNode) co.get("json");
            if (((Integer) co.get("status")) == 200) createdInvoiceIds.add(body.get("id").asLong());
            Map<String, Object> s = sessionRow(session.getId());
            List<Map<String, Object>> invoices = jdbc.queryForList(
                    "select id, status, pos_session_id from sales_invoices where pos_checkout_key = ?", k);
            Map<String, Object> round = new LinkedHashMap<>();
            round.put("closeDelayMs", delay);
            round.put("checkoutStatus", co.get("status"));
            round.put("checkoutCode", body != null && body.get("code") != null ? body.get("code").asText() : null);
            round.put("closeStatus", cl.get("status"));
            round.put("closeBody", abbreviate(String.valueOf(cl.get("body"))));
            round.put("session", s);
            round.put("invoices", invoices);
            round.put("attempt", attemptRowOrNull(k));
            log.add(round);

            boolean sold = ((Integer) co.get("status")) == 200;
            boolean closed = ((Integer) cl.get("status")) == 200;
            if (sold && closed) {
                assertEquals(1, ((Number) s.get("invoice_count")).intValue(),
                        "both succeeded, so the sale finished before the close and is in its totals: " + round);
            }
            if (!sold) assertTrue(invoices.isEmpty(), "a refused checkout leaves no invoice: " + round);
            if (closed) {
                assertTrue(attemptRepository.findBlockingForSession(session.getId()).isEmpty(),
                        "a closed session never has a blocking attempt: " + round);
            }
            if (sold && !closed) {
                assertTrue(String.valueOf(cl.get("body")).contains("SESSION_CHECKOUT_IN_PROGRESS"), round.toString());
                assertEquals(200, post("/api/pos/sessions/" + session.getId() + "/close", "{}").get("status"));
            }
        }
        writeEvidence();
    }

    // ------------------------------------------------------------------ 9, 10. same key

    @Test
    @Order(7)
    @DisplayName("9/16: concurrent claims with one key create exactly one ACTIVE attempt; concurrent HTTP retries one invoice")
    void sameKeyConcurrentClaims() throws Exception {
        PosSession session = openSession("SAMEKEY");
        String k = key("samekey");
        String h = hash();
        CountDownLatch go = new CountDownLatch(1);
        List<Future<ClaimResult>> futures = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            futures.add(pool.submit(() -> { go.await(); return claim(k, h, session.getId(), BRANCH_ID); }));
        }
        go.countDown();
        List<String> outcomes = new ArrayList<>();
        PosCheckoutClaim winner = null;
        for (Future<ClaimResult> f : futures) {
            ClaimResult r = f.get(30, TimeUnit.SECONDS);
            if (r instanceof Claimed c) { assertTrue(winner == null, "two claims won"); winner = c.claim(); }
            else assertEquals(ConflictKind.IN_PROGRESS, assertInstanceOf(Conflict.class, r).kind());
            outcomes.add(r instanceof Conflict c ? "Conflict:" + c.kind() : r.getClass().getSimpleName());
        }
        assertNotNull(winner, "one claim must win");
        assertEquals(1, jdbc.queryForObject("select count(*) from pos_checkout_attempts where checkout_key = ?", Integer.class, k));
        assertEquals(1, ((Number) attemptRow(k).get("attempt_count")).intValue());
        attemptService.complete(winner);

        // Two simultaneous HTTP checkouts with the same key.
        String httpKey = key("samekey-http");
        CountDownLatch go2 = new CountDownLatch(1);
        List<Future<Map<String, Object>>> posts = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            posts.add(pool.submit(() -> { go2.await();
                return post("/api/pos/checkout", cashSale(httpKey, session.getId(), session.getTerminalId(), 1, "CASH")); }));
        }
        go2.countDown();
        List<String> httpOutcomes = new ArrayList<>();
        for (Future<Map<String, Object>> f : posts) {
            Map<String, Object> r = f.get(60, TimeUnit.SECONDS);
            JsonNode b = (JsonNode) r.get("json");
            httpOutcomes.add(r.get("status") + (b != null && b.get("code") != null ? ":" + b.get("code").asText() : ""));
            assertTrue(((Integer) r.get("status")) == 200 || "CHECKOUT_IN_PROGRESS".equals(b.get("code").asText()),
                    "only 200 or CHECKOUT_IN_PROGRESS: " + r.get("body"));
        }
        List<Long> invoices = jdbc.queryForList("select id from sales_invoices where pos_checkout_key = ?", Long.class, httpKey);
        createdInvoiceIds.addAll(invoices);
        assertEquals(1, invoices.size(), "exactly one invoice for the key");
        Map<String, Object> retry = post("/api/pos/checkout", cashSale(httpKey, session.getId(), session.getTerminalId(), 1, "CASH"));
        assertEquals(200, retry.get("status"));
        assertEquals(invoices.get(0), ((JsonNode) retry.get("json")).get("id").asLong());
        Map<String, Object> e = section("9_sameKey");
        e.put("claimOutcomes", outcomes);
        e.put("httpOutcomes", httpOutcomes);
        e.put("invoices", invoices);
        writeEvidence();
    }

    @Test
    @Order(8)
    @DisplayName("10/16: same key, different canonical hash is a conflict — including a tender-only change")
    void sameKeyDifferentHash() throws Exception {
        PosSession session = openSession("HASH");
        String k = key("hash");
        PosCheckoutClaim c = assertInstanceOf(Claimed.class, claim(k, hash(), session.getId(), BRANCH_ID)).claim();
        assertEquals(ConflictKind.KEY_REUSED,
                assertInstanceOf(Conflict.class, claim(k, hash(), session.getId(), BRANCH_ID)).kind());
        attemptService.complete(c);

        String httpKey = key("hash-http");
        Map<String, Object> first = post("/api/pos/checkout", cashSale(httpKey, session.getId(), session.getTerminalId(), 1, "CASH"));
        assertEquals(200, first.get("status"), String.valueOf(first.get("body")));
        createdInvoiceIds.add(((JsonNode) first.get("json")).get("id").asLong());
        Map<String, Long> before = tableCounts();
        // Same lines, same total, same session; only the tender differs (cash → card). M1 answered
        // this with the stored invoice; M2's hash refuses it.
        Map<String, Object> tenderOnly = post("/api/pos/checkout",
                cashSale(httpKey, session.getId(), session.getTerminalId(), 1, "CARD"));
        Map<String, Long> delta = delta(before, tableCounts());
        Map<String, Object> e = section("10_differentHash");
        e.put("tenderOnly", withoutJson(tenderOnly));
        e.put("delta", delta);
        assertEquals(409, tenderOnly.get("status"));
        assertEquals("CHECKOUT_KEY_REUSED", text((JsonNode) tenderOnly.get("json"), "code"));
        assertEquals("requestHash", text((JsonNode) tenderOnly.get("json"), "differsIn"));
        assertNoBusinessWrites(delta);
        writeEvidence();
    }

    // ------------------------------------------------------------------ 11. fencing

    @Test
    @Order(9)
    @DisplayName("11/16: a stale owner cannot write after reclaim or release; a STALLED owner can re-adopt")
    void staleOwnerIsFencedOut() throws Exception {
        Map<String, Object> e = section("11_fencing");
        PosSession session = openSession("FENCE");
        String k = key("fence");
        String h = hash();
        PosCheckoutClaim a = assertInstanceOf(Claimed.class, claim(k, h, session.getId(), BRANCH_ID)).claim();
        expireLease(a.attemptId());
        assertEquals("FAILED", attemptService.recoverIfExpired(a.attemptId()).orElseThrow().state().name(),
                "expired with no write evidence → FAILED (M2.2.3: ABANDONED is explicit only)");
        PosCheckoutClaim b = assertInstanceOf(Claimed.class, claim(k, h, session.getId(), BRANCH_ID)).claim();
        assertEquals(a.attemptId(), b.attemptId());
        assertEquals(2L, b.fence(), "reclaim bumps the fence");
        AtomicBoolean staleRan = new AtomicBoolean();
        SupersededException ex = assertThrows(SupersededException.class,
                () -> attemptService.step(a, "INVOICE_SAVE", () -> { staleRan.set(true); return null; }, null));
        assertFalse(staleRan.get(), "the stale owner's work must not run");
        e.put("staleAfterReclaim", ex.getMessage());
        attemptService.step(b, "INVOICE_SAVE", () -> null, null);
        attemptService.complete(b);
        e.put("afterReclaim", attemptRow(k));

        // STALLED: partial evidence, then the owner re-adopts; then an administrator releases it.
        PosSession s2 = openSession("STALL");
        String k2 = key("stall");
        PosCheckoutClaim c = assertInstanceOf(Claimed.class, claim(k2, hash(), s2.getId(), BRANCH_ID)).claim();
        attemptService.step(c, "INVOICE_SAVE", () -> null,
                ignored -> attemptService.evidenceInvoiceSaved(c, evidenceInvoiceId, "M2-EVIDENCE"));
        expireLease(c.attemptId());
        assertEquals("STALLED", attemptService.recoverIfExpired(c.attemptId()).orElseThrow().state().name(),
                "expired with surviving invoice evidence → STALLED, never COMPLETED");
        Map<String, Object> closeStalled = post("/api/pos/sessions/" + s2.getId() + "/close", "{}");
        assertEquals(409, closeStalled.get("status"), "a STALLED attempt blocks close");
        e.put("closeWhileStalled", withoutJson(closeStalled));
        attemptService.step(c, "POST", () -> null, null);
        assertEquals("ACTIVE", attemptRow(k2).get("state"), "the original owner re-adopts a STALLED attempt");
        expireLease(c.attemptId());
        attemptService.recoverIfExpired(c.attemptId());
        Map<String, Object> rel = post("/api/pos/checkout/attempts/" + c.attemptId() + "/release",
                "{\"reason\":\"M2 test: partial sale reviewed\"}");
        e.put("release", withoutJson(rel));
        assertEquals(200, rel.get("status"), String.valueOf(rel.get("body")));
        Map<String, Object> released = attemptRow(k2);
        assertEquals("RELEASED", released.get("state"));
        assertEquals(c.fence() + 1, ((Number) released.get("fence")).longValue());
        assertEquals("admin", released.get("resolved_by"));
        AtomicBoolean ranAfterRelease = new AtomicBoolean();
        assertThrows(SupersededException.class, () -> attemptService.step(c, "PAYMENT_LEG_1",
                () -> { ranAfterRelease.set(true); return null; }, null));
        assertFalse(ranAfterRelease.get());
        assertEquals(200, post("/api/pos/sessions/" + s2.getId() + "/close", "{}").get("status"),
                "after release the session closes");
        e.put("released", released);
        writeEvidence();
    }

    // ------------------------------------------------------------------ lease expiry during a long step, lock timeout

    @Test
    @Order(10)
    @DisplayName("lease expiry during a long-running step: recovery, release and close cannot act until it commits")
    void leaseExpiresDuringLongStep() throws Exception {
        Map<String, Object> e = section("lease_longStep");
        PosSession session = openSession("LONGSTEP");
        String k = key("longstep");
        PosCheckoutClaim d = assertInstanceOf(Claimed.class, claim(k, hash(), session.getId(), BRANCH_ID)).claim();
        long leaseMs = attemptService.leaseSeconds() * 1000;
        CountDownLatch inStep = new CountDownLatch(1);
        Future<Object> step = pool.submit(() -> attemptService.step(d, "INVOICE_SAVE", () -> {
            inStep.countDown();
            sleep(leaseMs + 6000); // outlive the lease while holding the attempt row lock
            return null;
        }, ignored -> attemptService.evidenceInvoiceSaved(d, evidenceInvoiceId, "M2-EVIDENCE")));
        assertTrue(inStep.await(10, TimeUnit.SECONDS));
        sleep(leaseMs + 800);
        Map<String, Object> during = attemptRow(k);
        e.put("rowDuringStep", during);
        assertEquals(Boolean.TRUE, during.get("lease_expired"), "the committed lease has expired while the step runs");
        long t0 = System.nanoTime();
        Optional<?> recovered = attemptService.recoverIfExpired(d.attemptId());
        long recoverMs = (System.nanoTime() - t0) / 1_000_000;
        e.put("recoverDuringStep", recovered.isPresent() ? "acted" : "busy (NOWAIT)");
        e.put("recoverDuringStepMs", recoverMs);
        assertTrue(recovered.isEmpty(), "recovery cannot lock the row of an in-flight step");
        assertTrue(recoverMs < 1500, "NOWAIT returns at once, it does not wait: " + recoverMs + "ms");
        assertEquals("ACTIVE", attemptRow(k).get("state"));
        Map<String, Object> release = post("/api/pos/checkout/attempts/" + d.attemptId() + "/release", "{\"reason\":\"too early\"}");
        e.put("releaseDuringStep", withoutJson(release));
        assertEquals(409, release.get("status"));
        assertTrue(String.valueOf(release.get("body")).contains("CHECKOUT_ATTEMPT_BUSY"));
        Map<String, Object> close = post("/api/pos/sessions/" + session.getId() + "/close", "{}");
        e.put("closeDuringStep", withoutJson(close));
        assertEquals(409, close.get("status"), "close is refused while the step is in flight");

        step.get(60, TimeUnit.SECONDS);
        Map<String, Object> after = attemptRow(k);
        e.put("rowAfterStep", after);
        assertNotNull(after.get("invoice_saved_at"), "the step's evidence committed with it");
        assertEquals("STALLED", attemptService.recoverIfExpired(d.attemptId()).orElseThrow().state().name(),
                "after the step commits, recovery classifies on its evidence");
        assertEquals(200, post("/api/pos/checkout/attempts/" + d.attemptId() + "/release",
                "{\"reason\":\"M2 test cleanup\"}").get("status"));
        writeEvidence();
    }

    @Test
    @Order(11)
    @DisplayName("lock timeout: a claim behind a held session lock gives up at lock_timeout with nothing written")
    void claimLockTimeout() throws Exception {
        Map<String, Object> e = section("lockTimeout");
        PosSession session = openSession("LOCKTIMEOUT");
        String k = key("locktimeout");
        long elapsed;
        ClaimResult r;
        Map<String, Object> httpBusy;
        try (Connection holder = holdSessionLock(session.getId())) {
            long t0 = System.nanoTime();
            r = claim(k, hash(), session.getId(), BRANCH_ID);
            elapsed = (System.nanoTime() - t0) / 1_000_000;
            httpBusy = post("/api/pos/checkout", cashSale(key("locktimeout-http"), session.getId(), session.getTerminalId(), 1, "CASH"));
            holder.rollback();
        }
        e.put("claim", r.toString());
        e.put("claimElapsedMs", elapsed);
        e.put("httpWhileLocked", withoutJson(httpBusy));
        e.put("poolLockTimeoutAfter", jdbc.queryForObject("select current_setting('lock_timeout')", String.class));
        assertInstanceOf(PosCheckoutAttemptService.Busy.class, r);
        assertTrue(elapsed >= 1900 && elapsed < 4500, "gave up at the 2 s lock_timeout, not before, not much after: " + elapsed);
        assertTrue(attemptRowOrNull(k) == null, "nothing written");
        assertEquals(409, httpBusy.get("status"));
        assertEquals("SESSION_BUSY", text((JsonNode) httpBusy.get("json"), "code"));
        assertTrue(jdbc.queryForList("select id from sales_invoices where pos_checkout_key = ?", Long.class,
                key("locktimeout-http")).isEmpty());
        assertEquals("0", jdbc.queryForObject("select current_setting('lock_timeout')", String.class),
                "SET LOCAL did not leak into pooled connections");
        writeEvidence();
    }

    // ------------------------------------------------------------------ 12. durability across restart / instances

    @Test
    @Order(12)
    @DisplayName("12/16: attempt state survives a killed connection and is seen by another instance (restart)")
    void attemptStateSurvivesCrashAndRestart() throws Exception {
        Map<String, Object> e = section("12_restart");
        PosSession session = openSession("RESTART");
        String k = key("restart");
        String h = hash();
        PosCheckoutClaim w = assertInstanceOf(Claimed.class, claim(k, h, session.getId(), BRANCH_ID)).claim();
        // The worker's step connection dies mid-step (process crash, network loss, OOM kill).
        AtomicLong pid = new AtomicLong();
        CountDownLatch inStep = new CountDownLatch(1);
        Future<Object> step = pool.submit(() -> attemptService.step(w, "INVOICE_SAVE", () -> {
            pid.set(jdbc.queryForObject("select pg_backend_pid()", Long.class));
            inStep.countDown();
            jdbc.queryForObject("select pg_sleep(30)", Object.class);
            return null;
        }, ignored -> attemptService.evidenceInvoiceSaved(w, evidenceInvoiceId, "M2-EVIDENCE")));
        assertTrue(inStep.await(10, TimeUnit.SECONDS));
        Boolean killed = jdbc.queryForObject("select pg_terminate_backend(?::int)", Boolean.class, pid.get());
        Exception stepFailure = assertThrows(Exception.class, () -> step.get(30, TimeUnit.SECONDS));
        e.put("killedBackend", Map.of("pid", pid.get(), "terminated", killed));
        e.put("workerSaw", abbreviate(String.valueOf(stepFailure.getCause())));
        Map<String, Object> afterCrash = attemptRow(k);
        e.put("rowAfterCrash", afterCrash);
        assertEquals("ACTIVE", afterCrash.get("state"), "the claim is durable");
        assertEquals("CLAIMED", afterCrash.get("last_step"), "the killed step's fence + evidence rolled back together");
        assertEquals(null, afterCrash.get("invoice_saved_at"));

        // A second service instance — another backend node, or this one after a restart.
        PosCheckoutAttemptService restarted = new PosCheckoutAttemptService(attemptRepository, sessionRepository, jdbc,
                transactionManager, 10, 2000);
        assertNotEquals(attemptService.instanceId(), restarted.instanceId());
        assertEquals("ACTIVE", restarted.find(k).orElseThrow().state().name());
        assertEquals(ConflictKind.IN_PROGRESS, assertInstanceOf(Conflict.class,
                restarted.claim(new ClaimRequest(k, h, BRANCH_ID, session.getId(), session.getTerminalId(), "admin", null),
                        locked -> PosCheckoutSessionGuard.checkOpen(locked))).kind(), "a live lease is respected by another instance");
        assertEquals(409, post("/api/pos/sessions/" + session.getId() + "/close", "{}").get("status"),
                "and the session stays protected");
        expireLease(w.attemptId());
        PosCheckoutClaim taken = assertInstanceOf(Claimed.class,
                restarted.claim(new ClaimRequest(k, h, BRANCH_ID, session.getId(), session.getTerminalId(), "admin", null),
                        locked -> PosCheckoutSessionGuard.checkOpen(locked))).claim();
        Map<String, Object> reclaimed = attemptRow(k);
        e.put("rowAfterReclaimByOtherInstance", reclaimed);
        assertEquals(restarted.instanceId(), reclaimed.get("owner_instance"));
        assertEquals(2L, taken.fence());
        assertThrows(SupersededException.class, () -> attemptService.step(w, "INVOICE_SAVE", () -> null, null),
                "the original worker, if it comes back, is fenced out");
        restarted.complete(taken);
        writeEvidence();
    }

    // ------------------------------------------------------------------ 13. scheduler

    @Test
    @Order(13)
    @DisplayName("13/16: scheduled idle suspension skips a session with an active attempt or a held lock")
    void schedulerRespectsAttempts() throws Exception {
        Map<String, Object> e = section("13_scheduler");
        PosSession session = openSession("SCHED");
        String k = key("sched");
        PosCheckoutClaim c = assertInstanceOf(Claimed.class, claim(k, hash(), session.getId(), BRANCH_ID)).claim();
        LocalDateTime longAgo = businessDayWindowService.clock().now().minusMinutes(30);
        jdbc.update("update pos_sessions set idle_timeout_minutes = 1, last_activity_at = ? where id = ?", longAgo, session.getId());

        PosSessionScheduler.Outcome withAttempt = scheduler.suspendIfDue(session.getId());
        e.put("withActiveAttempt", withAttempt);
        assertEquals(PosSessionScheduler.Outcome.SKIPPED_CHECKOUT_IN_PROGRESS, withAttempt);
        assertEquals("OPEN", sessionRow(session.getId()).get("status"));

        attemptService.complete(c);
        PosSessionScheduler.Outcome locked;
        long t0 = System.nanoTime();
        try (Connection holder = holdSessionLock(session.getId())) {
            locked = scheduler.suspendIfDue(session.getId());
            holder.rollback();
        }
        long lockedMs = (System.nanoTime() - t0) / 1_000_000;
        e.put("whileLocked", locked);
        e.put("whileLockedMs", lockedMs);
        assertEquals(PosSessionScheduler.Outcome.SKIPPED_LOCKED, locked);
        assertTrue(lockedMs < 1500, "SKIP LOCKED does not wait: " + lockedMs);

        PosSessionScheduler.Outcome free = scheduler.suspendIfDue(session.getId());
        e.put("afterComplete", free);
        // The real @Scheduled job runs in this context too and may have got there first.
        assertTrue(free == PosSessionScheduler.Outcome.SUSPENDED || free == PosSessionScheduler.Outcome.SKIPPED_NOT_DUE, free.name());
        assertEquals("SUSPENDED", sessionRow(session.getId()).get("status"));
        writeEvidence();
    }

    // ------------------------------------------------------------------ 14. transfer / takeover / handover (M2.1)

    @Test
    @Order(14)
    @DisplayName("M2.1 §1: transfer, takeover and owner handover are refused while an attempt is ACTIVE or STALLED")
    void transferTakeoverAndHandoverRefusedWhileAttemptHoldsSession() throws Exception {
        Map<String, Object> e = section("14_transfer_takeover_handover");
        PosSession session = openSession("XFER");
        PosTerminal destination = newTerminal("XFER-DEST", BRANCH_ID);
        String k = key("xfer");
        PosCheckoutClaim c = assertInstanceOf(Claimed.class, claim(k, hash(), session.getId(), BRANCH_ID)).claim();

        for (String state : List.of("ACTIVE", "STALLED")) {
            if ("STALLED".equals(state)) {
                attemptService.step(c, "INVOICE_SAVE", () -> null,
                        ignored -> attemptService.evidenceInvoiceSaved(c, evidenceInvoiceId, "M2-EVIDENCE"));
                expireLease(c.attemptId());
                assertEquals("STALLED", attemptService.recoverIfExpired(c.attemptId()).orElseThrow().state().name());
            }
            Map<String, Object> before = sessionRow(session.getId());
            Map<String, Object> takeover = post("/api/pos/sessions/" + session.getId() + "/supervisor-takeover",
                    "{\"supervisorPin\":\"" + TEST_SUPERVISOR_PIN + "\"}");
            Map<String, Object> transfer = post("/api/pos/sessions/" + session.getId() + "/transfer",
                    "{\"destinationTerminalId\":\"" + destination.getTerminalId() + "\",\"confirm\":true,"
                            + "\"reason\":\"M2.1 test\",\"supervisorPin\":\"" + TEST_SUPERVISOR_PIN + "\"}");
            Exception handover = assertThrows(Exception.class, () -> asUser("admin",
                    () -> { sessionService.reassignSessionOwner(session.getTerminalId(), "cashier1@test.com"); return null; }));
            e.put(state + "_takeover", withoutJson(takeover));
            e.put(state + "_transfer", withoutJson(transfer));
            e.put(state + "_handover", handover.getMessage());
            for (Map<String, Object> r : List.of(takeover, transfer)) {
                assertEquals(409, r.get("status"), state + ": " + r.get("body"));
                assertTrue(String.valueOf(r.get("body")).contains("SESSION_CHECKOUT_IN_PROGRESS"), String.valueOf(r.get("body")));
            }
            assertTrue(handover.getMessage().contains("SESSION_CHECKOUT_IN_PROGRESS"), handover.getMessage());
            Map<String, Object> after = sessionRow(session.getId());
            assertEquals(before.get("terminal_id"), after.get("terminal_id"), state + ": terminal unchanged");
            assertEquals(before.get("opened_by"), after.get("opened_by"), state + ": owner unchanged");
            assertEquals(state, attemptRow(k).get("state"));
        }
        // A handover to the user who already owns the session stays a no-op even now (it is reached
        // from every successful supervisor credential check, including a checkout's own override).
        asUser("admin", () -> { sessionService.reassignSessionOwner(session.getTerminalId(), "admin"); return null; });

        assertEquals(200, post("/api/pos/checkout/attempts/" + c.attemptId() + "/release",
                "{\"reason\":\"M2.1 test: reviewed\"}").get("status"));
        // With nothing blocking, both still wait for the session lock, then proceed.
        long holdMs = 1200;
        for (String op : List.of("takeover", "transfer")) {
            String body = "takeover".equals(op)
                    ? "{\"supervisorPin\":\"" + TEST_SUPERVISOR_PIN + "\"}"
                    : "{\"destinationTerminalId\":\"" + destination.getTerminalId() + "\",\"confirm\":true,\"supervisorPin\":\""
                            + TEST_SUPERVISOR_PIN + "\"}";
            String path = "/api/pos/sessions/" + session.getId() + ("takeover".equals(op) ? "/supervisor-takeover" : "/transfer");
            Future<Map<String, Object>> f;
            long t0;
            try (Connection holder = holdSessionLock(session.getId())) {
                t0 = System.nanoTime();
                f = pool.submit(() -> post(path, body));
                awaitLockWaiters(1);
                sleep(holdMs);
                holder.rollback();
            }
            Map<String, Object> r = f.get(30, TimeUnit.SECONDS);
            long waited = (System.nanoTime() - t0) / 1_000_000;
            e.put(op + "AfterRelease", Map.of("status", r.get("status"), "waitedMs", waited));
            assertEquals(200, r.get("status"), op + ": " + r.get("body"));
            assertTrue(waited >= holdMs, op + " waited for the session lock: " + waited);
        }
        writeEvidence();
    }

    // ------------------------------------------------------------------ M2.1 §6 bounded lock waits

    @Test
    @Order(16)
    @DisplayName("M2.1 §6: close, suspend, takeover and transfer give up at the session lock timeout with 409 SESSION_BUSY")
    void sessionTransitionsHaveBoundedLockWaits() throws Exception {
        Map<String, Object> e = section("16_boundedLockWaits");
        PosSession session = openSession("BOUNDED");
        PosTerminal destination = newTerminal("BOUNDED-DEST", BRANCH_ID);
        Map<String, String> ops = new LinkedHashMap<>();
        ops.put("close", "{}");
        ops.put("suspend", "{}");
        ops.put("supervisor-takeover", "{\"supervisorPin\":\"" + TEST_SUPERVISOR_PIN + "\"}");
        ops.put("transfer", "{\"destinationTerminalId\":\"" + destination.getTerminalId() + "\",\"confirm\":true,"
                + "\"supervisorPin\":\"" + TEST_SUPERVISOR_PIN + "\"}");
        try (Connection holder = holdSessionLock(session.getId())) {
            for (var op : ops.entrySet()) {
                long t0 = System.nanoTime();
                Map<String, Object> r = post("/api/pos/sessions/" + session.getId() + "/" + op.getKey(), op.getValue());
                long ms = (System.nanoTime() - t0) / 1_000_000;
                e.put(op.getKey(), Map.of("status", r.get("status"), "elapsedMs", ms, "body", abbreviate(String.valueOf(r.get("body")))));
                assertEquals(409, r.get("status"), op.getKey() + ": " + r.get("body"));
                assertTrue(String.valueOf(r.get("body")).contains("SESSION_BUSY"), String.valueOf(r.get("body")));
                assertTrue(ms >= 1900 && ms < 6000, op.getKey() + " gave up at the 2 s session lock timeout: " + ms);
            }
            holder.rollback();
        }
        Map<String, Object> row = sessionRow(session.getId());
        assertEquals("OPEN", row.get("status"), "nothing changed");
        assertEquals(session.getTerminalId(), row.get("terminal_id"));
        assertEquals("0", jdbc.queryForObject("select current_setting('lock_timeout')", String.class),
                "the transaction-local bound never leaks into a pooled connection");
        assertEquals(200, post("/api/pos/sessions/" + session.getId() + "/close", "{}").get("status"),
                "once the lock is free the same close succeeds");
        e.put("poolLockTimeoutAfter", jdbc.queryForObject("select current_setting('lock_timeout')", String.class));
        writeEvidence();
    }

    // ------------------------------------------------------------------ M2.1 §2 post-settlement fencing

    @Test
    @Order(17)
    @DisplayName("M2.1 §2: an owner superseded before each authoritative step cannot perform that step's write")
    void supersededBeforeEachAuthoritativeStep() throws Exception {
        Map<String, Object> e = section("17_supersedeBeforeStep");
        String serial = runId + "-SN";
        jdbc.update("insert into serial_master (serial_number, product_code, product_name, status, product_id, branch_code, "
                + "is_active, created_at, updated_at) select ?, code, name, 'AVAILABLE', id, 'BR-01', true, now(), now() "
                + "from products where code = ? and branch_id is null limit 1", serial, PRODUCT_CODE);
        assertEquals("CONFIRMED", soStatus(SALES_ORDER), "fixture: the Sales Order is takeable");

        for (String step : List.of("INVOICE_SAVE", "POST", "PAYMENT_LEG_1", "SESSION_RECORD", "SALES_ORDER", "SERIALS_MARK")) {
            PosSession session = openSession("SUP-" + step);
            String k = key("sup-" + step);
            String body = switch (step) {
                case "SALES_ORDER" -> salesOrderSale(k, session);
                case "SERIALS_MARK" -> serialSale(k, session, serial);
                default -> cashSale(k, session.getId(), session.getTerminalId(), 1, "CASH");
            };
            supersede.arm(k, step);
            Map<String, Object> res = post("/api/pos/checkout", body);
            supersede.disarm();
            Map<String, Object> s = new LinkedHashMap<>();
            e.put(step, s);
            s.put("response", withoutJson(res));
            s.put("hookFired", supersede.fired(k));
            List<Map<String, Object>> inv = jdbc.queryForList("select id, status, amount_paid from sales_invoices "
                    + "where pos_checkout_key = ?", k);
            inv.forEach(r -> createdInvoiceIds.add(((Number) r.get("id")).longValue()));
            s.put("invoices", inv);
            s.put("attempt", attemptRow(k));
            s.put("session", sessionRow(session.getId()));
            assertTrue(supersede.fired(k), step + ": the hook superseded the owner");
            assertEquals(409, res.get("status"), step + ": " + res.get("body"));
            assertEquals("CHECKOUT_ATTEMPT_SUPERSEDED", text((JsonNode) res.get("json"), "code"));
            assertEquals(step, text((JsonNode) res.get("json"), "stoppedAtStep"));
            assertEquals("RELEASED", attemptRow(k).get("state"), "the old owner left the new owner's record alone");
            Long invoiceId = inv.isEmpty() ? null : ((Number) inv.get(0).get("id")).longValue();
            String invoiceNumber = invoiceId == null ? null
                    : jdbc.queryForObject("select invoice_number from sales_invoices where id = ?", String.class, invoiceId);
            int payments = invoiceNumber == null ? 0 : jdbc.queryForObject(
                    "select count(*) from sales_payments where linked_invoice = ?", Integer.class, invoiceNumber);
            int dns = invoiceId == null ? 0 : jdbc.queryForObject(
                    "select count(*) from delivery_notes where sales_invoice_id = ?", Integer.class, invoiceId);
            int sessionInvoices = ((Number) sessionRow(session.getId()).get("invoice_count")).intValue();
            s.put("payments", payments);
            s.put("deliveryNotes", dns);
            switch (step) {
                case "INVOICE_SAVE" -> assertTrue(inv.isEmpty(), "no invoice was saved");
                case "POST" -> {
                    assertEquals("DRAFT", inv.get(0).get("status"), "not posted");
                    assertEquals(0, dns, "no delivery note / stock movement");
                }
                case "PAYMENT_LEG_1" -> assertEquals(0, payments, "no payment recorded");
                case "SESSION_RECORD" -> {
                    assertEquals(1, payments);
                    assertEquals(0, sessionInvoices, "session totals untouched");
                }
                case "SALES_ORDER" -> {
                    assertEquals(1, sessionInvoices);
                    // The POST step (auto delivery note) already moved the order to DELIVERED, under
                    // its own fence. The SALES_ORDER step's write is the conversion to INVOICED.
                    s.put("salesOrderStatus", soStatus(SALES_ORDER));
                    assertNotEquals("INVOICED", soStatus(SALES_ORDER), "the Sales Order was not converted");
                    assertEquals(null, attemptRow(k).get("sales_order_completed_at"));
                }
                case "SERIALS_MARK" -> {
                    // On a counter sale the POST step's delivery note already marks the serial SOLD
                    // with sold_invoice_id, under the POST fence. SERIALS_MARK's own write (the only
                    // one on a PI-flow delivery) stamps the invoice number and sold-at time.
                    Map<String, Object> sn = jdbc.queryForMap("select status, sold_invoice_id, sold_invoice_number, "
                            + "sold_at::text as sold_at from serial_master where serial_number = ?", serial);
                    s.put("serial", sn);
                    assertEquals(null, sn.get("sold_invoice_number"), "SERIALS_MARK did not run");
                    assertEquals(null, sn.get("sold_at"), "SERIALS_MARK did not run");
                    assertEquals(null, attemptRow(k).get("serials_marked_at"));
                }
                default -> throw new IllegalStateException(step);
            }
            if (!"INVOICE_SAVE".equals(step)) {
                Map<String, Object> close = post("/api/pos/sessions/" + session.getId() + "/close", "{}");
                s.put("closeAfter", close.get("status"));
            }
        }

        // Compensating delete: a sale whose card legs do not add up is saved, then refused; the
        // DRAFT is deleted under the fence. Superseded first, the old owner must leave it alone.
        PosSession session = openSession("SUP-COMPENSATE");
        String k = key("sup-COMPENSATE");
        supersede.arm(k, "COMPENSATE");
        Map<String, Object> res = post("/api/pos/checkout", cardLegMismatchSale(k, session));
        supersede.disarm();
        List<Long> drafts = jdbc.queryForList("select id from sales_invoices where pos_checkout_key = ? and status = 'DRAFT'",
                Long.class, k);
        createdInvoiceIds.addAll(drafts);
        e.put("COMPENSATE", Map.of("response", withoutJson(res), "hookFired", supersede.fired(k), "draftsLeft", drafts,
                "attempt", attemptRow(k)));
        assertTrue(supersede.fired(k));
        assertEquals(400, res.get("status"), "the original refusal is still what the till is told: " + res.get("body"));
        assertEquals(1, drafts.size(), "the superseded owner did not delete the DRAFT");
        assertEquals("RELEASED", attemptRow(k).get("state"));

        // Control: the same failing sale with nothing superseded deletes its DRAFT under the fence.
        String k2 = key("compensate-control");
        Map<String, Object> control = post("/api/pos/checkout", cardLegMismatchSale(k2, session));
        assertEquals(400, control.get("status"));
        assertTrue(jdbc.queryForList("select id from sales_invoices where pos_checkout_key = ?", Long.class, k2).isEmpty(),
                "the owner compensates when it still owns the attempt");
        assertEquals("FAILED", attemptRow(k2).get("state"));
        writeEvidence();
    }

    @Test
    @Order(18)
    @DisplayName("M2.1 §2: serial and post-completion evidence on a normal sale; post tasks run once")
    void postSettlementEvidenceAndOnceOnlyPostTasks() throws Exception {
        Map<String, Object> e = section("18_postSteps");
        String serial = runId + "-SN2";
        jdbc.update("insert into serial_master (serial_number, product_code, product_name, status, product_id, branch_code, "
                + "is_active, created_at, updated_at) select ?, code, name, 'AVAILABLE', id, 'BR-01', true, now(), now() "
                + "from products where code = ? and branch_id is null limit 1", serial, PRODUCT_CODE);
        PosSession session = openSession("POSTSTEPS");
        String k = key("poststeps");
        long statsBefore = jdbc.queryForObject("select coalesce(total_quantity_sold, 0) from products where code = ? "
                + "and branch_id is null limit 1", Long.class, PRODUCT_CODE);
        Map<String, Object> res = post("/api/pos/checkout", serialSale(k, session, serial));
        assertEquals(200, res.get("status"), String.valueOf(res.get("body")));
        createdInvoiceIds.add(((JsonNode) res.get("json")).get("id").asLong());
        Map<String, Object> a = attemptRow(k);
        e.put("attempt", a);
        assertEquals("COMPLETED", a.get("state"));
        assertEquals(Boolean.TRUE, a.get("serials_step_required"));
        assertNotNull(a.get("serials_marked_at"));
        assertEquals(Boolean.FALSE, a.get("sales_order_step_required"));
        assertNotNull(a.get("qr_archived_at"));
        assertNotNull(a.get("stats_recorded_at"));
        assertEquals("SOLD", jdbc.queryForObject("select status from serial_master where serial_number = ?", String.class, serial));
        long statsAfter = jdbc.queryForObject("select coalesce(total_quantity_sold, 0) from products where code = ? "
                + "and branch_id is null limit 1", Long.class, PRODUCT_CODE);
        assertEquals(statsBefore + 1, statsAfter, "stats recorded once");
        // Replays do not re-run a post task that already ran (the increment is not repeated).
        for (int i = 0; i < 2; i++) {
            assertEquals(200, post("/api/pos/checkout", serialSale(k, session, serial)).get("status"));
        }
        assertEquals(statsAfter, jdbc.queryForObject("select coalesce(total_quantity_sold, 0) from products where code = ? "
                + "and branch_id is null limit 1", Long.class, PRODUCT_CODE), "replays did not count the sale again");
        // A post task that did not run is run by the next replay, once.
        jdbc.update("update pos_checkout_attempts set stats_recorded_at = null where checkout_key = ?", k);
        assertEquals(200, post("/api/pos/checkout", serialSale(k, session, serial)).get("status"));
        assertNotNull(attemptRow(k).get("stats_recorded_at"));
        long statsRetried = jdbc.queryForObject("select coalesce(total_quantity_sold, 0) from products where code = ? "
                + "and branch_id is null limit 1", Long.class, PRODUCT_CODE);
        e.put("stats", Map.of("before", statsBefore, "after", statsAfter, "afterRetry", statsRetried));
        assertEquals(statsAfter + 1, statsRetried, "the missing task ran exactly once on replay");
        jdbc.update("update products set total_quantity_sold = ? where code = ? and branch_id is null", statsBefore, PRODUCT_CODE);
        writeEvidence();
    }

    // ------------------------------------------------------------------ M2.1 §4 keyless

    @Test
    @Order(19)
    @DisplayName("M2.1 §4 (amended by M2.2.1): a payment-taking checkout without a key is refused; so is a keyless "
            + "PI-Flow delivery with a session")
    void keylessCheckouts() throws Exception {
        // M2.2 still let a tenderless PI-Flow delivery order through without a key; M2.2.1 refuses it.
        assertEquals("PI_FLOW", jdbc.queryForObject("select delivery_workflow_mode from pos_settings where branch_id = ?",
                String.class, BRANCH_ID), "fixture: branch 1 issues delivery orders as Pro-forma Invoices");
        Map<String, Object> e = section("19_keyless");
        PosSession session = openSession("KEYLESS");
        Map<String, Object> b = json.readValue(cashSale("unused", session.getId(), session.getTerminalId(), 1, "CASH"), Map.class);
        b.remove("checkoutKey");
        Map<String, Long> before = tableCounts();
        Map<String, Object> paid = post("/api/pos/checkout", json.writeValueAsString(b));
        Map<String, Long> delta = delta(before, tableCounts());
        e.put("paidWithoutKey", withoutJson(paid));
        e.put("paidWithoutKeyDelta", delta);
        assertEquals(409, paid.get("status"));
        assertEquals("CHECKOUT_KEY_REQUIRED", text((JsonNode) paid.get("json"), "code"));
        assertNoBusinessWrites(delta);

        // A delivery order with the session open, no tender and no key: refused since M2.2.1.
        Map<String, Long> beforeDelivery = tableCounts();
        Map<String, Object> delivery = post("/api/pos/checkout", json.writeValueAsString(deliveryOrder(session.getId())));
        Map<String, Long> deliveryDelta = delta(beforeDelivery, tableCounts());
        e.put("tenderlessWithSession", withoutJson(delivery));
        e.put("tenderlessWithSessionDelta", deliveryDelta);
        assertEquals(409, delivery.get("status"), String.valueOf(delivery.get("body")));
        assertEquals("CHECKOUT_KEY_REQUIRED", text((JsonNode) delivery.get("json"), "code"));
        assertNoBusinessWrites(deliveryDelta);
        writeEvidence();
    }

    // ------------------------------------------------------------------ M2.2 §1 stable key on every sale

    @Test
    @Order(21)
    @DisplayName("M2.2 §3.1-3.2: keyless paid sale, keyless tenderless credit sale and keyless Default-Settlement "
            + "delivery are refused with no business writes")
    void keylessInvoiceProducingCheckoutsAreRefused() throws Exception {
        Map<String, Object> e = section("21_m22_keylessRefused");
        PosSession session = openSession("M22-KEYLESS");
        Map<String, Object> cases = new LinkedHashMap<>();
        Map<String, Object> paid = json.readValue(cashSale("unused", session.getId(), session.getTerminalId(), 1, "CASH"), Map.class);
        paid.remove("checkoutKey");
        cases.put("paidCashWithSession", paid);
        Map<String, Object> credit = creditSale(null, session.getId(), session.getTerminalId(), PRICE);
        cases.put("tenderlessCreditWithSession", credit);
        Map<String, Object> creditBlankKey = creditSale("   ", session.getId(), session.getTerminalId(), PRICE);
        cases.put("tenderlessCreditBlankKey", creditBlankKey);
        Map<String, Object> creditNoSession = creditSale(null, null, runId + "-NOSESSION", PRICE);
        cases.put("tenderlessCreditWithoutSession", creditNoSession);

        long attemptsBefore = jdbc.queryForObject("select count(*) from pos_checkout_attempts", Long.class);
        for (var c : cases.entrySet()) {
            Map<String, Long> before = tableCounts();
            Map<String, Object> res = post("/api/pos/checkout", json.writeValueAsString(c.getValue()));
            Map<String, Long> d = delta(before, tableCounts());
            e.put(c.getKey(), withoutJson(res));
            e.put(c.getKey() + "Delta", d);
            assertEquals(409, res.get("status"), c.getKey() + ": " + res.get("body"));
            assertEquals("CHECKOUT_KEY_REQUIRED", text((JsonNode) res.get("json"), "code"), c.getKey());
            assertEquals("false", text((JsonNode) res.get("json"), "recorded"), c.getKey());
            assertNoBusinessWrites(d);
        }

        // A Default-Settlement delivery order posts an invoice, stock and GL at dispatch: no key, no sale.
        setDeliveryMode("DEFAULT_SETTLEMENT");
        try {
            for (Long sessionId : java.util.Arrays.asList(session.getId(), null)) {
                Map<String, Object> d = deliveryOrder(sessionId);
                Map<String, Long> before = tableCounts();
                Map<String, Object> res = post("/api/pos/checkout", json.writeValueAsString(d));
                Map<String, Long> delta = delta(before, tableCounts());
                String label = "defaultSettlementDelivery_" + (sessionId == null ? "noSession" : "session");
                e.put(label, withoutJson(res));
                e.put(label + "Delta", delta);
                assertEquals(409, res.get("status"), label + ": " + res.get("body"));
                assertEquals("CHECKOUT_KEY_REQUIRED", text((JsonNode) res.get("json"), "code"), label);
                assertNoBusinessWrites(delta);
            }
        } finally {
            setDeliveryMode(originalDeliveryMode);
        }
        assertEquals(attemptsBefore, jdbc.queryForObject("select count(*) from pos_checkout_attempts", Long.class),
                "no refused request claimed anything");
        Map<String, Object> row = sessionRow(session.getId());
        assertEquals(0, ((Number) row.get("invoice_count")).intValue(), "the session recorded no sale");
        writeEvidence();
    }

    @Test
    @Order(22)
    @DisplayName("M2.2 §3.3-3.4: a keyed tenderless credit sale posts once and replays; the same key with a changed "
            + "tender or price is refused with no business writes")
    void keyedCreditSaleReplaysAndRefusesChangedPayloads() throws Exception {
        Map<String, Object> e = section("22_m22_creditReplay");
        PosSession session = openSession("M22-CREDIT");
        String k = key("m22-credit");
        Map<String, Object> credit = creditSale(k, session.getId(), session.getTerminalId(), PRICE);

        Map<String, Object> first = post("/api/pos/checkout", json.writeValueAsString(credit));
        e.put("first", withoutJson(first));
        assertEquals(200, first.get("status"), String.valueOf(first.get("body")));
        long invoiceId = ((JsonNode) first.get("json")).get("id").asLong();
        createdInvoiceIds.add(invoiceId);
        Map<String, Object> invoice = jdbc.queryForMap("select status, amount_paid, pos_checkout_key, pos_session_id "
                + "from sales_invoices where id = ?", invoiceId);
        e.put("invoice", invoice);
        assertEquals(k, invoice.get("pos_checkout_key"));
        assertEquals(0, new BigDecimal(String.valueOf(invoice.get("amount_paid"))).signum(), "nothing was collected");
        Map<String, Object> journal = attemptRow(k);
        e.put("journal", journal);
        assertEquals("CLIENT", journal.get("key_source"));
        assertEquals("COMPLETED", journal.get("state"));
        assertEquals(0, ((Number) journal.get("payment_legs_expected")).intValue());

        // Matching replay: the same invoice, nothing new written.
        Map<String, Long> before = tableCounts();
        Map<String, Object> replay = post("/api/pos/checkout", json.writeValueAsString(credit));
        Map<String, Long> replayDelta = delta(before, tableCounts());
        e.put("replay", withoutJson(replay));
        e.put("replayDelta", replayDelta);
        assertEquals(200, replay.get("status"), String.valueOf(replay.get("body")));
        assertEquals(invoiceId, ((JsonNode) replay.get("json")).get("id").asLong(), "the replay answers with the same sale");
        assertNoBusinessWrites(replayDelta);

        // Same key, changed tender (credit -> cash) and changed price: refused, nothing written.
        Map<String, Object> cash = new LinkedHashMap<>(credit);
        cash.put("paymentMode", "Cash");
        cash.put("paymentAllocations", List.of(Map.of("type", "CASH", "amount", PRICE)));
        Map<String, Object> repriced = new LinkedHashMap<>(credit);
        Map<String, Object> line = new LinkedHashMap<>(item(1));
        line.put("price", PRICE - 10);
        repriced.put("items", List.of(line));
        repriced.put("paymentAllocations", List.of(Map.of("type", "CREDIT", "amount", PRICE - 10)));
        for (var c : Map.of("changedTender", cash, "changedPrice", repriced).entrySet()) {
            Map<String, Long> b = tableCounts();
            Map<String, Object> res = post("/api/pos/checkout", json.writeValueAsString(c.getValue()));
            Map<String, Long> d = delta(b, tableCounts());
            e.put(c.getKey(), withoutJson(res));
            e.put(c.getKey() + "Delta", d);
            assertEquals(409, res.get("status"), c.getKey() + ": " + res.get("body"));
            assertEquals("CHECKOUT_KEY_REUSED", text((JsonNode) res.get("json"), "code"), c.getKey());
            assertNoBusinessWrites(d);
        }
        assertEquals(1, ((Number) sessionRow(session.getId()).get("invoice_count")).intValue(), "exactly one sale");
        assertEquals("COMPLETED", attemptRow(k).get("state"));
        writeEvidence();
    }

    @Test
    @Order(23)
    @DisplayName("M2.2 §3.5: a keyed Default-Settlement delivery posts once and replays (the PI-Flow half moved to "
            + "M2.2.1, Orders 27-30)")
    void deliveryCompatibility() throws Exception {
        Map<String, Object> e = section("23_m22_delivery");
        PosSession session = openSession("M22-PI");

        // The till now sends a key on every delivery order (POSSales.jsx handleOutForDelivery).
        setDeliveryMode("DEFAULT_SETTLEMENT");
        try {
            String k = key("m22-default-delivery");
            Map<String, Object> d = deliveryOrder(session.getId(), k);
            Map<String, Object> first = post("/api/pos/checkout", json.writeValueAsString(d));
            e.put("defaultSettlementKeyed", withoutJson(first));
            assertEquals(200, first.get("status"), String.valueOf(first.get("body")));
            long id = ((JsonNode) first.get("json")).get("id").asLong();
            createdInvoiceIds.add(id);
            assertFalse(((JsonNode) first.get("json")).path("posProformaPending").asBoolean(false), "a real invoice");
            assertEquals("CLIENT", attemptRow(k).get("key_source"));
            Map<String, Long> before = tableCounts();
            Map<String, Object> replay = post("/api/pos/checkout", json.writeValueAsString(d));
            Map<String, Long> replayDelta = delta(before, tableCounts());
            e.put("defaultSettlementReplayDelta", replayDelta);
            assertEquals(200, replay.get("status"), String.valueOf(replay.get("body")));
            assertEquals(id, ((JsonNode) replay.get("json")).get("id").asLong());
            assertNoBusinessWrites(replayDelta);
        } finally {
            setDeliveryMode(originalDeliveryMode);
        }
        writeEvidence();
    }

    // ------------------------------------------------------------------ M2.2 §2 approval is not handover

    @Test
    @Order(24)
    @DisplayName("M2.2 §3.6/3.8: supervisor approvals (supervisor-auth, verify-pin, checkout price override) during an "
            + "ACTIVE and a STALLED attempt change no session owner")
    void supervisorApprovalsNeverMoveTheSession() throws Exception {
        Map<String, Object> e = section("24_m22_approvalNoOwnerChange");
        PosSession session = openSession("M22-APPROVE");
        String cashierToken = tokenFor(CASHIER, BRANCH_ID);
        String k = key("m22-approve-blocker");
        PosCheckoutClaim c = assertInstanceOf(Claimed.class, claim(k, hash(), session.getId(), BRANCH_ID)).claim();
        assertEquals("admin", sessionRow(session.getId()).get("opened_by"), "fixture: admin owns the session");

        for (String state : List.of("ACTIVE", "STALLED")) {
            if ("STALLED".equals(state)) makeStalled(c);
            Map<String, Object> s = section("24_m22_" + state);

            Map<String, Long> before = tableCounts();
            Map<String, Object> auth = postAs(cashierToken, "/api/pos/settings/supervisor-auth", json.writeValueAsString(Map.of(
                    "email", "admin@billbull.app", "password", TEST_SUPERVISOR_PASSWORD,
                    "terminalId", session.getTerminalId(), "lockedBy", CASHIER)));
            Map<String, Object> pin = postAs(cashierToken, "/api/pos/settings/verify-pin",
                    json.writeValueAsString(Map.of("pin", TEST_SUPERVISOR_PIN)));
            Map<String, Long> authDelta = delta(before, tableCounts());
            s.put("supervisorAuth", withoutJson(auth));
            s.put("verifyPin", withoutJson(pin));
            s.put("authDelta", authDelta);
            assertEquals(200, auth.get("status"), state + ": " + auth.get("body"));
            assertEquals("true", text((JsonNode) auth.get("json"), "valid"), state + ": " + auth.get("body"));
            assertEquals(200, pin.get("status"), state + ": " + pin.get("body"));
            assertEquals("true", text((JsonNode) pin.get("json"), "valid"), state + ": " + pin.get("body"));
            assertNoBusinessWrites(authDelta);
            assertEquals("admin", sessionRow(session.getId()).get("opened_by"), state + ": supervisor-auth moved no session");

            // The checkout's own price-override approval, by a cashier who lacks pos_price_override.
            String saleKey = key("m22-override-" + state);
            Map<String, Object> sale = json.readValue(cashSale(saleKey, session.getId(), session.getTerminalId(), 1, "CASH"), Map.class);
            Map<String, Object> line = new LinkedHashMap<>(item(1));
            line.put("price", BELOW_MIN_PRICE);
            sale.put("items", List.of(line));
            sale.put("paymentAllocations", List.of(Map.of("type", "CASH", "amount", BELOW_MIN_PRICE)));
            Map<String, Object> unapproved = postAs(cashierToken, "/api/pos/checkout", json.writeValueAsString(sale));
            s.put("overrideWithoutApproval", withoutJson(unapproved));
            assertEquals(403, unapproved.get("status"), "fixture: the line really needs an override: " + unapproved.get("body"));
            sale.put("checkoutKey", saleKey + "-approved");
            sale.put("supervisorOverrideEmail", "admin@billbull.app");
            sale.put("supervisorOverridePassword", TEST_SUPERVISOR_PASSWORD);
            Map<String, Object> approved = postAs(cashierToken, "/api/pos/checkout", json.writeValueAsString(sale));
            s.put("overrideApproved", withoutJson(approved));
            assertEquals(200, approved.get("status"), state + ": " + approved.get("body"));
            createdInvoiceIds.add(((JsonNode) approved.get("json")).get("id").asLong());
            assertEquals("COMPLETED", attemptRow(saleKey + "-approved").get("state"));
            assertEquals("admin", sessionRow(session.getId()).get("opened_by"), state + ": the override approval moved no session");
            assertEquals(state, attemptRow(k).get("state"), state + ": the blocking attempt is untouched");
        }
        assertEquals(200, post("/api/pos/checkout/attempts/" + c.attemptId() + "/release",
                "{\"reason\":\"M2.2 test: reviewed\"}").get("status"));
        writeEvidence();
    }

    @Test
    @Order(25)
    @DisplayName("M2.2 §3.7/3.8: explicit handover and takeover are refused while an attempt is ACTIVE or STALLED, "
            + "and work once it is released")
    void explicitOwnershipChangesKeepTheBarrier() throws Exception {
        Map<String, Object> e = section("25_m22_handover");
        PosSession session = openSession("M22-HANDOVER");
        String cashierToken = tokenFor(CASHIER, BRANCH_ID);
        String k = key("m22-handover-blocker");
        PosCheckoutClaim c = assertInstanceOf(Claimed.class, claim(k, hash(), session.getId(), BRANCH_ID)).claim();
        String handoverBody = json.writeValueAsString(Map.of("email", "admin@billbull.app", "password", TEST_SUPERVISOR_PASSWORD,
                "terminalId", session.getTerminalId(), "lockedBy", "admin"));

        for (String state : List.of("ACTIVE", "STALLED")) {
            if ("STALLED".equals(state)) makeStalled(c);
            Map<String, Long> before = tableCounts();
            Map<String, Object> handover = postAs(cashierToken, "/api/pos/settings/supervisor-handover", handoverBody);
            Map<String, Object> takeover = postAs(cashierToken, "/api/pos/sessions/" + session.getId() + "/supervisor-takeover",
                    "{\"supervisorPin\":\"" + TEST_SUPERVISOR_PIN + "\"}");
            Map<String, Long> d = delta(before, tableCounts());
            e.put(state + "_handover", withoutJson(handover));
            e.put(state + "_takeover", withoutJson(takeover));
            e.put(state + "_delta", d);
            for (Map<String, Object> r : List.of(handover, takeover)) {
                assertEquals(409, r.get("status"), state + ": " + r.get("body"));
                assertTrue(String.valueOf(r.get("body")).contains("SESSION_CHECKOUT_IN_PROGRESS"), String.valueOf(r.get("body")));
            }
            assertNoBusinessWrites(d);
            assertEquals("admin", sessionRow(session.getId()).get("opened_by"), state + ": owner unchanged");
            assertEquals(state, attemptRow(k).get("state"));
        }

        assertEquals(200, post("/api/pos/checkout/attempts/" + c.attemptId() + "/release",
                "{\"reason\":\"M2.2 test: reviewed\"}").get("status"));
        Map<String, Object> after = postAs(cashierToken, "/api/pos/settings/supervisor-handover", handoverBody);
        e.put("handoverAfterRelease", withoutJson(after));
        assertEquals(200, after.get("status"), String.valueOf(after.get("body")));
        assertEquals("true", text((JsonNode) after.get("json"), "valid"));
        assertEquals(CASHIER, sessionRow(session.getId()).get("opened_by"), "the explicit handover moved the session");
        writeEvidence();
    }

    @Test
    @Order(26)
    @DisplayName("M2.2 §2: a delivery settled by a cashier on a supervisor's approval still converts and collects, "
            + "and moves no session")
    void deliverySettlementStaysCompatible() throws Exception {
        Map<String, Object> e = section("26_m22_deliverySettlement");
        PosSession session = openSession("M22-SETTLE");
        String cashierToken = tokenFor(CASHIER, BRANCH_ID);
        // Admin sends the order out (a sessionless PI, keyed as the till sends it since M2.2.1); the
        // cashier, who did not create it, settles it on admin's session with a supervisor's approval.
        Map<String, Object> issued = post("/api/pos/checkout", json.writeValueAsString(deliveryOrder(null, key("m22-settle-pi"))));
        e.put("issued", withoutJson(issued));
        assertEquals(200, issued.get("status"), String.valueOf(issued.get("body")));
        long id = ((JsonNode) issued.get("json")).get("id").asLong();
        createdInvoiceIds.add(id);
        assertTrue(((JsonNode) issued.get("json")).get("posProformaPending").asBoolean(), "issued as a PI");
        String path = "/api/pos/checkout/deliveries/" + id + "/settle";

        Map<String, Object> settle = new LinkedHashMap<>();
        settle.put("paymentMode", "Cash");
        settle.put("sessionId", session.getId());
        settle.put("terminalId", session.getTerminalId());
        settle.put("branchId", BRANCH_ID);
        Map<String, Long> before = tableCounts();
        Map<String, Object> unapproved = postAs(cashierToken, path, json.writeValueAsString(withTotal(settle, id)));
        Map<String, Long> unapprovedDelta = delta(before, tableCounts());
        e.put("withoutApproval", withoutJson(unapproved));
        e.put("withoutApprovalDelta", unapprovedDelta);
        assertEquals(403, unapproved.get("status"), "fixture: a non-owner needs a supervisor: " + unapproved.get("body"));
        assertNoBusinessWrites(unapprovedDelta);

        settle.put("supervisorOverrideEmail", "admin@billbull.app");
        settle.put("supervisorOverridePassword", TEST_SUPERVISOR_PASSWORD);
        Map<String, Object> res = postAs(cashierToken, path, json.writeValueAsString(withTotal(settle, id)));
        e.put("settled", withoutJson(res));
        assertEquals(200, res.get("status"), String.valueOf(res.get("body")));
        Map<String, Object> inv = jdbc.queryForMap("select status, amount_paid, invoice_total, pos_proforma_pending "
                + "from sales_invoices where id = ?", id);
        e.put("invoiceAfter", inv);
        assertEquals("PAID", String.valueOf(inv.get("status")));
        assertNotEquals(Boolean.TRUE, inv.get("pos_proforma_pending"), "settling converted the PI");
        assertEquals(1L, jdbc.queryForObject("select count(*) from sales_payments where linked_invoice = "
                + "(select invoice_number from sales_invoices where id = ?) and pos_session_id = ?", Long.class, id, session.getId()),
                "the collection is attributed to the settling session");
        assertEquals("admin", sessionRow(session.getId()).get("opened_by"),
                "the settlement's supervisor approval moved no session (before M2.2 it handed it to the cashier)");
        writeEvidence();
    }

    // ------------------------------------------------------------------ M2.2.1 keyed PI-Flow delivery

    /** What a PI-Flow delivery order must never write when it is issued (it posts only on conversion). */
    private static final List<String> PI_PROHIBITED_TABLES = List.of("journal_entries", "journal_lines", "ledger_entries",
            "stock_movements", "sales_payments", "sales_receipt_vouchers", "delivery_notes", "delivery_note_items",
            "delivery_note_batch_consumptions");

    private static void assertNoPiPostings(String label, Map<String, Long> d) {
        List<String> posted = PI_PROHIBITED_TABLES.stream().filter(d::containsKey).toList();
        assertTrue(posted.isEmpty(), label + ": a Pro-forma Invoice posted to " + posted + " " + d);
    }

    private long invoicesWithKey(String k) {
        return jdbc.queryForObject("select count(*) from sales_invoices where pos_checkout_key = ?", Long.class, k);
    }

    @Test
    @Order(27)
    @DisplayName("M2.2.1 §5.1-5.2: a keyless (or blank-key) PI-Flow delivery is refused with and without a session; "
            + "nothing but audit is written")
    void keylessPiDeliveryIsRefused() throws Exception {
        Map<String, Object> e = section("27_m221_keylessPi");
        assertEquals("PI_FLOW", originalDeliveryMode, "fixture: branch 1 is on PI Flow");
        PosSession session = openSession("M221-KEYLESS");
        String serial = runId + "-SN-PI0";
        jdbc.update("insert into serial_master (serial_number, product_code, product_name, status, product_id, branch_code, "
                + "is_active, created_at, updated_at) select ?, code, name, 'AVAILABLE', id, 'BR-01', true, now(), now() "
                + "from products where code = ? and branch_id is null limit 1", serial, PRODUCT_CODE);
        long attemptsBefore = jdbc.queryForObject("select count(*) from pos_checkout_attempts", Long.class);
        for (Long sessionId : java.util.Arrays.asList(session.getId(), null)) {
            for (String k : java.util.Arrays.asList(null, "", "   ")) {
                String label = (sessionId == null ? "noSession" : "session") + "_key[" + k + "]";
                Map<String, Object> d = deliveryOrder(sessionId, k);
                @SuppressWarnings("unchecked")
                Map<String, Object> line = ((List<Map<String, Object>>) d.get("items")).get(0);
                Map<String, Object> serialLine = new LinkedHashMap<>(line);
                serialLine.put("serialNumber", serial);
                d.put("items", List.of(serialLine));
                Map<String, Long> before = tableCounts();
                Map<String, Object> res = post("/api/pos/checkout", json.writeValueAsString(d));
                Map<String, Long> d2 = delta(before, tableCounts());
                e.put(label, withoutJson(res));
                e.put(label + "Delta", d2);
                assertEquals(409, res.get("status"), label + ": " + res.get("body"));
                assertEquals("CHECKOUT_KEY_REQUIRED", text((JsonNode) res.get("json"), "code"), label);
                assertEquals("false", text((JsonNode) res.get("json"), "recorded"), label);
                assertNoBusinessWrites(d2);
            }
        }
        assertEquals(attemptsBefore, jdbc.queryForObject("select count(*) from pos_checkout_attempts", Long.class),
                "no refused request wrote an attempt");
        Map<String, Object> sn = jdbc.queryForMap("select status, sold_invoice_number from serial_master where serial_number = ?", serial);
        e.put("serialAfter", sn);
        assertEquals("AVAILABLE", sn.get("status"), "no refused request marked the serial sold");
        assertEquals(null, sn.get("sold_invoice_number"));
        assertEquals(0, ((Number) sessionRow(session.getId()).get("invoice_count")).intValue());
        assertEquals(0L, jdbc.queryForObject("select count(*) from sales_invoices where pos_session_id = ?", Long.class, session.getId()));
        writeEvidence();
    }

    @Test
    @Order(28)
    @DisplayName("M2.2.1 §5.3-5.6, 5.9: a keyed PI-Flow delivery (with and without a session) issues once, posts no "
            + "GL/stock/payment, replays, and refuses a changed line under the same key")
    void keyedPiDeliveryIssuesOnceAndReplays() throws Exception {
        Map<String, Object> e = section("28_m221_keyedPi");
        PosSession session = openSession("M221-PI");
        for (Long sessionId : java.util.Arrays.asList(session.getId(), null)) {
            String label = sessionId == null ? "noSession" : "session";
            String k = key("m221-pi-" + label);
            Map<String, Object> d = deliveryOrder(sessionId, k);

            Map<String, Long> before = tableCounts();
            Map<String, Object> first = post("/api/pos/checkout", json.writeValueAsString(d));
            Map<String, Long> firstDelta = delta(before, tableCounts());
            e.put(label + "_first", withoutJson(first));
            e.put(label + "_firstDelta", firstDelta);
            assertEquals(200, first.get("status"), label + ": " + first.get("body"));
            JsonNode node = (JsonNode) first.get("json");
            long id = node.get("id").asLong();
            createdInvoiceIds.add(id);
            assertTrue(node.get("posProformaPending").asBoolean(), label + ": issued as a Pro-forma Invoice");
            assertNoPiPostings(label, firstDelta);
            Map<String, Object> inv = jdbc.queryForMap("select status, amount_paid, pos_proforma_pending, pos_checkout_key, "
                    + "pos_session_id from sales_invoices where id = ?", id);
            e.put(label + "_invoice", inv);
            assertEquals(k, inv.get("pos_checkout_key"));
            assertEquals(Boolean.TRUE, inv.get("pos_proforma_pending"));
            assertEquals(0, new BigDecimal(String.valueOf(inv.get("amount_paid"))).signum(), label + ": nothing collected");
            Map<String, Object> journal = attemptRow(k);
            e.put(label + "_journal", journal);
            assertEquals("CLIENT", journal.get("key_source"));
            assertEquals("COMPLETED", journal.get("state"));
            assertEquals(id, ((Number) journal.get("invoice_id")).longValue());
            if (sessionId == null) assertEquals(null, journal.get("session_id"));
            else assertEquals(sessionId, ((Number) journal.get("session_id")).longValue());

            // Same key, same order: the original PI, nothing new.
            Map<String, Long> b2 = tableCounts();
            Map<String, Object> replay = post("/api/pos/checkout", json.writeValueAsString(d));
            Map<String, Long> replayDelta = delta(b2, tableCounts());
            e.put(label + "_replayDelta", replayDelta);
            assertEquals(200, replay.get("status"), label + ": " + replay.get("body"));
            assertEquals(id, ((JsonNode) replay.get("json")).get("id").asLong(), label + ": replay answers with the same PI");
            assertNoBusinessWrites(replayDelta);

            // Same key, changed line (quantity 2): refused, nothing written.
            Map<String, Object> changed = new LinkedHashMap<>(d);
            changed.put("items", List.of(item(2)));
            Map<String, Long> b3 = tableCounts();
            Map<String, Object> reused = post("/api/pos/checkout", json.writeValueAsString(changed));
            Map<String, Long> reusedDelta = delta(b3, tableCounts());
            e.put(label + "_changedLine", withoutJson(reused));
            e.put(label + "_changedLineDelta", reusedDelta);
            assertEquals(409, reused.get("status"), label + ": " + reused.get("body"));
            assertEquals("CHECKOUT_KEY_REUSED", text((JsonNode) reused.get("json"), "code"), label);
            assertNoBusinessWrites(reusedDelta);

            // A new key is a genuinely new order.
            String k2 = key("m221-pi-" + label + "-second");
            Map<String, Object> second = post("/api/pos/checkout", json.writeValueAsString(deliveryOrder(sessionId, k2)));
            assertEquals(200, second.get("status"), label + ": " + second.get("body"));
            long id2 = ((JsonNode) second.get("json")).get("id").asLong();
            createdInvoiceIds.add(id2);
            assertNotEquals(id, id2, label + ": a new key issues a new PI");
            assertEquals(1L, invoicesWithKey(k));
            assertEquals(1L, invoicesWithKey(k2));
        }
        writeEvidence();
    }

    @Test
    @Order(29)
    @DisplayName("M2.2.1 §5.6: the same key with a changed serial allocation is refused; the second serial stays "
            + "AVAILABLE and the PI keeps the first")
    void changedSerialUnderSameKeyIsRefused() throws Exception {
        Map<String, Object> e = section("29_m221_serial");
        PosSession session = openSession("M221-SERIAL");
        String sn1 = runId + "-SN-PI1";
        String sn2 = runId + "-SN-PI2";
        for (String s : List.of(sn1, sn2)) {
            jdbc.update("insert into serial_master (serial_number, product_code, product_name, status, product_id, branch_code, "
                    + "is_active, created_at, updated_at) select ?, code, name, 'AVAILABLE', id, 'BR-01', true, now(), now() "
                    + "from products where code = ? and branch_id is null limit 1", s, PRODUCT_CODE);
        }
        String k = key("m221-pi-serial");
        Map<String, Object> d = deliveryOrder(session.getId(), k);
        Map<String, Object> line = new LinkedHashMap<>(item(1));
        line.put("serialNumber", sn1);
        d.put("items", List.of(line));

        Map<String, Long> before = tableCounts();
        Map<String, Object> first = post("/api/pos/checkout", json.writeValueAsString(d));
        Map<String, Long> firstDelta = delta(before, tableCounts());
        e.put("first", withoutJson(first));
        e.put("firstDelta", firstDelta);
        assertEquals(200, first.get("status"), String.valueOf(first.get("body")));
        long id = ((JsonNode) first.get("json")).get("id").asLong();
        createdInvoiceIds.add(id);
        assertNoPiPostings("serial PI", firstDelta);
        // Existing PI behaviour: the serial leaves with the driver, so it is marked sold at issue.
        assertEquals("SOLD", jdbc.queryForObject("select status from serial_master where serial_number = ?", String.class, sn1));
        assertNotNull(attemptRow(k).get("serials_marked_at"));

        Map<String, Object> reallocated = new LinkedHashMap<>(d);
        Map<String, Object> line2 = new LinkedHashMap<>(line);
        line2.put("serialNumber", sn2);
        reallocated.put("items", List.of(line2));
        Map<String, Long> b2 = tableCounts();
        Map<String, Object> res = post("/api/pos/checkout", json.writeValueAsString(reallocated));
        Map<String, Long> d2 = delta(b2, tableCounts());
        e.put("changedSerial", withoutJson(res));
        e.put("changedSerialDelta", d2);
        assertEquals(409, res.get("status"), String.valueOf(res.get("body")));
        assertEquals("CHECKOUT_KEY_REUSED", text((JsonNode) res.get("json"), "code"));
        assertNoBusinessWrites(d2);
        Map<String, Object> s2 = jdbc.queryForMap("select status, sold_invoice_number from serial_master where serial_number = ?", sn2);
        e.put("serial2After", s2);
        assertEquals("AVAILABLE", s2.get("status"), "the refused request did not mark the other serial sold");
        assertEquals("SOLD", jdbc.queryForObject("select status from serial_master where serial_number = ?", String.class, sn1));

        Map<String, Object> replay = post("/api/pos/checkout", json.writeValueAsString(d));
        assertEquals(200, replay.get("status"), String.valueOf(replay.get("body")));
        assertEquals(id, ((JsonNode) replay.get("json")).get("id").asLong());
        assertEquals(1L, invoicesWithKey(k));
        writeEvidence();
    }

    @Test
    @Order(30)
    @DisplayName("M2.2.1 §5.7: a PI whose HTTP response was lost (client timeout mid-issue) is answered with the same "
            + "PI on retry with the same key")
    void retryAfterLostResponseReplaysThePi() throws Exception {
        Map<String, Object> e = section("30_m221_lostResponse");
        PosSession session = openSession("M221-LOST");
        String k = key("m221-pi-lost");
        String body = json.writeValueAsString(deliveryOrder(session.getId(), k));
        supersede.armPause(k, "PROFORMA_ISSUE");
        boolean timedOut;
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/pos/checkout"))
                    .timeout(Duration.ofSeconds(2))
                    .header("Authorization", "Bearer " + token)
                    .header("X-Branch-Id", String.valueOf(BRANCH_ID))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            try {
                http.send(req, HttpResponse.BodyHandlers.ofString());
                timedOut = false;
            } catch (java.net.http.HttpTimeoutException lost) {
                timedOut = true;
            }
            assertTrue(supersede.awaitPaused(5), "the server was issuing the PI when the client gave up");
            e.put("stateWhileLost", attemptRow(k).get("state"));
        } finally {
            supersede.resumePaused();
        }
        assertTrue(timedOut, "fixture: the client never saw the response");
        String state = null;
        for (int i = 0; i < 60 && !"COMPLETED".equals(state); i++) {
            Thread.sleep(250);
            state = String.valueOf(attemptRow(k).get("state"));
        }
        e.put("stateAfterServerFinished", state);
        assertEquals("COMPLETED", state, "the server finished the PI after the client left");
        assertEquals(1L, invoicesWithKey(k));
        long id = jdbc.queryForObject("select id from sales_invoices where pos_checkout_key = ?", Long.class, k);
        createdInvoiceIds.add(id);

        Map<String, Long> before = tableCounts();
        Map<String, Object> retry = post("/api/pos/checkout", body);
        Map<String, Long> d = delta(before, tableCounts());
        e.put("retry", withoutJson(retry));
        e.put("retryDelta", d);
        assertEquals(200, retry.get("status"), String.valueOf(retry.get("body")));
        assertEquals(id, ((JsonNode) retry.get("json")).get("id").asLong(), "the retry is answered with the PI already issued");
        assertTrue(((JsonNode) retry.get("json")).get("posProformaPending").asBoolean());
        assertNoBusinessWrites(d);
        assertEquals(1L, invoicesWithKey(k));
        writeEvidence();
    }

    @Test
    @Order(31)
    @DisplayName("M2.2.1 §5.8: a duplicate PI submission while the original is unresolved is answered "
            + "CHECKOUT_IN_PROGRESS with nothing written; after it finishes the duplicate replays the one PI")
    void duplicateWhileUnresolvedIsHeldOff() throws Exception {
        Map<String, Object> e = section("31_m221_duplicate");
        PosSession session = openSession("M221-DUP");
        String k = key("m221-pi-dup");
        String body = json.writeValueAsString(deliveryOrder(session.getId(), k));
        supersede.armPause(k, "PROFORMA_ISSUE");
        Future<Map<String, Object>> original;
        try {
            original = pool.submit(() -> post("/api/pos/checkout", body));
            assertTrue(supersede.awaitPaused(10), "the original reached PROFORMA_ISSUE");
            Map<String, Long> before = tableCounts();
            Map<String, Object> dup = post("/api/pos/checkout", body);
            Map<String, Long> d = delta(before, tableCounts());
            e.put("duplicate", withoutJson(dup));
            e.put("duplicateDelta", d);
            assertEquals(409, dup.get("status"), String.valueOf(dup.get("body")));
            assertEquals("CHECKOUT_IN_PROGRESS", text((JsonNode) dup.get("json"), "code"));
            assertEquals("true", text((JsonNode) dup.get("json"), "retryable"));
            assertNoBusinessWrites(d);
            assertEquals(1L, invoicesWithKey(k), "only the original's draft exists");
        } finally {
            supersede.resumePaused();
        }
        Map<String, Object> res = original.get(30, TimeUnit.SECONDS);
        e.put("original", withoutJson(res));
        assertEquals(200, res.get("status"), String.valueOf(res.get("body")));
        long id = ((JsonNode) res.get("json")).get("id").asLong();
        createdInvoiceIds.add(id);
        assertEquals("COMPLETED", attemptRow(k).get("state"));

        Map<String, Long> before = tableCounts();
        Map<String, Object> again = post("/api/pos/checkout", body);
        Map<String, Long> d = delta(before, tableCounts());
        e.put("duplicateAfter", withoutJson(again));
        e.put("duplicateAfterDelta", d);
        assertEquals(200, again.get("status"), String.valueOf(again.get("body")));
        assertEquals(id, ((JsonNode) again.get("json")).get("id").asLong());
        assertNoBusinessWrites(d);
        assertEquals(1L, invoicesWithKey(k));
        assertEquals(1L, jdbc.queryForObject("select count(*) from sales_invoices where pos_session_id = ?", Long.class,
                session.getId()), "exactly one PI on the session");
        writeEvidence();
    }

    private Map<String, Object> withTotal(Map<String, Object> settle, long invoiceId) {
        double total = jdbc.queryForObject("select invoice_total from sales_invoices where id = ?", BigDecimal.class, invoiceId)
                .doubleValue();
        Map<String, Object> b = new LinkedHashMap<>(settle);
        b.put("cashAmount", total);
        b.put("amountTendered", total);
        b.put("paymentAllocations", List.of(Map.of("type", "CASH", "amount", total)));
        return b;
    }

    private Map<String, Object> creditSale(String key, Long sessionId, String terminalId, double price) {
        Map<String, Object> b = new LinkedHashMap<>();
        if (key != null) b.put("checkoutKey", key);
        b.put("customerCode", DELIVERY_CUSTOMER);
        b.put("customerName", "M2.2 credit customer");
        b.put("paymentMode", "Credit");
        b.put("branchId", BRANCH_ID);
        b.put("branchCode", "BR-01");
        b.put("sessionId", sessionId);
        b.put("terminalId", terminalId);
        b.put("counterName", "M2");
        b.put("salespersonEmployeeCode", SALESPERSON);
        b.put("taxInclusive", true);
        Map<String, Object> line = new LinkedHashMap<>(item(1));
        line.put("price", price);
        b.put("items", List.of(line));
        b.put("paymentAllocations", List.of(Map.of("type", "CREDIT", "amount", price)));
        return b;
    }

    private void setDeliveryMode(String mode) {
        assertEquals(1, jdbc.update("update pos_settings set delivery_workflow_mode = ? where branch_id = ?", mode, BRANCH_ID));
    }

    /** Moves a claimed attempt to STALLED: write evidence, then lease expiry and recovery. */
    private void makeStalled(PosCheckoutClaim c) {
        attemptService.step(c, "INVOICE_SAVE", () -> null,
                ignored -> attemptService.evidenceInvoiceSaved(c, evidenceInvoiceId, "M2-EVIDENCE"));
        expireLease(c.attemptId());
        assertEquals("STALLED", attemptService.recoverIfExpired(c.attemptId()).orElseThrow().state().name());
    }

    // ------------------------------------------------------------------ M2.1 §5 endpoint authorization

    @Test
    @Order(20)
    @DisplayName("M2.1 §5: attempt endpoints refuse cashiers, other branches and a release without a reason")
    void attemptEndpointAuthorization() throws Exception {
        Map<String, Object> e = section("20_authorization");
        String cashier = tokenFor("cashier1@test.com", BRANCH_ID);
        String supervisor = tokenFor("supervisor1@test.com", BRANCH_ID);

        PosSession own = openSession("AUTH-OWN");
        PosCheckoutClaim ownClaim = assertInstanceOf(Claimed.class, claim(key("auth-own"), hash(), own.getId(), BRANCH_ID)).claim();
        // supervisor1 is assigned branches 1 and 2 (user_branches), so the foreign branch is one it
        // is not assigned to.
        assertEquals(0, jdbc.queryForObject("select count(*) from user_branches ub join users u on u.id = ub.user_id "
                + "where u.username = 'supervisor1@test.com' and ub.branch_id = ?", Integer.class, FOREIGN_BRANCH_ID));
        PosSession other = openSession("AUTH-OTHER", FOREIGN_BRANCH_ID);
        PosCheckoutRequest otherReq = new PosCheckoutRequest();
        otherReq.setSessionId(other.getId());
        otherReq.setBranchId(FOREIGN_BRANCH_ID);
        PosCheckoutClaim otherClaim = assertInstanceOf(Claimed.class, attemptService.claim(
                new ClaimRequest(key("auth-other"), hash(), FOREIGN_BRANCH_ID, other.getId(), "M2", "admin", null),
                locked -> PosCheckoutSessionGuard.checkBranch(otherReq, locked, FOREIGN_BRANCH_ID))).claim();
        expireLease(ownClaim.attemptId());
        expireLease(otherClaim.attemptId());

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("cashierList", call("GET", "/api/pos/checkout/attempts", null, cashier).get("status"));
        r.put("cashierRelease", call("POST", "/api/pos/checkout/attempts/" + ownClaim.attemptId() + "/release",
                "{\"reason\":\"x\"}", cashier).get("status"));
        r.put("supervisorListOtherBranchSession", call("GET", "/api/pos/checkout/attempts?sessionId=" + other.getId(),
                null, supervisor).get("status"));
        Map<String, Object> listAll = call("GET", "/api/pos/checkout/attempts?limit=500", null, supervisor);
        r.put("supervisorListAll", listAll.get("status"));
        r.put("supervisorReleaseOtherBranch", call("POST", "/api/pos/checkout/attempts/" + otherClaim.attemptId() + "/release",
                "{\"reason\":\"x\"}", supervisor).get("status"));
        r.put("supervisorReleaseNoReason", call("POST", "/api/pos/checkout/attempts/" + ownClaim.attemptId() + "/release",
                "{}", supervisor).get("status"));
        r.put("supervisorReleaseBlankReason", call("POST", "/api/pos/checkout/attempts/" + ownClaim.attemptId() + "/release",
                "{\"reason\":\"   \"}", supervisor).get("status"));
        Map<String, Object> ok = call("POST", "/api/pos/checkout/attempts/" + ownClaim.attemptId() + "/release",
                "{\"reason\":\"M2.1 auth test\"}", supervisor);
        r.put("supervisorReleaseOwnBranch", ok.get("status"));
        e.put("statuses", r);
        e.put("otherBranchAttemptAfter", attemptRow(key("auth-other")).get("state"));

        assertEquals(403, r.get("cashierList"));
        assertEquals(403, r.get("cashierRelease"));
        assertEquals(403, r.get("supervisorListOtherBranchSession"));
        assertEquals(200, r.get("supervisorListAll"));
        assertFalse(String.valueOf(listAll.get("body")).contains(otherClaim.attemptId().toString()),
                "another branch's attempt is not listed");
        assertEquals(403, r.get("supervisorReleaseOtherBranch"));
        assertEquals(400, r.get("supervisorReleaseNoReason"));
        assertEquals(400, r.get("supervisorReleaseBlankReason"));
        assertEquals(200, r.get("supervisorReleaseOwnBranch"), String.valueOf(ok.get("body")));
        assertEquals("supervisor1@test.com", attemptRow(key("auth-own")).get("resolved_by"));
        assertEquals("ACTIVE", attemptRow(key("auth-other")).get("state"), "the refused releases changed nothing");
        assertEquals(200, post("/api/pos/checkout/attempts/" + otherClaim.attemptId() + "/release",
                "{\"reason\":\"M2.1 cleanup\"}").get("status"));
        writeEvidence();
    }

    // ------------------------------------------------------------------ M2.1 fixtures

    /** Supersedes ("another owner took over") the armed attempt just before the armed step. */
    static class SupersedeHook implements com.billbull.backend.pos.checkout.attempt.PosCheckoutStepHook {
        private final JdbcTemplate jdbc;
        private volatile String key;
        private volatile String step;
        private final Set<String> fired = java.util.concurrent.ConcurrentHashMap.newKeySet();

        SupersedeHook(JdbcTemplate jdbc) { this.jdbc = jdbc; }

        void arm(String key, String step) { this.key = key; this.step = step; }
        void disarm() { this.key = null; this.step = null; }
        boolean fired(String key) { return fired.contains(key); }

        // M2.2.1: holds one request just before a step (outside its transaction), so a test can make
        // its HTTP response get lost or send a duplicate while the original is still unresolved.
        private volatile String pauseKey;
        private volatile String pauseStep;
        private volatile CountDownLatch pausedAt;
        private volatile CountDownLatch resume;

        void armPause(String key, String step) {
            pausedAt = new CountDownLatch(1);
            resume = new CountDownLatch(1);
            pauseStep = step;
            pauseKey = key;
        }
        boolean awaitPaused(long seconds) throws InterruptedException { return pausedAt.await(seconds, TimeUnit.SECONDS); }
        void resumePaused() { pauseKey = null; if (resume != null) resume.countDown(); }

        @Override
        public void beforeStep(PosCheckoutClaim claim, String s) {
            if (pauseKey != null && pauseKey.equals(claim.checkoutKey()) && s.equals(pauseStep)) {
                CountDownLatch r = resume;
                pausedAt.countDown();
                try {
                    r.await(30, TimeUnit.SECONDS);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                }
            }
            if (key != null && key.equals(claim.checkoutKey()) && s.equals(step)) {
                // Autocommit, from outside the worker: exactly what a release or reclaim does.
                int n = jdbc.update("update pos_checkout_attempts set state = 'RELEASED', fence = fence + 1, "
                        + "resolved_by = 'm2.1-supersede-hook', resolution_reason = ? where id = ?",
                        "superseded before " + s, claim.attemptId());
                if (n == 1) fired.add(claim.checkoutKey());
            }
        }
    }

    @org.springframework.boot.test.context.TestConfiguration
    static class SupersedeHookConfig {
        @org.springframework.context.annotation.Bean
        SupersedeHook supersedeHook(JdbcTemplate jdbc) { return new SupersedeHook(jdbc); }
    }

    /** A branch on the clone that supervisor1 is not assigned to. */
    private static final long FOREIGN_BRANCH_ID = 65L;
    private static final String SALES_ORDER = "SO-2026-0017";
    private static final String SALES_ORDER_CUSTOMER = "CUST-2026-0002";
    private static final long SALES_ORDER_ITEM_ID = 17L;

    private String soStatus(String soNumber) {
        return jdbc.queryForObject("select status from sales_orders where so_number = ?", String.class, soNumber);
    }

    @SuppressWarnings("unchecked")
    private String salesOrderSale(String key, PosSession session) throws Exception {
        Map<String, Object> b = json.readValue(cashSale(key, session.getId(), session.getTerminalId(), 1, "CASH"), Map.class);
        b.put("customerCode", SALES_ORDER_CUSTOMER);
        b.put("linkedSalesOrder", SALES_ORDER);
        Map<String, Object> line = ((List<Map<String, Object>>) b.get("items")).get(0);
        line.put("salesOrderItemId", SALES_ORDER_ITEM_ID);
        return json.writeValueAsString(b);
    }

    @SuppressWarnings("unchecked")
    private String serialSale(String key, PosSession session, String serial) throws Exception {
        Map<String, Object> b = json.readValue(cashSale(key, session.getId(), session.getTerminalId(), 1, "CASH"), Map.class);
        ((List<Map<String, Object>>) b.get("items")).get(0).put("serialNumber", serial);
        return json.writeValueAsString(b);
    }

    @SuppressWarnings("unchecked")
    private String cardLegMismatchSale(String key, PosSession session) throws Exception {
        Map<String, Object> b = json.readValue(cashSale(key, session.getId(), session.getTerminalId(), 1, "CASH"), Map.class);
        b.remove("paymentAllocations");
        b.put("paymentMode", "Card");
        b.put("cardLegs", List.of(Map.of("cardType", "Visa", "amount", 40.0, "referenceNumber", "R1")));
        return json.writeValueAsString(b);
    }

    private Map<String, Object> deliveryOrder(Long sessionId, String checkoutKey) {
        Map<String, Object> b = deliveryOrder(sessionId);
        b.put("checkoutKey", checkoutKey);
        return b;
    }

    /** POSSales.jsx's delivery-order builder, without the checkout key the till now always adds. */
    private Map<String, Object> deliveryOrder(Long sessionId) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("customerCode", DELIVERY_CUSTOMER);
        b.put("customerName", "M2.1 delivery with session");
        b.put("paymentMode", "Delivery");
        b.put("sessionId", sessionId);
        b.put("terminalId", runId + "-DELIVERY");
        b.put("branchId", BRANCH_ID);
        b.put("billDiscountAmount", 0);
        b.put("taxInclusive", true);
        b.put("shippingAddress", "M2.1 compatibility address");
        b.put("deliveryPersonEmployeeCode", DELIVERY_PERSON);
        b.put("salespersonEmployeeCode", SALESPERSON);
        b.put("deliveryDate", tradingDate.plusDays(1).toString());
        b.put("deliveryTimeSlot", "10:00-12:00");
        b.put("items", List.of(item(1)));
        return b;
    }

    private String tokenFor(String username, long branchId) {
        return tx.execute(s -> jwtUtil.generateToken(userRepository.findByUsername(username).orElseThrow(), branchId));
    }

    /** Runs {@code body} on this thread as {@code username} (for service calls that read the principal). */
    private <T> T asUser(String username, Callable<T> body) throws Exception {
        var auth = new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(username, null,
                List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_ADMIN")));
        var previous = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);
        try {
            return body.call();
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(previous);
        }
    }

    private Map<String, Object> call(String method, String path, String body, String bearer) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .timeout(Duration.ofSeconds(60))
                .header("Authorization", "Bearer " + bearer)
                .header("X-Branch-Id", String.valueOf(BRANCH_ID))
                .header("Content-Type", "application/json");
        b = "GET".equals(method) ? b.GET() : b.POST(HttpRequest.BodyPublishers.ofString(body == null ? "{}" : body));
        HttpResponse<String> res = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", res.statusCode());
        out.put("body", abbreviate(res.body() == null ? "" : res.body()));
        return out;
    }

    // ------------------------------------------------------------------ 15. delivery compatibility

    @Test
    @Order(15)
    @DisplayName("15/16 (amended by M2.2.1): a sessionless delivery order without a key is refused; with the key the "
            + "till sends it posts and is journaled")
    void deliveryOrderWithoutSessionOrKey() throws Exception {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("customerCode", DELIVERY_CUSTOMER);
        b.put("customerName", "M2 delivery compatibility");
        b.put("paymentMode", "Delivery");
        b.put("sessionId", null);
        b.put("terminalId", runId + "-DELIVERY");
        b.put("branchId", BRANCH_ID);
        b.put("billDiscountAmount", 0);
        b.put("taxInclusive", true);
        b.put("shippingAddress", "M2 compatibility address");
        b.put("deliveryPersonEmployeeCode", DELIVERY_PERSON);
        b.put("salespersonEmployeeCode", SALESPERSON);
        b.put("deliveryDate", tradingDate.plusDays(1).toString());
        b.put("deliveryTimeSlot", "10:00-12:00");
        b.put("items", List.of(item(1)));
        Map<String, Object> e = section("15_delivery");
        Map<String, Long> before = tableCounts();
        Map<String, Object> keyless = post("/api/pos/checkout", json.writeValueAsString(b));
        Map<String, Long> keylessDelta = delta(before, tableCounts());
        e.put("keyless", withoutJson(keyless));
        e.put("keylessDelta", keylessDelta);
        assertEquals(409, keyless.get("status"), String.valueOf(keyless.get("body")));
        assertEquals("CHECKOUT_KEY_REQUIRED", text((JsonNode) keyless.get("json"), "code"));
        assertNoBusinessWrites(keylessDelta);

        String k = key("m2-delivery-nosession");
        b.put("checkoutKey", k);
        Map<String, Object> res = post("/api/pos/checkout", json.writeValueAsString(b));
        JsonNode node = (JsonNode) res.get("json");
        if (node != null && node.get("id") != null && !node.get("id").isNull()) createdInvoiceIds.add(node.get("id").asLong());
        e.put("response", withoutJson(res));
        assertEquals(200, res.get("status"), String.valueOf(res.get("body")));
        Map<String, Object> journal = attemptRow(k);
        e.put("journal", journal);
        assertEquals("CLIENT", journal.get("key_source"));
        assertEquals("COMPLETED", journal.get("state"));
        assertEquals(null, journal.get("session_id"), "a sessionless delivery order is journaled without a session");
        writeEvidence();
    }

    // ------------------------------------------------------------------ M2.2.2 till status lookup

    @Test
    @Order(40)
    @DisplayName("M2.2.2: the till's key lookup reports every journal state, matches the request hash, writes nothing, "
            + "and is limited to the till permission and the journal row's branch")
    void tillKeyLookup() throws Exception {
        Map<String, Object> e = section("40_lookup");
        String cashier = tokenFor(CASHIER, BRANCH_ID);
        String supervisor = tokenFor("supervisor1@test.com", BRANCH_ID);
        PosSession session = openSession("LOOKUP");
        String lookup = "/api/pos/checkout/attempts/lookup";

        // Never used: nothing stands under the key, and asking writes nothing at all.
        String unused = key("lookup-unused");
        Map<String, Long> before = tableCounts();
        Map<String, Object> none = postAs(cashier, lookup, cashSale(unused, session.getId(), session.getTerminalId(), 1, "CASH"));
        Map<String, Long> noneDelta = delta(before, tableCounts());
        e.put("unused", withoutJson(none));
        e.put("unusedDelta", noneDelta);
        assertEquals(200, none.get("status"), String.valueOf(none.get("body")));
        JsonNode n = (JsonNode) none.get("json");
        assertEquals("false", text(n, "found"));
        assertEquals("NO", text(n, "recorded"));
        assertNoBusinessWrites(noneDelta); // the RBAC access audit (audit_logs) is the only row it may add
        assertNull(attemptRowOrNull(unused), "the lookup must not create a journal row");

        // Completed sale: YES, same request, the invoice; the same key with a changed cart: not the same request.
        String done = key("lookup-completed");
        String body = cashSale(done, session.getId(), session.getTerminalId(), 1, "CASH");
        Map<String, Object> sale = postAs(cashier, "/api/pos/checkout", body);
        assertEquals(200, sale.get("status"), String.valueOf(sale.get("body")));
        JsonNode inv = (JsonNode) sale.get("json");
        createdInvoiceIds.add(inv.get("id").asLong());
        before = tableCounts();
        JsonNode completed = (JsonNode) postAs(cashier, lookup, body).get("json");
        JsonNode changed = (JsonNode) postAs(cashier, lookup, cashSale(done, session.getId(), session.getTerminalId(), 2, "CASH")).get("json");
        Map<String, Long> completedDelta = delta(before, tableCounts());
        e.put("completed", completed.toString());
        e.put("changed", changed.toString());
        e.put("completedDelta", completedDelta);
        assertEquals("COMPLETED", text(completed, "state"));
        assertEquals("YES", text(completed, "recorded"));
        assertEquals("true", text(completed, "sameRequest"));
        assertEquals(inv.get("invoiceNumber").asText(), text(completed, "invoiceNumber"));
        assertEquals("false", text(changed, "sameRequest"));
        assertNoBusinessWrites(completedDelta);
        assertEquals(1, jdbc.queryForObject("select count(*) from sales_invoices where pos_checkout_key = ?", Integer.class, done));

        // ACTIVE → UNKNOWN, STALLED → PARTIAL, FAILED with no invoice → NO. The lookup never recovers or
        // reclaims: an ACTIVE row with an expired lease stays ACTIVE.
        Map<String, String> byState = new LinkedHashMap<>();
        for (String state : List.of("ACTIVE", "STALLED", "FAILED")) {
            String k = key("lookup-" + state.toLowerCase());
            PosCheckoutClaim c = assertInstanceOf(Claimed.class, claim(k, hash(), session.getId(), BRANCH_ID)).claim();
            if (!"ACTIVE".equals(state)) jdbc.update("update pos_checkout_attempts set state = ? where id = ?", state, c.attemptId());
            else expireLease(c.attemptId());
            // M2.2.3: these rows were started by admin on admin's session, so the cashier is refused (see
            // abandonmentAuthorization); a supervisor of the branch may read them.
            JsonNode s = (JsonNode) postAs(supervisor, lookup, cashSale(k, session.getId(), session.getTerminalId(), 1, "CASH")).get("json");
            byState.put(state, text(s, "recorded"));
            assertEquals(state, text(s, "state"));
            assertEquals("false", text(s, "sameRequest"), "a journal row of another request is reported as such");
            assertEquals(state, attemptRow(k).get("state"), "the lookup changed the attempt");
            if (!"FAILED".equals(state)) jdbc.update("update pos_checkout_attempts set state = 'RELEASED' where id = ?", c.attemptId());
        }
        e.put("recordedByState", byState);
        assertEquals(Map.of("ACTIVE", "UNKNOWN", "STALLED", "PARTIAL", "FAILED", "NO"), byState);

        // Another branch's journal row: refused, even when the body claims this branch.
        PosSession other = openSession("LOOKUP-OTHER", FOREIGN_BRANCH_ID);
        String foreign = key("lookup-foreign");
        PosCheckoutRequest otherReq = new PosCheckoutRequest();
        otherReq.setSessionId(other.getId());
        otherReq.setBranchId(FOREIGN_BRANCH_ID);
        PosCheckoutClaim fc = assertInstanceOf(Claimed.class, attemptService.claim(
                new ClaimRequest(foreign, hash(), FOREIGN_BRANCH_ID, other.getId(), "M2", "admin", null),
                locked -> PosCheckoutSessionGuard.checkBranch(otherReq, locked, FOREIGN_BRANCH_ID))).claim();
        Map<String, Object> foreignRes = postAs(supervisor, lookup, cashSale(foreign, session.getId(), session.getTerminalId(), 1, "CASH"));
        e.put("foreign", withoutJson(foreignRes));
        assertEquals(403, foreignRes.get("status"), String.valueOf(foreignRes.get("body")));
        jdbc.update("update pos_checkout_attempts set state = 'RELEASED' where id = ?", fc.attemptId());

        // A body without a key is a 400, and no token is a 401.
        assertEquals(400, postAs(cashier, lookup, "{\"branchId\":" + BRANCH_ID + "}").get("status"));
        assertEquals(401, postAs("not-a-token", lookup, cashSale(unused, session.getId(), session.getTerminalId(), 1, "CASH")).get("status"));
        writeEvidence();
    }

    // ------------------------------------------------------------------ M2.2.3 explicit abandonment

    private static final String ABANDON = "/api/pos/checkout/attempts/abandon?reason=M2.2.3%20test";

    @Test
    @Order(41)
    @DisplayName("M2.2.3 §A: claim vs abandonment race on the key's unique index — both winners occur, and whichever "
            + "wins the other sees it; never both")
    void claimVersusAbandonmentRace() throws Exception {
        Map<String, Object> e = section("41_abandonRace");
        int claimWins = 0;
        int abandonWins = 0;
        List<Map<String, Object>> rounds = new ArrayList<>();
        for (int round = 0; round < 40; round++) {
            PosSession session = openSession("RACE-AB");
            String k = key("race-ab-" + round);
            String h = hash();
            long jitterUs = (round % 2 == 0) ? 0 : (round * 1500L) % 25_000; // vary who arrives first
            CountDownLatch go = new CountDownLatch(1);
            Future<ClaimResult> claimF = pool.submit(() -> { go.await(); return claim(k, h, session.getId(), BRANCH_ID); });
            Future<PosCheckoutAttemptService.AbandonResult> abandonF = pool.submit(() -> {
                go.await();
                if (jitterUs > 0) TimeUnit.MICROSECONDS.sleep(jitterUs);
                return attemptService.abandon(k, h, new PosCheckoutAttemptService.AbandonTarget(BRANCH_ID, session.getId(),
                        session.getTerminalId()), "m2.2.3-race", "race round " + 0, null);
            });
            go.countDown();
            ClaimResult c = claimF.get(30, TimeUnit.SECONDS);
            PosCheckoutAttemptService.AbandonResult ab = abandonF.get(30, TimeUnit.SECONDS);
            Map<String, Object> row = attemptRow(k);
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("round", round);
            r.put("claim", c.getClass().getSimpleName() + (c instanceof Conflict cf ? ":" + cf.kind() : ""));
            r.put("abandon", ab.outcome() + (ab.refusalCode() != null ? ":" + ab.refusalCode() : ""));
            r.put("rowState", row.get("state"));
            rounds.add(r);
            if (c instanceof Claimed claimed) {
                claimWins++;
                assertEquals(PosCheckoutAttemptService.AbandonOutcome.REFUSED, ab.outcome(), "round " + round + ": " + r);
                assertEquals("CHECKOUT_IN_PROGRESS", ab.refusalCode(), "a live claim is never abandoned: " + r);
                assertEquals("ACTIVE", row.get("state"), r.toString());
                assertEquals(claimed.claim().fence(), ((Number) row.get("fence")).longValue(), "abandonment did not fence the owner out");
                attemptService.fail(claimed.claim(), new RuntimeException("race round cleanup")); // → FAILED, unblocks the session
            } else {
                abandonWins++;
                assertEquals(PosCheckoutAttemptService.AbandonOutcome.ABANDONED, ab.outcome(), "round " + round + ": " + r);
                assertEquals(ConflictKind.ABANDONED, assertInstanceOf(Conflict.class, c, r.toString()).kind(), r.toString());
                assertEquals("ABANDONED", row.get("state"), r.toString());
            }
            assertEquals(1, jdbc.queryForObject("select count(*) from pos_checkout_attempts where checkout_key = ?", Integer.class, k));
            assertEquals(0, jdbc.queryForObject("select count(*) from sales_invoices where pos_checkout_key = ?", Integer.class, k));
        }

        // Forced orderings, so both winners are proven even if the free race were one-sided.
        // (a) abandonment first: the claim is queued behind a held session lock while the tombstone commits.
        PosSession s1 = openSession("RACE-AB-FORCED1");
        String k1 = key("race-ab-forced-abandon-first");
        String h1 = hash();
        Future<ClaimResult> queued;
        try (Connection lock = holdSessionLock(s1.getId())) {
            queued = pool.submit(() -> claim(k1, h1, s1.getId(), BRANCH_ID));
            awaitLockWaiters(1);
            assertEquals(PosCheckoutAttemptService.AbandonOutcome.ABANDONED, attemptService.abandon(k1, h1,
                    new PosCheckoutAttemptService.AbandonTarget(BRANCH_ID, s1.getId(), s1.getTerminalId()),
                    "m2.2.3-race", "forced abandon first", null).outcome());
            lock.rollback();
        }
        assertEquals(ConflictKind.ABANDONED, assertInstanceOf(Conflict.class, queued.get(30, TimeUnit.SECONDS)).kind());
        abandonWins++;
        // (b) claim first: committed claim, then abandonment is refused and the claim keeps its fence.
        PosSession s2 = openSession("RACE-AB-FORCED2");
        String k2 = key("race-ab-forced-claim-first");
        String h2 = hash();
        PosCheckoutClaim first = assertInstanceOf(Claimed.class, claim(k2, h2, s2.getId(), BRANCH_ID)).claim();
        var refused = attemptService.abandon(k2, h2, null, "m2.2.3-race", "forced claim first", null);
        assertEquals("CHECKOUT_IN_PROGRESS", refused.refusalCode());
        attemptService.step(first, "INVOICE_SAVE", () -> null, null); // the owner is not fenced out
        attemptService.fail(first, new RuntimeException("forced round cleanup"));
        claimWins++;

        e.put("rounds", rounds);
        e.put("claimWins", claimWins);
        e.put("abandonWins", abandonWins);
        writeEvidence();
        assertTrue(claimWins >= 1 && abandonWins >= 1, "both winners must occur: claim=" + claimWins + " abandon=" + abandonWins);
    }

    @Test
    @Order(42)
    @DisplayName("M2.2.3 §A: an abandoned key's replay is refused with no business writes; active, stalled, completed "
            + "and legacy-invoice keys cannot be abandoned; FAILED/RELEASED can, once")
    void abandonmentRules() throws Exception {
        Map<String, Object> e = section("42_abandonRules");
        PosSession session = openSession("ABANDON");

        // 1. Never-claimed key, end to end over HTTP: the checkout is queued at the session lock while the
        //    tombstone commits; then the checkout, its replay and a different sale under the key are all refused.
        String k = key("abandon-http");
        String body = cashSale(k, session.getId(), session.getTerminalId(), 1, "CASH");
        Map<String, Long> before = tableCounts();
        Map<String, Object> raced;
        Map<String, Object> ab;
        try (Connection lock = holdSessionLock(session.getId())) {
            Future<Map<String, Object>> checkout = pool.submit(() -> post("/api/pos/checkout", body));
            awaitLockWaiters(1);
            ab = post(ABANDON, body);
            lock.rollback();
            raced = checkout.get(60, TimeUnit.SECONDS);
        }
        e.put("abandon", withoutJson(ab));
        e.put("racedCheckout", withoutJson(raced));
        assertEquals(200, ab.get("status"), String.valueOf(ab.get("body")));
        assertEquals("ABANDONED", text((JsonNode) ab.get("json"), "outcome"));
        assertEquals(409, raced.get("status"), String.valueOf(raced.get("body")));
        assertEquals("CHECKOUT_ABANDONED", text((JsonNode) raced.get("json"), "code"));
        Map<String, Object> replay = post("/api/pos/checkout", body);
        Map<String, Object> other = post("/api/pos/checkout", cashSale(k, session.getId(), session.getTerminalId(), 2, "CASH"));
        Map<String, Long> d = delta(before, tableCounts());
        e.put("replay", withoutJson(replay));
        e.put("otherSaleSameKey", withoutJson(other));
        e.put("delta", d);
        assertEquals(409, replay.get("status"));
        assertEquals("CHECKOUT_ABANDONED", text((JsonNode) replay.get("json"), "code"));
        assertEquals("false", text((JsonNode) replay.get("json"), "recorded"));
        assertEquals(409, other.get("status"));
        assertEquals("CHECKOUT_ABANDONED", text((JsonNode) other.get("json"), "code"));
        assertEquals(Long.valueOf(1), d.remove("pos_checkout_attempts"), "only the tombstone was written: " + d);
        assertNoBusinessWrites(d);
        assertEquals(0, ((Number) sessionRow(session.getId()).get("invoice_count")).intValue());
        Map<String, Object> again = post(ABANDON, body);
        assertEquals(200, again.get("status"));
        assertEquals("ALREADY_ABANDONED", text((JsonNode) again.get("json"), "outcome"));
        JsonNode looked = (JsonNode) post("/api/pos/checkout/attempts/lookup", body).get("json");
        assertEquals("ABANDONED", text(looked, "state"));
        assertEquals("NO", text(looked, "recorded"));
        assertEquals("true", text(looked, "sameRequest"));

        // 2. COMPLETED and a legacy (pre-journal) invoice: refused, nothing changes.
        String done = key("abandon-completed");
        String doneBody = cashSale(done, session.getId(), session.getTerminalId(), 1, "CASH");
        Map<String, Object> sale = post("/api/pos/checkout", doneBody);
        assertEquals(200, sale.get("status"), String.valueOf(sale.get("body")));
        createdInvoiceIds.add(((JsonNode) sale.get("json")).get("id").asLong());
        Map<String, Object> abDone = post(ABANDON, doneBody);
        assertEquals(409, abDone.get("status"));
        assertEquals("CHECKOUT_RECORDED", text((JsonNode) abDone.get("json"), "code"));
        assertEquals("COMPLETED", attemptRow(done).get("state"));
        String legacy = key("abandon-legacy");
        String legacyBody = cashSale(legacy, session.getId(), session.getTerminalId(), 1, "CASH");
        Map<String, Object> legacySale = post("/api/pos/checkout", legacyBody);
        assertEquals(200, legacySale.get("status"), String.valueOf(legacySale.get("body")));
        createdInvoiceIds.add(((JsonNode) legacySale.get("json")).get("id").asLong());
        jdbc.update("delete from pos_checkout_attempts where checkout_key = ?", legacy); // as if recorded before M2
        Map<String, Object> abLegacy = post(ABANDON, legacyBody);
        e.put("legacy", withoutJson(abLegacy));
        assertEquals(409, abLegacy.get("status"));
        assertEquals("CHECKOUT_RECORDED", text((JsonNode) abLegacy.get("json"), "code"));
        assertNull(attemptRowOrNull(legacy), "no tombstone over a legacy invoice");

        // 3. ACTIVE (live lease, and a running step holding the row), STALLED: refused.
        String active = key("abandon-active");
        String ah = hash();
        PosCheckoutClaim ac = assertInstanceOf(Claimed.class, claim(active, ah, session.getId(), BRANCH_ID)).claim();
        assertEquals("CHECKOUT_IN_PROGRESS", attemptService.abandon(active, ah, null, "admin", "x", null).refusalCode());
        expireLease(ac.attemptId());
        Connection stepLock = dataSource.getConnection();
        stepLock.setAutoCommit(false);
        try (PreparedStatement ps = stepLock.prepareStatement("select id from pos_checkout_attempts where id = ? for update")) {
            ps.setObject(1, ac.attemptId());
            ps.executeQuery().close();
            assertEquals("CHECKOUT_IN_PROGRESS", attemptService.abandon(active, ah, null, "admin", "x", null).refusalCode(),
                    "a step in flight holds the row: never abandoned");
        } finally {
            stepLock.rollback();
            stepLock.close();
        }
        assertEquals("ACTIVE", attemptRow(active).get("state"));
        String stalled = key("abandon-stalled");
        String sh = hash();
        PosCheckoutClaim sc = assertInstanceOf(Claimed.class, claim(stalled, sh, session.getId(), BRANCH_ID)).claim();
        attemptService.step(sc, "INVOICE_SAVE", () -> null,
                ignored -> attemptService.evidenceInvoiceSaved(sc, evidenceInvoiceId, "M2-EVIDENCE"));
        expireLease(sc.attemptId());
        assertEquals("CHECKOUT_STALLED", attemptService.abandon(stalled, sh, null, "admin", "x", null).refusalCode(),
                "expired with surviving evidence → STALLED, which needs the supervisor release first");
        assertEquals("STALLED", attemptRow(stalled).get("state"));
        // Released, but its invoice still stands: still not abandonable.
        assertEquals(200, post("/api/pos/checkout/attempts/" + sc.attemptId() + "/release",
                "{\"reason\":\"M2.2.3 test\"}").get("status"));
        assertEquals("CHECKOUT_RECORDED", attemptService.abandon(stalled, sh, null, "admin", "x", null).refusalCode());
        assertEquals("RELEASED", attemptRow(stalled).get("state"));

        // 4. Expired ACTIVE with no evidence: recovered to FAILED (never ABANDONED), then abandoned explicitly.
        //    Abandoned via an expired lease's recovery the old owner is fenced out; a reclaim is refused.
        PosCheckoutAttemptService.AbandonResult fromExpired = attemptService.abandon(active, ah, null, "admin", "x", null);
        Map<String, Object> abandonedRow = attemptRow(active);
        e.put("fromExpired", abandonedRow);
        assertEquals(PosCheckoutAttemptService.AbandonOutcome.ABANDONED, fromExpired.outcome());
        assertEquals("ABANDONED", abandonedRow.get("state"));
        assertTrue(String.valueOf(abandonedRow.get("resolution_reason")).contains("was FAILED"), String.valueOf(abandonedRow));
        assertEquals(ac.fence() + 1, ((Number) abandonedRow.get("fence")).longValue());
        assertThrows(SupersededException.class, () -> attemptService.step(ac, "INVOICE_SAVE", () -> null, null));
        assertEquals(ConflictKind.ABANDONED, assertInstanceOf(Conflict.class, claim(active, ah, session.getId(), BRANCH_ID)).kind(),
                "an ABANDONED attempt is never reclaimed");

        // 5. Another request's key: refused, untouched.
        String failed = key("abandon-otherhash");
        PosCheckoutClaim fc = assertInstanceOf(Claimed.class, claim(failed, hash(), session.getId(), BRANCH_ID)).claim();
        attemptService.fail(fc, new RuntimeException("test"));
        assertEquals("CHECKOUT_KEY_REUSED", attemptService.abandon(failed, hash(), null, "admin", "x", null).refusalCode());
        assertEquals("FAILED", attemptRow(failed).get("state"));
        writeEvidence();
    }

    @Test
    @Order(43)
    @DisplayName("M2.2.3 §2/§D: lookup, abandonment and the recoverable listing allow the initiator, the session's "
            + "current owner and a branch supervisor only; other branches and other users get 403")
    void abandonmentAuthorization() throws Exception {
        Map<String, Object> e = section("43_abandonAuth");
        String cashier = tokenFor(CASHIER, BRANCH_ID);
        String supervisor = tokenFor("supervisor1@test.com", BRANCH_ID);
        String lookup = "/api/pos/checkout/attempts/lookup";
        Map<String, Object> s = new LinkedHashMap<>();

        // admin's attempt on admin's session.
        PosSession adminSession = openSession("AUTH-ADMIN");
        String adminKey = key("auth-admin");
        String adminBody = cashSale(adminKey, adminSession.getId(), adminSession.getTerminalId(), 1, "CASH");
        PosCheckoutClaim adminClaim = assertInstanceOf(Claimed.class, claim(adminKey,
                PosCheckoutRequestHasher.hash(json.readValue(adminBody, PosCheckoutRequest.class)), adminSession.getId(), BRANCH_ID)).claim();
        attemptService.fail(adminClaim, new RuntimeException("auth test"));
        s.put("cashierLookupOther", postAs(cashier, lookup, adminBody).get("status"));
        s.put("cashierAbandonOther", postAs(cashier, ABANDON, adminBody).get("status"));
        assertEquals("FAILED", attemptRow(adminKey).get("state"), "a refused abandonment changes nothing");
        s.put("supervisorLookup", postAs(supervisor, lookup, adminBody).get("status"));

        // The cashier owns the session now (handover moves opened_by): allowed, though admin initiated it.
        PosSession cashierSession = openSession("AUTH-OWNER");
        jdbc.update("update pos_sessions set opened_by = ? where id = ?", CASHIER, cashierSession.getId());
        String ownedKey = key("auth-owned");
        String ownedBody = cashSale(ownedKey, cashierSession.getId(), cashierSession.getTerminalId(), 1, "CASH");
        PosCheckoutClaim ownedClaim = assertInstanceOf(Claimed.class, claim(ownedKey,
                PosCheckoutRequestHasher.hash(json.readValue(ownedBody, PosCheckoutRequest.class)), cashierSession.getId(), BRANCH_ID)).claim();
        attemptService.fail(ownedClaim, new RuntimeException("auth test"));
        s.put("ownerLookup", postAs(cashier, lookup, ownedBody).get("status"));
        Map<String, Object> ownerAbandon = postAs(cashier, ABANDON, ownedBody);
        s.put("ownerAbandon", ownerAbandon.get("status"));
        assertEquals("ABANDONED", attemptRow(ownedKey).get("state"), String.valueOf(ownerAbandon.get("body")));

        // Sessionless attempt started by admin: initiator or supervisor only.
        String sessionless = key("auth-sessionless");
        PosCheckoutRequest slReq = new PosCheckoutRequest();
        slReq.setCheckoutKey(sessionless);
        slReq.setBranchId(BRANCH_ID);
        slReq.setTerminalId(runId + "-SESSIONLESS");
        String slBody = json.writeValueAsString(slReq);
        PosCheckoutClaim slClaim = assertInstanceOf(Claimed.class, attemptService.claim(new ClaimRequest(sessionless,
                PosCheckoutRequestHasher.hash(slReq), BRANCH_ID, null, runId + "-SESSIONLESS", "admin", null),
                locked -> Optional.empty())).claim();
        attemptService.fail(slClaim, new RuntimeException("auth test"));
        s.put("cashierLookupSessionless", postAs(cashier, lookup, slBody).get("status"));
        s.put("supervisorLookupSessionless", postAs(supervisor, lookup, slBody).get("status"));

        // A tombstone for a never-seen key naming admin's session: the cashier does not own it.
        String fresh = key("auth-fresh");
        s.put("cashierTombstoneOnOthersSession", postAs(cashier, ABANDON,
                cashSale(fresh, adminSession.getId(), adminSession.getTerminalId(), 1, "CASH")).get("status"));
        assertNull(attemptRowOrNull(fresh));

        // Another branch: the supervisor is not assigned to it. Lookup, abandonment and listing are 403,
        // even when the body claims this branch, and even for a tombstone naming that branch's session.
        PosSession foreignSession = openSession("AUTH-FOREIGN", FOREIGN_BRANCH_ID);
        String foreign = key("auth-foreign");
        PosCheckoutRequest fReq = new PosCheckoutRequest();
        fReq.setSessionId(foreignSession.getId());
        fReq.setBranchId(FOREIGN_BRANCH_ID);
        PosCheckoutClaim fClaim = assertInstanceOf(Claimed.class, attemptService.claim(
                new ClaimRequest(foreign, hash(), FOREIGN_BRANCH_ID, foreignSession.getId(), "M2", "admin", null),
                locked -> PosCheckoutSessionGuard.checkBranch(fReq, locked, FOREIGN_BRANCH_ID))).claim();
        attemptService.fail(fClaim, new RuntimeException("auth test"));
        String foreignBody = cashSale(foreign, adminSession.getId(), adminSession.getTerminalId(), 1, "CASH");
        s.put("supervisorLookupForeign", postAs(supervisor, lookup, foreignBody).get("status"));
        s.put("supervisorAbandonForeign", postAs(supervisor, ABANDON, foreignBody).get("status"));
        s.put("supervisorTombstoneForeignSession", postAs(supervisor, ABANDON,
                cashSale(key("auth-foreign-fresh"), foreignSession.getId(), foreignSession.getTerminalId(), 1, "CASH")).get("status"));
        s.put("supervisorListForeign", call("GET", "/api/pos/checkout/attempts/recoverable?branchId=" + FOREIGN_BRANCH_ID,
                null, supervisor).get("status"));
        assertEquals("FAILED", attemptRow(foreign).get("state"));
        assertNull(attemptRowOrNull(key("auth-foreign-fresh")));

        // Recoverable listing: the supervisor sees the branch; the cashier only its own and owned-session
        // rows; a terminal id never widens what is returned. No secrets in the payload.
        Map<String, Object> supList = postlessGet(supervisor, "/api/pos/checkout/attempts/recoverable?branchId=" + BRANCH_ID + "&limit=500");
        Map<String, Object> cashList = postlessGet(cashier, "/api/pos/checkout/attempts/recoverable?branchId=" + BRANCH_ID + "&limit=500");
        Map<String, Object> cashListByTerminal = postlessGet(cashier, "/api/pos/checkout/attempts/recoverable?branchId=" + BRANCH_ID
                + "&terminalId=" + adminSession.getTerminalId());
        s.put("supervisorList", supList.get("status"));
        s.put("cashierList", cashList.get("status"));
        e.put("statuses", s);
        String sup = String.valueOf(supList.get("raw"));
        String cash = String.valueOf(cashList.get("raw"));
        e.put("cashierListBody", cashList.get("body"));
        assertTrue(sup.contains(adminKey) && sup.contains(ownedKey) && sup.contains(sessionless), "supervisor sees the branch");
        assertFalse(sup.contains(foreign), "another branch is never listed");
        assertTrue(cash.contains(ownedKey), "the session owner sees its session's attempt");
        assertFalse(cash.contains(adminKey) || cash.contains(sessionless), "the cashier never sees another user's attempts");
        assertFalse(String.valueOf(cashListByTerminal.get("raw")).contains(adminKey), "a terminal id is not access evidence");
        for (String forbidden : List.of("requestHash", "request_hash", "ownerToken", "owner_token", "\"fence\"", "ownerInstance",
                "outcomeDetail", "supervisorOverride", "paymentAllocations")) {
            assertFalse(sup.contains(forbidden), "listing exposes " + forbidden);
        }

        assertEquals(Map.ofEntries(
                Map.entry("cashierLookupOther", 403), Map.entry("cashierAbandonOther", 403), Map.entry("supervisorLookup", 200),
                Map.entry("ownerLookup", 200), Map.entry("ownerAbandon", 200), Map.entry("cashierLookupSessionless", 403),
                Map.entry("supervisorLookupSessionless", 200), Map.entry("cashierTombstoneOnOthersSession", 403),
                Map.entry("supervisorLookupForeign", 403), Map.entry("supervisorAbandonForeign", 403),
                Map.entry("supervisorTombstoneForeignSession", 403), Map.entry("supervisorListForeign", 403),
                Map.entry("supervisorList", 200), Map.entry("cashierList", 200)), s);
        writeEvidence();
    }

    /** A GET whose full body is kept (as "raw") for content assertions. */
    private Map<String, Object> postlessGet(String bearer, String path) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .timeout(Duration.ofSeconds(60))
                .header("Authorization", "Bearer " + bearer)
                .header("X-Branch-Id", String.valueOf(BRANCH_ID)).GET().build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", res.statusCode());
        out.put("body", abbreviate(res.body() == null ? "" : res.body()));
        out.put("raw", res.body());
        return out;
    }

    // ------------------------------------------------------------------ fixtures

    private PosTerminal newTerminal(String label, long branchId) {
        PosTerminal t = new PosTerminal();
        t.setBranchId(branchId);
        t.setTerminalId(runId + "-" + label + "-" + seq.incrementAndGet());
        t.setTerminalName("M2 " + label);
        t.setCounterName("M2");
        t.setStatus(PosTerminalStatus.ACTIVE);
        t.setRegisteredBy("admin");
        PosTerminal saved = terminalRepository.save(t);
        terminalIds.add(saved.getId());
        return saved;
    }

    private PosSession openSession(String label) { return openSession(label, BRANCH_ID); }

    private PosSession openSession(String label, long branchId) {
        PosTerminal terminal = newTerminal(label, branchId);
        LocalDateTime now = businessDayWindowService.clock().now();
        PosSession s = new PosSession();
        s.setBranchId(branchId);
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

    private String key(String label) { return runId + "-" + label; }

    private static String hash() {
        return (UUID.randomUUID().toString() + UUID.randomUUID()).replace("-", "").substring(0, 64);
    }

    /** A claim as the controller makes it, with M1's rules as the locked-session check. */
    private ClaimResult claim(String key, String hash, Long sessionId, long requestBranchId) {
        PosCheckoutRequest r = new PosCheckoutRequest();
        r.setSessionId(sessionId);
        r.setBranchId(requestBranchId);
        return attemptService.claim(new ClaimRequest(key, hash, BRANCH_ID, sessionId, "M2", "admin", null),
                locked -> {
                    if (locked == null) return Optional.of(PosCheckoutSessionGuard.missing(sessionId));
                    var branch = PosCheckoutSessionGuard.checkBranch(r, locked, BRANCH_ID);
                    if (branch.isPresent()) return branch;
                    return PosCheckoutSessionGuard.checkOpen(locked);
                });
    }

    /** Takes the session row lock on a raw connection the test controls. */
    private Connection holdSessionLock(long sessionId) throws Exception {
        Connection c = dataSource.getConnection();
        c.setAutoCommit(false);
        try (PreparedStatement ps = c.prepareStatement("select id from pos_sessions where id = ? for update")) {
            ps.setLong(1, sessionId);
            try (ResultSet rs = ps.executeQuery()) { assertTrue(rs.next()); }
        }
        return c;
    }

    /** Waits until at least {@code n} backends are waiting on a lock in this database. */
    private int awaitLockWaiters(int n) throws Exception {
        int seen = 0;
        for (int i = 0; i < 100; i++) {
            seen = jdbc.queryForObject("select count(*) from pg_stat_activity where datname = current_database() "
                    + "and wait_event_type = 'Lock'", Integer.class);
            if (seen >= n) return seen;
            Thread.sleep(50);
        }
        throw new AssertionError("expected " + n + " lock waiters, saw " + seen);
    }

    private void expireLease(UUID attemptId) {
        assertEquals(1, jdbc.update("update pos_checkout_attempts set lease_expires_at = now() - interval '1 second' "
                + "where id = ?", attemptId));
    }

    private Map<String, Object> attemptRow(String key) {
        Map<String, Object> row = attemptRowOrNull(key);
        assertNotNull(row, "no attempt row for " + key);
        return row;
    }

    private Map<String, Object> attemptRowOrNull(String key) {
        List<Map<String, Object>> rows = jdbc.queryForList("select id::text as id, state, fence, owner_token::text as owner_token, "
                + "owner_instance, session_id, branch_id, key_source, tenant_db, request_hash, attempt_count, last_step, "
                + "lease_expires_at::text as lease_expires_at, (lease_expires_at < now()) as lease_expired, invoice_id, "
                + "invoice_saved_at::text as invoice_saved_at, invoice_posted_at::text as invoice_posted_at, "
                + "payment_legs_expected, payment_legs_recorded, session_step_required, "
                + "session_recorded_at::text as session_recorded_at, completed_at::text as completed_at, outcome_detail, "
                + "resolved_by, resolution_reason, serials_step_required, serials_marked_at::text as serials_marked_at, "
                + "sales_order_step_required, sales_order_completed_at::text as sales_order_completed_at, sales_order_outcome, "
                + "qr_archived_at::text as qr_archived_at, stats_recorded_at::text as stats_recorded_at "
                + "from pos_checkout_attempts where checkout_key = ?", key);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Map<String, Object> sessionRow(Long sessionId) {
        return jdbc.queryForMap("select id, status, closing_started_at, closed_at, total_sales, invoice_count, terminal_id, opened_by "
                + "from pos_sessions where id = ?", sessionId);
    }

    private Map<String, Object> item(int quantity) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("itemCode", PRODUCT_CODE);
        item.put("itemName", "M2 line");
        item.put("quantity", quantity);
        item.put("unit", "Each");
        item.put("price", PRICE);
        item.put("discount", 0);
        item.put("taxRate", 5);
        return item;
    }

    private String cashSale(String key, Long sessionId, String terminalId, int quantity, String tender) throws Exception {
        Map<String, Object> pay = new LinkedHashMap<>();
        pay.put("type", tender);
        pay.put("amount", PRICE * quantity);
        if ("CARD".equals(tender)) pay.put("subtype", "Visa");
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("checkoutKey", key);
        b.put("customerName", "Walk-in Customer");
        b.put("paymentMode", "CARD".equals(tender) ? "Card" : "Cash");
        b.put("branchId", BRANCH_ID);
        b.put("branchCode", "BR-01");
        b.put("sessionId", sessionId);
        b.put("terminalId", terminalId);
        b.put("counterName", "M2");
        b.put("salespersonEmployeeCode", SALESPERSON);
        b.put("taxInclusive", true);
        b.put("items", List.of(item(quantity)));
        b.put("paymentAllocations", List.of(pay));
        return json.writeValueAsString(b);
    }

    private Map<String, Object> post(String path, String body) throws Exception {
        return postAs(token, path, body);
    }

    private Map<String, Object> postAs(String bearer, String path, String body) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .timeout(Duration.ofSeconds(90))
                .header("Authorization", "Bearer " + bearer)
                .header("X-Branch-Id", String.valueOf(BRANCH_ID))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("path", path);
        out.put("status", res.statusCode());
        String text = res.body() == null ? "" : res.body();
        out.put("body", abbreviate(text));
        try { out.put("json", json.readTree(text)); } catch (Exception notJson) { out.put("json", null); }
        return out;
    }

    private static String abbreviate(String s) {
        return s.length() > 1500 ? s.substring(0, 1500) + "…" : s;
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); throw new RuntimeException(ie); }
    }

    private static Map<String, Object> withoutJson(Map<String, Object> res) {
        Map<String, Object> copy = new LinkedHashMap<>(res);
        copy.remove("json");
        return copy;
    }

    private static String text(JsonNode node, String field) {
        return node == null || node.get(field) == null || node.get(field).isNull() ? null : node.get(field).asText();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> section(String name) {
        return (Map<String, Object>) evidence.computeIfAbsent(name, k -> Collections.synchronizedMap(new LinkedHashMap<>()));
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

    private static void assertNoBusinessWrites(Map<String, Long> d) {
        List<String> business = d.keySet().stream().filter(t -> !NON_BUSINESS_TABLES.contains(t)).toList();
        assertTrue(business.isEmpty(), "business tables changed: " + business + " " + d);
    }

    private static String inList(List<Long> ids) {
        return ids.isEmpty() ? "-1" : String.join(",", ids.stream().map(String::valueOf).toList());
    }

    private static String quoted(List<String> values) {
        return String.join(",", values.stream().map(v -> "'" + v.replace("'", "''") + "'").toList());
    }

    private void writeEvidence() throws Exception {
        Files.createDirectories(evidenceFile.getParent());
        synchronized (evidence) {
            Files.writeString(evidenceFile, json.writerWithDefaultPrettyPrinter().writeValueAsString(evidence));
        }
    }

    // ------------------------------------------------------------------ cleanup

    @AfterAll
    void cleanup() throws Exception {
        pool.shutdownNow();
        Thread.sleep(1500); // let @Async audit writes land before deleting
        String keyLike = runId + "-%";
        List<Long> invoiceIds = new ArrayList<>(jdbc.queryForList(
                "select id from sales_invoices where pos_checkout_key like ?", Long.class, keyLike));
        // Server-keyed and keyless sales are found through their session.
        invoiceIds.addAll(jdbc.queryForList("select id from sales_invoices where pos_session_id in (" + inList(sessionIds) + ")",
                Long.class));
        createdInvoiceIds.forEach(id -> { if (!invoiceIds.contains(id)) invoiceIds.add(id); });
        // Invoices already removed by a compensating delete still leave history events; their ids
        // survive on the attempt rows as evidence.
        invoiceIds.addAll(jdbc.queryForList("select invoice_id from pos_checkout_attempts where invoice_id is not null "
                + "and (checkout_key like ? or session_id in (" + inList(sessionIds) + "))", Long.class, keyLike));
        List<Long> distinct = invoiceIds.stream().distinct().toList();
        String ids = inList(distinct);
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
            sessionIds.forEach(id -> refs.add("SCL-" + id));
            String dn = inList(dnIds);
            String sess = inList(sessionIds);
            String term = inList(terminalIds);
            Map<String, Integer> deleted = new LinkedHashMap<>();
            List<String> auditKeys = new ArrayList<>(refs);
            auditKeys.addAll(jdbc.queryForList("select entry_number from journal_entries where reference in ("
                    + quoted(refs) + ")", String.class));
            List<String> paymentNumbers = invoiceNumbers.isEmpty() ? List.of() : jdbc.queryForList(
                    "select payment_number from sales_payments where linked_invoice in (" + quoted(invoiceNumbers) + ")", String.class);
            auditKeys.addAll(paymentNumbers);
            deleted.put("financial_audit_logs", jdbc.update("delete from financial_audit_logs where entity_id in ("
                    + quoted(auditKeys) + ")"));
            if (!paymentNumbers.isEmpty()) {
                deleted.put("notifications", jdbc.update("delete from notifications where reference_id in ("
                        + quoted(paymentNumbers) + ")"));
            }
            List<String> endpoints = new ArrayList<>();
            sessionIds.forEach(id -> endpoints.add("/api/pos/sessions/" + id + "/%"));
            endpoints.add("/api/pos/checkout%");
            // M2.2: approval and handover endpoints, and their POS_TERMINAL domain events (delivery
            // settlement lives under /api/pos/checkout and is already covered above).
            endpoints.add("/api/pos/settings/supervisor-%");
            endpoints.add("/api/pos/settings/verify-pin");
            for (String ep : endpoints) {
                deleted.merge("audit_logs", jdbc.update("delete from audit_logs where id > ? and endpoint like ?",
                        baselineAuditLogId, ep), Integer::sum);
            }
            deleted.merge("audit_logs", jdbc.update("delete from audit_logs where id > ? and entity_type = 'POS_TERMINAL' "
                    + "and entity_id like ?", baselineAuditLogId, runId + "-%"), Integer::sum);
            String r = quoted(refs);
            deleted.put("ledger_entries", jdbc.update("delete from ledger_entries where journal_id in "
                    + "(select id::text from journal_entries where reference in (" + r + "))"));
            deleted.put("journal_lines", jdbc.update("delete from journal_lines where journal_entry_id in "
                    + "(select id from journal_entries where reference in (" + r + "))"));
            deleted.put("journal_entries", jdbc.update("delete from journal_entries where reference in (" + r + ")"));
            if (!invoiceNumbers.isEmpty()) {
                deleted.put("sales_payments", jdbc.update("delete from sales_payments where linked_invoice in (" + quoted(invoiceNumbers) + ")"));
            }
            deleted.put("sales_receipt_vouchers", jdbc.update("delete from sales_receipt_vouchers where sales_invoice_id in (" + ids + ")"));
            deleted.put("stock_movements", jdbc.update("delete from stock_movements where source_type = 'DELIVERY_NOTE' and source_id in (" + dn + ")"));
            deleted.put("delivery_note_batch_consumptions", jdbc.update("delete from delivery_note_batch_consumptions where delivery_note_id in (" + dn + ")"));
            deleted.put("batch_allocation", jdbc.update("delete from batch_allocation where (source_document_type in ('SALES_INVOICE') and source_document_id in (" + ids + ")) "
                    + "or (source_document_type in ('DELIVERY_NOTE') and source_document_id in (" + dn + "))"));
            deleted.put("pos_stock_reservations", jdbc.update("delete from pos_stock_reservations "
                    + "where source_document_type = 'POS_PROFORMA' and source_document_id in (" + ids + ")"));
            deleted.put("delivery_note_items", jdbc.update("delete from delivery_note_items where delivery_note_id in (" + dn + ")"));
            deleted.put("delivery_notes", jdbc.update("delete from delivery_notes where id in (" + dn + ")"));
            deleted.put("sales_invoice_history_events", jdbc.update("delete from sales_invoice_history_events where invoice_id in (" + ids + ")"));
            deleted.put("sales_invoice_items", jdbc.update("delete from sales_invoice_items where sales_invoice_id in (" + ids + ")"));
            deleted.put("sales_invoices", jdbc.update("delete from sales_invoices where id in (" + ids + ")"));
            deleted.put("serial_master", jdbc.update("delete from serial_master where serial_number like ?", runId + "-%"));
            deleted.put("pos_checkout_attempts", jdbc.update("delete from pos_checkout_attempts where checkout_key like ? "
                    + "or session_id in (" + sess + ")", keyLike));
            deleted.put("pos_session_transfer_log", jdbc.update("delete from pos_session_transfer_log where session_id in (" + sess + ")"));
            deleted.put("pos_session_terminal_history", jdbc.update("delete from pos_session_terminal_history where session_id in (" + sess + ")"));
            deleted.put("pos_audit_log", jdbc.update("delete from pos_audit_log where session_id in (" + sess + ") or terminal_id like ?", runId + "-%"));
            jdbc.update("update pos_terminals set current_open_session_id = null where id in (" + term + ")");
            deleted.put("pos_sessions", jdbc.update("delete from pos_sessions where id in (" + sess + ")"));
            deleted.put("pos_terminals", jdbc.update("delete from pos_terminals where id in (" + term + ")"));
            jdbc.update("update pos_settings set supervisor_pin = ? where branch_id = ?", originalSupervisorPin, BRANCH_ID);
            jdbc.update("update pos_settings set delivery_workflow_mode = ? where branch_id = ?", originalDeliveryMode, BRANCH_ID);
            jdbc.update("update users set password = ? where username = 'admin'", originalAdminPassword);
            jdbc.update("update sales_orders set status = ? where so_number = ?", originalSalesOrder.get("status"), SALES_ORDER);
            jdbc.update("update sales_order_items set delivered_quantity = ? where id = ?",
                    originalSalesOrder.get("delivered_quantity"), SALES_ORDER_ITEM_ID);
            report.put("deleted", deleted);
        });
        Map<String, Long> remaining = delta(baselineCounts, tableCounts());
        report.put("rowCountDeltaVsBaselineAfterCleanup", remaining);
        report.put("salesOrderFixtureAfter", jdbc.queryForMap("select so.status, i.delivered_quantity from sales_orders so "
                + "join sales_order_items i on i.sales_order_id = so.id where so.so_number = ? and i.id = ?",
                SALES_ORDER, SALES_ORDER_ITEM_ID));
        report.put("supervisorPinRestored", java.util.Objects.equals(originalSupervisorPin,
                jdbc.queryForObject("select supervisor_pin from pos_settings where branch_id = ?", String.class, BRANCH_ID)));
        report.put("deliveryWorkflowModeRestored", java.util.Objects.equals(originalDeliveryMode,
                jdbc.queryForObject("select delivery_workflow_mode from pos_settings where branch_id = ?", String.class, BRANCH_ID)));
        report.put("adminPasswordRestored", java.util.Objects.equals(originalAdminPassword,
                jdbc.queryForObject("select password from users where username = 'admin'", String.class)));
        evidence.put("cleanup", report);
        writeEvidence();
        assertTrue(remaining.isEmpty(), "rows left behind after cleanup: " + remaining);
    }
}
