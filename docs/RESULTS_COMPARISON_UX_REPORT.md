# Results comparison UX and terminology update — 4 October 2026

The production Results experience uses **Implementation cost** as its consistent
user-facing term, including the metrics heading, accessible tooltip name,
comparison cards, summary explanations and cost-related errors. Backend field
names such as `strategyCostAud` are unchanged.

## Files changed

- `src/frontend/components/results/comparison-selection.js` (added)
- `src/frontend/components/results/strategy-comparison-step.js`
- `src/frontend/components/results/final-key-metrics.js`
- `src/frontend/components/results/yield-comparison-step.js`
- `src/frontend/components/results/ai-summary-step.js`
- `src/frontend/components/results/results-navigation.js`
- `src/frontend/pages/results.js`
- `src/frontend/pages/results.css`
- `src/frontend/state/app-session.js`
- `src/backend/results/economics.js` (error text only)
- `src/backend/results/results-service.js` (error/warning text only)
- `src/shared/results-contract.js` (error text only)
- `tests/results-comparison-ux.test.mjs` (added)
- `tests/results-api.test.mjs`
- `tests/baseline-state.test.mjs`
- `docs/RESULTS_IMPLEMENTATION_REPORT.md`
- `docs/RESULTS_CHANGED_FILES.json`
- `docs/RESULTS_COMPARISON_UX_REPORT.md` (this report)

Generated `dist/` was rebuilt. No dependency or package-manifest changes.

## Selection and current-run logic

State is `results.selectedStrategies: string[]`, persisted in the existing app
session. It uses `stubble`, `wider`, and `combined`. Each card toggles its own
membership without removing another alternative. Saved selections are deduplicated,
validated, and filtered against the completed run. Legacy single-selection storage
is migrated to an array. Refresh retains valid selections; Finished resets them.
The completed scenario and backend Results numbers are never mutated by selection.

| Completed adaptations | Disabled card | Selectable alternatives |
|---|---|---|
| Stubble only | Stubble retention | Wider Row Spacing, Combined strategy |
| Wider rows only | Wider Row Spacing | Stubble retention, Combined strategy |
| Both | Combined strategy | Stubble retention, Wider Row Spacing |
| Neither | None | All three |

Only an exact flag match is disabled. The Combined case therefore permits both
individual strategies to be selected simultaneously. A newly loaded run removes
its matching prior comparison from selections automatically.

The matching card retains its readable cost/description and displays **Current
simulation**, using a muted grey treatment with no selected outline or hover
effect. A native disabled button plus `aria-disabled="true"` prevents mouse and
keyboard activation. Available toggle buttons retain the existing selected style
and expose their selected state through `aria-pressed`.

Next is disabled with zero available selections and enabled with one or more.
Charts/tables show the unchanged current simulation plus every selected alternative;
the chart also retains the normal and no-adaptation drought references. Scenario
Summary renders a separate existing summary card for each selected alternative.
No multi-selection is reduced back to a single choice.

## Cost presentation and final copy

Cards format backend `comparison.metrics.strategyCostAud`; the frontend does not
recompute a cost model or read a demonstration area. The backend still uses the
completed run's hectares and approved per-ha allowances of $6.00, $2.40 and $8.40
for stubble, wider rows and both. The current disabled card still shows its cost.

| Farm area | Stubble retention | Wider Row Spacing | Combined strategy |
|---|---:|---:|---:|
| 100 ha | $600 | $240 | $840 |
| 250 ha | $1,500 | $600 | $2,100 |
| 500 ha | $3,000 | $1,200 | $4,200 |

The main label is **Implementation cost: [whole-farm amount]**. Specific
residue-management and annualised equipment/setup bases remain in the existing
metrics tooltip and backend assumption metadata.

Visible descriptions:

- Stubble retention: “Keeps more moisture in the soil, helping protect the crop during drought.”
- Wider Row Spacing: “Can help in very dry conditions, but may reduce yield when conditions are better.”
- Combined strategy: “Uses both strategies together to see whether the combined approach performs better.”

Technical descriptions remain in backend metadata/documentation; main comparison
cards omit SWI, RI, PGI, reference-yield/interpolation details and condition factors.

## Verification

- `npm run build`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: **66 passed; 0 failures; 0 skips**. All previous 58 tests retained;
  eight new UX tests cover mappings, independent toggling, new-run filtering,
  area-specific backend costs, simple copy, Next gating, downstream multiplicity,
  terminology, persistence and legacy migration.
- Browser: the wider-only current card is disabled and labelled, deselecting all
  disables Next, Space/Enter selects two alternatives together, both reach the
  chart/table and Scenario Summary, and refresh retains both selections.
- Combined-run browser acceptance: after completing a run with both adaptations,
  only Combined is disabled, the former Combined comparison is removed, and
  Stubble retention and Wider Row Spacing remain selected simultaneously.
- Model/assumptions/yield/water/scene modules and numerical Results equations are
  unchanged. The regenerated calibration matrix and full-precision economic
  acceptance cases match the pre-update files exactly.

The card design, colours/fonts/spacing/navigation and overall Results hierarchy
are retained, with only the requested disabled-card styling and minimal multiple
comparison rendering. No genuine blocker was discovered.
