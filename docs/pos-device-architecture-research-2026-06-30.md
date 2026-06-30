# BillBull POS Device Module — Architecture Research & Redesign Proposal

**Status: Research / proposal only. No code has been changed as part of this document.**
Date: 2026-06-30

---

## 1. Current BillBull Architecture Report

### 1.1 Request flow today

```
Browser (POSSales.jsx / POSConsole.jsx)
   │
   ├─ Receipt/Label print ────────► Local Print Agent (external .exe, NOT in this repo)
   │                                   http://127.0.0.1:19777  (ESC/POS, USB/Network/Bluetooth/Windows-queue)
   │                                   https://localhost:9101  (Zebra Browser Print, label printers)
   │
   ├─ Cash drawer kick ───────────► window CustomEvent `pos:open-cash-drawer` (no real hardware call —
   │                                   the kick itself happens implicitly when the configured receipt
   │                                   printer sends an ESC/POS drawer-kick byte sequence, or is just a UI toast)
   │
   ├─ Barcode scan ───────────────► Keyboard "wedge" — scanner is a HID keyboard, browser receives
   │                                   keydown/keypress events in a focused input; no driver, no API call
   │
   └─ REST API ───────────────────► Spring Boot backend ─────► PostgreSQL
        /api/pos/devices                                          pos_devices
        /api/pos/printers                                         pos_printers
        /api/pos/terminals                                        pos_terminals
        /api/pos/settings                                         pos_settings
        /api/pos/checkout                                         sales_invoices (+ pos_receipt_qr)
```

Two structurally different flows coexist:

1. **Configuration/registration flow** — fully client-server-DB (terminals, printers, generic devices). This part is genuinely well-built.
2. **Hardware I/O flow** — browser talks **directly** to a local agent process or to Zebra's own local web service. The Spring Boot backend is never in the loop for an actual print, scan, or drawer kick; it only stores config and receives a post-hoc "runtime status" PUT after the frontend tests a printer itself.

There is no backend-mediated hardware layer at all. The backend is a config/registry store, not a device orchestrator.

### 1.2 Device registration

- **Generic devices**: `PosDevice` (`pos_devices` table) — `deviceCode` (unique), `deviceName`, `branchId/branchName`, `counterName`, `status` (ACTIVE/INACTIVE/DECOMMISSIONED), `lastHeartbeat`. Registered via `POST /api/pos/devices`; heartbeat via `POST /api/pos/devices/{id}/heartbeat`. This entity is type-agnostic — it doesn't say *what kind* of device it is. In practice it looks unused by the POS UI (no caller found wiring a generic device into the POS console flow); it appears to be infrastructure built ahead of a consumer.
- **Printers**: `PosPrinter` (`pos_printers`) is the only device type with a full, used CRUD + UI loop (POSConsole.jsx printer tab → `posPrinterApi.js` → `PosPrinterController`/`PosPrinterService`). Scoping fields: `branchId`, `terminalId` (optional), `counterName`. Connection type enum: `USB`, `NETWORK_IP`, `BLUETOOTH`, `WINDOWS_QUEUE`, `ZEBRA_BROWSER_PRINT`.
- **Scanners**: no entity, no table, no API. `POSConsole.jsx` keeps a `scannerConfig` object in component state, persisted only to `localStorage`. It has no effect on runtime behavior — the actual scan path (keyboard wedge into a focused text input) works identically whether this config exists or not.
- **Terminals**: `PosTerminal` (`pos_terminals`) is the most mature entity — `deviceFingerprint` (zero-trust binding of a browser/workstation to a terminal record), `terminalId`, `counterName`, `isMainPos`, `lastSeenAt`, status lifecycle (NEW→ACTIVE→MAINTENANCE/BLOCKED/DECOMMISSIONED). `PosTerminalService.registerOrRefresh()` validates the fingerprint on every register call to stop terminal-ID spoofing.
- **Linkage model that exists**: `Branch → Terminal → Printer (optional) → Counter (string field, not an entity)`. There is no `Company` level (BillBull is single-tenant/single-company by branch), no `User`-level device binding (any logged-in user on a terminal shares whatever printer is assigned to that terminal/branch).
- **Scope answer**: printers are **branch-specific by default, optionally terminal-specific**. Terminals are branch-specific. Generic devices are branch-specific. Nothing is user-specific. Nothing is "global" except in the trivial sense that an unscoped printer with no `terminalId` is visible to the whole branch.

### 1.3 Printer flow

- **Receipt printing**: `posPrintUtils.js` builds an ESC/POS-ish plain-text or HTML receipt; `localPrintAgent.js` posts it to the local agent's `/print/receipt`. Falls back to `window.print()` for A4 invoice format printing (browser-native, no agent).
- **Kitchen printing**: modeled as a `deviceType=KITCHEN_PRINTER` on the same `PosPrinter` entity, but no caller in the codebase actually routes a kitchen ticket to it — it's a configuration option without a consuming print-trigger. BillBull is a retail system, not F&B, so this is speculative enterprise-parity surface, not dead legacy.
- **Label printing**: routed differently from receipts — `zebraZpl.js` talks to Zebra's own **Browser Print** local service (port 9101), generates raw ZPL, and posts to `/write`. This is a *second, parallel* local hardware integration with its own health-check/discovery logic, separate from the generic Print Agent.
- **Print templates**: `printTemplate` string field on `PosPrinter` + a set of builder functions in `posPrintUtils.js` (`buildThermalPrintHtml`, `buildPosA4Template`, `buildThermalReceiptText`, etc.). Templates are hardcoded JS functions, not data-driven/configurable beyond toggling which sections render.
- **Print jobs**: none. A print is a single synchronous HTTP call from the browser to the local agent; there is no job record, no queue, no retry, no history. If the call fails, the user sees an error toast and must retry manually.
- **Browser printing**: used for A4 documents (invoices) via `window.print()`. Thermal/label printing bypasses the browser print dialog entirely and goes straight to the agent/Browser Print service.
- **Local Print Agent**: an external executable, **not part of this repository**, expected to be running on `127.0.0.1:19777` on the cashier's workstation. "Print Agent not reachable" appears because `localPrintAgent.js` probes `/health` on both `127.0.0.1` and `localhost` before every printer-list/test/print call and surfaces this specific message when neither responds — i.e., the agent process isn't running, isn't installed, or is blocked by a firewall/port conflict on that machine.

### 1.4 Barcode scanner flow

- **Why scanner configuration exists**: it was added (POSConsole.jsx) as UI surface anticipating real scanner management, mirroring the printer tab's shape, but no backend or runtime logic was ever wired to it.
- **Keyboard Wedge**: the de facto and *only* scan mechanism. A USB or Bluetooth-HID barcode scanner emulates a keyboard; it "types" the barcode digits followed by Enter into whatever input has focus. BillBull's POS search/scan input listens for fast sequential keystrokes ending in Enter and resolves them via `/api/pos/resolve` (see [[project_pos_unified_smart_search]] memory). No vendor SDK, no serial protocol, no app-level driver is involved.
- **Does Bluetooth mode change runtime behavior?** No — Bluetooth HID scanners pair at the OS level and then behave exactly like USB HID once paired; the browser sees identical keystroke events either way. The `connectionType: 'USB'|'BLUETOOTH'|'SERIAL'` field in the unused scanner config has zero effect on this.
- **Do scanner settings affect scanning?** No. `inputMode: 'KEYBOARD_WEDGE'` is the only mode that actually works given the architecture; any other value would do nothing because there's no code path that branches on it.
- **What's metadata-only?** The entire scanner config object — `deviceCode`, `deviceName`, `connectionType`, `status`, `enabled` — is decorative. Disabling it in the UI does not disable scanning.
- **Actual scan workflow**: `Scanner (HID) → OS keyboard event → focused browser input → POS keystroke-burst detector → /api/pos/resolve → cart/lookup`.

### 1.5 Cash drawer

- **Kick-out support**: configured indirectly via `PosSettings.cashDrawerTriggers` (a comma-separated string list of trigger keys: `CASH_PAYMENT`, `RECEIPT_PRINT`, `CHANGE_RETURN`, `CASH_SETTLEMENT`, `CASH_DROP`, `CASH_OUT`, `MANUAL_OPEN`). There's no drawer *entity* — it's a feature flag set on the branch's POS settings, not a registered piece of hardware.
- **Drawer opening**: in real ESC/POS hardware, the drawer is wired into the receipt printer and opened by an escape sequence sent *with* a print job (`ESC p`), not via a separate driver call. BillBull's architecture is consistent with this — there's no standalone "open drawer" hardware call, only a `pos:open-cash-drawer` browser CustomEvent that other POS components listen for to update UI state (e.g., showing a "drawer open" toast) and, presumably, the print agent is expected to append the kick sequence when printing a receipt that has `RECEIPT_PRINT` as an enabled trigger. This dependency is implicit, not enforced or visible in code — if the agent doesn't honor it, nothing kicks.
- **Printer integration**: as above, drawer kick rides on the receipt printer's cable — there is no separate cash-drawer connection type or device record.
- **Drawer events**: purely a same-tab DOM CustomEvent (`pos:open-cash-drawer`) with a `trigger` payload; no cross-process or backend signal, no audit log entry distinct from the print/payment event that caused it.

### 1.6 Card terminal

- **Current support**: none. "Card" exists only as a payment *method* string on `SalesPayment`/checkout — there is no card terminal entity, no pairing flow, no settlement callback, no EMV/PCI integration of any kind.
- **Current implementation**: a hardcoded mock row ("Ingenico Move 5000", status "Offline") in `POSSales.jsx`'s device list — purely cosmetic, never backed by data.
- **Future limitations**: integrating a real card terminal (Ingenico, Verifone, Geidea, etc. — common in UAE) requires either (a) a payment-terminal SDK running on the cashier workstation that the browser can call locally (similar to the print agent pattern), or (b) a semi-integrated gateway model where the terminal talks to a payment processor directly and the POS only receives an approval/decline webhook. Neither pattern exists today; building it from the current cosmetic placeholder is a from-scratch effort.

### 1.7 Device assignment

Actual hierarchy implemented today:

```
Branch
  └─ Terminal (PosTerminal: deviceFingerprint, terminalId, counterName)
        └─ Printer (PosPrinter, optional terminalId scope; falls back to branch-level default if unscoped)
```

There is no `Company` tier (BillBull has no multi-company concept visible in this slice), no `Counter` as a first-class entity (it's a free-text string field on both `PosTerminal` and `PosPrinter`, not a row anyone can look up or reassign independently), and Scanner/Drawer/Card-Terminal have no place in this hierarchy at all because they aren't modeled as devices.

### 1.8 Local Print Agent

- **Protocol**: plain REST/HTTP (`fetch`/axios from the browser to `127.0.0.1:19777`), JSON request/response. No WebSocket, no persistent connection, no push channel from agent to browser.
- **Implementation**: external, not in this repository — `localPrintAgent.js` is purely a client. Whether the actual agent is a native exe, an Electron app, or a background Windows service is unknown/undocumented in this codebase; only its HTTP contract (`/health`, `/printers`, `/test-print`, `/print/receipt`) is visible from the frontend.
- **Polling vs push**: polling-only, request/response, fired on demand (page load, printer test click, checkout print). No keep-alive or periodic health beacon. A printer's `runtimeStatus` in the DB is only as fresh as the last time someone clicked a button that happened to test it (or until `lastSeenAt` ages out — but nothing currently marks a printer OFFLINE on a timer; it's manually re-tested or left stale).
- **IPC**: none relevant — agent communication is loopback HTTP, not OS-level IPC.

### 1.9 Device discovery

- **USB / Bluetooth / Serial / Network discovery**: none performed by BillBull's own code in this repo. The Local Print Agent's `/printers` endpoint is presumably backed by OS APIs (Windows printer spooler enumeration) on the agent side, but that logic lives outside this repository and is opaque to it.
- **Zebra discovery**: delegated entirely to Zebra Browser Print's `/available` endpoint — again, third-party code, not BillBull's.
- **Browser APIs**: BillBull does not use WebUSB, Web Bluetooth, or the Web Serial API anywhere. All "discovery" the operator does is manual: type in an IP/port or a Windows printer-queue name into a form.
- **No Windows device access, no native APIs** are touched directly by this codebase.

### 1.10 Current problems (architectural weaknesses)

1. **Two parallel, inconsistent hardware-talk paths** — generic Print Agent (19777) for ESC/POS, separate Zebra Browser Print (9101) for labels — different health-check shapes, different error handling, no shared abstraction.
2. **Browser is the orchestrator of hardware I/O.** The backend never sees a print attempt happen; it only sees a post-hoc status PUT if the frontend remembers to call it. This means: no central audit trail of print attempts, no server-side enforcement that a receipt was actually delivered, no way to print from a backend job (e.g., scheduled report) without a browser tab open.
3. **No print queue** — a failed print is just gone. No retry, no backlog, no "reprint last 5 failed jobs" recovery tool for a cashier whose printer jammed mid-shift (reprint exists only for completed *invoices*, not for *failed print attempts*).
4. **No print job / job history table** — can't answer "how many prints failed today across all terminals" without log-scraping.
5. **Scanner module is 100% decorative** — config UI exists, persists to localStorage, has no backend, and changes nothing about actual scan behavior. This is the most direct deviation from "what does enterprise software do" — JavaPOS/OPOS provide a real device-class abstraction for scanners even though HID wedge scanners need almost none of it; BillBull doesn't model the device at all, not even nominally.
6. **No cash drawer entity** — it's a string list of trigger flags on `PosSettings`, not a registered device, so there's no way to know which physical drawer is attached to which terminal, no health/online status, no per-drawer audit.
7. **No card terminal support whatsoever** — biggest functional gap for any retailer wanting integrated card payments (vs. manual "mark as paid by card" entry, which is what exists today).
8. **No central Device Manager concept** — `PosDevice`, `PosPrinter`, `PosTerminal` are three independent entities with overlapping but not unified scoping rules (`branchId`/`terminalId`/`counterName` repeated three times with slightly different semantics each time) and no shared parent abstraction or registry view.
9. **No device health monitoring** — `runtimeStatus` on `PosPrinter` is "last known," not "currently known"; there's no heartbeat sweep, no automatic OFFLINE transition, no alerting.
10. **Two unrelated local services with no common discovery layer** — operators must separately install/run/troubleshoot a BillBull-specific agent AND Zebra's official Browser Print app, with no unified dashboard telling them which is down.
11. **Difficult multi-terminal deployment** — every terminal needs its own local agent install + Zebra Browser Print install + manual printer registration via forms; nothing is auto-discovered.
12. **Missing offline support** — checkout itself can probably survive a network blip via idempotency keys (`posCheckoutKey`), but printing absolutely cannot: if the local agent or network to backend is down at the wrong moment, the print is simply lost with no recovery path.
13. **Missing reconnect logic** — `localPrintAgent.js` re-probes health on every call rather than maintaining/recovering a session; there's no exponential backoff, no "agent came back online" event.
14. **Weak abstraction across device types** — printer, scanner, drawer, and card-terminal each have their own ad hoc (or absent) model instead of a shared `Device` base + per-type capability extension, which makes adding a 5th device type (e.g., a customer-facing display or a scale) require yet another bespoke entity/controller/service/UI tab.

---

## 2. Current Database Design

```
pos_devices            -- generic device registry, currently orphaned from the POS UI's actual flows
  id, created_at, created_by, updated_at, updated_by, is_active,
  device_code (UNIQUE), device_name, branch_id, branch_name,
  counter_name, status[ACTIVE|INACTIVE|DECOMMISSIONED], last_heartbeat, notes

pos_terminals           -- workstation registration w/ zero-trust fingerprint binding
  id, ..., branch_id, branch_name, terminal_id (UNIQUE),
  terminal_name, counter_name, device_fingerprint (UNIQUE), device_info,
  is_main_pos, last_seen_at, registered_by,
  status[NEW|ACTIVE|INACTIVE|MAINTENANCE|BLOCKED|DECOMMISSIONED]

pos_printers             -- the only fully modeled device type
  id, ..., device_code (UNIQUE), device_type[RECEIPT_PRINTER|KITCHEN_PRINTER|LABEL_PRINTER],
  device_name, model_name, branch_id, branch_name, terminal_id, terminal_name,
  counter_name, connection_type[USB|NETWORK_IP|BLUETOOTH|WINDOWS_QUEUE|ZEBRA_BROWSER_PRINT],
  system_printer_name, device_identifier, ip_address, port_number,
  paper_size, print_template, is_default_printer,
  status[ACTIVE|INACTIVE|DECOMMISSIONED],
  runtime_status[ONLINE|OFFLINE|UNKNOWN|NOT_FOUND|DRIVER_ERROR],
  last_test_result, last_tested_at, last_seen_at, notes

pos_settings             -- branch-level config, holds cash-drawer trigger flags + print toggles
  id, ..., branch_id, max_terminals_per_branch,
  cash_drawer_triggers (CSV string), auto_print_receipt (bool),
  print_template_config (JSON text), ...

sales_invoices           -- carries POS-specific receipt/print metadata, not a device table
  ..., pos_receipt_qr, pos_checkout_key, pos_session_id, pos_terminal_id, pos_counter_name
```

No table exists for: scanners, cash drawers (as devices), card terminals, print jobs/queue, device-health history, or hardware profiles/templates reusable across terminals.

---

## 3. Current API Documentation

| Area | Method & Path | Notes |
|---|---|---|
| Devices (generic) | `POST/GET/PUT/DELETE /api/pos/devices`, `GET /api/pos/devices/code/{code}`, `POST /api/pos/devices/{id}/heartbeat` | Largely unconsumed by the POS UI today |
| Terminals | `POST /api/pos/terminals/register`, `GET /api/pos/terminals/branch/{branchId}`, `.../all`, `PUT .../rename`, `.../status`, `.../set-main` | Zero-trust register/refresh is the load-bearing piece |
| Printers | `GET/POST/PUT/DELETE /api/pos/printers`, `PUT /api/pos/printers/{id}/runtime` | Runtime status is client-reported, not server-observed |
| Settings | `GET/POST /api/pos/settings[/branch/{id}]`, `POST .../verify-pin`, `.../supervisor-auth` | Cash-drawer trigger flags live here |
| Checkout/Receipt | `POST /api/pos/checkout`, `GET .../invoices/{id}/receipt`, `GET .../invoices/{id}/reprint` | QR generated server-side; actual print dispatch is client-side after this |
| Local Print Agent (3rd-party/external, not BillBull backend) | `GET /health`, `GET /printers`, `POST /test-print`, `POST /print/receipt` on `127.0.0.1:19777` | Not part of this repo |
| Zebra Browser Print (3rd-party) | `GET /available`, `POST /write` on `localhost:9101` | Zebra's own product, not BillBull's |

---

## 4. Current Device Flow Diagrams

**Receipt print (today):**
```
Cashier completes sale → POSSales.jsx → posPrintUtils.buildThermalReceiptText()
   → localPrintAgent.printReceiptThroughAgent() → POST 127.0.0.1:19777/print/receipt
   → [external agent, opaque] → thermal printer
   (no DB record of the attempt; PosPrinter.runtimeStatus only updates if a manual "Test" was run)
```

**Label print (today):**
```
Operator clicks "Print Label" → zebraZpl.buildLabelZpl() → POST localhost:9101/write
   → Zebra Browser Print [opaque] → Zebra printer
```

**Scan (today):**
```
HID scanner → OS keyboard buffer → focused <input> in POS → keystroke-burst parser
   → /api/pos/resolve → product/customer/batch resolved into cart
```

**Cash drawer (today):**
```
Payment settled with CASH and trigger enabled → dispatchEvent('pos:open-cash-drawer')
   → [implicit reliance on receipt printer's ESC-p kick during the same print job]
```

**Terminal boot (today, the most "enterprise-shaped" flow that exists):**
```
Browser loads POS → reads/creates deviceFingerprint → POST /api/pos/terminals/register
   → PosTerminalService validates fingerprint vs stored terminalId → ACTIVE/REJECT
   → GET /api/pos/printers?branchId&terminalId → resolvePrinterForContext() picks defaults
```

---

## 5. Enterprise POS Research Report

### Device Manager
A **Device Manager** is the backend-resident service of record for "what hardware exists, where is it, is it healthy, and who/what is it allowed to talk to." In D365 Commerce, ERPNext, Oracle Retail Xstore, and LS Central, this is *always* a first-class module — not a side effect of printer config — because hardware in retail churns constantly (new store, new till, swapped printer) and someone other than a developer needs to manage it. Responsibilities: registration, discovery ingestion, configuration, lifecycle status, assignment to org hierarchy, health aggregation, and acting as the **single API surface** other modules (POS, kitchen, reporting) call instead of talking to hardware directly. Benefit: every consumer (POS sale screen, kitchen display, back-office dashboard) goes through one contract instead of re-implementing agent discovery/health-check logic per feature, which is exactly the duplication BillBull has between its Print Agent client and its separate Zebra client.

### Hardware Layer (separation of concerns)
Enterprise systems insert a layer between the POS application and the physical device:

```
POS App  →  Hardware Service (local, on the till)  →  Driver/SDK  →  Physical Device
```

This mirrors UnifiedPOS/JavaPOS/OPOS exactly: the POS app talks to a standardized **device-class API** (`PosPrinter`, `ScanProvider`, `CashDrawer`, `LineDisplay`, `PaymentDevice` are literal UPOS device categories), and a vendor-supplied or generic **service object** translates that standard call into the manufacturer's actual protocol. The POS app never needs to know if the printer is Epson ESC/POS, Star, or a generic thermal — it calls `printer.printNormal(text)` against the standard interface. BillBull's Local Print Agent is a primitive, ad hoc version of exactly this idea (good instinct) but it isn't standardized, isn't shared across device types (separate Zebra path), and the *browser* talks to it directly rather than the backend mediating, which removes server-side auditability and centralized control.

### Device Discovery
Enterprise hardware services auto-discover: USB enumeration (vendor/product ID matching for known scanner/printer classes), Bluetooth pairing lists, serial port scanning (COM ports on Windows), and network discovery (mDNS/Bonjour or SNMP/IP-range probing for network printers and payment terminals). The till-side local service performs discovery and reports a normalized list up to the central Device Manager; the operator picks from a list rather than typing in IPs and Windows queue names by hand (which is BillBull's current model end to end).

### Device Health
Standard health states across these systems: **Online, Offline, Busy, Disconnected, Paper Out, Cover Open, Error** (and usually a generic "Warning" for low-paper / near-fault states). Health is pushed or polled on a short interval (seconds, not "whenever someone clicks Test") from the local hardware service to the central Device Manager, which fans it out to dashboards and gates POS UI affordances (e.g., grey out "Print Receipt" if the assigned printer is Offline, rather than letting the cashier hit a failure at checkout).

### Hardware Profiles
A **Hardware Profile** is a reusable bundle of device-type defaults (paper size, template, connection defaults) that gets *assigned* to a terminal rather than each terminal having its own bespoke printer row built from scratch. E.g., "Counter Profile A" = Receipt Printer (80mm, ESC/POS) + Cash Drawer (kick on cash tender) + Scanner (USB HID). Rolling out a new till means assigning a profile, not re-entering five forms. BillBull has no profile concept; every printer is configured individually per terminal/branch.

### Hardware Assignment
Standard hierarchy: `Company → Store/Branch → Terminal/Till → Hardware Profile → individual Devices`. BillBull has `Branch → Terminal → Printer` only, with Counter as a string, and no Company tier or Profile tier. This is the most direct structural gap versus the named systems, all of which support multi-store/multi-company deployments with profile reuse.

### Print Queue
Enterprise print pipelines treat a print as a **job**, not a synchronous fire-and-forget call: the job is queued, the local hardware service pulls/receives it, attempts delivery, and reports success/failure back; failures are retried with backoff up to a limit, and failed-after-retries jobs land in a recoverable history the operator (or supervisor) can re-trigger from a UI ("reprint last failed receipt"). This also means a print can be requested by a *backend* process (e.g., automatic e-invoice copy, end-of-day Z-report) without any browser tab being open. BillBull has none of this — a print is one HTTP call from the browser with no record if it fails.

### Scanner Architecture
USB/Bluetooth HID "Keyboard Wedge" scanners genuinely need almost zero device-specific software: they're designed to be a no-driver keyboard substitute. This is *why* most POS systems (including BillBull, correctly) just listen for fast keystroke bursts terminated by Enter/Tab rather than building scanner SDK integration. Enterprise systems still register the scanner as a device for inventory/health/assignment purposes (so a store ops dashboard can see "Scanner offline" if it's unplugged) even though the runtime *scanning* itself needs no driver — the device record's value is operational visibility, not runtime necessity. BillBull's instinct to keep scan-handling driver-free is correct; the gap is that it didn't even keep the lightweight registration/visibility piece.

### Printer Architecture (canonical pipeline)
```
Print Request → Receipt/Label Renderer (template engine) → Queue → Hardware Service (local) → Printer → Success/Failure → Job log
```
The renderer step is decoupled from the transport step specifically so the same renderer output (e.g., a receipt object model) can be sent over ESC/POS, rendered to PDF for a customer-facing display, or emailed — BillBull's renderer functions in `posPrintUtils.js` already produce transport-agnostic text/HTML, which is good; what's missing is everything from "Queue" onward.

### Offline Printing
Enterprise POS terminals are designed to keep selling and printing receipts even with zero internet connectivity, because the **local hardware service runs on the till itself** and talks to USB/network-local printers without needing the cloud/backend in the loop for the print mechanics — the backend sync (inventory, sales posting) happens asynchronously/queued once connectivity returns. BillBull's local-agent pattern already has the right shape for this (frontend → local agent → printer doesn't require the Spring Boot backend to be reachable at print time) but it currently has no offline queue for the cases where the local agent *itself* is briefly unreachable, and checkout-to-backend has limited resilience beyond the idempotency key.

---

## 6. Comparison Matrix

| Area | Current BillBull | Enterprise Standard | Gap | Recommendation |
|---|---|---|---|---|
| Architecture | Browser talks directly to local hardware services; backend only stores config | POS App → backend Device Manager (for config/audit) + local Hardware Service (for actual I/O) | Backend never sees print/scan/drawer attempts | Introduce backend-mediated print job model; keep local agent for actual transport |
| Device discovery | Manual entry (IP, Windows queue name, ZPL device list from Zebra app) | Auto-discovery (USB/BT/serial/network) surfaced to a picker | No discovery anywhere in BillBull's own code | Local agent reports discovered devices; backend stores as "candidates" for one-click registration |
| Printer management | Single entity, 3 types, full CRUD + runtime status field | Same concept, plus profiles, queue, retry | Mostly present; missing queue/profile | Add print job table + hardware profiles |
| Scanner | UI-only mock, localStorage, zero runtime effect | Registered device (for visibility) + driver-free HID scanning | Entire backend model missing | Add lightweight `Scanner` device record for visibility only; keep wedge scanning as-is |
| Cash drawer | Trigger flags on branch settings, implicit reliance on printer kick code | Registered device tied to a printer, explicit kick command, health/audit | No device identity, no explicit kick confirmation | Model as a device attached to a printer; log kick attempts |
| Card terminal | Not implemented; mock UI row | Registered payment device, semi/fully-integrated EMV flow | 100% gap | New module — likely 3rd-party gateway SDK integration on local agent |
| Device health | Last-known status, manually refreshed | Live, polled/pushed every few seconds, standard state set | No heartbeat sweep, no auto-offline | Add health endpoint + periodic sweep job; expand status enum |
| Assignment | Branch → Terminal → Printer; Counter is a string | Company → Branch → Terminal → Hardware Profile → Devices | No Company tier, no Profile tier, Counter not an entity | Add Hardware Profile concept; promote Counter to entity if multi-counter ops matter |
| Print queue | None — synchronous, fire-and-forget | Job table, retry, history, recoverable | 100% gap | Add `pos_print_jobs` with status/retry/history |
| Offline support | Local-agent pattern is offline-friendly for transport; no queue for agent-unreachable case | Till keeps working without WAN; jobs queue locally and drain | Partial — checkout has idempotency key, printing does not | Add local-side persistent queue (or at least retry-with-backoff) in the agent contract |
| Logging | Only printer test results (`lastTestResult`) and invoice reprint audit | Every device action logged (print/reconnect/disconnect/failure/retry/error/health) | Sparse — no holistic device action log | Add `pos_device_event_log` feeding into existing `AuditLogService` |
| Scalability | Each terminal manually configured; no profile reuse | Profile-based rollout | Manual, doesn't scale past a few terminals per branch | Hardware Profiles |
| Security | Terminal has zero-trust fingerprinting (good); printers/scanners have no equivalent trust model | Devices generally inherit trust from the terminal/till they're attached to | Minor — printers/drawers aren't independently exploitable today since browser-initiated | Low priority; keep terminal-level trust, don't over-engineer device-level auth |
| Maintainability | 3 separate device entities with overlapping but inconsistent scoping fields; 2 separate local-service clients (agent + Zebra) | Single device abstraction, single local hardware service contract | Duplication, inconsistent models | Common `Device` base concept; consider migrating Zebra label flow behind the same agent contract long-term (not urgent) |

---

## 7. Gap Analysis Summary

The single largest architectural gap is **the backend's absence from the hardware I/O path**. Every other gap (no queue, no health sweep, no unified device model, no profiles) is a downstream consequence of the browser owning hardware communication directly instead of going through a backend-mediated job/command model. The second largest gap is **two unimplemented device types** (scanner is cosmetic, card terminal doesn't exist) sitting alongside one well-built type (printer) and one well-built but disconnected type (terminal). The third is **organizational**: no Hardware Profile / no Company tier, which matters once BillBull is deployed to more than a couple of branches with more than one till each.

---

## 8. New BillBull Device Architecture (Proposed)

### 8.1 Central Device Manager (backend)
A new `pos.devicemanager` package consolidating registration, profile assignment, health aggregation, and command dispatch behind one set of controllers, replacing/absorbing the current `device`, `printer`, `terminal` packages' overlapping scoping logic into a shared `Device` base entity with per-type extension tables (or a single table + `deviceType` discriminator, consistent with how `PosPrinter` already encodes its sub-type). Responsibilities: registration, discovery ingestion (candidate devices reported by local agents), configuration, assignment (via Hardware Profiles), health aggregation, command dispatch (print/open-drawer/etc.), and logging — all flowing through `AuditLogService` per existing convention.

### 8.2 Local Device Agent (unchanged role, formalized contract)
Keep the existing till-resident local agent pattern (it's the right shape) but unify the *contract* so both ESC/POS-style devices and Zebra-style label printers speak the same shape to the backend-mediated job model: `register(deviceList)`, `health()`, `executeJob(jobId, payload)` → reports result back via `PUT /api/pos/print-jobs/{id}/result`. The agent remains responsible for USB/Bluetooth/Serial/Network reach, discovery, and the actual driver/SDK call (ESC/POS, ZPL, or, eventually, a card terminal SDK) — it does NOT change its low-level transport responsibilities, only how it reports in and receives jobs.

### 8.3 Browser
Browser stops calling `127.0.0.1:19777` / `localhost:9101` directly. New flow: `Browser → Backend (create print job) → Local Agent polls/receives job → executes → reports result → Backend → Browser (via existing poll or a lightweight status check)`. This gives the backend a true record of every print attempt and lets a server-side process (e.g., an end-of-day report) submit print jobs without a browser session.

### 8.4 Supported device types
Receipt Printer, Kitchen Printer (kept as already-modeled, even if unused — low cost to retain), Label Printer, Barcode Scanner (lightweight registration, no runtime dependency), Cash Drawer (now a real device record, attached to a printer), Card Terminal (new — gated behind procurement decision of a specific gateway/SDK), Customer Display and Weighing Scale (documented as future extension points, not built now — BillBull's current business doesn't need them and there's no point bloating scope to match Dynamics/Oracle Retail's superset of device types speculatively).

### 8.5 Device status (unified enum)
`UNKNOWN, ONLINE, OFFLINE, BUSY, DISCONNECTED, ERROR, PAPER_OUT, DISABLED` — supersedes today's inconsistent per-entity status/runtimeStatus split.

### 8.6 Assignment model
`Branch → Terminal/Counter → Hardware Profile → Devices`. (Skipping a `Company` tier deliberately — BillBull has no multi-company concept elsewhere in the codebase, so adding one solely for device hierarchy would be scope creep; revisit only if multi-company is added system-wide.) Promote `Counter` from a free-text string to a lightweight entity only if/when multi-counter-per-terminal becomes a real requirement — right now it's a label, and entity-izing it speculatively would be premature.

### 8.7 Print pipeline (target)
`Generate Receipt/Label → Render (existing posPrintUtils/zebraZpl builders, reused as-is) → Create pos_print_jobs row (QUEUED) → Local Agent polls/receives → Printer → result reported → job marked SUCCESS/FAILED(+retry) → AuditLogService entry`.

### 8.8 Scanner pipeline (target — intentionally minimal)
`Scanner (HID) → OS → POS input (unchanged keystroke-burst detection) → /api/pos/resolve (unchanged)`, with the *only* addition being a lightweight, backend-persisted `Scanner` device row (deviceCode/name/branch/terminal/status) purely for operational visibility in the Device Dashboard — no behavioral runtime change, because the wedge mechanism genuinely doesn't need one.

### 8.9 Device Dashboard
A new Settings page surfacing, per branch: device list with live status (Online/Offline/Busy/Error/Paper Out), last-seen timestamp, assigned terminal/counter, and actions (Test Print, Reconnect Agent, Disable). Built on top of the unified Device Manager API rather than three separate tabs as today.

### 8.10 Logging
Every device action (print attempt + result, reconnect, disconnect, health transition, drawer kick attempt) flows into a new `pos_device_event_log` table and existing `AuditLogService`, closing today's gap where only printer test results and invoice reprints are logged.

---

## Decisions confirmed (2026-06-30)

1. **Card terminal**: design now, build later. Target gateway: **Network International (NI)**, semi-integrated model — NI is the dominant UAE acquirer for retail SMB and its semi-integrated terminal model (PIN entry/EMV handled entirely on the physical terminal; POS only exchanges an amount-request and an approval/decline result) fits BillBull's existing local-agent pattern without any PCI PAN-handling exposure in BillBull's own code. If a different processor is later chosen, only §13.3 below needs revision — the rest of the design (job model, entity shape, UI) is processor-agnostic.
2. **Print-job backend mediation**: proceed. This becomes the spine of the implementation below.
3. **Counter**: stays a free-text string field. No `pos_counters` table in this round.

---

## 9. Database Changes

All additive — no destructive changes to `pos_printers`, `pos_terminals`, `pos_devices`, `pos_settings`. Per repo convention, ship as a new Flyway migration ([[project_flyway_activation]]) rather than relying on `ddl-auto=update` for new tables with constraints.

```sql
-- V##__pos_print_jobs.sql
CREATE TABLE pos_print_jobs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    created_by VARCHAR(100),
    updated_at TIMESTAMP,
    updated_by VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    job_type VARCHAR(20) NOT NULL,        -- RECEIPT | LABEL | KITCHEN_TICKET | TEST
    printer_id BIGINT NOT NULL REFERENCES pos_printers(id),
    branch_id BIGINT NOT NULL,
    terminal_id VARCHAR(50),
    counter_name VARCHAR(100),

    source_type VARCHAR(30),              -- SALES_INVOICE | STOCK_LABEL | X_REPORT | Z_REPORT | MANUAL_TEST
    source_ref_id BIGINT,                 -- e.g. sales_invoices.id

    payload TEXT NOT NULL,                -- rendered receipt/ZPL text, transport-agnostic at creation time
    payload_format VARCHAR(20) NOT NULL,  -- ESC_POS_TEXT | ZPL | RAW_HTML

    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',  -- QUEUED | DISPATCHED | SUCCEEDED | FAILED | CANCELLED
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_error VARCHAR(500),
    dispatched_at TIMESTAMP,
    completed_at TIMESTAMP,

    requested_by VARCHAR(100)
);
CREATE INDEX idx_print_jobs_status_printer ON pos_print_jobs(status, printer_id);
CREATE INDEX idx_print_jobs_branch_terminal ON pos_print_jobs(branch_id, terminal_id);

-- V##__pos_device_event_log.sql
CREATE TABLE pos_device_event_log (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    device_type VARCHAR(20) NOT NULL,     -- PRINTER | SCANNER | DRAWER | CARD_TERMINAL | TERMINAL
    device_id BIGINT NOT NULL,
    branch_id BIGINT,
    event_type VARCHAR(30) NOT NULL,      -- PRINT_SUCCESS | PRINT_FAILED | RECONNECT | DISCONNECT | HEALTH_CHANGE | DRAWER_KICK
    detail VARCHAR(500),
    actor VARCHAR(100)
);
CREATE INDEX idx_device_event_log_device ON pos_device_event_log(device_type, device_id, created_at);

-- V##__pos_scanners.sql  (lightweight, visibility-only — mirrors the unused parts of PosDevice deliberately kept minimal)
CREATE TABLE pos_scanners (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT now(), created_by VARCHAR(100),
    updated_at TIMESTAMP, updated_by VARCHAR(100), is_active BOOLEAN NOT NULL DEFAULT TRUE,
    device_code VARCHAR(50) UNIQUE NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    branch_id BIGINT NOT NULL,
    terminal_id VARCHAR(50),
    counter_name VARCHAR(100),
    connection_type VARCHAR(20) NOT NULL DEFAULT 'USB', -- USB | BLUETOOTH
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',       -- ACTIVE | INACTIVE | DECOMMISSIONED
    last_seen_at TIMESTAMP,
    notes VARCHAR(500)
);

-- V##__pos_cash_drawers.sql
CREATE TABLE pos_cash_drawers (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT now(), created_by VARCHAR(100),
    updated_at TIMESTAMP, updated_by VARCHAR(100), is_active BOOLEAN NOT NULL DEFAULT TRUE,
    device_code VARCHAR(50) UNIQUE NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    branch_id BIGINT NOT NULL,
    terminal_id VARCHAR(50),
    counter_name VARCHAR(100),
    attached_printer_id BIGINT REFERENCES pos_printers(id),  -- drawer kicks ride the printer's cable, model that explicitly
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    last_kick_at TIMESTAMP,
    last_kick_result VARCHAR(20)   -- SUCCESS | FAILED | UNKNOWN
);

-- V##__pos_card_terminals.sql  (design only — table ships in this round, controller/UI deferred to build phase)
CREATE TABLE pos_card_terminals (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT now(), created_by VARCHAR(100),
    updated_at TIMESTAMP, updated_by VARCHAR(100), is_active BOOLEAN NOT NULL DEFAULT TRUE,
    device_code VARCHAR(50) UNIQUE NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    branch_id BIGINT NOT NULL,
    terminal_id VARCHAR(50),
    counter_name VARCHAR(100),
    gateway VARCHAR(30) NOT NULL DEFAULT 'NETWORK_INTERNATIONAL',
    connection_type VARCHAR(20) NOT NULL,   -- SERIAL | NETWORK_IP
    device_identifier VARCHAR(200),         -- NI terminal ID (TID) — not a secret, safe to store
    ip_address VARCHAR(50), port_number INT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    runtime_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    last_seen_at TIMESTAMP,
    notes VARCHAR(500)
    -- deliberately NO merchant secret/API key column here — those live in application config / a secrets store,
    -- never in a row editable through the Settings UI, consistent with how JWT secrets etc. are handled today
);

CREATE TABLE pos_card_transactions (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    card_terminal_id BIGINT NOT NULL REFERENCES pos_card_terminals(id),
    sales_invoice_id BIGINT REFERENCES sales_invoices(id),
    amount NUMERIC(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    status VARCHAR(20) NOT NULL,        -- REQUESTED | APPROVED | DECLINED | CANCELLED | TIMEOUT | REVERSED
    rrn VARCHAR(30),                    -- Retrieval Reference Number from the gateway
    auth_code VARCHAR(20),
    masked_pan VARCHAR(20),             -- e.g. 411111******1111 — last 4 + scheme only, NEVER full PAN/track2
    card_scheme VARCHAR(20),            -- VISA | MASTERCARD | etc.
    gateway_response_code VARCHAR(10),
    gateway_response_message VARCHAR(200)
);
-- PCI note: this table must never contain full PAN, track2, CVV, or PIN block. The terminal and NI's gateway own
-- that data; BillBull only ever receives a masked PAN + approval result, identical to how a standalone EDC works today.
```

`PosPrinter` gains no new columns — `pos_print_jobs.printer_id` is the only new link, keeping the existing entity untouched.

---

## 10. API Changes

| New endpoint | Purpose |
|---|---|
| `POST /api/pos/print-jobs` | Create a job (replaces direct browser→agent call). Body: `{printerId, jobType, payload, payloadFormat, sourceType, sourceRefId}`. Returns job with status `QUEUED`. |
| `GET /api/pos/print-jobs/{id}` | Poll job status (browser polls this after creating a job, short interval, to show success/fail toast). |
| `GET /api/pos/print-jobs?branchId&terminalId&status` | Local agent polls this to fetch its `QUEUED` jobs scoped to its terminal. |
| `PUT /api/pos/print-jobs/{id}/dispatch` | Agent calls this the moment it picks up a job (status → `DISPATCHED`, sets `dispatched_at`); prevents two agents double-handling the same job if more than one is somehow pointed at the same terminal. |
| `PUT /api/pos/print-jobs/{id}/result` | Agent reports outcome: `{success, errorMessage?}`. Backend sets `SUCCEEDED`/`FAILED`, increments `attempt_count`, re-queues automatically (status back to `QUEUED`) if `attempt_count < max_attempts`, writes a `pos_device_event_log` row, and updates `pos_printers.runtime_status`/`last_seen_at`. |
| `POST /api/pos/print-jobs/{id}/retry` | Manual operator-triggered retry for a job that exhausted `max_attempts`. |
| `GET /api/pos/devices/dashboard?branchId` | New aggregate endpoint for the Device Dashboard: printers + scanners + drawers + card terminals in one response with current status, for §8.9. |
| `GET /api/pos/devices/events?deviceType&deviceId` | Tail of `pos_device_event_log` for a given device, surfaced in the dashboard's device detail view. |
| `POST/GET/PUT/DELETE /api/pos/scanners` | CRUD mirroring `PosPrinterController`'s shape, for the new lightweight `pos_scanners`. |
| `POST/GET/PUT/DELETE /api/pos/cash-drawers` | CRUD for `pos_cash_drawers`; `attachedPrinterId` required on create. |
| `PUT /api/pos/cash-drawers/{id}/kick-result` | Local agent reports whether the ESC-p kick actually happened (closes today's "implicit reliance, no confirmation" gap). |
| *(design-only, not built this round)* `POST/GET/PUT/DELETE /api/pos/card-terminals`, `POST /api/pos/card-terminals/{id}/charge`, `POST /api/pos/card-terminals/{id}/void` | NI semi-integrated charge/void flow — see §13.3. |

Existing endpoints unaffected: `pos_printers`, `pos_terminals`, `pos_settings`, `pos_checkout` keep their current contracts. `posPrintUtils.js`'s renderer functions are reused as-is to build the `payload` string sent into the new `POST /api/pos/print-jobs` call — no template rewrite.

---

## 11. Backend Changes

- New package `com.billbull.backend.pos.printjob`: `PosPrintJob` entity, `PosPrintJobRepository`, `PosPrintJobService` (create/dispatch/result/retry logic + retry-with-backoff policy), `PosPrintJobController`.
- New package `com.billbull.backend.pos.deviceevent`: `PosDeviceEventLog` entity (append-only, no update path) + `PosDeviceEventLogService.record(...)` called from the print-job service, the cash-drawer kick-result endpoint, and (eventually) card-terminal transaction handling.
- New package `com.billbull.backend.pos.scanner` and `com.billbull.backend.pos.cashdrawer`: entity + repo + service + controller each, deliberately thin, copying `PosPrinterController`'s validation shape (`branchId` required, `deviceCode` unique).
- `PosPrinterService`: add a `markRuntimeFromJobResult(printerId, success, message)` method, called by `PosPrintJobService` after a job result comes in, replacing the current model where only a manual "Test" updates `runtimeStatus`.
- New scheduled task (e.g. `@Scheduled` in a `PosDeviceHealthSweepJob`) that marks any printer/scanner/drawer whose `last_seen_at`/`lastHeartbeat` is older than a configurable threshold (default 5 min) as `OFFLINE`, closing the "no heartbeat sweep" gap from §6.
- `PosDeviceEventLogService` writes feed into the existing `AuditLogService` for actions that already have an audit category (e.g. receipt reprint), and into the new dedicated log for everything else — no duplication of the two systems' purposes (audit = compliance trail of business actions; device event log = operational/technical trail).
- Permission: new `POS_DEVICE_MANAGEMENT` permission gating the dashboard's mutating endpoints (scanner/drawer/card-terminal CRUD, retry), following the existing `POS_SETTINGS`-gated pattern on `PosDeviceController`.
- *(design-only)* `com.billbull.backend.pos.cardterminal` package for the NI integration — see §13.3; not implemented this round.

---

## 12. Frontend Changes

- `localPrintAgent.js`: the browser-facing functions (`printReceiptThroughAgent`, `testPrintAgentPrinter`, etc.) are refactored to call the **new backend print-job endpoints** instead of `127.0.0.1:19777` directly. The actual `127.0.0.1:19777` HTTP calls move into a new agent-side responsibility (outside this repo, in the external agent executable) — from the browser's perspective, printing becomes "create a job, poll for result," not "call the printer directly."
- New `posPrintJobApi.js`: `createPrintJob(payload)`, `getPrintJob(id)`, `retryPrintJob(id)` — thin wrappers per repo convention (one file per backend feature).
- POSSales.jsx / POSConsole.jsx: replace direct `localPrintAgent` calls at checkout/print-test time with `createPrintJob` + a short poll (reuse the existing toast/status UI, just change what it's polling).
- New Settings page `DeviceDashboard.jsx` (or a new tab in POSConsole.jsx, consistent with how Printer/Scanner/Cash-Drawer tabs already sit side by side there) — consumes `GET /api/pos/devices/dashboard`, shows live status badges, last-seen, and a device event timeline pulling from `GET /api/pos/devices/events`.
- Scanner tab in POSConsole.jsx: stop writing to `localStorage`; wire `saveScannerConfig`/`loadScannerConfig` to the new `pos_scanners` CRUD API. No change to actual scan-handling code in the POS input — confirmed intentionally out of scope per §8.8.
- Cash Drawer tab: add a "Drawer" entity picker (device code/name, attached printer) above the existing trigger checkboxes; trigger checkboxes stay as-is on `PosSettings`, since they're a behavior toggle, not device identity.
- `zebraZpl.js`: unchanged in this round — Zebra Browser Print integration is left as its own path; folding it behind the same `pos_print_jobs` model is a documented future step (see §15), not required to realize the bulk of the benefit (receipt printing is the dominant, business-critical path; labels are comparatively low-volume).

---

## 13. Local Device Agent Design

### 13.1 Contract (formalized, no agent code in this repo)
The external Local Print Agent's HTTP surface changes shape from "browser tells me what to print" to "I ask the backend what to print":

```
Agent startup loop (every 2-5s):
  GET /api/pos/print-jobs?branchId=X&terminalId=Y&status=QUEUED
    → for each job:
        PUT /api/pos/print-jobs/{id}/dispatch
        → execute against the physical printer (existing ESC/POS logic, unchanged)
        → PUT /api/pos/print-jobs/{id}/result {success, errorMessage?}

Agent still exposes locally for diagnostics (kept, not removed):
  GET /health, GET /printers, POST /test-print   -- used by the Device Dashboard's "Test Print" button,
                                                      which still goes browser → backend → ... → agent's /test-print
                                                      via a TEST-type print job, not a direct browser call
```

This is the minimal change to the agent's responsibilities: it gains a polling loop against the backend and loses nothing — it still owns all USB/Bluetooth/Network/Windows-queue transport exactly as today.

### 13.2 Discovery (future increment, not required for the print-job migration)
Agent's existing `GET /printers` (backed by OS printer-spooler enumeration, presumably) gets a second use: periodically POST the discovered list to a new `POST /api/pos/devices/candidates` endpoint, letting the Device Dashboard show "found but not yet registered" printers for one-click registration instead of manual form entry. Documented as a Phase-2 increment — not required to fix the core architectural gap (browser bypassing the backend), so sequenced after the job-model migration.

### 13.3 Card terminal integration (design only — Network International, semi-integrated)
NI's semi-integrated model (consistent with their Compass/Direct terminal product line used widely in UAE retail): the physical terminal handles PIN entry, EMV chip/contactless read, and talks to NI's host directly over its own SIM/Ethernet connection — BillBull's job is only to **tell the terminal an amount and get back an approval/decline**, never to touch card data.

```
Cashier taps "Pay by Card" → POST /api/pos/card-terminals/{id}/charge {amount, salesInvoiceId}
   → backend creates pos_card_transactions row (status REQUESTED)
   → Local Agent polls a new job-like queue (or, if NI's SDK requires direct serial/IP control,
       the agent holds a persistent connection to the terminal — to be confirmed once NI's actual
       SDK docs are reviewed, since semi-integrated SDKs vary between polling and socket models)
   → Agent sends amount to terminal via NI SDK → terminal performs EMV flow with the customer
   → Agent receives APPROVED/DECLINED + masked PAN + RRN + auth code from the terminal/SDK
   → PUT result back to backend → pos_card_transactions updated → SalesPayment recorded as CARD,
       referencing rrn/authCode for reconciliation (no PAN ever reaches BillBull's database or backend)
```

This mirrors the print-job pattern deliberately — same polling/result shape, same agent role, same "browser never talks to hardware directly" principle — so building it later is mostly "another job type," not a new architecture. **Before any build phase**: confirm NI's actual semi-integrated SDK contract (some are Windows DLL/COM-based on the till, not HTTP — this would mean the agent, not the browser, hosts the SDK call, which the design above already assumes) and confirm PCI-DSS scope implications with NI directly; this section is a design sketch, not a vendor-verified integration spec.

---

## 14. Device Manager Design

No single new "God controller" — `pos_print_jobs`, `pos_scanners`, `pos_cash_drawers` stay as separate, conventionally-shaped feature packages (consistent with the repo's package-by-feature rule in CLAUDE.md), but they share three things that constitute the "Device Manager" as a concept rather than a class:
1. **A shared status vocabulary** (§8.5 enum) used consistently across `PosPrinter.runtimeStatus`, new `pos_scanners.status`, `pos_cash_drawers.status`, `pos_card_terminals.runtime_status`.
2. **One aggregate read endpoint** (`GET /api/pos/devices/dashboard`) that fans out to each feature's repository and assembles a unified view — this is the "Device Manager" the frontend talks to; it's a query-composition service, not a new entity hierarchy.
3. **One event log** (`pos_device_event_log`) every feature writes into.

This avoids the bigger, riskier refactor of collapsing `PosPrinter`/`PosTerminal`/`PosDevice` into a single polymorphic `Device` table, which would touch a lot of working, tested code for marginal benefit — the shared vocabulary + aggregate view gets ~90% of the "central Device Manager" value without that risk.

---

## 15. Migration Strategy

Phased, each phase independently shippable and reversible:

- **Phase A — Print job spine** (highest priority, closes the core architectural gap): `pos_print_jobs` table + backend service/controller + agent contract change + frontend `localPrintAgent.js` refactor. Receipts only first (label/Zebra path untouched). Ship behind no feature flag needed — it's a drop-in replacement of the transport call, UI unchanged.
- **Phase B — Device event log + health sweep**: `pos_device_event_log` + scheduled OFFLINE sweep + dashboard read endpoint. Additive, no behavior change to existing flows.
- **Phase C — Scanner & cash drawer registration**: `pos_scanners`, `pos_cash_drawers` tables + CRUD + dashboard tiles + drawer kick-result confirmation. Scanner runtime behavior explicitly untouched (§8.8).
- **Phase D — Device Dashboard UI**: ties A–C together into the new Settings page.
- **Phase E — Card terminal** (gated): only after NI's actual SDK contract is confirmed (§13.3) and a build decision is made; ships its own migration (`pos_card_terminals`, `pos_card_transactions`) independently of A–D.
- **Zebra/label path**: explicitly left out of all phases above — no regression risk, and folding it in is a "nice to have later," not blocking.

Each phase requires a corresponding **external Local Print Agent release** for Phase A (since the agent's contract changes) — this needs coordinating with whoever maintains that executable, since it lives outside this repository. Phase A cannot go live in BillBull's backend/frontend until updated agent binaries are deployed to till workstations, or print will break — recommend a brief dual-support window (agent honors both old direct-print and new job-poll contracts) if a hard cutover isn't feasible across all branches simultaneously.

---

## 16. Step-by-Step Implementation Plan

1. Flyway migration for `pos_print_jobs` (Phase A).
2. `PosPrintJob` entity/repo/service/controller; unit tests (Mockito, per repo convention) for create/dispatch/result/retry transitions.
3. Update agent contract documentation (external) — coordinate agent binary update.
4. Refactor `localPrintAgent.js` to call new job endpoints; keep existing toast/error UX, change only the transport.
5. Manual end-to-end verification: checkout → receipt print via job model, on real or simulated agent.
6. Flyway migration for `pos_device_event_log`; wire writes from print-job result handling.
7. Health-sweep scheduled job + tests for the offline-transition threshold logic.
8. `GET /api/pos/devices/dashboard` aggregate endpoint + tests.
9. Flyway migrations for `pos_scanners`, `pos_cash_drawers`; CRUD services/controllers + tests, mirroring `PosPrinterService`'s validation patterns.
10. Frontend: Device Dashboard page; scanner tab persistence switch from localStorage to API; cash-drawer entity picker.
11. Drawer kick-result endpoint + agent-side confirmation (requires another small agent contract addition).
12. (Deferred to its own future round) NI SDK contract confirmation → `pos_card_terminals`/`pos_card_transactions` migration → card-terminal service/controller → agent integration → checkout UI "Pay by Card" wiring.

---

## 17. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Agent binary update required for Phase A; till workstations might lag | Receipts stop printing on un-updated tills | Dual-support window in the agent (old + new contract) during rollout; coordinate release with till deployment schedule |
| Polling interval (2-5s) adds latency vs. today's synchronous call | Cashier waits slightly longer for receipt confirmation | Acceptable for a 2-5s window in a checkout flow; can shorten if needed, or add a long-poll/SSE variant later if perceived latency is an issue |
| Retry logic double-prints if a job is marked FAILED after the printer actually succeeded (e.g. agent crashed after printing but before reporting result) | Customer gets two receipts | Cap `max_attempts` low (3) for receipts; surface a manual reconciliation note ("job retried — verify only one receipt was issued") rather than silent auto-retry beyond that; this is a known hard problem in print-job systems generally, not unique to this design |
| Scope creep into Device entity unification (collapsing Printer/Terminal/Device into one polymorphic table) | Large, risky refactor of working code for cosmetic benefit | Explicitly rejected in §14 — kept as separate feature packages with shared vocabulary instead |
| NI SDK turns out to require a Windows-native DLL/COM integration rather than HTTP | Agent needs a capability it may not have (depends on what the external agent executable is actually built in/with) | Confirm SDK shape before any Phase E commitment — flagged as an explicit unknown in §13.3, not assumed away |
| PCI-DSS scope creep if a future developer is tempted to log/store full PAN for "debugging" | Compliance violation | `pos_card_transactions` schema explicitly excludes PAN/track2/CVV/PIN columns; call this out in code review checklist when Phase E is eventually built |

---

## 18. Testing Strategy

- **Backend unit tests** (Mockito, mirroring existing test conventions): `PosPrintJobServiceTest` covering create→dispatch→result transitions, retry-until-max-attempts, and the runtime-status side-effect on `PosPrinter`; `PosDeviceHealthSweepJobTest` covering the OFFLINE-threshold logic with mocked clock; `PosScannerServiceTest`/`PosCashDrawerServiceTest` mirroring `PosPrinterServiceTest`'s validation-edge-case coverage.
- **Integration-style verification** (manual, since this is hardware-dependent and not unit-testable): use the `/verify` skill against a real or simulated agent once Phase A code lands — confirm a real checkout print still produces a physical/simulated receipt, and confirm a forced agent-offline scenario surfaces the correct dashboard status and doesn't silently drop the job.
- **Regression guard**: existing `PosCheckoutControllerTest`-style guard (per [[project_pos_payment_draft_clobber]] precedent) for "checkout completes even if print-job creation fails" — printing must never block or roll back a sale.
- Card terminal (Phase E, future): once a build decision is made, this needs its own test plan against NI's sandbox/test terminal — out of scope to design further until that phase is actually scheduled.

---

## 19. Final Architecture Diagram

```
                         ┌────────────────────────────┐
                         │   Browser (POS UI)         │
                         │  POSSales / POSConsole     │
                         └─────────────┬──────────────┘
                                       │ REST (job create/poll, CRUD, dashboard read)
                                       ▼
                         ┌────────────────────────────┐
                         │   Spring Boot Backend      │
                         │  ┌──────────────────────┐  │
                         │  │ pos.printjob         │  │──► pos_print_jobs
                         │  │ pos.deviceevent      │  │──► pos_device_event_log
                         │  │ pos.printer (exist.) │  │──► pos_printers
                         │  │ pos.scanner (new)    │  │──► pos_scanners
                         │  │ pos.cashdrawer (new) │  │──► pos_cash_drawers
                         │  │ pos.terminal (exist.)│  │──► pos_terminals
                         │  │ pos.cardterminal*    │  │──► pos_card_terminals / *_transactions  (*design only)
                         │  └──────────┬───────────┘  │
                         └─────────────┼──────────────┘
                                       │ poll: GET queued jobs / PUT dispatch+result
                                       ▼
                         ┌────────────────────────────┐
                         │  Local Device Agent         │   (external executable, till-resident)
                         │  - ESC/POS receipt printing  │
                         │  - Windows printer queue     │
                         │  - (future) NI terminal SDK  │
                         └─────────────┬──────────────┘
                                       │ USB / Network / Bluetooth / Serial
                                       ▼
                    Receipt Printer · Cash Drawer (via printer cable) · Card Terminal*

   Zebra label path (unchanged, out of scope this round):
   Browser → Zebra Browser Print (localhost:9101) → Zebra label printer

   Scanner path (unchanged, out of scope this round):
   HID Scanner → OS keyboard buffer → POS input → /api/pos/resolve
```

---

## Summary

The proposal closes the architecture's central gap — backend absence from the hardware I/O path — via a print-job model (Phase A–D), while deliberately *not* over-engineering: no Company tier, no Counter entity, no Device-table unification, no Zebra-path migration, and no card-terminal build until NI's SDK contract is verified. Recommend starting implementation at **Phase A** (§15/§16 steps 1–5) as the next concrete task whenever you're ready — it's the highest-leverage, most self-contained piece and doesn't require the card-terminal vendor decision to be finalized.
