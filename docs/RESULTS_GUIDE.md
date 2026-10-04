# Current Results implementation

The current release implements the complete Results journey. This document replaces the former “Results backend pending” handoff instructions.

## Data flow

The projection API returns a reproducible run descriptor. Completing day 84 stores it in the session. `POST /api/results` validates the descriptor and reproduces the same official baseline and scenario before calculating current and alternative outputs. Version/checksum mismatches fail explicitly rather than displaying old mock figures.

## Model and economics

Model version: `1.0-educational-severity-swi-loss`; assumptions version: `2026-10-04-v2`.

- Normal-season reference: 3.0 t/ha; wheat-price assumption: AUD 350/t.
- Moderate / Severe / Extreme reference drought losses: 15% / 30% / 55%.
- Actual versus raw severity SWI loss scales the drought effect. Soil, irrigation and stubble affect yield through their existing SWI trajectories, without extra arbitrary yield bonuses or a PGI ratio.
- The 18 cm reference yield is bounded to the normal reference range. The existing 30 cm wider-row response is applied afterward; its response crosses near 1.55 t/ha and can help or hurt.
- Implementation cost: representative AUD 6/ha stubble allowance plus AUD 2.40/ha wider-row allowance when selected. Actual farm costs vary.
- Crop saved is signed whole-farm production difference against the same drought without adaptations. Gross protected crop value uses the backend price assumption. Net benefit subtracts Implementation cost; it is not gross revenue or whole-farm profit.

See `RESULTS_CALIBRATION_MATRIX.md` / `.json` for full backend calibration outputs and sources in `src/backend/results/assumptions.js`.

## UI behaviour

1. **Final Key Metrics:** actual completed-run production, crop saved, yield loss, revenue, Implementation cost and net benefit.
2. **Comparison selection:** independent multi-selection; only the exact current strategy is disabled; whole-farm costs come from the backend.
3. **Final yield comparison:** one shared deduplicated scenario set, sorted by backend yield; current and selected labels; no unused columns. No adaptations shares the drought-baseline bar.
4. **Scenario Summary:** one card, three distinct deterministic insights and one scenario-qualified conclusion. Rankings prefer net benefit, using yield as context. Only current and selected adaptation strategies are analysed, with normal/drought reference context. Near-ties and unavailable costs are handled explicitly.

No external AI endpoint is configured. Structured analysis determines facts before text; optional wording is accepted only from supported fact-checked alternatives and otherwise falls back immediately. The app needs no LLM/API key.

The detailed comparison, dynamic-yield and insight reports included here describe those implemented features. Their test counts refer to their respective development stages; **the complete current suite is 91 tests**.
