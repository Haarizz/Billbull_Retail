package com.billbull.platform.support;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SupportSessionRepository extends JpaRepository<SupportSession, Long> {

    List<SupportSession> findByTenantIdOrderByCreatedAtDesc(Long tenantId, Pageable pageable);

    List<SupportSession> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
