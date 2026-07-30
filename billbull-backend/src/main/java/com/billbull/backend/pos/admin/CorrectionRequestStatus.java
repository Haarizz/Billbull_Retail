package com.billbull.backend.pos.admin;

/** Correction lifecycle (architectural review §8): {@code REQUESTED -> PENDING_APPROVAL ->
 *  APPROVED -> EXECUTING -> APPLIED}, with {@code REJECTED}/{@code CANCELLED}/{@code FAILED}
 *  as terminal branches. Approval and execution are independent lifecycle events — a request
 *  can be APPROVED and still end up FAILED, never silently re-approved. Phase 1 only drives
 *  transitions up to APPROVED/REJECTED/CANCELLED; EXECUTING/APPLIED/FAILED are modeled here
 *  for later phases' executors and are not reachable through any Phase 1 endpoint. */
public enum CorrectionRequestStatus {
    REQUESTED,
    PENDING_APPROVAL,
    APPROVED,
    EXECUTING,
    APPLIED,
    REJECTED,
    CANCELLED,
    FAILED
}
