package com.billbull.backend.inventory.product;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductBarcodeRepository extends JpaRepository<ProductBarcode, Long> {
    java.util.Optional<ProductBarcode> findFirstByBarcode(String barcode);

    List<ProductBarcode> findByProductId(Long productId);

    List<ProductBarcode> findByProductIdIn(List<Long> productIds);

    void deleteByProductId(Long productId);

    boolean existsByBarcode(String barcode);

    boolean existsByBarcodeAndProductIdNot(String barcode, Long productId);

    boolean existsByBarcodeAndProductBrandId(String barcode, Long brandId);

    boolean existsByBarcodeAndProductIdNotAndProductBrandId(String barcode, Long productId, Long brandId);
}