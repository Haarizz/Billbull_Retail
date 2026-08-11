package com.billbull.backend.pos.session;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decides whether a session whose <b>closure workflow has been started</b> may still be
 * used for normal POS work.
 *
 * <h2>Why this exists</h2>
 * "Close Session" navigates the cashier to the X-Report / Close Session screen, but the
 * session deliberately stays OPEN in the database until the final close succeeds — the
 * X-Report and every close validation operate on the open session. Nothing, however,
 * stopped the cashier from walking back to the dashboard and pressing "Continue Session"
 * to keep selling. This is the control that closes that bypass.
 *
 * <h2>Source of truth: {@code closingStartedAt}, never {@code xReportGeneratedAt}</h2>
 * The marker is {@link PosSession#getClosingStartedAt()}, written by exactly one explicit
 * user action — {@code POST /sessions/{id}/begin-closure}, behind the same owner/supervisor
 * verification the close itself requires.
 *
 * <p>It is emphatically <b>not</b> {@code xReportGeneratedAt}. The X-Report is an
 * <i>informational, optional, mid-shift</i> read: it is stamped by merely opening the
 * X-Report view, a session can be closed having never run one ({@code closeSession}
 * back-stamps it precisely because it may be missing), and selling after one has always
 * been permitted. Keying closure off it would lock a till the moment a cashier glanced at
 * a mid-shift report. Generating an X-Report has no effect on this gate whatsoever.
 *
 * <p>{@link PosSessionStatus} is likewise untouched: the session remains genuinely OPEN,
 * so every existing consumer of status (Day Close resolution, Z-Report gating,
 * previous-Business-Day blocking, terminal locking) keeps classifying it exactly as before.
 *
 * <h2>Relationship to {@code BusinessDayContinuationGate}</h2>
 * Deliberately separate and composed, never merged. That gate answers "does this session
 * belong to a Business Day that has since rolled over?"; this one answers "has an operator
 * started closing this session?". They are independent conditions with independent
 * messages, and no Business Day, Trading Date, timezone, or window/extension logic appears
 * here. Callers assert the Business Day gate <i>first</i>, so a session that is both stale
 * and mid-closure keeps reporting the Business Day problem — the more fundamental one,
 * whose remedy (Day Close) subsumes the other. That precedence is intentional and is
 * covered by a test.
 *
 * <h2>What is deliberately NOT gated</h2>
 * Everything the closure itself needs: {@code getById}, session sync, X-Report generation
 * and preview, denomination entry, supervisor approval, {@code authorize-closure},
 * {@code closeSession}, {@code cancel-closure}, supervisor takeover, session transfer, and
 * the whole Day Close domain. A session in the closure workflow must always remain fully
 * closeable — that is the entire point.
 */
@Service
public class PosSessionClosureWorkflowGate {

    /**
     * True when an operator has started {@code session}'s closure workflow and it has not
     * yet been closed: still usable in principle (OPEN or SUSPENDED) but locked to closure
     * operations only.
     *
     * <p>A CLOSED session returns false — it is past the workflow, not inside it, and its
     * callers are read/report paths that must never be blocked.
     */
    public boolean isInClosureWorkflow(PosSession session) {
        if (session == null) return false;
        PosSessionStatus status = session.getStatus();
        if (status != PosSessionStatus.OPEN && status != PosSessionStatus.SUSPENDED) return false;
        return session.getClosingStartedAt() != null;
    }

    /**
     * Throws {@link PosSessionClosureRequiredException} when {@code session}'s closure
     * workflow has been started. Returns normally in every other case — including a null
     * session, an ordinary OPEN session (with or without an X-Report), and any CLOSED
     * session.
     *
     * <p>Call this at the point a normal POS operation is actually authorized, never only
     * where the UI decides what to render: the frontend flag is a courtesy, this is the
     * control.
     */
    @Transactional(readOnly = true)
    public void assertMayOperate(PosSession session) {
        if (isInClosureWorkflow(session)) {
            throw PosSessionClosureRequiredException.of(session);
        }
    }
}
