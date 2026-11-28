package com.billbull.backend.errorlog;

import java.util.Map;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform agent endpoint for the error log: {@code GET /api/platform/errors}. Under
 * {@code /api/platform/**}, so only an HMAC-signed control-plane call reaches it
 * ({@code PlatformAgentAuthFilter}); 404 while the agent is disabled. Read-only.
 */
@RestController
@RequestMapping("/api/platform/errors")
@PreAuthorize("hasRole('PLATFORM_AGENT')")
public class PlatformErrorLogController {

    private final ErrorLogService service;

    public PlatformErrorLogController(ErrorLogService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> page(@RequestParam(defaultValue = "0") long afterGroupSeq,
                                    @RequestParam(defaultValue = "0") long afterEventId,
                                    @RequestParam(defaultValue = "200") int limit) {
        return service.page(afterGroupSeq, afterEventId, limit);
    }
}
