package com.billbull.backend.platform;

import java.io.IOException;
import java.util.Optional;
import java.util.Set;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Enforces what the control plane decided for this tenant, before any controller runs:
 *
 * <ul>
 *   <li><b>SUSPENDED</b> → every {@code /api/**} call, sign-in included, gets
 *       423 {@code TENANT_SUSPENDED}.</li>
 *   <li><b>READ_ONLY</b> → reads and sign-in still work; any other write gets
 *       423 {@code TENANT_READ_ONLY}.</li>
 *   <li>A call into a module the plan doesn't include gets 403 {@code MODULE_NOT_ENTITLED}.</li>
 * </ul>
 * The platform agent's own path and the client-log sink are never blocked, so the control plane
 * can always lift a suspension. Unmanaged tenants (no state row) pass straight through.
 */
@Component
public class PlatformPolicyFilter extends OncePerRequestFilter {

    public static final int SC_LOCKED = 423;

    /** Writes a READ_ONLY tenant still accepts: signing in and out and switching branch. */
    private static final Set<String> READ_ONLY_WRITE_ALLOWED = Set.of(
            "/api/auth/login", "/api/auth/pos/login", "/api/auth/pos/pin/login", "/api/auth/pos/pin/staff",
            "/api/session/switch-branch");

    private final PlatformStateService stateService;

    public PlatformPolicyFilter(PlatformStateService stateService) {
        this.stateService = stateService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = path(request);
        return !path.startsWith("/api/")
                || PlatformAgentAuthFilter.isPlatformPath(request)
                || path.startsWith("/api/client-logs")
                || "OPTIONS".equalsIgnoreCase(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        PlatformState state = stateService.current();
        if (!state.managed()) {
            chain.doFilter(request, response);
            return;
        }
        String path = path(request);

        if (state.status() == TenantLifecycleStatus.SUSPENDED) {
            write(response, SC_LOCKED, "TENANT_SUSPENDED", message(state,
                    "This BillBull account is suspended. Please contact BillBull support."), null);
            return;
        }
        if (state.status() == TenantLifecycleStatus.READ_ONLY && isWrite(request)
                && !READ_ONLY_WRITE_ALLOWED.contains(path) && !isAnnouncementDismissal(path)) {
            write(response, SC_LOCKED, "TENANT_READ_ONLY", message(state,
                    "This BillBull account is read-only. You can view and export data, but not make changes."), null);
            return;
        }
        Optional<String> module = PlatformModules.moduleForPath(path);
        if (module.isPresent() && !state.isModuleEnabled(module.get())) {
            write(response, HttpServletResponse.SC_FORBIDDEN, "MODULE_NOT_ENTITLED",
                    "The " + module.get() + " module is not included in your BillBull plan.", module.get());
            return;
        }
        chain.doFilter(request, response);
    }

    /** Dismissing a BillBull announcement isn't business data, and a read-only notice must be dismissable. */
    static boolean isAnnouncementDismissal(String path) {
        return path.startsWith("/api/platform-access/announcements/") && path.endsWith("/seen");
    }

    private static boolean isWrite(HttpServletRequest request) {
        String m = request.getMethod();
        return !("GET".equalsIgnoreCase(m) || "HEAD".equalsIgnoreCase(m) || "OPTIONS".equalsIgnoreCase(m));
    }

    private static String message(PlatformState state, String fallback) {
        return state.statusMessage() != null && !state.statusMessage().isBlank() ? state.statusMessage() : fallback;
    }

    private static String path(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String context = request.getContextPath();
        if (context != null && !context.isEmpty() && uri.startsWith(context)) {
            uri = uri.substring(context.length());
        }
        return uri;
    }

    private static void write(HttpServletResponse response, int status, String code, String message, String module)
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        StringBuilder json = new StringBuilder("{\"code\":\"").append(code).append("\",\"message\":")
                .append(quote(message));
        if (module != null) json.append(",\"module\":").append(quote(module));
        json.append('}');
        response.getWriter().write(json.toString());
    }

    static String quote(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> {
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
                }
            }
        }
        return b.append('"').toString();
    }
}
