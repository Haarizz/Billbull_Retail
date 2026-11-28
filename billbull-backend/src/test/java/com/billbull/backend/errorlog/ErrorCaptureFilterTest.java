package com.billbull.backend.errorlog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import jakarta.servlet.ServletException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.LoggingEvent;

@ExtendWith(MockitoExtension.class)
class ErrorCaptureFilterTest {

    @Mock
    ErrorLogService service;

    @Test
    void recordsControllerExceptionWithFinalStatus() throws Exception {
        ErrorCaptureFilter filter = new ErrorCaptureFilter(service);
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/sales/invoices/5");
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.capture(req, res, null, List.of());
        verify(service, never()).record(any());

        req.setAttribute(ErrorCaptureResolver.EXCEPTION_ATTRIBUTE, new NullPointerException("unit is null"));
        res.setStatus(400);
        filter.capture(req, res, null, List.of());
        ArgumentCaptor<CapturedError> c = ArgumentCaptor.forClass(CapturedError.class);
        verify(service).record(c.capture());
        assertThat(c.getValue().source).isEqualTo(CapturedError.Source.SERVER);
        assertThat(c.getValue().exceptionClass).isEqualTo(NullPointerException.class.getName());
        assertThat(c.getValue().httpStatus).isEqualTo(400);
        assertThat(c.getValue().path).isEqualTo("/api/sales/invoices/5");
        assertThat(c.getValue().httpMethod).isEqualTo("POST");
    }

    @Test
    void escapedExceptionIsRecordedAs500AndRethrown() {
        when(service.isEnabled()).thenReturn(true);
        ErrorCaptureFilter filter = new ErrorCaptureFilter(service);
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/reports/x");
        MockHttpServletResponse res = new MockHttpServletResponse();
        assertThatThrownBy(() -> filter.doFilter(req, res, (rq, rs) -> {
            throw new ServletException(new IllegalStateException("boom"));
        })).isInstanceOf(ServletException.class);
        ArgumentCaptor<CapturedError> c = ArgumentCaptor.forClass(CapturedError.class);
        verify(service).record(c.capture());
        assertThat(c.getValue().httpStatus).isEqualTo(500);
        assertThat(c.getValue().exceptionClass).isEqualTo(IllegalStateException.class.getName());
    }

    @Test
    void expectedRefusalIsNotRecordedAndDropsItsLogLines() {
        ErrorCaptureFilter filter = new ErrorCaptureFilter(service);
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/users");
        req.setAttribute(ErrorCaptureResolver.EXCEPTION_ATTRIBUTE, new AccessDeniedException("no"));
        MockHttpServletResponse res = new MockHttpServletResponse();
        res.setStatus(403);
        filter.capture(req, res, null, List.of(new CapturedError()));
        verify(service, never()).record(any());
    }

    @Test
    void errorLogLinesOfAnOtherwiseCleanRequestAreRecorded() {
        ErrorCaptureFilter filter = new ErrorCaptureFilter(service);
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/pos/print");
        MockHttpServletResponse res = new MockHttpServletResponse();
        CapturedError logged = new CapturedError();
        logged.source = CapturedError.Source.LOG;
        filter.capture(req, res, null, List.of(logged));
        verify(service).record(logged);
        assertThat(logged.httpStatus).isEqualTo(200);
    }

    @Test
    void appenderHoldsLinesOnRequestThreadsAndSkipsNoisyLoggers() {
        when(service.isEnabled()).thenReturn(true);
        ErrorLogAppender appender = new ErrorLogAppender(service);
        appender.setContext(new LoggerContext());
        appender.start();

        List<CapturedError> buffer = ErrorLogAppender.beginRequest();
        try {
            appender.doAppend(event("com.billbull.backend.pos.printer.X", Level.ERROR, "printer offline"));
            appender.doAppend(event("org.hibernate.engine.jdbc.spi.SqlExceptionHelper", Level.ERROR, "dup"));
            appender.doAppend(event("com.billbull.backend.pos.printer.X", Level.WARN, "slow"));
        } finally {
            ErrorLogAppender.endRequest();
        }
        assertThat(buffer).hasSize(1);
        assertThat(buffer.get(0).message).isEqualTo("printer offline");
        verify(service, never()).record(any());

        appender.doAppend(event("com.billbull.backend.config.GlBalanceRebuildJob", Level.ERROR, "rebuild failed"));
        ArgumentCaptor<CapturedError> c = ArgumentCaptor.forClass(CapturedError.class);
        verify(service).record(c.capture());
        assertThat(c.getValue().source).isEqualTo(CapturedError.Source.JOB);
        assertThat(c.getValue().logger).isEqualTo("com.billbull.backend.config.GlBalanceRebuildJob");
    }

    private static LoggingEvent event(String logger, Level level, String msg) {
        LoggingEvent e = new LoggingEvent();
        e.setLoggerName(logger);
        e.setLevel(level);
        e.setMessage(msg);
        e.setTimeStamp(System.currentTimeMillis());
        return e;
    }
}
