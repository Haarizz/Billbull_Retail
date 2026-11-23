package com.billbull.platform.auth;

/**
 * Platform roles, each including the one below it ({@code SecurityConfig.roleHierarchy}).
 *
 * <ul>
 *   <li>{@code VIEWER} — read everything: tenants, health, backups, audit.</li>
 *   <li>{@code OPERATOR} — day-to-day operations: onboard and edit tenants, change status,
 *       modules and limits, sync, open support sessions.</li>
 *   <li>{@code OWNER} — everything, plus platform users, plans, agent-secret rotation and
 *       archiving a tenant.</li>
 * </ul>
 */
public enum PlatformRole {
    VIEWER,
    OPERATOR,
    OWNER
}
