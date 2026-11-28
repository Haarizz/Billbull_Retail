package com.billbull.backend.platform;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The tenant's own window onto the control plane, for its signed-in users.
 *
 * <pre>
 *   GET  /api/platform-access/status                      any user: status, plan, modules (for banners)
 *   GET  /api/platform-access/support-sessions            ADMIN: every BillBull support sign-in
 *   POST /api/platform-access/support-sessions/{id}/revoke ADMIN: end one now
 *   GET  /api/platform-access/announcements/pending       any user: BillBull announcements not yet dismissed
 *   POST /api/platform-access/announcements/{id}/seen     any user: dismiss one (it won't pop up again)
 * </pre>
 */
@RestController
@RequestMapping("/api/platform-access")
public class PlatformAccessController {

    private final PlatformStateService stateService;
    private final PlatformSupportService supportService;
    private final PlatformAgentProperties properties;
    private final PlatformAnnouncementService announcementService;

    public PlatformAccessController(PlatformStateService stateService, PlatformSupportService supportService,
                                    PlatformAgentProperties properties, PlatformAnnouncementService announcementService) {
        this.stateService = stateService;
        this.supportService = supportService;
        this.properties = properties;
        this.announcementService = announcementService;
    }

    @GetMapping("/announcements/pending")
    @PreAuthorize("isAuthenticated()")
    public List<Map<String, Object>> pendingAnnouncements(Authentication authentication) {
        return announcementService.pendingFor(authentication.getName(), isAdmin(authentication));
    }

    @PostMapping("/announcements/{id}/seen")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> announcementSeen(@PathVariable long id, Authentication authentication) {
        return Map.of("recorded", announcementService.markSeen(id, authentication.getName()));
    }

    /** "Owners & admins" audience: tenant admins and branch admins. */
    static boolean isAdmin(Authentication authentication) {
        return authentication.getAuthorities().stream().map(a -> a.getAuthority())
                .anyMatch(a -> "ROLE_ADMIN".equals(a) || "ROLE_BRANCH_ADMIN".equals(a));
    }

    @GetMapping("/status")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> status() {
        PlatformState s = stateService.current();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("managed", s.managed());
        m.put("status", s.status().name());
        m.put("statusMessage", s.statusMessage());
        m.put("planCode", s.planCode());
        Map<String, Boolean> modules = new LinkedHashMap<>();
        PlatformModules.OPTIONAL.keySet().forEach(k -> modules.put(k, s.isModuleEnabled(k)));
        m.put("modules", modules);
        m.put("limits", s.limits());
        m.put("supportAccessEnabled", properties.isSupportAccessEnabled());
        m.put("supportUsername", properties.getSupportUsername());
        return m;
    }

    @GetMapping("/support-sessions")
    @PreAuthorize("hasRole('ADMIN')")
    public List<Map<String, Object>> supportSessions(@RequestParam(defaultValue = "100") int limit) {
        return supportService.list(limit);
    }

    @PostMapping("/support-sessions/{id}/revoke")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> revoke(@PathVariable long id, Authentication authentication) {
        return Map.of("revoked", supportService.revoke(id, "tenant:" + authentication.getName()));
    }
}
