# Farm Forward current release contents

Release date: **4 October 2026, Australia/Sydney**.

This package is the final frontend/backend app from the current review workspace, including all completed Results work. It is not the earlier simulator-only handoff.

## Included

- Entire required current frontend, backend and shared source.
- Runtime models, asset recipes, fonts/licences, images/icons and all required official CDI data/provenance.
- Current tests, locked npm dependencies/configuration, build/run scripts and optional data import script.
- Current setup, Results, deployment and demo recording guides.
- Two current Results screenshots under `docs/screenshots/`.
- GitHub CI checks, per-file SHA-256 manifest and local verification helpers.

## Deliberate exclusions

- Older prototype applications, sister/review ZIPs, old handoff instructions and obsolete source-verification records.
- The unused `src/frontend/mock/results-data.js`; current Results use the real backend. Current simulation presentation descriptors and tested compatibility contracts are retained.
- `node_modules`, `dist`, caches, logs, machine-specific paths, real `.env` files and credentials. These are not required committed source.
- Optional original raw GIS ZIP and Blender authoring projects. The processed runtime geometry, all final GLBs and imported recipes are included. The optional GIS re-import is documented.

`docs/SOURCE_AUDIT.json` proves 141 existing required implementation/configuration/test/data/asset files match the latest app byte-for-byte. `HANDOFF_FILES.sha256` lists every final deliverable file and its checksum. The published Git commit identifies this exact source state after push.

Start with `README.md`; use `DEMO_GUIDE.md` for recording. A GitHub push shares source and does not by itself host the website.
