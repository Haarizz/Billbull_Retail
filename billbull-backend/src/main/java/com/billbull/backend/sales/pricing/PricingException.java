package com.billbull.backend.sales.pricing;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** A pricing request that cannot be honoured (unknown or inactive level, bad level price…). 400. */
public class PricingException extends ResponseStatusException {
    public PricingException(String message) {
        super(HttpStatus.BAD_REQUEST, message);
    }
}
