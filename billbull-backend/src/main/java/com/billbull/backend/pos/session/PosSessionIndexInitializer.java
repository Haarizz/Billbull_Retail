package com.billbull.backend.pos.session;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates the partial unique index that enforces one OPEN session per terminal at the DB level.
 * DDL is idempotent — safe to run on every startup.
 */
@Component
public class PosSessionIndexInitializer {

    private static final Logger log = LoggerFactory.getLogger(PosSessionIndexInitializer.class);

    @PersistenceContext
    private EntityManager em;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void createPartialUniqueIndex() {
        try {
            em.createNativeQuery(
                "CREATE UNIQUE INDEX IF NOT EXISTS uix_one_open_session_per_terminal " +
                "ON pos_sessions(terminal_pk) WHERE status = 'OPEN'"
            ).executeUpdate();
            log.info("POS session unique index ensured: uix_one_open_session_per_terminal");
        } catch (Exception e) {
            log.warn("Could not create POS session unique index (table may not exist yet): {}", e.getMessage());
        }
    }
}
