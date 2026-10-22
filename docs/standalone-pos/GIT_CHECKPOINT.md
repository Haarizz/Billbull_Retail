# Standalone POS — git checkpoint record

## Starting point (2026-10-09)

| | |
|---|---|
| Starting branch | `feature/loqfix` |
| Starting HEAD | `d3a4dbd87161c60ae4d3229741d8479a92989b16` (`feat(pos): inline Alter Item panel, tap-to-alter cart rows, invoice preview items`) |
| Staged changes | none |
| Tracked, uncommitted | `billbull-backend/src/main/resources/application.properties` (+3 lines) |
| Untracked | `STANDALONE_POS_AUTONOMOUS_EXECUTION_PLAN.md` (the execution brief) |

### Classification of the starting changes

| Path | Class | Action |
|---|---|---|
| `billbull-backend/src/main/resources/application.properties` | Environment/client-local configuration **containing a credential**: a local datasource URL, username and password. `CLAUDE.md` says this file's dev datasource must be overridden locally and not committed. | **Not committed.** Left exactly as it was in the working tree. It carried over unchanged, uncommitted, to the new branch. Its value is not reproduced here. |
| `STANDALONE_POS_AUTONOMOUS_EXECUTION_PLAN.md` | The user's task brief (input document, not source). | Left untracked and untouched. |

There was no other work in the tree, so **no checkpoint commit was needed on `feature/loqfix`**: everything committable there was already committed at `d3a4dbd8`. No commit was amended, nothing was reset, stashed, cleaned or force-pushed, and nothing was pushed.

## Standalone branch

| | |
|---|---|
| Branch | `feat/standalone-pos` (the name was free; the old `feature/posclient` was not reused) |
| Base | `d3a4dbd87161c60ae4d3229741d8479a92989b16`, the verified starting HEAD above |
| Remote | local only, not pushed |

### Commits on `feat/standalone-pos`

| Commit | Summary |
|---|---|
| `23a1a3a5` | refactor(print): move pick list default settings out of the designer page |
| `e07ebf08` | build(frontend): move the POS import closure into a @billbull/shared workspace (358 pure renames) |
| `e69819fb` | feat(shared): host hooks the standalone POS needs, Retail behaviour unchanged |
| `9d8ed454` | feat(pos): standalone POS app at /pos/ (apps/pos) |
| `142988d5` | fix(pos): latch shell gates during render; POS boundary zone covers its config |
| (the commit adding this file) | docs + parity harness: `docs/standalone-pos/`, `tools/pos-parity/`, update-guide step, CLAUDE.md |

## Baseline before any edit

Taken on the untouched starting tree (`d3a4dbd8`), from `billbull-frontend`:

| Check | Command | Result |
|---|---|---|
| Frontend suite | `npx vitest run --reporter=json` | 1,066 suites · **6,289 tests · 6,280 passed · 9 failed** |
| Retail build | `npm run build` | passed (1m06s); CSS `index-DLinV_mS.css` 274.09 kB; JS `index-*.js` 7,876.56 kB |
| Lint | `npx eslint .` | 87 errors · 4,582 warnings (all pre-existing) |

The exact pre-existing failure set had **9** entries. The recorded "historical" baseline file lists 3 (`useDelivery`). The other 6 (`useProductEntry` / Item Entry dialog) also fail on clean HEAD. They predate this work and were confirmed on a clean-HEAD worktree on 2026-10-07. The authoritative baseline file was not edited.

```
pages/Sales/__tests__/useDelivery.characterization.test.js > initial state starts with an empty roster, list and validation state
pages/Sales/__tests__/useDelivery.characterization.test.js > settle modal open does nothing when the modal closes
pages/Sales/__tests__/useDelivery.characterization.test.js > settle modal open resets the filters, selection and payment lines, then loads
pages/Sales/__tests__/useProductEntry.characterization.test.js > handleProductSelection — the single Product Entry Mode decision OPEN_ENTRY_DIALOG adds nothing, opens the dialog and returns the deferred contract
pages/Sales/__tests__/useProductEntry.characterization.test.js > handleProductSelection — the single Product Entry Mode decision OPEN_ENTRY_DIALOG locks quantity at 1 for any controlled unit — scanned batch, scanned serial, or a flagged product
pages/Sales/__tests__/useProductEntry.characterization.test.js > handleUnifiedEntry — the in-memory cache fast path the OPEN_ENTRY_DIALOG deferral suppresses the banner and the toast
pages/Sales/__tests__/useProductEntry.characterization.test.js > the Item Entry dialog confirm hands off to the supervisor gate instead of stacking dialogs, closing itself without a toast
pages/Sales/__tests__/useProductEntry.characterization.test.js > the Item Entry dialog confirm re-attaches the scan-pinned unit and adds the confirmed line at the exact confirmed quantity
pages/Sales/__tests__/useProductEntry.characterization.test.js > the Item Entry dialog confirm refuses a payload with no product and surfaces it through the feedback toaster, keeping the dialog open
```

These identities are relative to the source root. After the move they live under `packages/shared/src/` with the same relative paths.

## Files intentionally left local

- `billbull-backend/src/main/resources/application.properties`: local datasource override with a credential. Never staged.
- `STANDALONE_POS_AUTONOMOUS_EXECUTION_PLAN.md`: the brief.

Both are still in the working tree exactly as found.
