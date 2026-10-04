# Farm Forward — complete demo handoff

**Current release: 4 October 2026 (Australia/Sydney).** This is the complete frontend and backend, including the finished Results experience. Use this repository root; no older ZIP, prototype or separate backend folder is needed.

## Run the website

Install Node.js 22.14 or newer, open a terminal in this folder, then run:

```sh
npm ci
npm run build
npm run typecheck
npm test
node scripts/verify-demo.mjs
npm run dev
```

Open **http://127.0.0.1:4174/** and keep the terminal running. The single server serves the website and its backend. Do not open the HTML files directly or use a static-only server.

No API key, database or separate dataset download is required. Internet is needed for the initial dependency installation and new location searches. A browser with WebGL is needed for the 3D scene.

## For the demo video

Start with **[DEMO_GUIDE.md](DEMO_GUIDE.md)**: exact sample settings, expected results, a short recording sequence and narration. It also explains how to demonstrate the wider-row trade-off without changing the model.

The [handoff guide](HANDOFF_README.md) explains the source layout, setup and what belongs in Git. [Verification](docs/VERIFICATION.md) records the release checks. [Results guide](docs/RESULTS_GUIDE.md) explains the assumptions and current behaviour.

## What is included

- Farm setup, official NSW baseline lookup, 84-day drought projection and synchronised 3D simulation.
- All four Results stages: calculated metrics, multiple comparison selection, dynamic yield chart/table, and three scenario insights with one data-driven conclusion.
- Complete backend and shared contracts; the bundled official CDI snapshot and source/attribution files.
- All five runtime GLBs, two asset recipes, local fonts, icons and images.
- Locked dependencies, build/run scripts, 91 automated tests and handoff integrity checks.

`node_modules/` and `dist/` are generated locally and excluded from Git. `HANDOFF_FILES.sha256` verifies the committed handoff files with `node scripts/verify-handoff.mjs`.

## Sharing and hosting

The repository shares the source; it does **not** automatically publish the website. Your sister can clone/download this repository and run the commands above. `127.0.0.1` works only on the computer running the server.

The retained `.openai/hosting.json` identifies the original hosting project; it is not a credential and does not grant deployment access. That project was unavailable from this account during handoff. No live website publication is claimed by this release. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Model context

Yields and financial results are provisional educational outputs, not an official forecast or general farming advice. The model uses a 3.0 t/ha normal reference, AUD 350/t wheat price, and representative Implementation cost allowances of AUD 6/ha for stubble and AUD 2.40/ha for wider rows. Actual farm costs vary. Data and font attribution are preserved; see [CDI_DATA.md](docs/CDI_DATA.md) and [ASSETS.md](docs/ASSETS.md).
