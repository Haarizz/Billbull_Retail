package com.billbull.backend.platform.db;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks one statement typed into the control plane's database console before it reaches
 * PostgreSQL.
 *
 * <p>This is a second line of defence, not the first. A READ statement always runs inside a
 * {@code READ ONLY} transaction, on its own connection that is closed afterwards, so PostgreSQL
 * itself refuses writes and nothing the statement sets can leak into the application's pool. What
 * a read-only transaction does <em>not</em> stop is reaching outside the database: server files
 * ({@code pg_read_file}, {@code COPY … PROGRAM}), other sessions ({@code pg_terminate_backend}),
 * server settings, roles, or switching off the triggers that keep the audit ledgers append-only
 * ({@code session_replication_role}, {@code DISABLE TRIGGER}). Those are refused here in every
 * mode — the tenant's database login is often a superuser.
 *
 * <p>The scan strips comments and string literals first (so {@code 'pg_read_file'} inside a string
 * is harmless) and unquotes identifiers (so {@code "pg_read_file"(…)} is still caught). Exactly
 * one statement is allowed: the PostgreSQL driver would otherwise run {@code SELECT 1; DROP …}
 * as two.
 */
public final class SqlGuard {

    public enum Mode { READ, WRITE }

    /**
     * @param firstKeyword     lower-case first word of the statement
     * @param needsAutocommit  the statement can't run inside a transaction (VACUUM, … CONCURRENTLY)
     * @param destructive      DROP/TRUNCATE, or UPDATE/DELETE without WHERE: the caller must confirm
     * @param sql              the statement as it will be sent, without its semicolons
     */
    public record Verdict(String firstKeyword, boolean needsAutocommit, boolean destructive, String sql) {}

    public static final class Rejected extends RuntimeException {
        private final String code;

        Rejected(String code, String message) {
            super(message);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }

    public static final int MAX_SQL_LENGTH = 100_000;

    static final Set<String> READ_FIRST_WORDS = Set.of("select", "with", "explain", "show", "values", "table");

    /** First words a WRITE statement may start with. Everything else (DO, CALL, SET, BEGIN, GRANT …) is refused. */
    static final Set<String> WRITE_FIRST_WORDS = Set.of(
            "select", "with", "explain", "show", "values", "table",
            "insert", "update", "delete", "merge", "truncate",
            "create", "alter", "drop", "comment",
            "vacuum", "analyze", "analyse", "reindex", "cluster", "refresh");

    private static final List<Pattern> FORBIDDEN = List.of(
            // server files, shell, large objects
            word("copy"),
            fn("pg_read_file"), fn("pg_read_binary_file"), fn("pg_ls_\\w+"), fn("pg_stat_file"), fn("pg_file_\\w+"),
            fn("lo_\\w+"), fn("lo_import"), fn("lo_export"),
            // other sessions, server state, replication
            fn("pg_terminate_backend"), fn("pg_cancel_backend"), fn("pg_reload_conf"), fn("pg_rotate_logfile"),
            fn("pg_promote"), fn("pg_switch_wal"), fn("pg_create_\\w+"), fn("pg_drop_replication_slot"),
            fn("pg_logical_\\w+"), fn("pg_replication_\\w+"), fn("pg_advisory\\w*"), fn("pg_try_advisory\\w*"),
            // settings, dynamic SQL, other databases
            fn("set_config"), fn("dblink\\w*"), fn("query_to_xml\\w*"), fn("cursor_to_xml\\w*"),
            fn("query_to_xmlschema"),
            Pattern.compile("\\balter\\s+system\\b"),
            Pattern.compile("\\b(create|alter|drop)\\s+(role|user|group|database|tablespace|extension|server|"
                    + "foreign\\s+data\\s+wrapper|user\\s+mapping|subscription|publication|event\\s+trigger|language)\\b"),
            Pattern.compile("\\bcreate\\s+(or\\s+replace\\s+)?(function|procedure|trigger|rule|aggregate|operator|cast|"
                    + "transform|constraint\\s+trigger)\\b"),
            Pattern.compile("\\bsession_replication_role\\b"),
            Pattern.compile("\\bset\\s+(local\\s+|session\\s+)?(role|session\\s+authorization)\\b"),
            Pattern.compile("\\b(disable|enable)\\s+(always\\s+|replica\\s+)?trigger\\b"),
            Pattern.compile("\\bsecurity\\s+label\\b"),
            Pattern.compile("\\bimport\\s+foreign\\s+schema\\b"),
            Pattern.compile("\\b(temp|temporary)\\s+table\\b"));

    private static final Pattern UNICODE_ESCAPE = Pattern.compile("(?i)\\bu&[\"']");
    private static final Pattern FIRST_WORD = Pattern.compile("^[\\s(]*([a-z_]+)");
    private static final Pattern CONCURRENTLY = Pattern.compile("\\bconcurrently\\b");
    private static final Pattern WHERE = Pattern.compile("\\bwhere\\b");
    private static final Pattern ALTER_DROP = Pattern.compile("^alter\\s+table\\b.*\\bdrop\\b", Pattern.DOTALL);

    private SqlGuard() {}

    private static Pattern word(String w) {
        return Pattern.compile("\\b" + w + "\\b");
    }

    private static Pattern fn(String name) {
        return Pattern.compile("\\b" + name + "\\s*\\(");
    }

    public static Verdict check(String sql, Mode mode) {
        if (sql == null || sql.isBlank()) throw new Rejected("SQL_EMPTY", "Type a statement to run");
        if (sql.length() > MAX_SQL_LENGTH) throw new Rejected("SQL_TOO_LONG", "Statements are limited to 100,000 characters");
        if (UNICODE_ESCAPE.matcher(sql).find()) {
            throw new Rejected("SQL_FORBIDDEN", "U&'…' escapes are not allowed in the console");
        }
        Scan scan = scan(sql);
        String norm = scan.text.toLowerCase(Locale.ROOT);
        String[] parts = norm.split(";", -1);
        int nonBlank = 0;
        for (String p : parts) if (!p.isBlank()) nonBlank++;
        if (nonBlank == 0) throw new Rejected("SQL_EMPTY", "Type a statement to run");
        if (nonBlank > 1) {
            throw new Rejected("SQL_MULTIPLE_STATEMENTS", "Run one statement at a time (select it and press Run)");
        }
        // Only a trailing semicolon is allowed; drop it so the driver sees one clean statement.
        String body = stripSemicolons(sql, scan.semicolons());
        String normBody = norm.replace(";", " ").trim();

        Matcher m = FIRST_WORD.matcher(normBody);
        if (!m.find()) throw new Rejected("SQL_UNSUPPORTED", "Could not read the statement's first keyword");
        String first = m.group(1);

        Set<String> allowed = mode == Mode.READ ? READ_FIRST_WORDS : WRITE_FIRST_WORDS;
        if (!allowed.contains(first)) {
            throw new Rejected(mode == Mode.READ ? "SQL_READ_ONLY" : "SQL_UNSUPPORTED",
                    mode == Mode.READ
                            ? "Read mode runs SELECT, WITH, EXPLAIN, SHOW, VALUES and TABLE only. Switch to write mode to change data."
                            : "\"" + first.toUpperCase(Locale.ROOT) + "\" statements are not allowed in the console");
        }
        for (Pattern p : FORBIDDEN) {
            Matcher f = p.matcher(normBody);
            if (f.find()) {
                throw new Rejected("SQL_FORBIDDEN", "\"" + f.group().trim().replaceAll("\\s*\\($", "")
                        + "\" is not allowed in the console: it reaches outside this client's data"
                        + " or switches off its safeguards");
            }
        }

        boolean autocommit = first.equals("vacuum")
                || (CONCURRENTLY.matcher(normBody).find()
                    && (first.equals("create") || first.equals("drop") || first.equals("reindex")));
        boolean destructive = first.equals("drop") || first.equals("truncate")
                || ((first.equals("delete") || first.equals("update")) && !WHERE.matcher(normBody).find())
                || ALTER_DROP.matcher(normBody).find();
        return new Verdict(first, autocommit, destructive, body);
    }

    /** Only one non-blank statement is left, so every top-level semicolon is leading or trailing. */
    private static String stripSemicolons(String sql, List<Integer> positions) {
        if (positions.isEmpty()) return sql.trim();
        StringBuilder b = new StringBuilder(sql);
        for (int p : positions) b.setCharAt(p, ' ');
        return b.toString().trim();
    }

    record Scan(String text, List<Integer> semicolons) {}

    /**
     * Copies {@code sql} with comments replaced by a space, string and dollar-quoted literals by
     * {@code ''} and double-quoted identifiers by their bare text. Records where the last top-level
     * semicolon was in the original.
     */
    static Scan scan(String sql) {
        StringBuilder out = new StringBuilder(sql.length());
        int n = sql.length();
        List<Integer> semis = new java.util.ArrayList<>();
        int i = 0;
        while (i < n) {
            char c = sql.charAt(i);
            char next = i + 1 < n ? sql.charAt(i + 1) : '\0';
            if (c == '-' && next == '-') {
                while (i < n && sql.charAt(i) != '\n') i++;
                out.append(' ');
            } else if (c == '/' && next == '*') {
                int depth = 1;
                i += 2;
                while (i < n && depth > 0) {
                    if (sql.startsWith("/*", i)) { depth++; i += 2; }
                    else if (sql.startsWith("*/", i)) { depth--; i += 2; }
                    else i++;
                }
                if (depth > 0) throw new Rejected("SQL_UNTERMINATED", "A /* comment is not closed");
                out.append(' ');
            } else if (c == '\'') {
                boolean escapes = i > 0 && (sql.charAt(i - 1) == 'e' || sql.charAt(i - 1) == 'E')
                        && (i < 2 || !isIdentChar(sql.charAt(i - 2)));
                i++;
                boolean closed = false;
                while (i < n) {
                    char s = sql.charAt(i);
                    if (escapes && s == '\\') { i += 2; continue; }
                    if (s == '\'') {
                        if (i + 1 < n && sql.charAt(i + 1) == '\'') { i += 2; continue; }
                        i++;
                        closed = true;
                        break;
                    }
                    i++;
                }
                if (!closed) throw new Rejected("SQL_UNTERMINATED", "A quoted string is not closed");
                out.append("''");
            } else if (c == '"') {
                i++;
                boolean closed = false;
                while (i < n) {
                    char s = sql.charAt(i);
                    if (s == '"') {
                        if (i + 1 < n && sql.charAt(i + 1) == '"') { out.append('"'); i += 2; continue; }
                        i++;
                        closed = true;
                        break;
                    }
                    out.append(s == ';' ? ' ' : s); // a ; inside "…" is part of the name, not a statement break
                    i++;
                }
                if (!closed) throw new Rejected("SQL_UNTERMINATED", "A quoted identifier is not closed");
            } else if (c == '$' && (i == 0 || !isIdentChar(sql.charAt(i - 1)))) {
                Matcher tag = DOLLAR_TAG.matcher(sql).region(i, n);
                if (tag.lookingAt()) {
                    String t = tag.group();
                    int end = sql.indexOf(t, i + t.length());
                    if (end < 0) throw new Rejected("SQL_UNTERMINATED", "A $$ quoted string is not closed");
                    i = end + t.length();
                    out.append("''");
                } else {
                    out.append(c);
                    i++;
                }
            } else {
                if (c == ';') semis.add(i);
                out.append(c);
                i++;
            }
        }
        return new Scan(out.toString(), semis);
    }

    private static final Pattern DOLLAR_TAG = Pattern.compile("\\$([A-Za-z_][A-Za-z0-9_]*)?\\$");

    private static boolean isIdentChar(char c) {
        return Character.isLetterOrDigit(c) || c == '_' || c == '$';
    }
}
