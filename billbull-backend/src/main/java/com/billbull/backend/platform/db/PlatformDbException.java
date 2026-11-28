package com.billbull.backend.platform.db;

/** A refusal the agent reports to the control plane as {@code {"code": …, "message": …}}. */
public class PlatformDbException extends RuntimeException {

    private final int status;
    private final String code;

    public PlatformDbException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() { return status; }
    public String code() { return code; }

    static PlatformDbException disabled(String code, String setting) {
        return new PlatformDbException(403, code,
                "Switched off on this client's server. To allow it, set " + setting + "=true in its environment and restart.");
    }
}
