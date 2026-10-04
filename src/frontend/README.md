# Frontend

Current pages are Hero/Setup (`public/`), the 84-day Visual Simulation (`pages/visual-simulation.js`) and the four-stage calculated Results journey (`pages/results.js`). UI is plain JavaScript/DOM; the scene is TypeScript/Three.js. Public assets are served from the site root.

`services/` requests real backend CDI/projection responses. `state/simulator-ui-state.js` owns the master simulationDay. `components/farm-scene-host.js` maps supplied projection frames into crop, roots, water/layers and cracks. These are visual mappings, not a separate drought/ET/yield model.

`mock/simulation-data.js` contains strategy descriptions and initial null presentation fields; official CDI cards and scene playback use backend responses. Results uses the validated completed-run descriptor and `POST /api/results`. The unused old Results fixture is not part of this release.

See the root `HANDOFF_README.md` and `docs/RESULTS_GUIDE.md` for current contracts, comparisons and deterministic insights.
