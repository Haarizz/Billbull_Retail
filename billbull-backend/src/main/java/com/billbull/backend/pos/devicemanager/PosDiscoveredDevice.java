package com.billbull.backend.pos.devicemanager;

import com.billbull.backend.common.BaseEntity;
import com.billbull.backend.pos.device.PosDeviceType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

/**
 * A hardware candidate reported by a Local Device Agent that hasn't (yet) been matched to a
 * registered {@code PosDevice}. Purely a visibility/staging concept for Phase C — turning a
 * candidate into an actual registered device (printer/scanner/etc.) is deferred to whichever
 * phase builds the Device Dashboard's "Register" action (Phase F), since that requires picking
 * a device type, branch, and terminal — decisions this entity deliberately doesn't make.
 * See docs/pos-device-architecture-specification-v2-2026-06-30.md §11.
 */
@Entity
@Table(name = "pos_discovered_device", indexes = {
        @Index(name = "idx_discovered_device_status", columnList = "status")
}, uniqueConstraints = {
        @UniqueConstraint(name = "uq_discovered_device", columnNames = {"agent_identifier", "raw_identifier"})
})
public class PosDiscoveredDevice extends BaseEntity {

    @Column(name = "agent_identifier", nullable = false, length = 120)
    private String agentIdentifier;

    @Enumerated(EnumType.STRING)
    @Column(name = "discovery_method", nullable = false, length = 20)
    private DiscoveryMethod discoveryMethod;

    @Column(name = "raw_identifier", nullable = false, length = 200)
    private String rawIdentifier;

    @Enumerated(EnumType.STRING)
    @Column(name = "suggested_device_type", length = 30)
    private PosDeviceType suggestedDeviceType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private DiscoveredDeviceStatus status = DiscoveredDeviceStatus.NEW;

    @Column(name = "first_seen_at", nullable = false)
    private LocalDateTime firstSeenAt;

    @Column(name = "last_seen_at", nullable = false)
    private LocalDateTime lastSeenAt;

    public String getAgentIdentifier() { return agentIdentifier; }
    public void setAgentIdentifier(String agentIdentifier) { this.agentIdentifier = agentIdentifier; }

    public DiscoveryMethod getDiscoveryMethod() { return discoveryMethod; }
    public void setDiscoveryMethod(DiscoveryMethod discoveryMethod) { this.discoveryMethod = discoveryMethod; }

    public String getRawIdentifier() { return rawIdentifier; }
    public void setRawIdentifier(String rawIdentifier) { this.rawIdentifier = rawIdentifier; }

    public PosDeviceType getSuggestedDeviceType() { return suggestedDeviceType; }
    public void setSuggestedDeviceType(PosDeviceType suggestedDeviceType) { this.suggestedDeviceType = suggestedDeviceType; }

    public DiscoveredDeviceStatus getStatus() { return status; }
    public void setStatus(DiscoveredDeviceStatus status) { this.status = status; }

    public LocalDateTime getFirstSeenAt() { return firstSeenAt; }
    public void setFirstSeenAt(LocalDateTime firstSeenAt) { this.firstSeenAt = firstSeenAt; }

    public LocalDateTime getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(LocalDateTime lastSeenAt) { this.lastSeenAt = lastSeenAt; }
}
