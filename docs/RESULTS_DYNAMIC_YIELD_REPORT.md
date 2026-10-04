# Final yield comparison: dynamic scenarios

Implemented 4 October 2026. Production changes are confined to the Final yield comparison Results step and its styles. No backend, calibration, simulation, water, wider-row, economics, implementation-cost, completed-run or selection-persistence logic changed.

## Files changed in this pass

- Added `src/frontend/components/results/displayed-results-scenarios.js`: shared presentation collection.
- Updated `src/frontend/components/results/yield-comparison-step.js`: dynamic caption, chart, table and role labels.
- Updated `src/frontend/pages/results.css`: count-dependent sizing, wrapping caption and compact table labels; only yield-comparison styles changed.
- Added `tests/results-dynamic-yield.test.mjs`: 12 regression tests.
- Updated `tests/results-comparison-ux.test.mjs`: existing downstream assertion now recognizes the current scenario's real strategy ID.
- Added this report, updated `docs/RESULTS_IMPLEMENTATION_REPORT.md`, and recorded this pass in `docs/RESULTS_CHANGED_FILES.json`.

Generated `dist` output was rebuilt. A preview screenshot is saved outside the app at `../results-dynamic-yield.png`.

## Scenario collection and state

`buildDisplayedResultsScenarios` constructs one unique collection from normal reference, drought baseline, the completed current run and explicitly selected comparisons. Both chart and table consume it. Backend scenarios that were neither current nor selected are excluded.

Current identity comes from `data.run.scenario.adaptations`: neither flag means No adaptations; stubble only means Stubble retention; wider only means Wider Row Spacing; both means Combined strategy. The current scenario retains `data.finalMetrics`. Selected alternatives retain their existing `comparison.metrics` objects.

Scenarios are keyed by their canonical ID in a Map. Current No adaptations replaces the drought baseline, with chart name “Drought, no adaptations” and table name “No adaptations”. Current-matching, repeated and unknown selected IDs cannot add duplicate bars or columns. Current labels are “(current simulation)” in the chart and “Current simulation” in the table; comparison labels are distinct.

The existing `selectedStrategies` array flows unchanged from the preceding Results step. Existing navigation, normalization and refresh persistence are untouched. No single-selection field was reintroduced. The caption lists every valid selected comparison with a natural-language conjunction.

The chart always represents Normal reference, Drought/no adaptations and the current simulation, plus only explicitly selected comparisons. With no adaptations, one drought bar fulfills both baseline and current roles. The table includes only current plus selected scenarios, omitting chart-only references.

## Ordering, layout and backend binding

The shared collection sorts by descending, unrounded backend yield. Exact ties use normal reference, drought baseline, current simulation, then incoming selected-array order. The existing selection state already normalizes its array; this pass does not change how that state is stored. Table scenarios are filtered from the sorted chart collection, preserving their relative order.

The chart generates exactly one equal grid track per displayed bar. Its minimum content width depends on that count. One fixed-layout HTML table generates only the actual columns, distributing available width equally across metric plus displayed scenarios. Its minimum width is 175 pixels per actual column. Both use horizontal scrolling within their own containers on small screens, without reserving empty strategy slots.

All yields, crop saved, yield loss and net benefit come directly from the backend Results response. Frontend operations are selection, sorting, numeric formatting and chart-axis/layout scaling only. The table continues its existing three metric rows; no implementation-cost calculation or row was added. Existing “Implementation cost” terminology checks still pass.

Final visible sentence format:

> Provisional educational yields from this run. Current simulation: [CURRENT STRATEGY]. Comparing with: [SELECTED COMPARISONS]. Not an official NSW grain-yield forecast.

If a defensive empty selection reaches this renderer, comparisons read “None”; normal navigation still requires a comparison to proceed.

## Validation

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: **78 passed, zero failed or skipped**, retaining the prior 66 tests and adding 12.
- Tests cover requested A–D combinations, all four current identities, duplicate/invalid selections, exact ties, differences below display rounding precision, backend metric binding, dynamic 1–4 scenario table columns, caption plurality, zero-yield chart dimensions and no mutation of input Results/state.
- File hashes confirm backend, shared contracts, state and saved calibration outputs remain byte-identical to the start of this pass. The full source audit limits production edits to the two yield-comparison modules and related CSS.
- Live preview verified the persisted combined-strategy run with both selected alternatives, current/selected labels, descending chart/table order and real signed metric values. Removing Wider Row Spacing produced exactly four chart bars and two scenario table columns; the metric and two scenario columns measured approximately 383.83 pixels each at desktop width.
- At a 390-pixel viewport, page content remained 390 pixels wide. Chart and table overflow stayed in their own scroll containers. The long caption wrapped without overlapping the chart. The temporary viewport override was reset afterward.
- Preview restored to both selected alternatives and left on Final yield comparison at `http://127.0.0.1:4174/results/`.

The existing educational/provisional model status is unchanged.
