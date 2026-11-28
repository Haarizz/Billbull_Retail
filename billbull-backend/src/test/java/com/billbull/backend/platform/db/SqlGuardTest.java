package com.billbull.backend.platform.db;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.billbull.backend.platform.db.SqlGuard.Mode;
import com.billbull.backend.platform.db.SqlGuard.Rejected;

class SqlGuardTest {

    private static String code(String sql, Mode mode) {
        return assertThrows(Rejected.class, () -> SqlGuard.check(sql, mode)).code();
    }

    @Test
    void readModeAcceptsQueries() {
        assertEquals("select", SqlGuard.check("SELECT * FROM products LIMIT 10", Mode.READ).firstKeyword());
        assertEquals("with", SqlGuard.check("  WITH x AS (SELECT 1) SELECT * FROM x;", Mode.READ).firstKeyword());
        assertEquals("select", SqlGuard.check("(select 1) union (select 2)", Mode.READ).firstKeyword());
        assertEquals("show", SqlGuard.check("show work_mem", Mode.READ).firstKeyword());
        assertEquals("explain", SqlGuard.check("explain select 1", Mode.READ).firstKeyword());
    }

    @Test
    void readModeRefusesWrites() {
        assertEquals("SQL_READ_ONLY", code("UPDATE products SET price = 0", Mode.READ));
        assertEquals("SQL_READ_ONLY", code("delete from x where id = 1", Mode.READ));
        assertEquals("SQL_READ_ONLY", code("-- comment\n/* block */ insert into x values (1)", Mode.READ));
    }

    @Test
    void trailingSemicolonsAreDroppedButTwoStatementsAreRefused() {
        assertEquals("select 1", SqlGuard.check("select 1;", Mode.READ).sql());
        assertEquals("select 1", SqlGuard.check("select 1;;  ", Mode.READ).sql());
        assertEquals("SQL_MULTIPLE_STATEMENTS", code("select 1; drop table products", Mode.READ));
        assertEquals("SQL_MULTIPLE_STATEMENTS", code("select 1; select 2", Mode.WRITE));
    }

    @Test
    void semicolonsInsideLiteralsAndCommentsDoNotSplit() {
        assertEquals("select", SqlGuard.check("select 'a;b', $$x;y$$, $t$;$t$, \"we;ird\" from t -- ;\n", Mode.READ).firstKeyword());
        assertEquals("select", SqlGuard.check("select /* ; /* nested ; */ */ 1", Mode.READ).firstKeyword());
        assertEquals("select", SqlGuard.check("select E'it\\'s;' as s", Mode.READ).firstKeyword());
    }

    @Test
    void forbiddenFunctionsAreRefusedInEveryModeEvenWhenQuoted() {
        assertEquals("SQL_FORBIDDEN", code("select pg_read_file('/etc/passwd')", Mode.READ));
        assertEquals("SQL_FORBIDDEN", code("select \"pg_read_file\"('/etc/passwd')", Mode.READ));
        assertEquals("SQL_FORBIDDEN", code("SELECT PG_TERMINATE_BACKEND (123)", Mode.READ));
        assertEquals("SQL_FORBIDDEN", code("select set_config('session_replication_role','replica',false)", Mode.READ));
        assertEquals("SQL_FORBIDDEN", code("select * from dblink('host=x', 'select 1') as t(a int)", Mode.READ));
        assertEquals("SQL_FORBIDDEN", code("select query_to_xml('delete from x', true, true, '')", Mode.READ));
        assertEquals("SQL_FORBIDDEN", code("select lo_export(1, '/tmp/x')", Mode.WRITE));
        assertEquals("SQL_FORBIDDEN", code("select pg_advisory_lock(1)", Mode.READ));
    }

    @Test
    void forbiddenWordsInsideStringsAreHarmless() {
        assertEquals("select", SqlGuard.check("select 'pg_read_file(x)' as note", Mode.READ).firstKeyword());
        assertEquals("select", SqlGuard.check("select $$copy x to program 'sh'$$", Mode.READ).firstKeyword());
    }

    @Test
    void writeModeRefusesEscapes() {
        assertEquals("SQL_UNSUPPORTED", code("COPY products TO PROGRAM 'curl evil'", Mode.WRITE));
        assertEquals("SQL_FORBIDDEN", code("explain copy products to program 'curl evil'", Mode.WRITE));
        assertEquals("SQL_FORBIDDEN", code("alter system set fsync = off", Mode.WRITE));
        assertEquals("SQL_FORBIDDEN", code("create role x superuser", Mode.WRITE));
        assertEquals("SQL_FORBIDDEN", code("drop database billbull", Mode.WRITE));
        assertEquals("SQL_FORBIDDEN", code("create or replace function f() returns int language sql as 'select 1'", Mode.WRITE));
        assertEquals("SQL_FORBIDDEN", code("alter table access_audit_ledger disable trigger all", Mode.WRITE));
        assertEquals("SQL_FORBIDDEN", code("create temp table t (a int)", Mode.WRITE));
        assertEquals("SQL_FORBIDDEN", code("select u&\"\\0070g_read_file\"('x')", Mode.READ));
        assertEquals("SQL_UNSUPPORTED", code("DO $$ begin perform 1; end $$", Mode.WRITE));
        assertEquals("SQL_UNSUPPORTED", code("set role postgres", Mode.WRITE));
        assertEquals("SQL_UNSUPPORTED", code("begin", Mode.WRITE));
        assertEquals("SQL_UNSUPPORTED", code("grant all on products to public", Mode.WRITE));
        assertEquals("SQL_UNSUPPORTED", code("call do_things()", Mode.WRITE));
    }

    @Test
    void writeModeFlagsDestructiveAndAutocommitStatements() {
        assertTrue(SqlGuard.check("delete from products", Mode.WRITE).destructive());
        assertFalse(SqlGuard.check("delete from products where id = 1", Mode.WRITE).destructive());
        assertTrue(SqlGuard.check("update products set price = 1", Mode.WRITE).destructive());
        assertTrue(SqlGuard.check("truncate products", Mode.WRITE).destructive());
        assertTrue(SqlGuard.check("drop index idx_x", Mode.WRITE).destructive());
        assertTrue(SqlGuard.check("alter table products drop column x", Mode.WRITE).destructive());
        assertFalse(SqlGuard.check("alter table products add column x int", Mode.WRITE).destructive());

        assertTrue(SqlGuard.check("create index concurrently idx_a on t (a)", Mode.WRITE).needsAutocommit());
        assertTrue(SqlGuard.check("vacuum analyze products", Mode.WRITE).needsAutocommit());
        assertFalse(SqlGuard.check("create index idx_a on t (a)", Mode.WRITE).needsAutocommit());
    }

    @Test
    void emptyOrUnterminatedInputIsRefused() {
        assertEquals("SQL_EMPTY", code("   ", Mode.READ));
        assertEquals("SQL_EMPTY", code(" ; ", Mode.READ));
        assertEquals("SQL_EMPTY", code("-- just a comment", Mode.READ));
        assertEquals("SQL_UNTERMINATED", code("select 'abc", Mode.READ));
        assertEquals("SQL_UNTERMINATED", code("select $$abc", Mode.READ));
        assertEquals("SQL_UNTERMINATED", code("select /* x", Mode.READ));
    }

    @Test
    void jdbcUrlParsingForPgDump() {
        var t = PlatformDbConnections.parse("jdbc:postgresql://localhost:5433/billbull_demo?sslmode=disable");
        assertEquals("localhost", t.host());
        assertEquals(5433, t.port());
        assertEquals("billbull_demo", t.database());
        assertEquals(5432, PlatformDbConnections.parse("jdbc:postgresql://db.internal/testdb").port());
        assertThrows(PlatformDbException.class, () -> PlatformDbConnections.parse("jdbc:h2:mem:x"));
    }
}
