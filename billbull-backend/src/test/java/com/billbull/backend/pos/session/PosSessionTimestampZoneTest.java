package com.billbull.backend.pos.session;

import com.billbull.backend.pos.businessdate.BusinessDayClock;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.TimeZone;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Locks down the zone a POS session timestamp is <i>presented</i> in.
 *
 * <p>{@code openedAt}/{@code closedAt} are stored as {@link LocalDateTime} — a bare wall-clock
 * reading with no zone — and are stamped by {@code BusinessDayClock.now()}, i.e. in
 * {@code pos.businessday.timezone}. Attaching any other zone at serialization time does not
 * re-express that moment, it invents a different one. Attaching {@code ZoneId.systemDefault()}
 * (which {@code BillbullBackendApplication} pins to {@code Asia/Dubai} for every tenant) shifted
 * an India-profile session opened at 10:05 IST to 11:35, i.e. into the future relative to the
 * browser's own clock. UAE tenants were unaffected only because their configured zone happened
 * to equal that pin — which is exactly why the coincidence had to stop being load-bearing.
 *
 * <p>Deliberately host-independent: every assertion names the expected zone explicitly rather
 * than comparing against the JVM default, so the suite reads the same on a UTC CI box, on the
 * IST developer machine, and on a Dubai host.
 */
class PosSessionTimestampZoneTest {

    private static final LocalDateTime STAMPED = LocalDateTime.of(2026, 9, 1, 10, 5, 52);

    /** Constructing a clock publishes its zone — the same thing that happens once at startup. */
    private static PosSession sessionUnderTenantZone(String tenantZone) {
        new BusinessDayClock(tenantZone);
        PosSession session = new PosSession();
        session.setOpenedAt(STAMPED);
        session.setClosedAt(STAMPED.plusHours(6));
        return session;
    }

    /** The app's Jackson setup: ISO strings, not epochs, with spring.jackson.time-zone=Asia/Dubai. */
    private static ObjectMapper appObjectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        mapper.setTimeZone(TimeZone.getTimeZone("Asia/Dubai"));
        return mapper;
    }

    @Test
    @DisplayName("India tenant: openedAt is presented as IST, not as the pinned JVM zone")
    void indiaTenantPresentsIst() {
        PosSession session = sessionUnderTenantZone("Asia/Kolkata");

        ZonedDateTime openedAt = session.getOpenedAtZoned();
        assertEquals(ZoneId.of("Asia/Kolkata"), openedAt.getZone());
        assertEquals(ZonedDateTime.of(STAMPED, ZoneId.of("Asia/Kolkata")).toInstant(), openedAt.toInstant());
        assertEquals(ZoneId.of("Asia/Kolkata"), session.getClosedAtZoned().getZone());
    }

    @Test
    @DisplayName("UAE tenant: unchanged — openedAt is still presented as Dubai time")
    void uaeTenantIsUnchanged() {
        PosSession session = sessionUnderTenantZone("Asia/Dubai");

        ZonedDateTime openedAt = session.getOpenedAtZoned();
        assertEquals(ZoneId.of("Asia/Dubai"), openedAt.getZone());
        assertEquals(ZonedDateTime.of(STAMPED, ZoneId.of("Asia/Dubai")).toInstant(), openedAt.toInstant());
    }

    @Test
    @DisplayName("The stamped wall-clock reading is preserved verbatim in the tenant's own zone")
    void wallClockReadingIsPreservedNotShifted() {
        for (String tenantZone : new String[] { "Asia/Kolkata", "Asia/Dubai", "UTC" }) {
            PosSession session = sessionUnderTenantZone(tenantZone);
            assertEquals(STAMPED, session.getOpenedAtZoned().toLocalDateTime(),
                    "wall time must survive serialization untouched for " + tenantZone);
            assertEquals(STAMPED, session.getOpenedAt(),
                    "the persisted column must not be rewritten for " + tenantZone);
        }
    }

    @Test
    @DisplayName("Serialized JSON carries the instant the session was really opened")
    void serializedJsonCarriesTheCorrectInstant() throws Exception {
        PosSession session = sessionUnderTenantZone("Asia/Kolkata");

        String json = appObjectMapper().writeValueAsString(session.getOpenedAtZoned());
        ZonedDateTime roundTripped = ZonedDateTime.parse(json.replace("\"", ""));

        // Jackson renders it in the context timezone (spring.jackson.time-zone=Asia/Dubai), so the
        // literal offset in the JSON is +04:00 — an instant-preserving re-expression, which the
        // browser converts back to its own locale. What must never change is the instant itself.
        assertEquals(ZonedDateTime.of(STAMPED, ZoneId.of("Asia/Kolkata")).toInstant(), roundTripped.toInstant());
        assertEquals(STAMPED, roundTripped.withZoneSameInstant(ZoneId.of("Asia/Kolkata")).toLocalDateTime());
    }
}
