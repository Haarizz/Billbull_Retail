package com.billbull.backend.inventory.product;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserFavouriteProductRepository extends JpaRepository<UserFavouriteProduct, Long> {

    List<UserFavouriteProduct> findByUserId(Long userId);

    boolean existsByUserIdAndProductId(Long userId, Long productId);

    void deleteByUserIdAndProductId(Long userId, Long productId);

    @Query("SELECT f.productId FROM UserFavouriteProduct f WHERE f.userId = :userId")
    List<Long> findProductIdsByUserId(@Param("userId") Long userId);
}
