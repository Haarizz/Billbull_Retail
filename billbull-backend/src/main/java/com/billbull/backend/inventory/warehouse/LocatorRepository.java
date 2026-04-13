package com.billbull.backend.inventory.warehouse;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LocatorRepository extends JpaRepository<Locator, Long> {

    List<Locator> findByZoneId(Long zoneId);

    List<Locator> findByZoneIdAndStatus(Long zoneId, String status);

    boolean existsByCodeAndZoneId(String code, Long zoneId);

    @Query("SELECT l FROM Locator l WHERE l.zone.warehouse.id = :warehouseId")
    List<Locator> findByWarehouseId(Long warehouseId);

    @Query("SELECT COUNT(l) FROM Locator l WHERE l.zone.warehouse.id = :warehouseId")
    Long countByWarehouseId(Long warehouseId);
}
