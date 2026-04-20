package com.billbull.backend.sales.customerledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, Long> {
    List<Customer> findByNameContainingIgnoreCaseOrCodeContainingIgnoreCase(String name, String code);
    boolean existsByCode(String code);
    java.util.Optional<Customer> findByCode(String code);
}