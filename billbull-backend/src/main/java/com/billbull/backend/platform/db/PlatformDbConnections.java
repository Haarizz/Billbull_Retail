package com.billbull.backend.platform.db;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Opens a fresh connection for each console statement or maintenance job instead of borrowing one
 * from the application's pool. Whatever the statement does to its session (settings, cursors,
 * locks held by a long query) ends when the connection closes, and a console query can't starve
 * the till of pooled connections. Sessions show up in {@code pg_stat_activity} as
 * {@code billbull-platform-console}.
 */
@Component
public class PlatformDbConnections {

    public static final String APPLICATION_NAME = "billbull-platform-console";

    private static final Pattern PG_URL = Pattern.compile("^jdbc:postgresql://([^/:?,]+)(?::(\\d+))?/([^?]+)");

    private final Environment env;

    public PlatformDbConnections(Environment env) {
        this.env = env;
    }

    public Connection open(String applicationName) throws SQLException {
        Properties p = new Properties();
        p.setProperty("user", username());
        p.setProperty("password", password());
        p.setProperty("ApplicationName", applicationName == null ? APPLICATION_NAME : applicationName);
        p.setProperty("connectTimeout", "10");
        return DriverManager.getConnection(url(), p);
    }

    public String url() {
        return env.getProperty("spring.datasource.url", "");
    }

    public String username() {
        return env.getProperty("spring.datasource.username", "");
    }

    public String password() {
        return env.getProperty("spring.datasource.password", "");
    }

    /** Host, port and database parsed from the JDBC URL, for pg_dump. */
    public record Target(String host, int port, String database) {}

    public Target target() {
        return parse(url());
    }

    static Target parse(String url) {
        Matcher m = PG_URL.matcher(url == null ? "" : url.trim());
        if (!m.find()) {
            throw new PlatformDbException(500, "DATASOURCE_UNSUPPORTED",
                    "Backups need a plain jdbc:postgresql://host[:port]/database URL");
        }
        int port = m.group(2) != null ? Integer.parseInt(m.group(2)) : 5432;
        return new Target(m.group(1), port, m.group(3));
    }
}
