package com.billbull.backend.pos.session;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Session Roaming Phase 1 (schema foundation only). Not called by any service yet.
 */
public interface PosSessionTerminalHistoryRepository extends JpaRepository<PosSessionTerminalHistory, Long> {
}
