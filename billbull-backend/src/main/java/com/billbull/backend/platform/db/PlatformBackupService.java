package com.billbull.backend.platform.db;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import jakarta.annotation.PreDestroy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.billbull.backend.platform.TenantIdentity;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * On-demand database backups taken from the control plane ({@code POST /api/platform/db/backups}).
 *
 * <p>Runs {@code pg_dump -Fc} into {@code billbull.platform.backups.dir} as
 * {@code <client>-<UTC stamp>.dump.partial}, checks the file with {@code pg_restore --list}, then
 * renames it and writes a {@code .json} sidecar (status, size, SHA-256, who asked). Listing reads the
 * sidecars, so the history survives a restart; only files named after this client are ever listed,
 * opened or deleted, even when several clients share a working directory. The newest
 * {@code billbull.platform.backups.keep} successful dumps are kept.
 *
 * <p>This complements, and doesn't replace, the server's nightly {@code billbull-backup} script:
 * a dump on the database's own disk is lost with that disk. Download important ones.
 */
@Service
public class PlatformBackupService {

    private static final Logger log = LoggerFactory.getLogger(PlatformBackupService.class);
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);

    private final PlatformDbProperties props;
    private final PlatformDbConnections connections;
    private final TenantIdentity tenant;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ExecutorService runner = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "platform-db-backup");
        t.setDaemon(true);
        return t;
    });
    private volatile Map<String, Object> running;

    public PlatformBackupService(PlatformDbProperties props, PlatformDbConnections connections, TenantIdentity tenant,
                                 JdbcTemplate jdbc) {
        this.props = props;
        this.connections = connections;
        this.tenant = tenant;
        this.jdbc = jdbc;
    }

    @PreDestroy
    void stop() {
        runner.shutdownNow();
    }

    Pattern namePattern() {
        return Pattern.compile("^" + Pattern.quote(tenant.code()) + "-\\d{8}T\\d{6}Z\\.dump$");
    }

    private Path dir() {
        return Path.of(props.backupDir()).toAbsolutePath().normalize();
    }

    private void requireEnabled() {
        if (!props.backupsEnabled()) throw PlatformDbException.disabled("DB_BACKUPS_DISABLED", "BILLBULL_PLATFORM_BACKUPS_ENABLED");
    }

    public Map<String, Object> list() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", props.backupsEnabled());
        out.put("keep", props.backupKeep());
        out.put("directory", dir().toString());
        Map<String, Object> r = running;
        out.put("running", r == null ? null : new LinkedHashMap<>(r));
        List<Map<String, Object>> items = new ArrayList<>();
        Path d = dir();
        if (Files.isDirectory(d)) {
            String prefix = tenant.code() + "-";
            try (DirectoryStream<Path> ds = Files.newDirectoryStream(d, prefix + "*.dump.json")) {
                for (Path p : ds) {
                    try {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> m = mapper.readValue(p.toFile(), LinkedHashMap.class);
                        Object name = m.get("name");
                        if (name instanceof String s && namePattern().matcher(s).matches()) {
                            m.put("present", Files.isRegularFile(d.resolve(s)));
                            items.add(m);
                        }
                    } catch (IOException e) {
                        log.debug("Unreadable backup sidecar {}: {}", p, e.getMessage());
                    }
                }
            } catch (IOException e) {
                out.put("error", e.getMessage());
            }
        }
        try {
            out.put("diskFreeBytes", Files.isDirectory(d) ? Files.getFileStore(d).getUsableSpace() : null);
        } catch (IOException e) {
            out.put("diskFreeBytes", null);
        }
        items.sort(Comparator.comparing((Map<String, Object> m) -> String.valueOf(m.get("name"))).reversed());
        out.put("backups", items);
        return out;
    }

    public synchronized Map<String, Object> start(String actor, String note) {
        requireEnabled();
        if (running != null) {
            throw new PlatformDbException(409, "BACKUP_RUNNING", "A backup is already running (" + running.get("name") + ")");
        }
        PlatformDbConnections.Target target = connections.target();
        Path d = dir();
        try {
            Files.createDirectories(d);
        } catch (IOException e) {
            throw new PlatformDbException(500, "BACKUP_DIR", "Can't create " + d + ": " + e.getMessage());
        }
        Long dbSize = jdbc.queryForObject("SELECT pg_database_size(current_database())", Long.class);
        try {
            long free = Files.getFileStore(d).getUsableSpace();
            // A custom-format dump is compressed, usually well under half the database size.
            if (dbSize != null && free < dbSize / 2 + 200L * 1024 * 1024) {
                throw new PlatformDbException(507, "BACKUP_NO_SPACE",
                        "Not enough free disk for a dump (" + (free >> 20) + " MB free, database " + (dbSize >> 20) + " MB)");
            }
        } catch (IOException e) {
            log.debug("Free space unknown: {}", e.getMessage());
        }
        String name = tenant.code() + "-" + STAMP.format(Instant.now()) + ".dump";
        Map<String, Object> job = new LinkedHashMap<>();
        job.put("name", name);
        job.put("status", "RUNNING");
        job.put("database", target.database());
        job.put("databaseSizeBytes", dbSize);
        job.put("requestedBy", actor);
        job.put("note", note == null ? null : (note.length() > 300 ? note.substring(0, 300) : note));
        job.put("startedAt", Instant.now().toString());
        running = job;
        runner.submit(() -> run(job, target, d));
        return new LinkedHashMap<>(job);
    }

    private void run(Map<String, Object> job, PlatformDbConnections.Target target, Path d) {
        String name = (String) job.get("name");
        Path partial = d.resolve(name + ".partial");
        Path file = d.resolve(name);
        Path logFile = d.resolve(name + ".log");
        try {
            int code = exec(List.of(props.pgDump(), "-Fc", "--no-password", "-h", target.host(), "-p", String.valueOf(target.port()),
                    "-U", connections.username(), "-f", partial.toString(), target.database()), logFile);
            if (code != 0) throw new IllegalStateException("pg_dump exited " + code + ": " + tail(logFile));
            code = exec(List.of(props.pgRestore(), "--list", partial.toString()), logFile);
            if (code != 0) throw new IllegalStateException("pg_restore --list could not read the dump: " + tail(logFile));
            Files.move(partial, file, StandardCopyOption.ATOMIC_MOVE);
            job.put("status", "SUCCESS");
            job.put("sizeBytes", Files.size(file));
            job.put("sha256", sha256(file));
            job.put("message", "pg_dump ok, verified with pg_restore --list");
        } catch (Exception e) {
            job.put("status", "FAILED");
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            job.put("message", msg.length() > 900 ? msg.substring(0, 900) : msg);
            log.warn("Platform backup {} failed: {}", name, msg);
            deleteQuietly(partial);
        } finally {
            deleteQuietly(logFile);
            job.put("finishedAt", Instant.now().toString());
            try {
                mapper.writerWithDefaultPrettyPrinter().writeValue(d.resolve(name + ".json").toFile(), job);
            } catch (IOException e) {
                log.warn("Could not write backup sidecar for {}: {}", name, e.getMessage());
            }
            running = null;
            prune(d);
        }
    }

    private int exec(List<String> command, Path logFile) throws IOException, InterruptedException {
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.environment().put("PGPASSWORD", connections.password());
        pb.environment().put("PGAPPNAME", "billbull-platform-backup");
        pb.redirectErrorStream(true);
        pb.redirectOutput(logFile.toFile());
        Process p;
        try {
            p = pb.start();
        } catch (IOException e) {
            throw new IOException("Could not start " + command.get(0)
                    + " (set billbull.platform.backups.pg-dump / pg-restore to the full path): " + e.getMessage(), e);
        }
        if (!p.waitFor(props.backupMaxMinutes(), TimeUnit.MINUTES)) {
            p.destroyForcibly();
            throw new IllegalStateException(command.get(0) + " took longer than " + props.backupMaxMinutes() + " minutes");
        }
        return p.exitValue();
    }

    /** Keeps the newest {@code keep} successful dumps and the newest 5 failure records. */
    private void prune(Path d) {
        try {
            List<Map<String, Object>> items = castList(list().get("backups"));
            int ok = 0;
            int failed = 0;
            for (Map<String, Object> m : items) {
                boolean success = "SUCCESS".equals(m.get("status"));
                boolean keep = success ? ++ok <= props.backupKeep() : ++failed <= 5;
                if (!keep) remove(d, String.valueOf(m.get("name")));
            }
        } catch (RuntimeException e) {
            log.warn("Backup pruning failed: {}", e.getMessage());
        }
    }

    public Path open(String name) {
        requireEnabled();
        Path file = validated(name);
        if (!Files.isRegularFile(file)) throw new PlatformDbException(404, "BACKUP_NOT_FOUND", "Backup " + name + " is not on the server");
        return file;
    }

    public Map<String, Object> delete(String name) {
        requireEnabled();
        validated(name);
        if (running != null && name.equals(running.get("name"))) {
            throw new PlatformDbException(409, "BACKUP_RUNNING", "That backup is still running");
        }
        boolean removed = remove(dir(), name);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", name);
        out.put("deleted", removed);
        return out;
    }

    private Path validated(String name) {
        if (name == null || !namePattern().matcher(name).matches()) {
            throw new PlatformDbException(400, "BACKUP_NAME", "Not a backup name for this client");
        }
        Path d = dir();
        Path file = d.resolve(name).normalize();
        if (!file.getParent().equals(d)) throw new PlatformDbException(400, "BACKUP_NAME", "Not a backup name for this client");
        return file;
    }

    private static boolean remove(Path d, String name) {
        boolean a = deleteQuietly(d.resolve(name));
        boolean b = deleteQuietly(d.resolve(name + ".json"));
        return a || b;
    }

    private static boolean deleteQuietly(Path p) {
        try {
            return Files.deleteIfExists(p);
        } catch (IOException e) {
            return false;
        }
    }

    private static String tail(Path logFile) {
        try {
            String s = Files.readString(logFile, StandardCharsets.UTF_8).trim();
            return s.length() > 600 ? "…" + s.substring(s.length() - 600) : s;
        } catch (IOException e) {
            return "(no output)";
        }
    }

    static String sha256(Path file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = Files.newInputStream(file)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        return HexFormat.of().formatHex(md.digest());
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> castList(Object o) {
        return o instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    }
}
