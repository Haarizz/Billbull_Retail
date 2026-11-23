package com.billbull.platform.tenant;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantRepository extends JpaRepository<Tenant, Long> {

    Optional<Tenant> findByCode(String code);

    Optional<Tenant> findByDatabaseName(String databaseName);

    List<Tenant> findAllByOrderByNameAsc();

    List<Tenant> findByStatusNot(TenantStatus status);

    long countByPlanId(Long planId);
}
