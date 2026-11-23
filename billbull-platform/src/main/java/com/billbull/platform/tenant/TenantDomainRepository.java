package com.billbull.platform.tenant;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantDomainRepository extends JpaRepository<TenantDomain, Long> {

    List<TenantDomain> findByTenantIdOrderByPrimaryDomainDescHostAsc(Long tenantId);

    Optional<TenantDomain> findByHostIgnoreCase(String host);

    List<TenantDomain> findAllByOrderByHostAsc();
}
