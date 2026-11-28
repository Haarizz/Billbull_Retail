package com.billbull.platform.live;

import java.util.Map;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Live Clients: which clients have someone signed in right now, and on which devices. */
@RestController
@RequestMapping("/api/live-clients")
@PreAuthorize("hasRole('VIEWER')")
public class LiveClientsController {

    private final LiveClientsService service;

    public LiveClientsController(LiveClientsService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> live(@RequestParam(defaultValue = "false") boolean fresh) {
        return service.live(fresh);
    }
}
