package com.billbull.backend.inventory.serial;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface SerialMasterRepository extends JpaRepository<SerialMaster, Long> {

    /** Exact serial number lookup (case-insensitive). */
    Optional<SerialMaster> findFirstBySerialNumberIgnoreCase(String serialNumber);

    boolean existsBySerialNumberIn(List<String> serialNumbers);

    /** Pessimistic write lock for checkout/status transitions to prevent double-selling. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SerialMaster s WHERE LOWER(s.serialNumber) = LOWER(:sn)")
    Optional<SerialMaster> findBySerialNumberForUpdate(@Param("sn") String sn);

    List<SerialMaster> findByProductCodeAndStatus(String productCode, SerialStatus status);

    List<SerialMaster> findByProductCode(String productCode);

    @Query("SELECT s FROM SerialMaster s WHERE LOWER(s.serialNumber) LIKE LOWER(CONCAT(:prefix, '%')) ORDER BY s.serialNumber")
    List<SerialMaster> findBySerialNumberStartingWith(@Param("prefix") String prefix);
}
