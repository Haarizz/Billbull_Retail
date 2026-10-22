# Standalone POS — one-tenant pilot and rollback

**Status: NOT STARTED.** The pilot is a human, evidence-based gate. It can't be run or declared complete from the repository.

## Entry criteria (all required)

- [ ] `HARDWARE_CHECKLIST.md` signed off on every till model in the pilot tenant.
- [ ] `QA_PARITY.md`: the full 30-transaction script passed in Classic, Compact and Cart Focus, with no unexplained differences.
- [ ] `/pos/` deployed to the pilot tenant only (`DEPLOYMENT.md`), with production rollout authorized.
- [ ] Every pilot till has a working `/sales/pos` bookmark as well as `/pos/`.
- [ ] The pre-rollout role checks in `PERMISSIONS.md` have been run on the pilot tenant, and every role they returned has been resolved.
- [ ] Every network printer on the pilot tenant has a private-LAN address on port 9100–9109 (`PERMISSIONS.md` check 4). Otherwise the server refuses to print to it.
- [ ] Supervisors who configure the till have `pos.settings` edit (check 3), and the drawer behaviour expected at checkout is set on the printer or its driver: no BillBull code sends a drawer pulse (`PERMISSIONS.md`, "How the till actually prints").
- [ ] A named owner for daily reconciliation, and a named person who can order an immediate rollback.

## Running the pilot (one volunteer tenant, one full trading week)

1. Day 0: switch the pilot tills' bookmarks/shortcuts to `https://<tenant-host>/pos/`. Keep a visible `/sales/pos` shortcut on every till.
2. Every day, for at least seven consecutive trading days:
   - Each till closes its session (X-Report + Close Session). Run the Z-Report.
   - Fill in the reconciliation sheet below.
   - Check for failed or stuck print jobs:
     `select status, count(*) from pos_print_jobs where created_at::date = current_date group by 1;`
     Look for `FAILED`, and for `DISPATCHED` rows older than `pos.printjob.dispatch-timeout-minutes`.
   - Check terminal registration and health in Enterprise → POS Administration. Look for new or duplicate terminals for the pilot tills, `PENDING` approvals, or offline flags.
   - Collect cashier feedback on scanner, keyboard, lock and sign-out behaviour.
3. Investigate every unexplained variance or difference the same day.

## Daily reconciliation sheet

| Date | Till / terminal | Z-Report no. | Sales count | Gross sales | VAT | Cash expected | Cash counted | Variance | Card settled | Returns | Print failures | Registration issues | Unexplained? (Y/N) | Initials |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | | |
| | | | | | | | | | | | | | | |

For each day, also compare the Z-Report totals with the GL (sales, VAT, cash and card accounts) and with stock movements for the day, the same way you would for a normal `/sales/pos` day.

## Exit criteria

- Seven or more consecutive trading days with no unexplained financial, stock, GL, customer-balance, session or print difference.
- No till reverted to `/sales/pos` for a `/pos/`-specific reason during the last three days.
- Sign-off by the tenant and by BillBull.

Only then plan the next tenant. Decommissioning `/sales/pos` is a separate, later decision (see below).

## Rollback (immediate, no backend or database change)

Roll back at once if any unexplained financial or operational divergence appears.

1. **Tills:** open `https://<tenant-host>/sales/pos` (the existing bookmark). The same origin means the same device fingerprint and terminal. An open POS session can be continued or closed there. Nothing needs migrating.
2. **Tenant (if needed):** remove the four `/pos` location blocks from the vhost, then `nginx -t && systemctl reload nginx`.
3. Record what happened, keep the logs (browser console / client-logs, backend logs, `pos_print_jobs`) and investigate before retrying.

Both apps use the same API and database, so nothing in the data needs reverting. The backend till check (`PERMISSIONS.md`) applies to `/sales/pos` and `/pos/` alike, so rolling back to `/sales/pos` does not require reverting it.

## Decommissioning `/sales/pos` — separate, gated, not part of this work

Do **not** delete or disable `/sales/pos`, `POSSales.jsx`, `pages/Sales/POS/**`, `posFirstMode`, or the legacy landing overrides as part of the initial standalone rollout. Open a separate issue with:

- [ ] every intended tenant migrated, with its pilot signed off;
- [ ] a list of what would be removed: the `/sales/pos` route and sidebar link, Retail-only references, and possibly moving POS-only modules out of `packages/shared` into `apps/pos` once Retail no longer imports them;
- [ ] its own build/test run and rollback plan (restore the route from git);
- [ ] explicit authorization.

Renaming `billbull-frontend/src` to `apps/retail` is optional, separate cleanup, and must not be bundled with any of the above.
