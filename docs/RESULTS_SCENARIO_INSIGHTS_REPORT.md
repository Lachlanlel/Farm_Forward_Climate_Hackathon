# Scenario Summary: deterministic insights

Implemented 4 October 2026. Results step 03 now interprets the current completed run and selected comparisons in one existing summary card, with exactly three numbered insights and one qualified conclusion. The page title, colours, typography, spacing, responsive CSS and Previous / Finished navigation are unchanged.

## Files changed

- `src/frontend/components/results/ai-summary-step.js`: one current-run card, three insight roles and one conclusion; optional validated wording argument.
- `src/frontend/components/results/scenario-insight-analysis.js` (new): deterministic structured facts and rankings.
- `src/frontend/components/results/scenario-insight-text.js` (new): concise templates and strict optional wording validation.
- `src/frontend/services/scenario-insights-presenter.js` (new): compact optional-provider payload, timeout/failure fallback and provider instructions. No external endpoint or credentials.
- `tests/results-insights.test.mjs` (new): 13 tests, including an exhaustive 48-scenario content check.
- `tests/results-comparison-ux.test.mjs`: retain scenario-membership assertions while expecting one summary card and three rows instead of one card per selected comparison.
- This report, `docs/RESULTS_IMPLEMENTATION_REPORT.md` and `docs/RESULTS_CHANGED_FILES.json`.

Generated `dist` assets were rebuilt. The final screenshot is saved outside the application at `../results-scenario-insights.png`.

## Structured analysis

`buildScenarioInsightContext` reuses `buildDisplayedResultsScenarios`, the same membership model as Final yield comparison. It never adds unselected adaptation scenarios. Current identity comes from the completed run, not comparison selections.

The versioned context contains:

- Current scenario and selected scenarios, each with backend yield, pre-row reference yield, production, crop saved, Implementation cost, gross crop value protected and net benefit.
- Same-drought baseline yield/production and normal-reference yield/production. The baseline's incremental cost/value/net benefit are zero by definition.
- Highest-yield, highest-net-benefit and lowest-Implementation-cost scenarios; tolerance-aware leading groups; whether all compared economics are available.
- Current versus baseline and current versus each selected comparison: yield, production, cost and net-benefit differences.
- Combined versus stubble and combined versus wider facts, only when both relevant scenarios are in the selected/current set; separate yield and economic directions and a meaningful-benefit flag.
- Per-scenario wider-row effects, whether they helped/hurt, and the current run's row effect when applicable.
- Drought severity, interpretation version and tolerances. No location, raw CDI records or simulation timeline is needed to write insights.

Only subtraction, comparison and ranking of existing backend outputs occur here. No agronomy, crop valuation, cost or net-benefit equation is reproduced. Original backend outputs remain unchanged.

## Ranking and conclusion rules

Highest yield and net benefit use full-precision backend outputs, descending; minimum cost uses ascending backend cost. Exact ties use the shared scenario priority. Interpretation treats yield differences within **0.005 t/ha**, whole-farm production changes within **0.005 t**, and financial differences within **AUD 1** as similar. These are wording tolerances, not model parameters or changes to chart sorting.

Wider-row effect is backend final yield minus backend pre-row reference yield. Its sign beyond the yield tolerance determines whether rows helped or hurt. This does not rerun the wider-row equation and does not award a separate water benefit.

Combined-versus-individual differences subtract the corresponding existing backend outputs. A meaningful economic improvement requires net benefit above the individual by more than AUD 1. Where economics are missing, only a yield comparison is possible. Both dimensions remain separately available so a crop gain cannot be misrepresented as a financial gain.

The conclusion prioritises net benefit when every relevant scenario has valid economics. It names a stronger alternative even if that contradicts the user's current choice. If all strategies lose money relative to the same-drought baseline, it favours no adaptations for this simulation. Near-ties do not produce an arbitrary winner. Missing economics produce a qualified yield-only conclusion, never a winner from a partial financial ranking. If highest yield differs meaningfully from highest net benefit, the copy explains the trade-off.

No selected comparisons is safe: all three insights still render, and the third compares the current strategy with the drought baseline. A no-adaptation run with no alternatives explicitly says an adaptation winner cannot be identified.

## Optional AI path and fallback

**No external AI endpoint is implemented or configured.** No data leaves the app. The production page renders deterministic insights synchronously, without a loading dependency or an “AI unavailable” message.

An optional `resolveScenarioInsights(context, { rewrite })` adapter is provided for future integration. It sends an explicit compact allowlist of scenario facts and supported wordings, not app state, coordinates, CDI data, source files, HTML, 3D state or a timeline. Its contract is exactly `insight1`, `insight2`, `insight3`, `recommendation`.

Optional wording is deliberately constrained: a provider may choose between the fact-checked phrasings generated for each field. Arbitrary free-form paraphrases are rejected because numerical-token checks alone cannot prove that prose contains no invented agricultural claim or false ranking. Validation requires all four fields, no extra fields, supported concise strings, distinct insights and the prequalified scenario conclusion. The renderer validates again before displaying any replacement.

No adapter returns the fallback immediately. Exceptions, empty/malformed content, unsupported numbers/claims, incorrect rankings and general farming advice all return the complete deterministic fallback. A stalled adapter times out after 1.5 seconds and is aborted; initial deterministic content remains available throughout. Tests demonstrate an accepted supported alternative as well as each rejection path. A future external integration would need to call the adapter and pass its validated result to the renderer; no API key or provider is silently assumed.

## Visible structure and validation

Heading: **[Current strategy] — scenario insights**.

Subheading: **Key takeaways from your simulation and selected comparisons.**

Rows: **01 Crop outcome**, **02 Economic trade-off**, **03 Compared strategies**. The bottom strip is labelled **CONCLUSION** and always qualifies the simulation. The global notice already accurately describes representative implementation-cost allowances and actual farm cost variation; it was left unchanged. No current production copy claims that configured costs await validation.

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: **91 passed, zero failures or skips**; all previous 78 retained, 13 added.
- Tests cover positive stubble, negative and positive extreme wider rows, combined versus each individual, highest yield versus highest net benefit, tolerance ties, missing comparisons/costs, optional AI fallback/rejection/acceptance and exactly three distinct insights across all 48 model configurations.
- Hash checks confirm all 69 protected backend, shared-contract, state, scene and calibration files remain byte-identical. No CSS, selection architecture or previous Results-step implementation changed.
- Live browser checks confirmed current Combined strategy with both persisted selected alternatives, three insight rows, one conclusion favouring Stubble retention, and Previous / Finished controls. At 390 pixels and 1280 pixels, document content width matched viewport width. The original responsive CSS required no changes. The temporary viewport override was reset after checking.

## Exact deterministic examples

The following text is generated from the production backend for Wagga Wagga, 100 ha, rainfed. Values are illustrative outputs of the existing educational model, not new assumptions.

### Positive stubble: Severe / Clay

**insight1:** Stubble retention protected 12.15 t of wheat compared with the same drought without adaptations. In the model, residue slows soil-water loss, helping the crop maintain production.

**insight2:** The protected crop value of $4,252 exceeded the Implementation cost of $600, leaving $3,652 in positive net benefit. This is an incremental gain over the drought baseline, not whole-farm profit.

**insight3:** Stubble retention delivered the strongest net benefit among the scenarios compared. Adding wider rows reduced part of the yield benefit from stubble alone.

**recommendation:** For this simulated scenario, Stubble retention delivers the highest net benefit among the scenarios compared.

### Negative wider rows: Severe / Clay

**insight1:** Wider Row Spacing reduced production by 5.94 t compared with the same drought without adaptations. The yield level was above the range where wider spacing helps in this model, so the row response reduced yield.

**insight2:** Production fell and the Implementation cost was $240, leaving a net benefit of −$2,320. The strategy finished financially behind the same drought without adaptations.

**insight3:** Stubble retention outperformed your Wider Row Spacing scenario in both yield and net benefit.

**recommendation:** For this simulated scenario, Stubble retention delivers the highest net benefit among the scenarios compared.

### Positive wider rows: Extreme / Sandy (baseline-only comparison)

**insight1:** Wider Row Spacing protected 1.96 t of wheat compared with the same drought without adaptations. At this low yield level, the model’s wider-row response slightly improved production; that advantage does not apply at every yield level.

**insight2:** The protected crop value of $685 exceeded the Implementation cost of $240, leaving $445 in positive net benefit. This is an incremental gain over the drought baseline, not whole-farm profit.

**insight3:** No alternative strategy was selected; the comparison is with the no-adaptation drought baseline. The current strategy improved net benefit after its Implementation cost.

**recommendation:** For this simulated scenario, Wider Row Spacing delivers the highest net benefit among the scenarios compared.
