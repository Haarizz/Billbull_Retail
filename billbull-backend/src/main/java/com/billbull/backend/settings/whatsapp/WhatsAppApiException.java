package com.billbull.backend.settings.whatsapp;

/**
 * A call to the Meta Graph API failed. {@link #getMetaCode()} carries Meta's numeric error code
 * when the response had one (e.g. 190 = expired/invalid token, 131030 = recipient not in the test
 * number's allow-list, 132001 = template name/language not found) so the UI can show something
 * actionable instead of a bare HTTP status.
 */
public class WhatsAppApiException extends RuntimeException {

    private final Integer metaCode;

    public WhatsAppApiException(String message, Integer metaCode) {
        super(message);
        this.metaCode = metaCode;
    }

    public WhatsAppApiException(String message, Throwable cause) {
        super(message, cause);
        this.metaCode = null;
    }

    public Integer getMetaCode() { return metaCode; }
}
