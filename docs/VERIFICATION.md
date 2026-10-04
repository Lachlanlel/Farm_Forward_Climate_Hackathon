# Release verification — 4 October 2026

**Latest follow-up:** [Release-candidate QA](RELEASE_CANDIDATE_QA.md) records the public deployment, 100 passing tests, 536 matrix/generated API cases and final browser checks. The sections below preserve the original handoff verification history.

This verification applies to the current repository handoff, after the completed Results, multi-comparison, dynamic-yield and Scenario Summary work. It replaces the original 36-test archive verification.

## Clean-copy checks

The complete app was copied into a new release folder without `node_modules`, `dist`, old ZIPs, alternate source trees or symlinks to the working app. Locked dependencies were freshly installed using `npm ci`; the existing dependency folder and build output were not copied.

Environment: Node **24.18.0**, npm **11.16.0**, Windows. The supported Node minimum remains **22.14.0**, matching `.nvmrc` and the CI workflow.

| Check | Result |
|---|---|
| Fresh locked dependency installation | PASS — 12 packages installed |
| `npm run build` | PASS — frontend assets and bundled backend Worker, 7.59 MiB compressed |
| `npm run typecheck` | PASS — configured TypeScript/JSDoc scope |
| `npm test` | PASS — 91 passed, zero failures/skips |
| `node scripts/verify-demo.mjs` | PASS — 59 served assets match source, all page routes and compiled scene load, all three APIs work |
| Latest-source comparison | PASS — 141 existing executable/configuration/data/asset/test files are byte-identical to the final working app |
| Old Results mock | Excluded; compiled Worker returns 404 for its former path |
| Models/fonts/recipes | All five GLBs, three WOFF2 files/licences and two imported scene recipes retained |
| Source credential-pattern scan | No matching private keys or common access-token patterns detected |

The file list and hashes in `SOURCE_AUDIT.json` establish what was retained. Documentation was updated separately; the two release-verification scripts, CI workflow and line-ending/ignore rules are handoff additions. The compatibility `context.js` and current simulation presentation descriptor remain because current code/tests depend on them.

The final `HANDOFF_FILES.sha256` covers all deliverable files except itself. Run `node scripts/verify-handoff.mjs` after cloning or extracting to check for missing, altered or extra deliverable files. Dependencies, Git metadata, local secrets, caches and compiled output are excluded from that source manifest.

## What the tests cover

The suite includes the original numerical/water/scene audits, 48-scenario invariants, Results API validation, built Worker parity, signed economics, hectares/cost scaling, completed-run persistence, multiple comparisons, deduplication and yield sorting, and deterministic insights with AI fallback/rejection tests.

The fresh build's smoke check performs the official baseline → projection → completed Results flow directly through the compiled Worker. The sample Severe / Clay / Rain-fed / Combined / 100 ha case returns $840 Implementation cost and approximately +$1,106 net benefit, with Stubble retention ranking above the combined strategy.

## Render hosting preparation

After the original handoff, the server gained a configurable bind address and a public `npm start` entry point. `render.yaml` specifies a free Node web service. No frontend, modelling, Results, data or asset files changed. The original source audit remains a historical handoff record; the current checksum manifest covers these hosting additions.

Validation at hosting preparation: build and typecheck passed, all 91 tests passed, and `verify-demo.mjs` passed. The new `verify-hosting.mjs` also passed: it starts the public server with a temporary `PORT`, then checks all 59 assets, routes and three backend APIs over actual HTTP. This check is included in GitHub CI. The subsequent public deployment and expanded QA are recorded in the report above.

## Original browser evidence and scope

The final working application's Results comparison and Scenario Summary were inspected in the browser at desktop and mobile widths before packaging. Current screenshots are in `docs/screenshots/`. The release retains that executable source byte-for-byte; the release copy was independently verified by build, tests and compiled-Worker route/API checks.

No new video recording or live hosted deployment is claimed. No scientific field calibration is claimed. New location searches still depend on the external Photon service, and the bundled official CDI snapshot remains dated 31 August 2026.
