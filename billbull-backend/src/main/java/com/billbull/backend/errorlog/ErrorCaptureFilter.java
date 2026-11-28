package com.billbull.backend.errorlog;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Records a request's error once the response status is known. Runs just inside
 * {@code RequestLoggingFilter}, so the request id, user and branch are still in the log context.
 *
 * <ul>
 *   <li>An exception from a controller (parked by {@link ErrorCaptureResolver}) or one that
 *       escaped the filter chain is recorded unless it is an expected refusal
 *       ({@link ErrorCaptureSupport#shouldRecord}).</li>
 *   <li>A 5xx without an exception is recorded as an HTTP error.</li>
 *   <li>ERROR log lines written while the request ran are recorded only when the request itself
 *       recorded nothing — otherwise they are the same fault told twice.</li>
 * </ul>
 * Capturing can never change the response or fail the request.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class ErrorCaptureFilter extends OncePerRequestFilter {

    private final ErrorLogService service;

    public ErrorCaptureFilter(ErrorLogService service) {
        this.service = service;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        // Browser reports are recorded by ClientLogController itself, as CLIENT errors.
        return !service.isEnabled() || path == null || path.startsWith("/api/client-logs");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        List<CapturedError> logged = ErrorLogAppender.beginRequest();
        Throwable escaped = null;
        try {
            chain.doFilter(request, response);
        } catch (Throwable t) {
            escaped = t;
            throw t;
        } finally {
            ErrorLogAppender.endRequest();
            try {
                capture(request, response, escaped, logged);
            } catch (RuntimeException ignored) {
                // never let bookkeeping fail a request
            }
        }
    }

    void capture(HttpServletRequest request, HttpServletResponse response, Throwable escaped, List<CapturedError> logged) {
        Throwable ex = escaped != null ? unwrap(escaped) : (Throwable) request.getAttribute(ErrorCaptureResolver.EXCEPTION_ATTRIBUTE);
        int status = escaped != null ? 500 : response.getStatus();
        if (ErrorCaptureSupport.shouldRecord(ex, status)) {
            CapturedError e = new CapturedError();
            e.source = CapturedError.Source.SERVER;
            if (ex != null) {
                ErrorCaptureSupport.describe(e, ex);
            } else {
                e.message = "HTTP " + status + " returned without an exception";
            }
            e.httpMethod = request.getMethod();
            e.path = request.getRequestURI();
            e.httpStatus = status;
            ErrorLogService.fillFromLogContext(e);
            service.record(e);
            return;
        }
        if (ex == null && logged != null) {
            for (CapturedError e : logged) {
                e.httpStatus = status;
                service.record(e);
            }
        }
    }

    private static Throwable unwrap(Throwable t) {
        if (t instanceof ServletException se && se.getRootCause() != null) return se.getRootCause();
        return t;
    }
}
