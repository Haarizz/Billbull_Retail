package com.billbull.backend.pos.session;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Session Roaming Phase 1 (schema foundation only — unused by any service yet). Append-only log
 * of which terminal/counter hosted a given session over time, one row per hosting segment.
 * {@code endedAt} is null while the segment is still open (the session's current hosting).
 */
@Entity
@Table(name = "pos_session_terminal_history", indexes = {
    @Index(name = "idx_pos_sess_term_hist_session", columnList = "session_id"),
    @Index(name = "idx_pos_sess_term_hist_terminal", columnList = "terminal_id"),
    @Index(name = "idx_pos_sess_term_hist_open", columnList = "session_id, ended_at")
})
public class PosSessionTerminalHistory extends BaseEntity {

    @Column(name = "session_id")
    private Long sessionId;

    @Column(name = "terminal_id")
    private Long terminalId;

    @Column(name = "counter_id")
    private Long counterId;

    @Column(name = "counter_name", length = 100)
    private String counterName;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }

    public Long getTerminalId() { return terminalId; }
    public void setTerminalId(Long terminalId) { this.terminalId = terminalId; }

    public Long getCounterId() { return counterId; }
    public void setCounterId(Long counterId) { this.counterId = counterId; }

    public String getCounterName() { return counterName; }
    public void setCounterName(String counterName) { this.counterName = counterName; }

    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }

    public LocalDateTime getEndedAt() { return endedAt; }
    public void setEndedAt(LocalDateTime endedAt) { this.endedAt = endedAt; }
}
