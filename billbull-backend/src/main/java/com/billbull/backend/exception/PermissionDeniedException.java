package com.billbull.backend.exception;

public class PermissionDeniedException extends RuntimeException {
    
    private final String code;

    public PermissionDeniedException(String message) {
        super(message);
        this.code = "PERMISSION_DENIED";
    }

    public String getCode() {
        return code;
    }
}
