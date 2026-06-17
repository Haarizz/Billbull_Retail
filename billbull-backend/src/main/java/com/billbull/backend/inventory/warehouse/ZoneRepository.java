package com.billbull.backend.inventory.warehouse;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface ZoneRepository extends JpaRepository<Zone, Long> {

    List<Zone> findByWarehouseId(Long warehouseId);

    List<Zone> findByWarehouseIdIn(Collection<Long> warehouseIds);

    List<Zone> findByWarehouseIdAndStatus(Long warehouseId, String status);

    boolean existsByCodeAndWarehouseId(String code, Long warehouseId);
}
