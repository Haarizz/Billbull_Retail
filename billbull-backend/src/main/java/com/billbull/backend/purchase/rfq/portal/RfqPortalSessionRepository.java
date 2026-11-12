package com.billbull.backend.purchase.rfq.portal;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RfqPortalSessionRepository extends JpaRepository<RfqPortalSession, Long> {

    Optional<RfqPortalSession> findByTokenHashAndIsActiveTrue(String tokenHash);
}
