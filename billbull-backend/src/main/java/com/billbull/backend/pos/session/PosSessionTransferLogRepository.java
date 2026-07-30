package com.billbull.backend.pos.session;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Session Roaming Phase 1 (schema foundation) / Phase 2 (finder method added, still not called by
 * any production flow) — no service writes rows here yet, that arrives with the Phase 7 Session
 * Transfer Service. This finder exists for that future transfer-history read path.
 */
public interface PosSessionTransferLogRepository extends JpaRepository<PosSessionTransferLog, Long> {

    List<PosSessionTransferLog> findBySessionIdOrderByCreatedAtDesc(Long sessionId);
}
