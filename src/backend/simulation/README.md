# Numerical simulation

`farm-forward-model-v1.js` and `project-scenario.js` are the production v1 parameter/equation sources. The shared projected-condition classifier is in `src/shared/projected-condition.js`. Do not recalibrate them as part of Results integration.

`context.js` is the unused earlier null Week 0/4/8/12 placeholder. Current production returns 85 daily frames for days 0–84.

Results yield/economics are implemented in `../results/`; see the root `docs/RESULTS_GUIDE.md`. This handoff does not change the simulation equations.
