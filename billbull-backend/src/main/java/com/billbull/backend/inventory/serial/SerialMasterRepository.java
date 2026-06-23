package com.billbull.backend.inventory.serial;

import java.util.Collection;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SerialMasterRepository extends JpaRepository<SerialMaster, Long> {

    boolean existsBySerialNumber(String serialNumber);

    boolean existsBySerialNumberIn(Collection<String> serialNumbers);
}
