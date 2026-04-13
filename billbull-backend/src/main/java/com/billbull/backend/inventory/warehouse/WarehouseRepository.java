package com.billbull.backend.inventory.warehouse;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WarehouseRepository extends JpaRepository<Warehouse, Long> {
	Optional<Warehouse> findByName(String name);
}
