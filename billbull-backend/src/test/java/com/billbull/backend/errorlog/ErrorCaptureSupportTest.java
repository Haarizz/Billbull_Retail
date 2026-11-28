package com.billbull.backend.errorlog;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.sql.SQLException;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

import com.billbull.backend.financials.generalledger.postingengine.PostingErrorCode;
import com.billbull.backend.financials.generalledger.postingengine.PostingException;

class ErrorCaptureSupportTest {

    @Test
    void expectedRefusalsAreNotRecorded() {
        assertThat(ErrorCaptureSupport.shouldRecord(new AccessDeniedException("no"), 403)).isFalse();
        assertThat(ErrorCaptureSupport.shouldRecord(new ResponseStatusException(HttpStatus.NOT_FOUND, "x"), 404)).isFalse();
        assertThat(ErrorCaptureSupport.shouldRecord(new RuntimeException(new IOException("Broken pipe")), 500)).isFalse();
    }

    @Test
    void faultsAndBusinessRefusalsAreRecorded() {
        assertThat(ErrorCaptureSupport.shouldRecord(new NullPointerException(), 400)).isTrue();
        assertThat(ErrorCaptureSupport.shouldRecord(new RuntimeException("Insufficient stock"), 400)).isTrue();
        assertThat(ErrorCaptureSupport.shouldRecord(new ResponseStatusException(HttpStatus.BAD_GATEWAY, "x"), 502)).isTrue();
        assertThat(ErrorCaptureSupport.shouldRecord(null, 503)).isTrue();
        assertThat(ErrorCaptureSupport.shouldRecord(null, 404)).isFalse();
    }

    @Test
    void describeTakesSqlStateRootCauseAndAppFrame() {
        SQLException sql = new SQLException("ERROR: duplicate key value violates unique constraint \"uk_products_code\""
                + " Detail: Key (code)=(ABC-1) already exists.", "23505");
        DataIntegrityViolationException ex = new DataIntegrityViolationException("could not execute statement", sql);
        CapturedError e = new CapturedError();
        ErrorCaptureSupport.describe(e, ex);
        assertThat(e.exceptionClass).isEqualTo(DataIntegrityViolationException.class.getName());
        assertThat(e.rootCauseClass).isEqualTo(SQLException.class.getName());
        assertThat(e.sqlState).isEqualTo("23505");
        assertThat(e.causeChain).isEqualTo("DataIntegrityViolationException > SQLException");
        assertThat(e.topFrame).startsWith("com.billbull.backend.errorlog.ErrorCaptureSupportTest.describeTakesSqlState");
        assertThat(e.stackTrace).contains("Caused by: java.sql.SQLException");
    }

    @Test
    void topFrameSkipsServletFilters() {
        RuntimeException ex = new RuntimeException("x");
        ex.setStackTrace(new StackTraceElement[] {
                new StackTraceElement("org.springframework.web.Foo", "bar", "Foo.java", 1),
                new StackTraceElement("com.billbull.backend.platform.PlatformPolicyFilter", "doFilterInternal", "P.java", 80),
                new StackTraceElement("com.billbull.backend.sales.SalesService", "save", "S.java", 12),
        });
        assertThat(ErrorCaptureSupport.topFrame(java.util.List.of(ex))).isEqualTo("com.billbull.backend.sales.SalesService.save:12");

        RuntimeException onlyFilters = new RuntimeException("y");
        onlyFilters.setStackTrace(new StackTraceElement[] {
                new StackTraceElement("org.springframework.web.Foo", "bar", "Foo.java", 1),
                new StackTraceElement("com.billbull.backend.platform.PlatformPolicyFilter", "doFilterInternal", "P.java", 80),
        });
        assertThat(ErrorCaptureSupport.topFrame(java.util.List.of(onlyFilters))).isEqualTo("org.springframework.web.Foo.bar:1");
    }

    @Test
    void describeCarriesPostingCode() {
        CapturedError e = new CapturedError();
        ErrorCaptureSupport.describe(e, new PostingException(PostingErrorCode.PERIOD_LOCKED, "Period is closed"));
        assertThat(e.errorCode).isEqualTo("PERIOD_LOCKED");
    }

    @Test
    void pathTemplateReplacesIdentifiersOnly() {
        assertThat(ErrorCaptureSupport.pathTemplate("/api/sales/invoices/1234/print?x=1"))
                .isEqualTo("/api/sales/invoices/{id}/print");
        assertThat(ErrorCaptureSupport.pathTemplate("/api/pos/v2/checkout")).isEqualTo("/api/pos/v2/checkout");
        assertThat(ErrorCaptureSupport.pathTemplate("/api/grns/GRN-00012"))
                .isEqualTo("/api/grns/{id}");
        assertThat(ErrorCaptureSupport.pathTemplate("/api/x/0195b4a2-7c1d-7e00-8a11-2b3c4d5e6f70"))
                .isEqualTo("/api/x/{id}");
    }

    @Test
    void sameFaultWithDifferentValuesSharesAFingerprint() {
        CapturedError a = server("Insufficient stock for 'A1': short by 3", "/api/sales/invoices/10");
        CapturedError b = server("Insufficient stock for 'B77': short by 12", "/api/sales/invoices/99");
        CapturedError c = server("Customer credit limit exceeded", "/api/sales/invoices/10");
        assertThat(ErrorCaptureSupport.fingerprint(a)).isEqualTo(ErrorCaptureSupport.fingerprint(b));
        assertThat(ErrorCaptureSupport.fingerprint(a)).isNotEqualTo(ErrorCaptureSupport.fingerprint(c));
    }

    @Test
    void redactsPersonalAndSecretValues() {
        String r = ErrorCaptureSupport.redact("mail a.b@shop.ae card 4111 1111 1111 1111 phone +971501234567 "
                + "password=hunter2 Bearer abcdefghijklmnop invoice 1024 qty 3.5");
        assertThat(r).doesNotContain("a.b@shop.ae", "4111", "971501234567", "hunter2", "abcdefghijklmnop");
        assertThat(r).contains("[email]", "[number]", "password=[redacted]", "Bearer [token]", "invoice 1024", "qty 3.5");
    }

    @Test
    void clientUrlPathIgnoresQueryAndHost() {
        assertThat(ErrorLogService.urlPath("https://shop.billbull.app/sales/pos?customer=Ali")).isEqualTo("/sales/pos");
        assertThat(ErrorLogService.urlPath(null)).isNull();
    }

    private static CapturedError server(String message, String path) {
        CapturedError e = new CapturedError();
        e.source = CapturedError.Source.SERVER;
        e.exceptionClass = RuntimeException.class.getName();
        e.message = message;
        e.httpMethod = "POST";
        e.path = path;
        e.topFrame = "com.billbull.backend.sales.SalesService.save:120";
        return e;
    }
}
