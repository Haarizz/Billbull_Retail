import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const post = vi.fn(() => Promise.resolve({ data: {} }));
const get = vi.fn(() => Promise.resolve({ data: {} }));

vi.mock('../../../api/axiosConfig', () => ({
  default: { post: (...a) => post(...a), get: (...a) => get(...a), put: vi.fn(), delete: vi.fn() },
}));

const { closePosSession, authorizePosVariance } = await import('../../../api/posApi');

/**
 * The variance-approval workflow.
 *
 * The control this protects: a cashier must not be able to close an over-threshold drawer, and
 * the figures a supervisor authorizes must be the server's, not the page's. The gate used to be
 * a client boolean — `supervisorApproved: true` in the request body, with no credentials and no
 * approver behind it — so it was both bypassable by anyone with curl and unsatisfiable through
 * the product.
 *
 * POSSales.jsx is a ~15k-line component that this project's test setup does not render, so the
 * request contract is covered behaviourally and the component's financial discipline is covered
 * by reading its source. The rendered panel itself remains manual-QA only, which the Phase 5
 * report states.
 */
describe('POS variance approval', () => {
  const POS_SALES = fs.readFileSync(
    path.resolve(__dirname, '../POSSales.jsx'), 'utf8');

  beforeEach(() => {
    post.mockClear();
    get.mockClear();
  });

  // ── The close request no longer carries a client approval flag ──────────────────────

  it('never sends supervisorApproved', async () => {
    await closePosSession(42, { notes: 'eod', closingDenominations: { 500: 2 } });

    const [, body] = post.mock.calls[0];
    expect(body).not.toHaveProperty('supervisorApproved');
  });

  it('cannot smuggle supervisorApproved through as an extra argument', async () => {
    // A caller passing the retired flag gets it dropped: the function destructures a fixed set
    // of fields, so the boolean has no route into the request at all.
    await closePosSession(42, {
      notes: 'eod',
      closingDenominations: { 500: 2 },
      supervisorApproved: true,
    });

    const [, body] = post.mock.calls[0];
    expect(body).not.toHaveProperty('supervisorApproved');
  });

  it('sends the server-issued grant when one was obtained', async () => {
    await closePosSession(42, {
      closingDenominations: { 500: 2 },
      varianceApprovalToken: 'grant-abc',
    });

    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/api/pos/sessions/42/close');
    expect(body.varianceApprovalToken).toBe('grant-abc');
  });

  it('sends denomination quantities and no cash total', async () => {
    await closePosSession(42, { closingDenominations: { 500: 2, 100: 3 } });

    const [, body] = post.mock.calls[0];
    expect(body.closingDenominations).toEqual({ 500: 2, 100: 3 });
    expect(body).not.toHaveProperty('closingCash');
    expect(body).not.toHaveProperty('countedCash');
    expect(body).not.toHaveProperty('cashVariance');
  });

  // ── Authorization request ────────────────────────────────────────────────────────────

  it('asks the server to authorize, sending credentials and the counted denominations', async () => {
    await authorizePosVariance(42, {
      usernameOrEmail: 'supervisor',
      password: 'secret',
      reason: 'miscount',
      closingDenominations: { 500: 2 },
    });

    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/api/pos/sessions/42/authorize-variance');
    expect(body.usernameOrEmail).toBe('supervisor');
    expect(body.reason).toBe('miscount');
    expect(body.closingDenominations).toEqual({ 500: 2 });
    // The client states no financial figure: the server re-derives expected and counted itself,
    // so a grant can never be obtained for numbers the page invented.
    expect(body).not.toHaveProperty('expectedCash');
    expect(body).not.toHaveProperty('countedCash');
    expect(body).not.toHaveProperty('cashDifference');
  });

  // ── The component's financial discipline ─────────────────────────────────────────────

  it('reacts to the structured error code, not to error text', () => {
    // String-matching a message would break the moment the wording changed, and would make the
    // gate depend on prose rather than on a contract.
    expect(POS_SALES).toContain("data?.code === 'VARIANCE_APPROVAL_REQUIRED'");
  });

  it('displays only server-provided figures in the approval panel', () => {
    for (const field of ['expectedCash', 'countedCash', 'varianceAmount', 'threshold']) {
      expect(POS_SALES).toContain(`varianceApproval.${field}`);
    }
  });

  it('performs no arithmetic on the approval figures', () => {
    // Any operator applied to a varianceApproval field would mean the panel was deriving a
    // number the server is authoritative for.
    const arithmetic = /varianceApproval\.(expectedCash|countedCash|varianceAmount|cashDifference|threshold)\s*[-+*/]/;
    expect(POS_SALES).not.toMatch(arithmetic);
  });

  it('holds the grant in a ref, never in localStorage or sessionStorage', () => {
    // A persisted grant would survive a reload and could be replayed; a ref dies with the
    // dialog, so a refresh re-derives the situation from the server.
    expect(POS_SALES).toContain('varianceGrantRef');
    expect(POS_SALES).not.toMatch(/(local|session)Storage[^\n]*variance/i);
  });

  it('clears the grant whenever the close dialog is dismissed or completes', () => {
    const clears = POS_SALES.match(/varianceGrantRef\.current = null/g) || [];
    expect(clears.length).toBeGreaterThanOrEqual(3);
  });

  it('requires a reason before asking for authorization', () => {
    expect(POS_SALES).toContain('A reason is required to authorize a cash variance.');
  });

  it('leaves the session open when authorization is refused', () => {
    // The panel stays up with the server's reason; no close is retried and no cash fact moves.
    expect(POS_SALES).toContain("setVarianceApprovalError(result?.message || 'Authorization was refused.')");
  });

  it('does not retain supervisor credentials after use', () => {
    expect(POS_SALES).toContain("setVarianceSupervisorPassword('')");
  });
});
