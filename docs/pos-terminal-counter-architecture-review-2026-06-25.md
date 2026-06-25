# POS Terminal & Counter Management — Architecture Review

**Branch:** `feature/pos-erp-audit` | **Reviewed:** 2026-06-25

---

## Table of Contents

1. [Terminal Registration Lifecycle](#1-terminal-registration-lifecycle)
2. [Question-by-Question Answers](#2-question-by-question-answers)
3. [Counter Architecture](#3-counter-architecture)
4. [Session Lifecycle](#4-session-lifecycle)
5. [Multi-Branch Behaviour](#5-multi-branch-behaviour)
6. [Security Assessment](#6-security-assessment)
7. [Scalability Assessment](#7-scalability-assessment)
8. [ERP Comparison](#8-erp-comparison)
9. [Priority-Based Implementation Roadmap](#9-priority-based-implementation-roadmap)
10. [Summary](#10-summary)

---

## 1. Terminal Registration Lifecycle

### How it actually works

```
Browser opens /sales/pos
        ↓
POSSales.jsx useEffect (mount)
        ↓
Generate device fingerprint (client-side, deterministic)
  = btoa(userAgent | screenW | screenH | colorDepth | timezone).slice(0, 64)
        ↓
POST /api/pos/terminals/register
  { deviceFingerprint, deviceInfo }
        ↓
PosTerminalService.registerOrRefresh()
  → Lookup by fingerprint in pos_terminals (UNIQUE index)
  → If found: update lastSeenAt, return existing terminal  ← IDEMPOTENT
  → If not found:
      Check ACTIVE count for branch < maxTerminalsPerBranch (default: 5)
      Generate terminalId = "T" + format("%03d", activeCount+1) + "-" + UUID.slice(0,4).upper
      First terminal → isMainPos = true
      Insert row → return { terminal, isNew: true }
        ↓
setCurrentTerminal(result.terminal)     ← stored in React state only
        ↓
GET /api/pos/sessions/active?terminalId=...
  → Resume if OPEN session exists
  → Otherwise wait for cashier to open session manually
```

**No localStorage. No sessionStorage. No cookie.** The fingerprint is regenerated on every page load from browser properties, and the server does the identity lookup.

### Key Files

| Layer | File | Purpose |
|---|---|---|
| Frontend fingerprint | [POSSales.jsx:935-938](../billbull-frontend/src/pages/Sales/POSSales.jsx) | Fingerprint generation + terminal init |
| Frontend console | [POSConsole.jsx](../billbull-frontend/src/pages/Sales/POS/POSConsole.jsx) | Terminals tab UI (1520 lines) |
| Frontend API | [posApi.js](../billbull-frontend/src/api/posApi.js) | Terminal & session API calls |
| Backend entity | [PosTerminal.java](../billbull-backend/src/main/java/com/billbull/backend/pos/terminal/PosTerminal.java) | `pos_terminals` table |
| Backend service | [PosTerminalService.java](../billbull-backend/src/main/java/com/billbull/backend/pos/terminal/PosTerminalService.java) | Registration, rename, status, main POS |
| Backend controller | [PosTerminalController.java](../billbull-backend/src/main/java/com/billbull/backend/pos/terminal/PosTerminalController.java) | REST endpoints |
| Session entity | [PosSession.java](../billbull-backend/src/main/java/com/billbull/backend/pos/session/PosSession.java) | `pos_sessions` table |
| Session service | [PosSessionService.java](../billbull-backend/src/main/java/com/billbull/backend/pos/session/PosSessionService.java) | Open, close, X/Z-report |
| Settings entity | [PosSettings.java](../billbull-backend/src/main/java/com/billbull/backend/pos/settings/PosSettings.java) | `maxTerminalsPerBranch` + all config |
| Device entity | [PosDevice.java](../billbull-backend/src/main/java/com/billbull/backend/pos/device/PosDevice.java) | `pos_devices` table (peripheral registry) |

---

## 2. Question-by-Question Answers

### Q1 — Is manual Terminal or Counter configuration required?

**No. POS works without ever visiting BillBull Console.**

Terminal registration is fully automatic at POS mount. Counter name defaults to empty string if not pre-configured; the session captures whatever `counterName` the terminal has at `openSession()` time. A cashier who never opens the Console can open a session, sell, and close — the terminal row is auto-created in `pos_terminals`.

The Console is for *management*: renaming, blocking stale devices, designating the Main POS. It is not a prerequisite.

| Scenario | Auto-registers? | Notes |
|---|---|---|
| First POS login | Yes | First terminal → isMainPos = true |
| New browser (same PC) | Yes | Different fingerprint = new terminal slot consumed |
| New PC | Yes | New terminal slot consumed |
| Mobile device | Yes | New terminal slot consumed |
| Different cashier, same browser | **Same terminal** | Fingerprint is device-based, not user-based |
| Different branch | New terminal in that branch | `branchId` is scoped per terminal row |
| Incognito mode | Yes, but **new slot each session** | Incognito does not persist fingerprint between windows |

> **Warning:** Incognito mode is a slot-leak risk — each private window generates a new fingerprint and consumes a slot against the 5-terminal limit. This is a production gap (see [§9 P0-2](#p0--production-blockers)).

---

### Q2 — Where does the "5 Terminal Slot" limit come from?

**It is a database value, not hardcoded.**

```java
// PosSettings.java
@Column(name = "max_terminals_per_branch")
private Integer maxTerminalsPerBranch = 5;
```

The Java default of `5` is only the JPA column default for new rows. The value is stored in `pos_settings`, one row per branch, and enforced by `PosTerminalService.registerOrRefresh()` at registration time. Each branch can have its own limit.

**What is missing:** A Company-level license tier cap above which no branch setting can go. That is a P2 enhancement (see [§9](#9-priority-based-implementation-roadmap)).

---

### Q3 — Is Main POS functionally important or decorative?

**Currently decorative / informational only.**

`PosTerminalService.setMainPos()` clears `isMainPos` on all other branch terminals and sets it on the target. No business logic in checkout, session, receipt numbering, or reports branches on `isMainPos`.

In a production multi-terminal environment, Main POS is typically the authority for:
- Default cash drawer open signal
- End-of-day Z-Report authority (only Main POS can run Z-Report)
- Shift-closing gate

None of these are enforced. This is a **P1 gap**.

---

### Q4 — Can renaming, deactivating, or changing Main POS while sessions are active create inconsistencies?

| Operation | Risk | Current Guard |
|---|---|---|
| Rename terminal | Low — `counterName` is cached in `pos_sessions.counter_name` at `openSession()` time | None needed |
| Rename counter | Same — session row holds the name snapshot | None needed |
| Set Main POS | Low — currently decorative | None needed |
| Deactivate terminal (BLOCKED) | **Medium** — no guard prevents blocking a terminal that has an OPEN session | **Missing** |

**Race condition detail:** `setStatus(terminalId, BLOCKED)` has no check for `pos_sessions WHERE terminal_id = ? AND status = 'OPEN'`. An admin can block a terminal mid-checkout. The POS frontend continues operating (terminal state is in React memory), but the next mount/refresh will fail to register. If the cashier's browser refreshes mid-sale, they cannot resume.

The sale itself goes through — the checkout controller does not validate terminal status at checkout time. That is actually safer (no partial transaction), but the cashier gets no warning.

**P1 fix:** Before blocking/deactivating, check for open sessions. Return HTTP 409 if one exists.

---

### Q5 — Does every terminal need a dedicated Counter, or can multiple terminals share one?

Multiple terminals can share the same `counterName` string — there is no uniqueness constraint on counter names. Counter is a label, not a first-class entity. Two terminals can both be assigned "Counter 1" with no conflict at the data layer.

However, since session cash reconciliation is **terminal-scoped** (not counter-scoped), two terminals under "Counter 1" will have separate session totals, separate X-Reports, and separate cash drawers. There is no merged counter-level view.

---

### Q6 — Terminal ID format

```
T001-F2C1
```

| Part | Meaning |
|---|---|
| `T` | Literal prefix |
| `001` | Sequential count of ACTIVE terminals in the branch at registration time |
| `F2C1` | First 4 chars of a random UUID, uppercased |

Generated **server-side** at first registration, stored permanently in `pos_terminals.terminal_id`. Not from MAC address, not from IndexedDB, not from hardware.

> **Gap:** The sequence number is based on `COUNT(ACTIVE)` at the time of registration, not a true auto-increment. If terminal T002 is deactivated and a new terminal registers, it may also receive T002, creating a confusing duplicate display name (though terminal IDs remain unique due to the UUID suffix).

**Edge cases:**

| Scenario | Result |
|---|---|
| Two Chrome profiles, same PC, same branch | **Two terminals** — different userAgent or screen values between profiles |
| Same browser, different branch | New terminal row in the new branch |
| Clear browser storage then reopen POS | Fingerprint recomputed from same browser properties → **same terminal resolved** |
| Chrome upgrade (userAgent changes) | **New terminal** — old row becomes orphaned |
| Copy browser profile to another PC | Same fingerprint → **same terminal identity** (security risk in shared environments) |

---

### Q7 — Device replacement workflow

Current process:
1. Admin goes to Console → Terminals
2. Clicks **Deactivate** on the old PC's terminal
3. New PC opens POS → auto-registers a new terminal
4. Admin optionally renames the new terminal

There is no transfer, migration, or auto-cleanup. Inactive terminal rows remain in the DB but do not count against the slot limit (`getForBranch()` filters to ACTIVE only).

**Gap:** No auto-expiry of terminals not seen for N days. A terminal last seen 6 months ago still appears in the Console list until manually deactivated.

---

### Q8 — Deactivation during active transaction

```
Admin clicks Deactivate on Terminal 1
        ↓
PosTerminalService.setStatus(T001-XXXX, BLOCKED)
        ↓
pos_terminals row updated — no session check
        ↓
Active cashier on Terminal 1 continues (no notification)
        ↓
Cashier completes checkout → POST /api/pos/checkout
  → PosCheckoutController does NOT check terminal status
        ↓
Sale succeeds (stock deducted, invoice created)
        ↓
Cashier refreshes browser → terminal registration fails (BLOCKED)
        ↓
Cashier cannot open new session
```

The in-flight sale is safe. The problem is the cashier's next action after refresh.

**Expected ERP behaviour:** Graceful notification to the active cashier, block new session open, allow current checkout to finish, log admin action in audit trail.

---

### Q9 — Multi-Branch Behaviour

Slot limits are **per-branch**. All terminal counts and lookups in `PosTerminalService` are scoped by `branchId`. Branch A's 5 terminals do not affect Branch B's limit.

> **Verify:** Whether `PosSettings` has one row per branch or one row per company (with `branchId = null`). If the latter, all branches share the same settings and the same slot limit, which would be incorrect for multi-branch deployments.

---

## 3. Counter Architecture

**Counter is currently a display name only.** It is stored in:

- `pos_terminals.counter_name` — the terminal's assigned counter label
- `pos_sessions.counter_name` — snapshot copied at `openSession()` time

Counter name flows into:
- X/Z-Report headers
- `SalesInvoice` derivable via `sessionId` → `session.counterName`

**Counter does NOT affect:**
- Receipt numbering (invoice sequence, not counter-scoped)
- Stock deduction logic
- GL posting
- Cash drawer triggers
- Shift closing gate

**Changing counter name mid-session:** `pos_sessions.counter_name` is captured at open. Renaming the terminal's counter after session open does not alter the in-flight session. If X-Report is printed before rename and Z-Report after, they will show different counter names — cosmetic inconsistency, not a financial one.

**ERP comparison:** In Oracle Retail and SAP B1 POS, a "Till" (counter) is a first-class entity with its own cash balance, opening float, and reconciliation state. In BillBull, the session is terminal-scoped, not counter-scoped. If two cashiers share a counter in shifts (common in small retail), there is no mechanism to distinguish their session totals under the same counter name. This is a **P1 architectural gap** for multi-shift operations.

---

## 4. Session Lifecycle

```
openSession()
  → One OPEN session per terminal (partial unique index enforces this)
  → Captures: terminalId, counterName, openingCash, sessionDate, openedBy
  → Initialises all totals to 0
        ↓
Each checkout:
  → PosCheckoutController.checkout()
  → Idempotency check on posCheckoutKey (dedup network retries)
  → Stock deducted, invoice created
  → recordInvoiceOnSession() → atomic UPDATE on pos_sessions totals
        ↓
X-Report (at any time):
  → Live totals from pos_sessions + pos_invoices JOIN
        ↓
closeSession()
  → Cash variance check (closingCash vs expectedCash)
  → If variance > cashVarianceThreshold → require supervisor approval
  → Z-Report JSON snapshot written to pos_sessions.z_report_json (immutable)
  → GL posting (non-blocking)
  → status = CLOSED
```

### Database Schema — Key Tables

**pos_terminals**

```sql
id              BIGSERIAL PRIMARY KEY,
branch_id       BIGINT,
terminal_id     VARCHAR(50) UNIQUE,
terminal_name   VARCHAR(100),
counter_name    VARCHAR(100),
device_fingerprint VARCHAR(200) UNIQUE,
device_info     VARCHAR(500),
is_main_pos     BOOLEAN DEFAULT FALSE,
last_seen_at    TIMESTAMP,
registered_by   VARCHAR(255),
status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'

INDEX idx_pos_terminal_branch (branch_id)
INDEX idx_pos_terminal_device (device_fingerprint)
```

**pos_sessions**

```sql
id              BIGSERIAL PRIMARY KEY,
branch_id       BIGINT,
terminal_id     VARCHAR(50),
counter_name    VARCHAR(100),
opened_by       VARCHAR(255),
closed_by       VARCHAR(255),
session_date    DATE,
opened_at       TIMESTAMP,
closed_at       TIMESTAMP,
status          VARCHAR(20) NOT NULL DEFAULT 'OPEN',
opening_cash    NUMERIC(15,2),
closing_cash    NUMERIC(15,2),
expected_cash   NUMERIC(15,2),
cash_difference NUMERIC(15,2),
total_sales     NUMERIC(15,2),
total_cash_sales NUMERIC(15,2),
total_card_sales NUMERIC(15,2),
total_credit_sales NUMERIC(15,2),
total_mixed_sales NUMERIC(15,2),
total_refunds   NUMERIC(15,2),
total_voids     INTEGER,
invoice_count   INTEGER,
x_report_printed BOOLEAN,
z_report_printed BOOLEAN,
z_report_json   TEXT

UNIQUE INDEX uq_pos_session_terminal_open (terminal_id) WHERE status='OPEN'
INDEX idx_pos_sess_lookup (branch_id, terminal_id, status)
```

**pos_devices** (peripheral registry)

```sql
id              BIGSERIAL PRIMARY KEY,
device_code     VARCHAR(50) NOT NULL UNIQUE,
device_name     VARCHAR(100),
branch_id       BIGINT,
counter_name    VARCHAR(100),
status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
last_heartbeat  TIMESTAMP,
notes           VARCHAR(500)

INDEX idx_pos_device_code (device_code)
INDEX idx_pos_device_branch (branch_id)
```

### Key Configuration Parameters

| Parameter | Default | Location |
|---|---|---|
| Max terminals per branch | **5** | `PosSettings.maxTerminalsPerBranch` |
| Terminal ID format | `T{NNN}-{UUID4}` | `PosTerminalService.registerOrRefresh()` |
| Device fingerprint max length | **200 chars** | `pos_terminals.device_fingerprint` |
| Supervisor PIN | BCrypt hashed | `PosSettings.supervisorPin` (never sent to client) |
| Cash variance threshold | **0** (disabled) | `PosSettings.cashVarianceThreshold` |
| Open sessions per terminal | **1** | Partial unique index on `pos_sessions` |

---

## 5. Multi-Branch Behaviour

| Scope | Current Behaviour |
|---|---|
| Slot limit | Per-branch (`PosSettings` scoped to `branchId`) |
| Terminal lookup | Always scoped by `branchId` |
| Session lookup | Scoped by `(branch_id, terminal_id, status)` |
| Cross-branch terminal | Same device in Branch B gets a new terminal row for that branch |
| Z-Report | Per-branch, per-date aggregation |

**Recommended ERP model:**

```
Company Plan
    ↓
Allowed Terminals (license cap — company-wide max)
    ↓
Branch Limit (per-branch override, cannot exceed company cap)
    ↓
Active Devices (current registered count)
    ↓
Available Slots
```

Currently only the Branch Limit layer exists.

---

## 6. Security Assessment

### Device Fingerprint Components

```javascript
// POSSales.jsx lines 935-938
const fp = btoa([
    navigator.userAgent,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone
].join('|')).slice(0, 64);
```

### Attack Surface

| Attack vector | Current defence | Gap |
|---|---|---|
| Clear browser storage | Fingerprint recomputed from same browser properties → same terminal | **Safe** |
| Incognito mode | New fingerprint each window → new slot consumed | **Slot leak** |
| Change browser (Chrome → Firefox) | Different userAgent → new terminal by design | Acceptable |
| Copy browser profile to another PC | Same fingerprint → **same terminal identity** | **Hijack risk** |
| Spoof fingerprint via devtools | Override `navigator.userAgent` + `screen.*` → steal another terminal's identity | **Feasible** |
| Concurrent registration on near-full branch | Count check + insert are not atomic → two requests can both pass and insert | **Slot race** |
| Block terminal with open session | No guard in `setStatus()` | **Operational risk** |

### Supervisor PIN Security

BCrypt hashed, stored server-side. Frontend sends raw PIN; backend verifies hash. Raw PIN is never returned to client. This is correct.

### Checkout Idempotency

`posCheckoutKey` on `sales_invoices` — if the same key is sent twice (network retry), the previously-created invoice is returned. Prevents double-charges.

---

## 7. Scalability Assessment

| Concern | Current State | Risk Level |
|---|---|---|
| 5 terminals | Fully supported | None |
| 50 terminals | DB layer fine; Console list renders all | Low |
| 500 terminals | `getAllForBranch()` returns unbounded list | **Medium** — needs pagination |
| Concurrent checkouts | Atomic UPDATE on session totals | Safe |
| Session hot lookup | Index on `(branch_id, terminal_id, status)` | Safe |
| Slot limit enforcement | COUNT query + INSERT not in one transaction | **Race condition** |
| Z-Report at scale | Aggregates over `pos_invoices` for a date | Low-medium — add date index if absent |

### Slot Limit Race Condition (P0)

`PosTerminalService.registerOrRefresh()` pattern:

```java
long activeCount = repo.countByBranchIdAndStatus(branchId, ACTIVE);
if (activeCount >= settings.getMaxTerminalsPerBranch()) throw new SlotLimitException();
// ← two concurrent requests can both pass here on a 4/5-used branch
terminal = new PosTerminal();
repo.save(terminal);  // both save, resulting in 6 terminals
```

**Fix:** Wrap count + insert in a serialisable transaction, or use `SELECT ... FOR UPDATE` on the `PosSettings` row, or add a DB-level trigger/constraint.

---

## 8. ERP Comparison

| Feature | Oracle Retail | SAP B1 POS | Microsoft D365 Commerce | BillBull | Gap |
|---|---|---|---|---|---|
| Device registration | Hardware cert + server key | Manual config | Cloud-provisioned | Auto via fingerprint | Missing server-issued token |
| Counter as first-class entity | Yes (Till) | Yes | Yes | No (label only) | **P1** |
| Cash drawer mapped to counter | Yes | Yes | Yes | No | **P1** |
| Receipt printer mapped to terminal | Yes | Yes | Yes | No (manual) | P2 |
| Barcode scanner mapped | Yes | Yes | Yes | No | P2 |
| Payment terminal mapping | Yes | Yes | Yes | No | **P1** |
| Fiscal printer (VAT/ZATCA) | Yes | Yes | Yes | Partial (QR archival) | **P1** |
| Z-Report authority = Main POS only | Yes | Yes | Yes | Not enforced | **P1** |
| Deactivation guard (open session) | Yes | Yes | Yes | **Missing** | **P1** |
| License tier cap on terminals | Yes | Yes | Yes | Missing | P2 |
| Auto-expiry of stale terminals | Yes | Configurable | Yes | Missing | P2 |
| Multi-shift counter handover | Yes | Yes | Yes | Not implemented | P1 |
| Kitchen printer routing | Yes | No | Yes | No | P3 |
| Customer-facing display | Yes | Yes | Yes | No | P3 |

---

## 9. Priority-Based Implementation Roadmap

### P0 — Production Blockers

| # | Issue | Location | Fix |
|---|---|---|---|
| P0-1 | Slot limit race condition | `PosTerminalService.registerOrRefresh()` | Wrap count + insert in serialisable transaction or use `SELECT ... FOR UPDATE` on PosSettings row |
| P0-2 | Incognito mode leaks terminal slots | `POSSales.jsx` fingerprint generation | Add `localStorage` UUID token as primary device identity; fingerprint as fallback only |

### P1 — ERP-Grade Gaps

| # | Issue | Fix |
|---|---|---|
| P1-1 | No deactivation guard for open sessions | Before `setStatus(BLOCKED)`, check for open session; return HTTP 409 if found |
| P1-2 | Counter is not a first-class entity | Create `PosCounter` entity; counters own the cash float; sessions bind to counter, not terminal |
| P1-3 | Main POS has no enforced business logic | Gate Z-Report close to Main POS only; gate cash drawer open signal to Main POS terminal |
| P1-4 | No payment terminal mapping | Add `paymentTerminalCode` to `PosTerminal` or `PosDevice`; map card transactions to a physical terminal |
| P1-5 | No deactivation notification to active cashier | WebSocket or polling mechanism to push terminal status changes to open POS sessions |
| P1-6 | Multi-shift counter handover not supported | Session is terminal-scoped; two cashiers on same terminal in separate shifts cannot reconcile independently |

### P2 — Scalability & Operations

| # | Issue | Fix |
|---|---|---|
| P2-1 | No company-level license tier cap | Add `CompanyPlan.maxTerminalsPerBranch`; branch settings cannot exceed it |
| P2-2 | No auto-expiry of stale terminals | Scheduled job: BLOCK terminals where `last_seen_at < now() - interval '90 days'` |
| P2-3 | Console terminal list unbounded | Paginate `getAllForBranch()` |
| P2-4 | Peripheral device mapping incomplete | Extend `PosDevice` with `deviceType` enum; map to terminal via junction table |
| P2-5 | Chrome upgrade orphans terminal | On fingerprint mismatch, allow admin to "claim" orphaned terminal to new fingerprint via Console |
| P2-6 | Sequence number can produce duplicate display names | Use a DB sequence for terminal numbering, not a live COUNT |

### P3 — Future Enhancements

| # | Issue |
|---|---|
| P3-1 | Kitchen printer routing by item category |
| P3-2 | Customer-facing display mapping |
| P3-3 | Fiscal printer (ZATCA hardware) registration |
| P3-4 | Remote device diagnostics (heartbeat dashboard) |

---

## 10. Summary

### What is correct and production-ready

| Area | Status |
|---|---|
| Terminal auto-registration | Fully automatic — no Console visit required |
| Idempotent fingerprint lookup | Prevents duplicate terminals across refreshes |
| Slot limit storage | DB-driven, per-branch, configurable — not hardcoded |
| Session uniqueness | Enforced by partial unique index on `pos_sessions` |
| Checkout idempotency | `posCheckoutKey` prevents double-charges on network retry |
| Z-Report immutability | JSON snapshot captured at close, never overwritten |
| Atomic session totals | `recordInvoiceOnSession()` uses atomic UPDATE — no hot-row contention |
| Supervisor PIN security | BCrypt hashed server-side, never returned to client |

### What is missing before production rollout

| Priority | Gap |
|---|---|
| **P0** | Slot limit race condition during concurrent registration |
| **P0** | Incognito mode leaks terminal slots |
| **P1** | Deactivation with open session is unguarded (no HTTP 409) |
| **P1** | Main POS designation has no enforced business logic |
| **P1** | Counter is a label, not a first-class entity with its own cash reconciliation |
| **P1** | No notification to active cashier when terminal is blocked |

### Device fingerprint adequacy

The fingerprint approach (`btoa(userAgent + screen + timezone)`) is adequate for **single-user dedicated workstations** in a controlled retail environment. It is not adequate for:
- Shared PCs (multiple cashiers, same device = same terminal identity)
- Mobile kiosks where browser upgrades happen frequently
- High-security environments where profile copying must be detected

**Recommended fix (P0-2):** Issue a server-generated UUID token stored in `localStorage` on first registration. Use the fingerprint only as a fallback for devices that have never received a token. The token survives browser upgrades; the fingerprint covers fresh installs.
