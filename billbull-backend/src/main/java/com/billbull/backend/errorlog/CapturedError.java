package com.billbull.backend.errorlog;

import java.time.Instant;

/**
 * One error as captured, before it is grouped. Mutable on purpose: the capture points fill in
 * what they know (the exception, the request, the browser URL) and {@link ErrorLogService} does
 * the rest. Every text field is redacted and clipped before it is written.
 */
public class CapturedError {

    /** Where it came from: an HTTP request, a browser report, a background job or an ERROR log line. */
    public enum Source { SERVER, CLIENT, JOB, LOG }

    public Source source = Source.SERVER;
    public Instant occurredAt = Instant.now();

    public String exceptionClass;
    public String rootCauseClass;
    public String causeChain;
    public String message;
    public String rootCauseMessage;
    public String errorCode;
    public String sqlState;
    public String topFrame;
    public String stackTrace;
    public String logger;

    public String httpMethod;
    public String path;
    public Integer httpStatus;
    public String clientUrl;

    public String requestId;
    public String username;
    public Long branchId;
}
