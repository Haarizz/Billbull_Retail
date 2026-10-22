# Standalone POS — development

Everything runs from `billbull-frontend/`. One `npm install` there installs and links both workspaces (`@billbull/shared`, `@billbull/pos`). There is still one `node_modules` and one `package-lock.json`.

```bash
cd billbull-frontend
npm install
```

## Commands

| What | Retail (unchanged) | Standalone POS |
|---|---|---|
| Dev server | `npm run dev` → http://localhost:5173 | `npm run dev:pos` → http://localhost:5174/pos/ |
| Production build | `npm run build` → `dist/` | `npm run build:pos` → `apps/pos/dist/` |
| Preview a build | `npm run preview` | `npm run preview:pos` → http://localhost:5174/pos/ |
| Tests (both apps + shared) | `npm test` | (same command) |
| Lint | `npm run lint` | (same command) |
| Workspace boundary check | `npm run check:boundaries` | (same) |
| Regenerate shared export map | `npm run shared:exports` | (same) |

The two builds write to different folders and never overwrite each other. `npm run build` is unchanged in meaning, so the existing tenant update commands keep working.

### How the POS dev server reaches the backend

Both apps read the same env files (`billbull-frontend/.env.development` and `.env.production`), so flags such as `VITE_USE_NEW_POS_PRINT_TEMPLATE` match.

In dev, the POS server sets `VITE_API_BASE_URL=http://localhost:5174` for itself and proxies `/api` and `/uploads` to the backend. The browser therefore stays same-origin, as it is in production, and the backend needs no CORS entry for port 5174.

- Backend somewhere other than `http://localhost:8080`: `BILLBULL_DEV_BACKEND=http://localhost:8081 npm run dev:pos`.
- To bypass the proxy, set `VITE_API_BASE_URL` in the shell yourself. The backend must then allow the origin.

Retail's dev server is unchanged. It calls `http://localhost:8080` directly, which CORS already allows for 5173.

### Working on shared code

- Code both apps use lives in `packages/shared/src/`, which mirrors the old `src/` layout. Inside the package, import relatively.
- From Retail (`src/`) or the POS app (`apps/pos/src/`), import `@billbull/shared/<path-without-extension>`, for example `@billbull/shared/utils/vatMath`.
- After adding a new shared import, run `npm run shared:exports`. The boundary test fails if the export map and the imports disagree.
- Move a module into shared only when both apps really use it. Retail-only code stays in `src/`.
- Tailwind classes in shared files are picked up by both apps: `packages/shared/src/index.css` declares `@source "."`.

### Tests

- New shell tests: `apps/pos/src/__tests__/` (access rules, gates, session lock and key guard, routes, error boundary, build config).
- Boundary and export-map tests: `scripts/__tests__/workspaceBoundaries.test.js`.
- The POS characterization suites moved with their code to `packages/shared/src/**/__tests__/`. Paths relative to `src/` are unchanged, so the failure identities in `packages/shared/src/pages/Sales/POS/__tests__/known-baseline-failures-after-useCheckout-harness-repair.txt` still read the same.
- Search suites flake under full parallel load on slower machines. Rerun `npx vitest run src/components/search --no-file-parallelism` before trusting a timeout there.

### Runtime parity harness

See `tools/pos-parity/README.md` and `QA_PARITY.md`. It builds both apps, serves them same-origin in front of a backend on a disposable database, and drives sale / return / close through both the embedded route and `/pos/`.
