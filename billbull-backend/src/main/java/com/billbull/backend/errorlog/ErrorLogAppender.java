package com.billbull.backend.errorlog;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.classic.spi.ThrowableProxy;
import ch.qos.logback.core.UnsynchronizedAppenderBase;

/**
 * Turns ERROR log lines into error-log entries, which is how failures outside a web request —
 * scheduled jobs (GL balance rebuild, print-job sweeps, session schedulers), async work, startup
 * seeders — reach the control plane. Attached to the root logger by {@link ErrorLogAppenderInstaller}.
 *
 * <p>On a request thread the line is held until {@link ErrorCaptureFilter} decides: if the request
 * recorded its own exception the line is the same fault and is dropped. Loggers whose ERROR lines
 * always accompany an exception that is captured anyway (the exception handler, Hibernate's SQL
 * helper, Tomcat's servlet wrapper) are skipped, as is this package — which also stops a failure
 * to record from recording itself.
 */
public class ErrorLogAppender extends UnsynchronizedAppenderBase<ILoggingEvent> {

    private static final Set<String> SKIPPED_LOGGERS = Set.of(
            "com.billbull.backend.exception.GlobalExceptionHandler",
            "com.billbull.backend.logging.RequestLoggingFilter",
            "client-logs",
            "org.hibernate.engine.jdbc.spi.SqlExceptionHelper",
            "org.hibernate.engine.jdbc.batch.internal.BatchingBatch",
            "org.springframework.boot.web.servlet.support.ErrorPageFilter");
    private static final String OWN_PACKAGE = "com.billbull.backend.errorlog";
    private static final int MAX_PER_REQUEST = 5;

    private static final ThreadLocal<List<CapturedError>> REQUEST_BUFFER = new ThreadLocal<>();

    private final ErrorLogService service;

    public ErrorLogAppender(ErrorLogService service) {
        this.service = service;
    }

    /** Starts holding ERROR lines for the current request thread. */
    static List<CapturedError> beginRequest() {
        List<CapturedError> list = new ArrayList<>(2);
        REQUEST_BUFFER.set(list);
        return list;
    }

    static void endRequest() {
        REQUEST_BUFFER.remove();
    }

    @Override
    protected void append(ILoggingEvent event) {
        if (!event.getLevel().isGreaterOrEqual(Level.ERROR) || !service.isEnabled()) return;
        String logger = event.getLoggerName();
        if (logger == null || SKIPPED_LOGGERS.contains(logger) || logger.startsWith(OWN_PACKAGE)
                || logger.startsWith("org.apache.catalina.core.ContainerBase")) {
            return;
        }
        String thread = Thread.currentThread().getName();
        if ("error-log-writer".equals(thread)) return;
        try {
            CapturedError e = toCaptured(event, thread);
            List<CapturedError> buffer = REQUEST_BUFFER.get();
            if (buffer != null) {
                if (buffer.size() < MAX_PER_REQUEST) buffer.add(e);
            } else {
                service.record(e);
            }
        } catch (RuntimeException ignored) {
            // an appender must never throw
        }
    }

    static CapturedError toCaptured(ILoggingEvent event, String thread) {
        CapturedError e = new CapturedError();
        boolean onRequest = REQUEST_BUFFER.get() != null;
        e.source = onRequest ? CapturedError.Source.LOG : CapturedError.Source.JOB;
        e.logger = event.getLoggerName();
        e.occurredAt = java.time.Instant.ofEpochMilli(event.getTimeStamp());
        IThrowableProxy proxy = event.getThrowableProxy();
        if (proxy instanceof ThrowableProxy tp && tp.getThrowable() != null) {
            ErrorCaptureSupport.describe(e, tp.getThrowable());
            if (e.rootCauseMessage == null) e.rootCauseMessage = e.message;
        } else if (proxy != null) {
            e.exceptionClass = ErrorCaptureSupport.clip(proxy.getClassName(), 200);
            e.rootCauseMessage = ErrorCaptureSupport.clipRedacted(proxy.getMessage(), 2000);
        }
        e.message = ErrorCaptureSupport.clipRedacted(event.getFormattedMessage(), 2000);
        if (e.topFrame == null) e.topFrame = ErrorCaptureSupport.clip(e.logger + " [" + thread + "]", 400);
        if (onRequest) ErrorLogService.fillFromLogContext(e);
        return e;
    }
}
