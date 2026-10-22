# Standalone POS — permission model

Audited on `feat/standalone-pos` in three passes:

1. 2026-10-09: the till permission on transaction endpoints.
2. 2026-10-09: the remaining endpoints (sessions, day close, cash drawers, printers, POS search, invoice lookups, and the invoice helpers the till shares with Retail).
3. 2026-10-10: hardware control (counters, scanners, hardware profiles, the device registry, print jobs, server-relayed printing and the drawer pulse), branch isolation for held sales, layaways, cash movements and POS settings, and product cost exposure.

This page records what the code enforces, not what was intended.

## How a permission is decided

Frontend `PermissionContext.canAction` and backend `ModulePermissionService` use the same rule:

1. If any of the user's roles has an explicit row for the key (for example `sales.pos`), that row decides. An explicit `false` is a deny and is not overridden by the parent.
2. If no role has a row for the key, the top-level parent decides (`sales.pos` falls back to `sales`, `pos.devices` to `pos`).
3. Otherwise the answer is deny. Roles combine as a union: one role that allows is enough.

`approve` on `pos.admin*` never falls back to the parent. Single-switch keys such as `permissions.pos.cashmovement.create` are "granted" when `can_view` is true; their parent is `permissions`, which no seeded role holds, so they need an explicit row.

The seeded roles (`RolePermissionInitializer`) grant only the top-level `sales` row. They reach `sales.pos` and `sales.invoice` through the parent. Explicit sub-key rows exist only where an administrator saved them in Roles & Permissions.

## How branch scope is decided

`BranchAccessService` decides, from the JWT's branch claims (`BranchContextHolder`), never from a branch id the client sends:

- **One record** (`assertTransactionBranchAccessible`): ADMIN and SUPER_ADMIN reach every branch. Everyone else, BRANCH_ADMIN included, reaches their primary and additional branches. Rows with no branch are reachable. A refusal is HTTP 403.
- **A customer** (`currentSearchScope`, the customer typeahead's rule): visible when attached or allocated to a reachable branch, or attached to none.

Where an endpoint takes a `branchId` parameter, it is now checked against this scope, and rows are filtered by their own branch, so `branchId` omitted (which the queries treat as "all branches") cannot widen the result.

## What a cashier needs

| Key | Flag | Why |
|---|---|---|
| `sales.pos` | view | The till permission. It admits the user to `/pos/` and `/sales/pos`, and the backend requires it on every till endpoint (matrix below). |
| `sales.invoice` | view | The till reads invoices through `/api/sales/invoices` (receipt print after checkout, customer-history preview, serial lookup, invoice email). Create and edit are **not** needed. |
| `inventory.product` | view | The till's product catalogue loads through `/api/products/list`, which requires it. Seeded SALES has it through `inventory`. |
| `sales.return` | view + create | Only for returns at the till (`/api/sales/returns`). |
| `permissions.pos.cashmovement.create` | granted | Only for cash in/out from the back-office Cash Movements screen. The till's own cash in/out route needs till access, not this key (see open questions). |
| `permissions.pos.receipt.reprint` | granted | Only for duplicate-receipt reprints. |
| `permissions.pos.reports.view` | granted | Only for the X/Z report browser. |

Not needed by a cashier, and now enforced: `pos.devices`, `pos.printers`, `pos.counters`, `pos.scanners` and `pos.hardwareprofiles` create/edit/delete, for device setup, and `pos.settings` edit, for saving POS settings. Opening the drawer through a network printer needs no extra key, but it does need the cashier's own open session in that branch (see the drawer rule).

## Endpoint authorization matrix

"Till" means `sales.pos` view. "Session scope" means the stored session's branch must be reachable. "Branch scope" means a `branchId` parameter must be reachable. **Bold** marks a check added in the hardening pass. Every endpoint also requires authentication (`SecurityConfig`).

### `/api/pos/sessions` (`PosSessionController`)

| Method and route | Kind | Required | Extra rules kept |
|---|---|---|---|
| `POST /open` | write | Till | Branch from the terminal, server-side |
| `GET /active` | read | **Till** | Service returns only the caller's own session |
| `GET /{id}`, `GET /{id}/sync` | read | **Till + session scope** | |
| `POST /{id}/transfer` | write | **Till + session scope** | `confirm: true`, supervisor PIN when the transfer policy needs one |
| `POST /{id}/close` | write | **Till + session scope** | Closure grant (`authorize-closure`) and variance grant (`authorize-variance`) |
| `POST /{id}/begin-closure` | write | **Till + session scope** | Closure grant |
| `POST /{id}/cancel-closure` | write | **Till + session scope** | Supervisor only (`PosSessionAuthorizationService`) |
| `POST /{id}/authorize-closure` | write | **Till + session scope**, checked before the password is verified | Owner or supervisor credentials; single-use grant |
| `POST /{id}/authorize-variance` | write | **Till + session scope** | Supervisor credentials; grant bound to the counted figures |
| `POST /{id}/cash-movement` | write, posts GL | **Till + session scope** | Open session, Business Day and closure gates. The till opens the drawer only after this call succeeds. Not `permissions.pos.cashmovement.create` (see open questions) |
| `GET /{id}/x-report`, `POST /{id}/x-report/generate`, `POST /{id}/x-report/print-check` | read / marks report | **Till + session scope** | |
| `GET /z-report`, `GET /day-close/summary`, `GET /z-report/print-check` | read | **Till + branch scope** | |
| `POST /close-day` | write | **Till + branch scope**, always | Plus a supervisor role when the branch's `requireSupervisorForDayClose` is on |
| `POST /skip-day` | retired | Role list (`hasAnyAuthority`) | Always 410 Gone |
| `GET /day-status` | read | **Till** | |
| `GET /history` | read | **Till + branch scope** | `branchId` defaults to the caller's branch |
| `POST /{id}/suspend`, `/resume`, `/touch-activity` | write | **Till + session scope** | Resume keeps the Business Day and closure gates |
| `POST /{id}/supervisor-takeover` | write | **Till + session scope** | Supervisor PIN when the branch has one set |

### `/api/pos/checkout` (`PosCheckoutController`)

| Method and route | Kind | Required |
|---|---|---|
| `POST /` | write | Till (before the idempotent replay); price-override, closed-day and salesperson rules unchanged |
| `GET /capabilities` | static | Authentication only (describes the API contract, no data) |
| `GET /invoices/lookup` | read | Till. **By number: the matched invoice's branch must be reachable** (exact match: 403; prefix search: unreachable matches skipped). **By mobile: branch scope on `branchId`, and only reachable invoices match** |
| `GET /invoices` | read | Till + **branch scope, rows filtered by branch** |
| `GET /invoices/{id}/receipt` | read | Till; `SalesInvoiceService.getById` checks branch and ownership |
| `GET /invoices/{id}/reprint` | read, audits | `permissions.pos.receipt.reprint` + invoice branch |
| `GET /deliveries` | read | Till + **branch scope, rows filtered by branch** |
| `POST /deliveries/{id}/settle` | write | Till; the invoice is loaded through `getById` (branch checked) |
| `POST /deliveries/{id}/return` | write | Till + **delivery order's branch** (`PosDeliveryReturnService`, before anything is written) |

### Till lookups and product panels

| Method and route | Kind | Required |
|---|---|---|
| `GET /api/pos/resolve` | read (price, stock, cost) | **Till** |
| `GET /api/pos/credit-balance` | read (AR, credit, advances) | **Till; a customer outside the caller's scope reads as not found** |
| `GET /api/pos/batch-check` | read (sold invoices) | **Till; other branches' invoices left out** |
| `GET /api/pos/customer-history` | read | **Till; scoped query** (`findRecentByCustomerCodeScoped`) |
| `GET /api/products/favourites`, `/recently-sold`, `/top-sold` | read (full product aggregate) | **Till.** Only the till's product panels call them |
| `GET /api/products/list`, `/api/products/search` | read | `inventory.product` view (unchanged) |

### Invoice helpers shared by Retail and the till (`SalesInvoiceController`)

Each now requires view on at least one of the screens that call it (`ModulePermissionService.requireCanViewAny`). `sales.pos` is one option among several, not a blanket requirement.

| Route | Required | Data scope |
|---|---|---|
| `GET /api/sales/invoices/next-number` | **`sales.invoice` or `sales.pos`** | Read-only preview; nothing is reserved |
| `GET /api/sales/invoices/outstanding` | **`sales.invoice` or `sales.pos`** | **A customer outside the caller's scope reads as nothing owing.** For a visible customer the figure stays company-wide, because credit decisions are |
| `GET /api/sales/invoices/price-history/{itemCode}` | **`sales.invoice`, `sales.quotation`, `sales.delivery` or `sales.pos`** | Already limited to the caller's own branch by the service |

### Cash drawers (`/api/pos/cash-drawers`)

The backend never opens a drawer from this controller. The kick rides the receipt printer: `POST /api/pos/printers/{id}/print/escpos` for a network printer. The local print agent refuses every drawer pulse from 0.6.0 (`PRINT_AGENT_SECURITY.md`).

| Method and route | Kind | Required |
|---|---|---|
| `GET /`, `GET /{id}` | read | **Till or `pos.devices` view + branch scope** |
| `PUT /{id}/kick-result` | write (outcome log) | **Till + drawer's branch** |
| `POST /` | config | **`pos.devices` create + requested branch** |
| `PUT /{id}` | config | **`pos.devices` edit + drawer's branch + requested branch** |
| `DELETE /{id}` | config | **`pos.devices` delete + drawer's branch** |

### Printers (`/api/pos/printers`)

A printer's stored IP and port are where `print/escpos` opens a raw socket from the server, so writing them is administration.

| Method and route | Kind | Required |
|---|---|---|
| `POST /`, `PUT /{id}`, `DELETE /{id}` | config | **`pos.printers` create / edit / delete + branch**; network address must pass the printer network policy (below) |
| `GET /`, `GET /{id}`, `PUT /{id}/runtime` | read / status | Authentication + **branch scope** |
| `POST /{id}/print/escpos` | hardware | Authentication + **printer's branch**; the whole payload must pass the **command policy for the printer's type** (ESC/POS, or ZPL for a `LABEL_PRINTER`; 422 `PRINT_COMMAND_REJECTED` otherwise); a payload that opens the drawer also needs the **drawer rule** (below); the stored address must pass the network policy again. All checked before the socket is opened |

Reading and printing stay open to any signed-in user, because Retail invoice, return, barcode-label and employee-card printing use the same printers.

## Hardware control (third pass)

### How the till actually prints and opens the drawer

Traced 2026-10-10. This is what the rules below protect:

- **Network/IP printers** are reached only through `POST /api/pos/printers/{id}/print/escpos`. The server checks the request's bytes against the command policy for the stored printer's type — `EscPosCommandPolicy` for receipt and kitchen printers, `ZplCommandPolicy` for label printers (2026-10-11) — and only then opens a raw socket to the printer's stored IP and port. Till receipts, Retail invoices, returns, statements and ZPL labels (`labelPrinterTransport.js`, which also sends `format: "ZPL"`) all use it.
- **USB, Bluetooth and Windows-queue printers** are reached through the local print agent at `127.0.0.1:19777`. The backend is not involved. From agent 0.6.0 the agent checks Host, Origin and a pairing token itself, and refuses drawer, buzzer, power-off and printer-memory commands on `/print/escpos` and printer-configuration, network, storage and tilde commands on `/print/zpl` (`PRINT_AGENT_SECURITY.md`, "Every printer-output path").
- **Print jobs** (`/api/pos/print-jobs`) are bookkeeping that the browser writes around each print (`localPrintAgent.js`). Nothing reads the queue and prints from it: no agent polls it, and the timeout sweep only marks stuck jobs FAILED. A job's `payload` is the receipt text, so it is data to protect, but creating a job has no physical effect.
- **The drawer.** `useCashDrawer` only dispatches a `pos:open-cash-drawer` browser event, and nothing in the frontend or the print agent listens for it. No BillBull code emits a drawer pulse (`ESC p` or `DLE DC4 1`). Today a drawer opens only if the printer or its Windows driver is configured to kick on every print, or if someone sends the pulse bytes themselves. `HARDWARE_CHECKLIST.md` items 9 and 10 (drawer opens on a cash sale, manual kick) have no software path and will fail unless the printer is configured that way.

### The drawer rule (`PosDrawerKickAuthorizer`)

A print sent through the server that contains a drawer pulse needs **all three** of:

1. the till permission (`sales.pos` view);
2. the printer's branch within the caller's scope;
3. an **OPEN POS session owned by the caller in that branch** (`pos_sessions.owner_user_id`, taken from the JWT's user id).

A cashier ringing up sales meets all three, so a future drawer pulse at a cash sale, change, cash in/out or manual open is allowed. Belonging to the branch is not enough. Retail users who print invoices and labels to the same printer cannot open the drawer, and neither can a till user with no shift running. Administrators get no exemption; they open a session too. A refused pulse sends nothing to the printer, not even the rest of the receipt.

**Detection (`EscPosDrawerKick`).** The detector walks the ESC/POS command stream and skips each command's arguments and data block, so raster logos, QR codes and barcodes that happen to contain `1B 70` are not mistaken for a pulse. Inside data blocks it still looks for the strict real-time pulse (`DLE DC4 1`, m 0–1, t 1–8), because printers act on real-time commands even inside image data. On a command it does not model, it searches the rest of the stream, which can over-report but never under-report. Every command `escPosReceipt.js` emits is modelled, and ZPL contains no ESC, so legitimate prints never take that path. Since 2026-10-11 `EscPosCommandPolicy` also reports well-formed pulses and refuses unknown commands outright; the service asks for the drawer rule when either detector sees a pulse, and only for ESC/POS printers.

Prints without a pulse are unaffected.

### Printer network policy (`PrinterNetworkPolicy`)

The relay writes caller-supplied bytes to the stored address. Without a limit, a printer row was a way to make the server write arbitrary bytes to any host it could reach: its own database, a cache, a cloud metadata service, an internal admin port. It is now limited to:

| Allowed by default | Refused |
|---|---|
| 10/8, 172.16/12, 192.168/16, 100.64/10 (VPN overlays such as Tailscale), IPv6 fc00::/7 | Loopback (127/8, ::1, `localhost`), link-local (169.254/16, which includes cloud metadata, and fe80::/10), 0.0.0.0, multicast, broadcast, public addresses |
| Ports 9100–9109 (raw printing) | Every other port, for example 22, 80, 5432 and 6379 |

The policy is checked when a printer is saved (HTTP 400) and again on every print, against the address the host name resolves to at that moment. The socket then opens to exactly that resolved address, so a DNS answer cannot change between check and connect. Settings (no change to `application.properties` was made):

- `pos.printer.network.allowed-ports` (default `9100-9109`, comma-separated ports or ranges)
- `pos.printer.network.allow-loopback` (default `false`; set `true` only for a printer emulator in development)
- `pos.printer.network.allow-public` (default `false`)

**Effect on existing rows.** A printer saved before this check with a refused address stops printing (HTTP 400 naming the address) until an administrator corrects it. On testdb, printer 4 (`127.0.0.1:9100`, the local emulator) is refused. See check 4 below.

### Endpoint matrix

"Till" means `sales.pos` view. "Branch" means the stored record's branch, and any `branchId` the request names, must be within the caller's scope. A `branchId` omitted on a list returns only reachable branches. Every write is refused before the service is called.

| Controller | Read | Write |
|---|---|---|
| `/api/pos/counters` | Till or `pos.counters` view + branch | `pos.counters` create / edit (update, status) / delete + counter's branch. New counters go to the caller's own branch |
| `/api/pos/scanners` | Till or `pos.scanners` view + branch | `pos.scanners` create / edit / delete + scanner's branch + requested branch |
| `/api/pos/hardware-profiles` | `pos.hardwareprofiles` view + branch (global templates readable) | `pos.hardwareprofiles` create / edit / delete. Role slots and terminal binding are edit, and also need the device's and the terminal's branch. **A global template (no branch) can only be created, changed or removed by an all-branches administrator** |
| `/api/pos/devices` (registry) | `pos.devices` view + branch; list filtered by branch. `GET /code/{code}` and `POST /{id}/heartbeat`: till or `pos.devices` view + device's branch | `pos.devices` create / edit (update, status) / delete + device's branch + requested branch. **Was `hasAuthority('POS_SETTINGS')`, which no login carries, so these writes were refused for everyone** |
| `/api/pos/devices` (dashboard, events, health history) | `pos.devices` view + branch | `POST /{id}/health`: `pos.devices` edit + device's branch |
| `/api/pos/devices/discovery` | `pos.devices` view | Report: `pos.devices` create. Ignore: `pos.devices` edit. Candidates carry no branch, so no branch rule applies |
| `/api/pos/devices/dashboard/refresh-token` | Authentication (a bare version counter, no device data) | — |
| `/api/pos/print-jobs` | `GET /{id}`: job's branch. `GET` (queue): `pos.printers` view + branch, rows filtered | Create: printer's branch. Dispatch and result: job's branch, **and the job's own requester or `pos.printers` edit**. Retry: `pos.printers` edit + job's branch |

## Data scope (third pass)

| Controller | Rule |
|---|---|
| `/api/pos/held-sales` | Till (unchanged). **Scope is judged on the POS session the cart belongs to:** holding needs the session's branch, and the cart is stamped with the session's branch, not the client's `branchId`. Listing and recall check the stored cart's session; a refused recall leaves the cart held. Enforced in `PosHeldSaleService` |
| `/api/pos/layaways` | Till (unchanged); cancel and release keep `sales` delete. **Every read and change goes through `getById`, which checks the layaway's branch** (get, payments, cancel, convert, payment, release). A `posSessionId` named for cash must be in a reachable branch. Create checks the requested branch and session before a number is taken or stock reserved. Search: `branchId` checked, rows filtered. Enforced in `PosLayawayService` |
| `/api/pos/cash-movements` | `permissions.pos.cashmovement.*` (unchanged). **Plus branch:** the stored movement's branch for get, edit and void; the named session's branch for create and list; `branchId` checked. The list applies the caller's scope **inside the query**, so pagination stays exact. `viewall` widens across sessions, not across branches. Eligible sessions are filtered |
| `/api/pos/settings` | Read: **till or `pos.settings` view**, and `GET /branch/{id}` needs that branch. Save: **`pos.settings` edit + the target branch**; supervisor and voucher-expiry fields keep the supervisor role check in `PosSettingsService.save`. `verify-pin` and `supervisor-auth`: **till** (only the till calls them) |

Administrators (all-branches JWT) keep cross-branch access to all of the above.

### Unchanged in the third pass

| Controller | Current rule |
|---|---|
| `/api/pos/reports` | `permissions.pos.reports.*`, own branch unless `viewall` |
| `/api/pos/admin/**` | `pos.admin.*`; approvals never inherited |
| `/api/pos/terminals` | `permissions.pos.terminal.*` / `pos.terminals`. `register` and `heartbeat` are deliberately open to any signed-in user (documented in the controller) |
| `/api/pos/denominations` | Authentication (reference data) |

## Product cost (third pass)

### Where cost leaves the server

| Response | Cost fields | Gate before | Who needs cost there |
|---|---|---|---|
| `GET /api/products`, `/{id}`, `/by-barcode` (`ProductAggregateResponse`) | `pricing.cost`, `landingCost`, `costMethod`; `effectivePricing.*`; `branchPrices[].cost`; `activeBranchPrice.cost` | **Authentication only** | Product master, stock taking, GRN, LPO. Also called by Customer and Follow-ups (CRM) and the dashboard, which do not use cost |
| `GET /api/products/list`, `/search`, `/validate-duplicate` | Same aggregate | `inventory.product` view | Product master, product pickers on sales and purchase documents |
| `GET /api/pos/resolve`, `/api/products/favourites`, `/recently-sold`, `/top-sold` | Same aggregate | Till | The till: cost is its selling-price floor when no `minPrice` is set (`getPriceFloor`) |
| Sales invoice, quotation, proforma and delivery lines (`items[].cost`) | Line cost | The document's own permission | Margin/GP columns on those screens |

### What changed (`ProductCostMasking`)

Cost stays visible to anyone who can view a screen that shows or edits it: `inventory.product`, `inventory.stock`, `inventory.reports`, `purchases.lpo`, `purchases.grn` or `purchases.invoice`. Everyone else gets responses without the cost fields:

- **`/api/products`, `/{id}`, `/by-barcode`** drop `cost`, `landingCost` and `costMethod` everywhere in the aggregate.
- **Till reads** (resolve and the three panels) drop `landingCost` and `costMethod`. They keep a pricing row's `cost` only where it **is** the price floor, meaning no positive `minPrice` is set. The till's warning therefore fires at exactly the same price as before, and the backend applies the same floor at checkout (`PosCheckoutController`).

Masking runs on a JSON copy, never on the entities, so it cannot be flushed back to the database. Verified on the serialized response, over MockMvc and against a real backend.

### Not changed, and why

- **Cashiers still see cost.** The till requires `inventory.product` view, because its catalogue loads through `/api/products/list`, and that key also governs cost. On testdb CASHIER (2 users), SALES, SUPERVISOR, MANAGER and STOREKEEPER all read cost (check 6). The existing model cannot express "see products but not cost". Separating them needs a new key (for example `inventory.product.cost`) that every costing screen checks, granted to costing roles before rollout. That is a policy decision, so it is not made here.
- **`/list`, `/search` and sales-document lines are untouched.** Retail quotations, proformas, delivery notes and invoices read `product.cost` for their GP columns and **send line `cost` back**, which the backend stores (for example `DeliveryNoteService` `item.setCost(i.cost)`). Masking cost for those callers would save lines at cost 0 and corrupt COGS and margin reports. The safe order is: derive line cost server-side, as POS checkout already does, then mask.

### Controls that stay supervisor-only

Till access grants none of these:

| Control | Enforced by |
|---|---|
| Price below minimum | `pos_price_override` edit (ADMIN and BRANCH_ADMIN always pass), or verified supervisor credentials on the request |
| Sale on a closed Business Day | Verified supervisor credentials on the request |
| Business Day close | A supervisor role (`ADMIN`, `BRANCH_ADMIN`, `MANAGER`, `SUPERVISOR`) when `requireSupervisorForDayClose` is on; till access and branch scope always |
| Session close, variance, cancel-closure | Single-use grants from `authorize-closure` / `authorize-variance` |
| Layaway cancel, release reservation | `sales` delete inside `PosLayawayService` |
| Correction approval | `pos.admin.approvals` approve, never inherited |
| Terminal lifecycle | `permissions.pos.terminal.*` |
| Reprint | `permissions.pos.receipt.reprint` |
| Supervisor configuration | `pos.settings` edit, plus a supervisor role in `PosSettingsService.save` |
| Cash drawer pulse through the server | Till + printer's branch + the caller's own open session there (`PosDrawerKickAuthorizer`) |

## Role matrix

"Nav" is what the UI shows or admits. "API" is what the backend accepts when called directly. After both passes:

| Role | `/pos/` and `/sales/pos` | Till APIs | Till cash in/out | Drawer / printer setup | Back-office invoice create/edit |
|---|---|---|---|---|---|
| Till cashier (`sales.pos` + `sales.invoice` view) | yes | yes | yes, own branch | no | no |
| Invoice clerk (`sales.invoice`, no till) | no | no (403) | no | no | yes |
| Seeded SALES | yes | yes | yes (seeded grant) | no | yes |
| Seeded SUPERVISOR | yes | yes | yes | no (seeded `pos` is view only) | per flags |
| Seeded MANAGER | yes | yes | yes | edit and remove; not add (seeded `pos` has no create) | per flags |
| ADMIN, BRANCH_ADMIN | yes | yes, BRANCH_ADMIN within its branches | yes | yes | yes |
| No sales access (HR, INVENTORY_MANAGER, STOREKEEPER) | no | no (403) | no | no | no |

Before the first pass, every till API checked only authentication. Before the second, sessions, day close (with the supervisor setting off), cash drawer and printer configuration, POS search and the three invoice helpers did too, and invoice lookups did not check branch. Before the third, counters, scanners, hardware profiles, the device dashboard, print jobs and POS settings saves checked only authentication. Held sales, layaways, cash movements and settings did not check branch, and any signed-in user of a branch could send a drawer pulse to its network printer.

Third-pass additions, from seeded grants on testdb (2026-10-10):

| Role | Counter / scanner setup | POS settings save | Drawer pulse via server | Product cost on open reads |
|---|---|---|---|---|
| CASHIER (2 users) | no | **no (was yes)** | own branch, on shift | yes (holds `inventory.product`) |
| SUPERVISOR (1 user) | no | **no (was yes)** | own branch, on shift | yes |
| MANAGER (1 user) | edit and remove; not add | yes | own branch, on shift | yes |
| ADMIN, BRANCH_ADMIN | yes | yes | on shift; BRANCH_ADMIN within its branches | yes |
| Retail-only roles (invoice clerk, CRM, HR) | no | no | **no** | **no** |

## View or create for the till

**Evidence.**

- The route guards (`RequirePosAccess` in `apps/pos`, the `/sales/pos` route in `App.jsx`) and the backend till check all test `sales.pos` **view**.
- `ModuleCatalog` describes `sales.pos` as where "day-to-day cashiering stays". `RolePermissionInitializer` says for SALES that "`sales.pos` already covers day-to-day checkout".
- The same initializer gives CASHIER_SALESPERSON `sales` create "since that designation does ring up sales", and keeps SALESPERSON at view "not to hand anyone new authority". That comment treats create as the flag for ringing up sales.
- Seeded SALESPERSON, DELIVERY_PERSON, ACCOUNTANT, MANAGER and SUPERVISOR hold `sales` view without create. On testdb (2026-10-09) the roles with users that resolve `sales.pos` view but not create are MANAGER (1 user) and SUPERVISOR (1 user); CASHIER (2 users), SALES, ADMIN and BRANCH_ADMIN resolve create.

**Conclusion.** The code is inconsistent: the guards admit on view, while one seeding comment implies create. Requiring `sales.pos` create on the transaction endpoints (checkout, layaway create and payment, delivery settle and return, held sales) would stop the MANAGER and SUPERVISOR users on testdb from selling unless an administrator grants create first. That is a policy decision, so it is **not changed**.

**Recommendation.** Decide per tenant. If create is adopted, change only `PosTillPermission` call sites on transaction endpoints to `requireCanCreate`, ship it with a pre-rollout query listing roles with till view but not create, and grant create to the roles that should sell before deploying.

## Before rollout

No schema or data change. Run these **read-only** checks on each tenant before deploying the backend. The checks are per role; a user with several roles is allowed if any role allows, so they can only over-report.

**1. Till access (first pass).** Roles that could reach `/sales/pos` through `sales.invoice` but lack `sales.pos`, and will now be refused at both the route and the API:

```sql
SELECT r.name
FROM roles r
LEFT JOIN role_permissions par ON par.role_id = r.id AND lower(par.module) = 'sales'
LEFT JOIN role_permissions pos ON pos.role_id = r.id AND lower(pos.module) = 'sales.pos'
LEFT JOIN role_permissions inv ON inv.role_id = r.id AND lower(inv.module) = 'sales.invoice'
WHERE COALESCE(inv.can_view, par.can_view, false)
  AND NOT COALESCE(pos.can_view, par.can_view, false);
```

**2. Device setup at the till (hardening pass).** Adding, changing or removing a cash drawer or printer now needs `pos.devices` / `pos.printers` create, edit or delete. On testdb only ADMIN and BRANCH_ADMIN hold all three; MANAGER can edit and remove but not add. The till console still shows the device buttons to everyone and reports the refusal. To list who can do what:

```sql
SELECT r.name,
       COALESCE(dev.can_create, p.can_create, false) AS drawer_add,
       COALESCE(dev.can_edit,   p.can_edit,   false) AS drawer_edit,
       COALESCE(dev.can_delete, p.can_delete, false) AS drawer_remove,
       COALESCE(prn.can_create, p.can_create, false) AS printer_add,
       COALESCE(prn.can_edit,   p.can_edit,   false) AS printer_edit,
       COALESCE(prn.can_delete, p.can_delete, false) AS printer_remove
FROM roles r
LEFT JOIN role_permissions p   ON p.role_id = r.id AND lower(p.module) = 'pos'
LEFT JOIN role_permissions dev ON dev.role_id = r.id AND lower(dev.module) = 'pos.devices'
LEFT JOIN role_permissions prn ON prn.role_id = r.id AND lower(prn.module) = 'pos.printers'
ORDER BY r.name;
```

A till-only role can be built in Roles & Permissions with "POS Sales" view (+create), "Sales Invoices" view and "Products / Services" view, with no `sales` parent row.

**3. POS settings, counters and scanners (third pass).** Saving POS settings (Console layout, print templates, behaviour, the cash-movement category toggle) now needs `pos.settings` edit; counters and scanners need `pos.counters` / `pos.scanners`. On testdb only ADMIN, BRANCH_ADMIN and MANAGER can save settings. **SUPERVISOR (1 user) and CASHIER (2 users) lose it**, including SUPERVISOR's ability to change the supervisor fields. MANAGER can edit and remove counters and scanners but not add them. Grant `pos.settings` edit to supervisors before rollout if they should keep configuring the till.

```sql
SELECT r.name,
       (SELECT count(*) FROM user_roles ur WHERE ur.role_id = r.id) AS users,
       COALESCE(st.can_edit,   p.can_edit,   false) AS settings_save,
       COALESCE(ct.can_create, p.can_create, false) AS counter_add,
       COALESCE(ct.can_edit,   p.can_edit,   false) AS counter_edit,
       COALESCE(ct.can_delete, p.can_delete, false) AS counter_remove,
       COALESCE(sc.can_create, p.can_create, false) AS scanner_add,
       COALESCE(sc.can_edit,   p.can_edit,   false) AS scanner_edit
FROM roles r
LEFT JOIN role_permissions p  ON p.role_id = r.id  AND lower(p.module)  = 'pos'
LEFT JOIN role_permissions st ON st.role_id = r.id AND lower(st.module) = 'pos.settings'
LEFT JOIN role_permissions ct ON ct.role_id = r.id AND lower(ct.module) = 'pos.counters'
LEFT JOIN role_permissions sc ON sc.role_id = r.id AND lower(sc.module) = 'pos.scanners'
ORDER BY r.name;
```

**4. Network printers the server will refuse.** This approximates the policy for IPv4 literals; a host name is resolved at save and print time, so check those by hand. On testdb it returns printer 4 (`127.0.0.1:9100`).

```sql
SELECT id, branch_id, device_code, ip_address, port_number
FROM pos_printers
WHERE is_active AND connection_type = 'NETWORK_IP'
  AND (port_number NOT BETWEEN 9100 AND 9109
       OR NOT (ip_address ~ '^10\.' OR ip_address ~ '^192\.168\.'
               OR ip_address ~ '^172\.(1[6-9]|2[0-9]|3[01])\.'
               OR ip_address ~ '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.'
               OR lower(ip_address) ~ '^f[cd]'));
```

**5. Open sessions without an owner id.** The drawer rule finds the caller's session by `owner_user_id`. A session opened before that column was stamped has none, so its cashier cannot pulse a drawer through the server until the session is closed and reopened. On testdb: 1.

```sql
SELECT count(*) FROM pos_sessions WHERE status = 'OPEN' AND owner_user_id IS NULL;
```

**6. Who reads product cost.** Roles that keep cost on the open product reads. On testdb: everyone except CASHIER_SALESPERSON, DELIVERY_PERSON, HR and SALESPERSON.

```sql
SELECT r.name, (SELECT count(*) FROM user_roles ur WHERE ur.role_id = r.id) AS users,
       bool_or(COALESCE(x.can_view, par.can_view, false)) AS sees_cost
FROM roles r
CROSS JOIN (VALUES ('inventory.product','inventory'), ('inventory.stock','inventory'), ('inventory.reports','inventory'),
                   ('purchases.lpo','purchases'), ('purchases.grn','purchases'), ('purchases.invoice','purchases')) k(module, parent)
LEFT JOIN role_permissions x   ON x.role_id = r.id   AND lower(x.module) = k.module
LEFT JOIN role_permissions par ON par.role_id = r.id AND lower(par.module) = k.parent
GROUP BY r.id, r.name ORDER BY r.name;
```

## Why there is no `pos.till.operate`

`sales.pos` is already a dedicated till key. Nothing else uses it apart from the sidebar link, and `ModuleCatalog` documents it as the cashiering key. The defect was not missing vocabulary: the backend never checked the key. A new permission would not remove the `sales.invoice` dependency either, because the till reads invoices through the back-office invoice API.

## Open questions (not changed here)

- **View or create** for transactions. See above.
- **Broad parent grants.** Any role with `sales` view, including ACCOUNTANT and DELIVERY_PERSON, can operate the till. This comes from role configuration, not code.
- **`sales.invoice` view exposes back-office screens** to a till-only cashier, in view mode. Removing it means serving the till's invoice reads from `/api/pos/...`.
- **Cash in/out at the till and `permissions.pos.cashmovement.create`.** The back-office route requires that key; the till's route (`POST /api/pos/sessions/{id}/cash-movement`), which calls the same service method, requires only till access and the session's branch. Enforcing the key there was tried and backed out: Roles & Permissions has no switch for any `permissions.pos.cashmovement.*` key (nor for `receipt.reprint` or `reports.*`), so they exist only as seeded rows. On testdb the CASHIER role (2 users) has till access but no such row, and would have lost cash in/out with no way for an administrator to restore it. To close the gap: add the cash-movement switches to Roles & Permissions, grant them to every till role that handles cash, then add `requireCanView("permissions.pos.cashmovement.create")` to that route. This query lists the till roles that would need the grant:

  ```sql
  SELECT r.name, (SELECT count(*) FROM user_roles ur WHERE ur.role_id = r.id) AS users
  FROM roles r
  LEFT JOIN role_permissions par  ON par.role_id = r.id AND lower(par.module) = 'sales'
  LEFT JOIN role_permissions pos  ON pos.role_id = r.id AND lower(pos.module) = 'sales.pos'
  LEFT JOIN role_permissions cm   ON cm.role_id = r.id AND lower(cm.module) = 'permissions.pos.cashmovement.create'
  LEFT JOIN role_permissions perm ON perm.role_id = r.id AND lower(perm.module) = 'permissions'
  WHERE COALESCE(pos.can_view, par.can_view, false)
    AND NOT COALESCE(cm.can_view, perm.can_view, false);
  ```

  On testdb (2026-10-09) it returns ACCOUNTANT, CASHIER (2 users), CASHIER_SALESPERSON, DELIVERY_PERSON and SALESPERSON.
- **Closed by the third pass:** branch gaps on held sales, layaways, cash movements and settings; authentication-only device administration (counters, scanners, hardware profiles, dashboard, discovery, health, print jobs) and the unreachable `POS_SETTINGS` writes; drawer pulses through a network printer; server writes to arbitrary hosts; and cost on the open product reads for roles with no costing screen. See the sections above.
- **The print agent trusted any web page — fixed in agent 0.6.0, not yet rolled out.** Up to 0.5.3, `tools/pos-print-agent` answered `Access-Control-Allow-Origin: *` on `127.0.0.1:19777`, so any page open on the till could print, send a drawer pulse, or write bytes to any LAN `host:port`, without the backend. 0.6.0 adds an exact origin allow-list, Host pinning, pairing tokens, an ESC/POS command allow-list (no drawer pulse from any caller) and the same LAN policy as the backend. Tills stay exposed until each one runs 0.6.0. See `PRINT_AGENT_SECURITY.md` for the trust model and rollout.
- **Cashiers see cost.** See "Product cost: not changed". It needs a dedicated cost key and server-side line cost.
- **Sales document lines trust the client's `cost`.** `DeliveryNoteService` and the Retail invoice/quotation flows store the line cost the browser sends. Any user who may create those documents can record a false cost, which skews margin and COGS reports. POS checkout already derives cost server-side.
- **Closed 2026-10-11 (not deployed): other physical commands on the backend relay.** The relay used to gate only the drawer pulse, so a user of the printer's branch could sound a buzzer, power the printer off (`DLE DC4 2`), rewrite its memory switches (`GS ( E`), or send any ZPL (`^JUF` factory reset, `~JR` restart, `^NS` network change) to a network label printer. It now applies the same ESC/POS allow-list as the agent and a ZPL allow-list for label printers, chosen from the stored printer type; feed and cut stay allowed. Remaining gap: the backend trusts the stored `deviceType`, so a Zebra registered as a receipt printer gets the ESC/POS policy (which refuses ZPL in text but not inside raster image data). See `PRINT_AGENT_SECURITY.md`, "Known limitations".
- **Print-job payloads are readable within the branch.** Any signed-in user of the branch can read a job by id, and its receipt text. Claiming and reporting are limited to the requester.
- **Discovery candidates have no branch.** Any `pos.devices` viewer in any branch sees every agent's discovered device identifiers. They can be scoped once the agent reports its terminal.
- **Till console UI.** It still shows device add and remove, counter and scanner setup and settings save to every user. The backend refuses them; hiding the controls for users without the matching `pos.*` key is a follow-up.
- **Supervisor takeover without a PIN.** When a branch has no supervisor PIN set, any till user of that branch can take over another cashier's session.
