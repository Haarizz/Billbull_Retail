package com.billbull.backend.pos.offline;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** M3 offline rules that do not need a database: the lease gates and the pre-posting checks. */
@ExtendWith(MockitoExtension.class)
class PosOfflineRulesTest {

    @Mock PosOfflineRepository repo;
    @Mock PosOfflineCatalogService catalog;

    private final ObjectMapper mapper = new ObjectMapper();

    // ------------------------------------------------------------------ lease gates

    @Test
    void sessionTransitionRefusedWhileALeaseIsOutstanding() {
        when(repo.findActiveLeasesForSession(58L)).thenReturn(List.of(lease(false)));
        when(repo.leaseUsage(any())).thenReturn(new long[] { 1, 10000 });
        var barrier = new PosOfflineLeaseBarrier(repo);
        var ex = assertThrows(ResponseStatusException.class, () -> barrier.assertNoOutstandingLease(58L, "CLOSE"));
        assertTrue(ex.getReason().startsWith("OFFLINE_LEASE_OUTSTANDING"));
    }

    @Test
    void anExpiredButUnsettledLeaseStillBlocks() {
        when(repo.findActiveLeasesForSession(58L)).thenReturn(List.of(lease(true)));
        when(repo.leaseUsage(any())).thenReturn(new long[] { 0, 0 });
        assertThrows(ResponseStatusException.class, () -> new PosOfflineLeaseBarrier(repo).assertNoOutstandingLease(58L, "SUSPEND"));
    }

    @Test
    void noLeaseNoRefusal() {
        when(repo.findActiveLeasesForSession(58L)).thenReturn(List.of());
        assertDoesNotThrow(() -> new PosOfflineLeaseBarrier(repo).assertNoOutstandingLease(58L, "CLOSE"));
    }

    @Test
    void dayCloseRefusedByTheServerSideLeaseRegister() {
        when(repo.findUnsettledLeasesForBranchDate(1L, LocalDate.of(2026, 11, 13))).thenReturn(List.of(lease(false)));
        var ex = assertThrows(ResponseStatusException.class,
                () -> new PosOfflineLeaseBarrier(repo).assertDayCloseAllowed(1L, LocalDate.of(2026, 11, 13)));
        assertTrue(ex.getReason().contains("offline lease"));
    }

    // ------------------------------------------------------------------ pre-posting checks

    private PosOfflineIngestService ingest() {
        return new PosOfflineIngestService(repo, null, null, null, catalog, null, null, mapper, null);
    }

    private JsonNode record(String tender, long priceMinor, long taxBp, long qty, long total, long tendered) throws Exception {
        return mapper.readTree("{\"taxInc\":true,\"totalMinor\":" + total + ",\"tender\":{\"type\":\"" + tender
                + "\",\"tenderedMinor\":" + tendered + ",\"changeMinor\":" + (tendered - total) + "},\"lines\":[{\"code\":\"08747\",\"qty\":"
                + qty + ",\"priceMinor\":" + priceMinor + ",\"taxBp\":" + taxBp + "}]}");
    }

    private void listed() {
        when(catalog.currentLine(eq("08747"), anyLong())).thenReturn(Optional.of(
                new PosOfflineCatalogService.CatalogLine(2L, "08747", new BigDecimal("100.00"), new BigDecimal("5"), "PCS")));
    }

    @Test
    void aListPricedCashSalePassesTheChecks() throws Exception {
        listed();
        assertNull(ingest().businessCheck(record("CASH", 10000, 500, 2, 20000, 25000), 1L));
    }

    @Test
    void nonCashTenderIsRefused() throws Exception {
        assertTrue(ingest().businessCheck(record("CARD", 10000, 500, 1, 10000, 10000), 1L).startsWith("TENDER_NOT_ALLOWED"));
    }

    @Test
    void underpaidCashIsRefused() throws Exception {
        assertTrue(ingest().businessCheck(record("CASH", 10000, 500, 1, 10000, 9000), 1L).startsWith("TENDER_INVALID"));
    }

    @Test
    void ineligibleProductIsRefused() throws Exception {
        when(catalog.currentLine(eq("08747"), anyLong())).thenReturn(Optional.empty());
        assertTrue(ingest().businessCheck(record("CASH", 10000, 500, 1, 10000, 10000), 1L).startsWith("PRODUCT_NOT_ELIGIBLE"));
    }

    @Test
    void priceAndTaxDriftAreRefused() throws Exception {
        listed();
        assertTrue(ingest().businessCheck(record("CASH", 9000, 500, 1, 9000, 9000), 1L).startsWith("PRICE_DRIFT"));
        assertTrue(ingest().businessCheck(record("CASH", 10000, 0, 1, 10000, 10000), 1L).startsWith("TAX_DRIFT"));
    }

    @Test
    void totalsThatDoNotAddUpAreRefused() throws Exception {
        listed();
        assertTrue(ingest().businessCheck(record("CASH", 10000, 500, 2, 15000, 20000), 1L).startsWith("TOTAL_MISMATCH"));
    }

    private static PosOfflineRepository.Lease lease(boolean expired) {
        return new PosOfflineRepository.Lease(UUID.randomUUID(), "t", 1L, "T1", 1L, 58L, UUID.randomUUID(), "admin",
                LocalDate.of(2026, 11, 13), Instant.now(), Instant.now(), Instant.now(), 50, 500000, 1, 51, "CASH", "p",
                null, 1, "kid", "jws", "ACTIVE", expired, false);
    }
}
