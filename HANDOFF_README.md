# Current frontend/backend handoff

This is the 4 October 2026 release after the Results comparison and Scenario Summary updates. The source was copied from the verified `work/farm-forward-current-review/farm-forward` working application. Earlier simulator ZIPs, prototypes, old handoff documents and generated build output were not used as replacement source.

## Installation and operation

Use Node.js 22.14 or newer and npm. The release was checked with Node 24.18.0 / npm 11.16.0; `.nvmrc` retains the original supported 22.14.0 pin.

```sh
npm ci
npm run build
npm run typecheck
npm test
node scripts/verify-demo.mjs
node scripts/verify-handoff.mjs
npm run dev
```

Browse to http://127.0.0.1:4174/. Build before starting the server; restart it after rebuilding. The preview uses the compiled `dist/server/index.js`. Source-only edits are not live-reloaded.

For a different local port in PowerShell:

```powershell
$env:PORT = '4184'
npm run dev
```

On macOS/Linux: `PORT=4184 npm run dev`. `.env` is optional and is not loaded automatically; instructions are in `.env.example`.

## One application, one server

| Path | Purpose |
|---|---|
| `src/frontend/public/` | Setup/HTML routes, locally served models/fonts and attribution |
| `src/frontend/pages/` | Simulation and Results controllers/styles |
| `src/frontend/scene/` | TypeScript/Three.js scene, visual water/roots/crop behaviour and asset recipes |
| `src/frontend/state/` | Farm/session state and the master simulation clock |
| `src/frontend/components/results/` | Real backend metric presentation, shared comparison set and deterministic scenario insights |
| `src/backend/worker.js` | Same-origin API and static asset server |
| `src/backend/data/` | Official snapshot, geometry, provenance and raw CSV/terms |
| `src/backend/simulation/` | Existing 84-day numerical model |
| `src/backend/results/` | Versioned yield/economics assumptions and authoritative Results calculations |
| `src/shared/` | Input/output validation and shared contracts |
| `tests/` | Current 91-test suite |
| `scripts/` | Build, preview, verification and optional data import/calibration tools |

The backend exposes `POST /api/cdi/baseline`, `POST /api/simulation/project` and `POST /api/results`. Completed-run descriptors are reproduced and checked server-side before Results are returned. Stale or incompatible saved runs require a new simulation; no mock metric fallback is used.

The retained `src/frontend/mock/simulation-data.js` supplies current strategy descriptions and initial empty presentation state only; it remains imported by the simulation controller. Its filename does not mean simulation calculations are mocked. The unused old `mock/results-data.js` is excluded from this release. `src/backend/simulation/context.js` remains because a current baseline-contract test imports it; the production Worker uses `project-scenario.js`.

## Included assets and data

All five GLBs, both imported asset recipes, three WOFF2 fonts and their licences, paddock image, soil icon, official parish repository, source CSVs and attribution terms are included. No asset is loaded from an external prototype folder. See `docs/ASSETS.md` and `docs/CDI_DATA.md`.

The bundled CDI snapshot is dated 31 August 2026 and contains 7,377 parishes. It is not a live feed. New location search uses Photon/OSM over the internet. The optional original 77 MiB GIS ZIP is not required at runtime: processed geometry is already included and re-import instructions are documented.

## Source integrity

`docs/SOURCE_AUDIT.json` records byte-for-byte comparison against the latest working application's executable source, tests, scripts, assets and data. Existing runtime equations and UI implementation are unchanged for this packaging pass. Documentation is refreshed separately.

`HANDOFF_FILES.sha256` covers every deliverable file except itself. `node scripts/verify-handoff.mjs` detects missing, altered or unexpected deliverable files. After intentional maintenance, regenerate it with `node scripts/verify-handoff.mjs --write` and rerun verification.

## What to commit/push

Commit this repository's files, including `src/`, `tests/`, `scripts/`, `docs/`, `.github/`, `.openai/hosting.json`, the lockfile, configuration and integrity manifest. Git ignores dependency installations, build output, caches, real environment files and temporary logs. No credentials are required or included.

Do not copy older workspace folders or handoff ZIPs into this repository. For future edits, make changes in this repository and rerun the checks instead of combining application trees.

## Current boundaries

The Results backend, comparison selection, dynamic chart/table and deterministic insights are implemented. There is no external LLM endpoint configured; optional wording support is bounded and falls back to deterministic text. The website does not need an AI key for the video. The scientific model remains explicitly educational/provisional.
