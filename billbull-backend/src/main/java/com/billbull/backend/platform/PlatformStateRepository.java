package com.billbull.backend.platform;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Plain JDBC over {@code platform_tenant_state} (V148); there is deliberately no JPA entity. */
@Repository
public class PlatformStateRepository {

    private static final TypeReference<Map<String, Boolean>> MODULES = new TypeReference<>() {};
    private static final TypeReference<Map<String, Integer>> LIMITS = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public PlatformStateRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public Optional<PlatformState> load() {
        List<PlatformState> rows = jdbc.query(
                "SELECT status, status_message, plan_code, modules_json, limits_json, config_version, updated_at, updated_by"
                        + " FROM platform_tenant_state WHERE id = 1",
                (rs, i) -> new PlatformState(
                        true,
                        TenantLifecycleStatus.parse(rs.getString("status")),
                        rs.getString("status_message"),
                        rs.getString("plan_code"),
                        read(rs.getString("modules_json"), MODULES),
                        read(rs.getString("limits_json"), LIMITS),
                        rs.getLong("config_version"),
                        rs.getObject("updated_at", OffsetDateTime.class),
                        rs.getString("updated_by")));
        return rows.stream().findFirst();
    }

    public void save(PlatformState state) {
        jdbc.update(
                "INSERT INTO platform_tenant_state (id, status, status_message, plan_code, modules_json, limits_json,"
                        + " config_version, updated_at, updated_by)"
                        + " VALUES (1, ?, ?, ?, ?, ?, ?, now(), ?)"
                        + " ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status,"
                        + " status_message = EXCLUDED.status_message, plan_code = EXCLUDED.plan_code,"
                        + " modules_json = EXCLUDED.modules_json, limits_json = EXCLUDED.limits_json,"
                        + " config_version = EXCLUDED.config_version, updated_at = now(), updated_by = EXCLUDED.updated_by",
                state.status().name(), state.statusMessage(), state.planCode(),
                write(state.modules()), write(state.limits()), state.configVersion(), state.updatedBy());
    }

    private <T> T read(String json, TypeReference<T> type) {
        if (json == null || json.isBlank()) return null;
        try {
            return mapper.readValue(json, type);
        } catch (Exception e) {
            throw new IllegalStateException("platform_tenant_state holds unreadable JSON", e);
        }
    }

    private String write(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot serialise platform state", e);
        }
    }
}
