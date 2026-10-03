package com.billbull.backend.settings.whatsapp;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class WhatsAppCloudApiClientTest {

    @Test
    void templateParamsAreFlattenedToMetaRules() {
        assertEquals("Line one Line two", WhatsAppCloudApiClient.sanitizeParam("Line one\r\n\tLine     two"));
        assertEquals("-", WhatsAppCloudApiClient.sanitizeParam("   "));
        assertEquals("-", WhatsAppCloudApiClient.sanitizeParam(null));
    }
}
