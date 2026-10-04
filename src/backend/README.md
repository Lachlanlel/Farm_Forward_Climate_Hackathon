# Backend

The backend implements the official NSW CDI baseline, Farm Forward Model v1, completed-run validation and authoritative Results yield/economics calculations.

- `data/cdi-repository.json`: dated official parish indices, geometry and provenance; no live CDI download at runtime.
- `data/cdi-repository.js`: newest snapshot on/before the journey date.
- `services/spatial-lookup.js`: coordinate/polygon matching, rejecting ambiguous boundaries.
- `services/cdi-lookup-service.js`: immutable official baseline, source metadata and unavailable handling.
- `simulation/farm-forward-model-v1.js`: current educational parameters, 84 days / 24 seconds.
- `simulation/project-scenario.js`: drought projection and 85 daily samples.
- `results/`: versioned yield/economics assumptions, calculations and run reproduction.
- `worker.js`: POST /api/cdi/baseline, POST /api/simulation/project, POST /api/results and static files.

The earlier `simulation/context.js` null Week 0/4/8/12 contract is unused by the Worker and current Simulation page. It is retained as legacy source, not the current model.

See the root `HANDOFF_README.md`, `docs/RESULTS_GUIDE.md` and `docs/CDI_DATA.md`. The build bundles backend imports through esbuild. Scenario insights interpret existing backend outputs deterministically; no external AI endpoint is configured.
