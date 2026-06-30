package com.billbull.backend.pos.devicemanager;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PosDeviceHealthSnapshotRepository extends JpaRepository<PosDeviceHealthSnapshot, Long> {

    List<PosDeviceHealthSnapshot> findTop50ByDeviceIdOrderByCapturedAtDesc(Long deviceId);
}
