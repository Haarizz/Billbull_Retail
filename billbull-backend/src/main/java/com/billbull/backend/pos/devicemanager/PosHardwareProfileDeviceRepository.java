package com.billbull.backend.pos.devicemanager;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PosHardwareProfileDeviceRepository extends JpaRepository<PosHardwareProfileDevice, Long> {

    List<PosHardwareProfileDevice> findByHardwareProfileId(Long hardwareProfileId);

    Optional<PosHardwareProfileDevice> findByHardwareProfileIdAndRole(Long hardwareProfileId, String role);

    List<PosHardwareProfileDevice> findByDeviceId(Long deviceId);

    boolean existsByHardwareProfileIdAndRole(Long hardwareProfileId, String role);
}
