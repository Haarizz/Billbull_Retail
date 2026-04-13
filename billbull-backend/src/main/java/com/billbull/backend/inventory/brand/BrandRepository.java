package com.billbull.backend.inventory.brand;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BrandRepository extends JpaRepository<Brand, Long> {

    List<Brand> findByActiveTrue();

    boolean existsByCodeAndActiveTrue(String code);

    boolean existsByNameAndActiveTrue(String name);

    boolean existsByBarcode(String barcode);

    java.util.Optional<Brand> findByNameIgnoreCase(String name);

    java.util.Optional<Brand> findByCodeIgnoreCase(String code);
}

