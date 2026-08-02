package com.billbull.backend.pos.session;

import com.billbull.backend.common.BaseEntity;
import jakarta.persistence.*;

/**
 * Session Roaming Phase 1 (schema foundation only — unused by any service yet). Append-only log
 * of session-transfer events between terminals; no service writes rows here yet — that arrives
 * with the Phase 7 Session Transfer Service.
 */
@Entity
@Table(name = "pos_session_transfer_log", indexes = {
    @Index(name = "idx_pos_sess_transfer_log_session", columnList = "session_id"),
    @Index(name = "idx_pos_sess_transfer_log_from_terminal", columnList = "from_terminal_id"),
    @Index(name = "idx_pos_sess_transfer_log_to_terminal", columnList = "to_terminal_id")
})
public class PosSessionTransferLog extends BaseEntity {

    @Column(name = "session_id")
    private Long sessionId;

    @Column(name = "from_terminal_id")
    private Long fromTerminalId;

    @Column(name = "to_terminal_id")
    private Long toTerminalId;

    @Column(name = "initiated_by_user_id")
    private Long initiatedByUserId;

    @Column(name = "supervisor_authorized", nullable = false)
    private Boolean supervisorAuthorized = false;

    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }

    public Long getFromTerminalId() { return fromTerminalId; }
    public void setFromTerminalId(Long fromTerminalId) { this.fromTerminalId = fromTerminalId; }

    public Long getToTerminalId() { return toTerminalId; }
    public void setToTerminalId(Long toTerminalId) { this.toTerminalId = toTerminalId; }

    public Long getInitiatedByUserId() { return initiatedByUserId; }
    public void setInitiatedByUserId(Long initiatedByUserId) { this.initiatedByUserId = initiatedByUserId; }

    public Boolean getSupervisorAuthorized() { return supervisorAuthorized; }
    public void setSupervisorAuthorized(Boolean supervisorAuthorized) { this.supervisorAuthorized = supervisorAuthorized; }
}
