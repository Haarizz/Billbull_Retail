package com.billbull.backend.pos.pinlogin;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PosPinDeviceRepository extends JpaRepository<PosPinDevice, Long> {

    Optional<PosPinDevice> findByTokenHashAndRevokedAtIsNull(String tokenHash);

    List<PosPinDevice> findByRevokedAtIsNullOrderByCreatedAtDesc();
}
