package com.billbull.platform.web;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Client address for audit and throttling. {@code server.forward-headers-strategy=native} lets
 * Tomcat take it from {@code X-Forwarded-For} set by the local nginx, so this is the remote
 * address Tomcat reports — never a raw header the client could set.
 */
public final class ClientIp {

    private ClientIp() {}

    public static String of(HttpServletRequest request) {
        if (request == null) return null;
        String ip = request.getRemoteAddr();
        return ip == null ? null : (ip.length() > 64 ? ip.substring(0, 64) : ip);
    }
}
