package com.billbull.backend.pos.devicemanager;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PosDiscoveredDeviceRepository extends JpaRepository<PosDiscoveredDevice, Long> {

    Optional<PosDiscoveredDevice> findByAgentIdentifierAndRawIdentifier(String agentIdentifier, String rawIdentifier);

    List<PosDiscoveredDevice> findByStatusOrderByLastSeenAtDesc(DiscoveredDeviceStatus status);
}
