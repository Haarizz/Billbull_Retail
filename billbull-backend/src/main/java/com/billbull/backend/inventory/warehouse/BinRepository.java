package com.billbull.backend.inventory.warehouse;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BinRepository extends JpaRepository<Bin, Long> {

    /** Eagerly loads locator + zone in a single query — avoids LazyInitializationException */
    @Query("SELECT b FROM Bin b JOIN FETCH b.locator l JOIN FETCH l.zone WHERE b.id = :id")
    Optional<Bin> findByIdEager(@Param("id") Long id);

    List<Bin> findByLocatorId(Long locatorId);

    List<Bin> findByLocatorIdAndStatus(Long locatorId, String status);

    boolean existsByCodeAndLocatorId(String code, Long locatorId);

    @Query("SELECT b FROM Bin b WHERE b.locator.zone.warehouse.id = :warehouseId")
    List<Bin> findByWarehouseId(Long warehouseId);

    @Query("SELECT COUNT(b) FROM Bin b WHERE b.locator.zone.warehouse.id = :warehouseId")
    Long countByWarehouseId(Long warehouseId);

    @Query("SELECT COUNT(b) FROM Bin b WHERE b.locator.zone.id = :zoneId")
    Long countByZoneId(Long zoneId);

    java.util.Optional<Bin> findByCode(String code);

    List<Bin> findAllByCode(String code);
}
