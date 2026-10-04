# Farm Forward release-candidate QA

**4 October 2026 · Overall Results demo readiness: READY**

**Working demo:** https://farm-forward-052x.onrender.com/

The existing Render service `srv-db1265lg1s2s73878h80` was updated in place. The submitted URL has not changed. Render confirmed code commit `4666d5a77b788f08e9cf56f44825e2dc49eebab3` live; the subsequent documentation commit adds this report and screenshots without changing the app. No model or economic assumptions were changed during QA.

## A. Automated coverage and final verification

| Check | Outcome |
|---|---|
| Baseline build / typecheck | PASS; no compiler/build warnings |
| Baseline suite | 91 passed, 0 failed, 0 skipped |
| Final `npm run build` | PASS; complete frontend and backend Worker |
| Final `npm run typecheck` | PASS |
| Final `npm test` | **100 passed, 0 failed, 0 skipped** |
| Full configuration matrix | 48 configurations × 7 farm sizes = **336 cases**, each through projection and Results API handlers |
| Farm sizes | 1, 10, 50, 100, 250, 500 and 1000 ha |
| Seeded generated coverage | **200 additional cases**: 100 fractional-area configurations paired with doubled area |
| Model/scenario coverage | Moderate/Severe/Extreme × clay/sandy × rainfed/irrigated × stubble off/on × wider rows off/on |
| Local HTTP hosting check | PASS: public server entry point, assigned port, all routes/assets and three calculation APIs |
| Final public HTTPS check | PASS: **59 assets byte-identical to checkout**, page routes/compiled scene available, baseline → projection → completed Results API flow correct |
| Production path/credential pattern scan | 99 text source/build files; no localhost/filesystem-path or credential-pattern matches |

The 336-case audit inspects starting/ending RI, SWI and PGI; all 85 daily frames; reference and final yields; row multiplier; production; signed crop change; loss percentage; revenue; Implementation cost; gross value protected; and net benefit. It also checks each response's three comparison strategies. The full numeric record is [RELEASE_QA_MATRIX.json](RELEASE_QA_MATRIX.json). This file is evidence, not runtime data.

Tests are in `tests/release-candidate.test.mjs` plus the existing model, API, insights, comparison, persistence and playback tests. No existing test was deleted, skipped or weakened. Existing persistence/copy tests gained regression assertions.

## B. Browser journeys

Tested in the Codex Chromium in-app browser, using the public HTTPS deployment. Wagga Wagga NSW 2650 was selected from actual autocomplete suggestions for each farm journey.

| Drought / soil / water / strategy | Area | Observed final yield | Observed Implementation cost | Observed net benefit |
|---|---:|---:|---:|---:|
| Moderate / clay / rainfed / stubble | 50 ha | 2.656 t/ha | $300 | +$763 |
| Same agronomy, larger farm | 500 ha | 2.656 t/ha | $3,000 | +$7,631 |
| Severe / clay / rainfed / wider rows | 100 ha | 2.131 t/ha | $240 | −$2,320 |
| Extreme / sandy / rainfed / wider rows | 100 ha | 1.283 t/ha | $240 | +$445 |
| Extreme / sandy / irrigated / combined | 250 ha | 1.948 t/ha | $2,100 | +$9,042 |
| Extreme / clay / rainfed / no adaptations | 1000 ha | 1.515 t/ha | $0 | $0 |
| Severe / clay / rainfed / combined | 100 ha | 2.246 t/ha | $840 | +$1,106 |
| Severe / clay / rainfed / stubble, rerun through Previous | 100 ha | 2.311 t/ha | $600 | +$3,652 |

The figures above are display-rounded; area scaling assertions use unrounded backend values. Each journey reached comparisons, yield chart, summary and Finished. Playback tests included natural completion, play/pause, restart/play, and seeking forward/backward. Results tests included double-clicking Next, repeated selection/deselection, Previous/Next, refresh, browser Back/Forward and returning to a different farm/scenario.

The public origin was unvisited at the start: direct Results showed an explicit missing-run state and no fabricated metrics, followed by a fresh Setup journey. After the substantive fixes, the compiled production build was also tested on a previously unused local origin (empty app storage), through a complete 50 ha Moderate/stubble journey → Finished → 250 ha Extreme/sandy/irrigated/combined journey. Final public verification repeated combined Results and a different stubble run through Previous.

## C. Bugs found and fixes

| Symptom and root cause | Fix | Regression/evidence |
|---|---|---|
| A Results request had no deadline; a lost connection could leave loading indefinitely. Non-JSON hosting failures surfaced a raw JSON parsing error. | A 30-second Results timeout and understandable refresh/rerun messages. Navigation cancellation remains silent; no fallback numbers are manufactured. | `results-network.test.mjs`: failed/non-JSON request reproduced before fix; timeout, delayed success and navigation abort covered. |
| Starting another simulation through Previous retained the previous Results selections and stage. Simulation reset only cleared its completed descriptor. | Reset the Results journey whenever a simulation is no longer complete. Refresh within the same completed Results run still keeps comparisons. | Existing persistence test reproduced failure, then passed with the fix. Final public rerun showed no preselected comparisons and disabled Next. |
| On narrow screens, chart/table content extended sideways without an explicit cue; keyboard access was not explicit. | Added a narrow-screen scrolling hint, focusable labelled regions and visible focus outlines. | Dynamic-yield regression test and browser keyboard scrolling of both regions. No document-wide horizontal overflow. |
| Mobile comparison heading displayed “Timingdetermines” because CSS hid the line break between adjacent words. | Preserved a literal space before the break. | Comparison-copy regression assertion; final public mobile text verified as “Timing determines”. |

## D. Data consistency

- **No double counting:** irrigation and stubble act through the existing multiplicative SWI trajectory (`0.65 × 0.85` where both apply). No separate irrigation/stubble yield bonus. Wider rows adjust the 18 cm reference once. Row-caused yield loss is retained as lost crop value, not charged again as a cost.
- **Economics:** `cropSavedT × 350 − strategyCostAud`, not gross revenue minus cost. Costs are $6/ha stubble, $2.40/ha wider rows, $8.40/ha combined, and $0 without adaptations. All requested area examples and doubled areas pass.
- **Bounds and ordering:** finite outputs, bounded RI/SWI/PGI, nonnegative yields/production, no area-dependent yield, and expected severity/soil/water/stubble effects pass. No PGI ratios are used for yield.
- **Wider rows:** source multipliers 1.0300 / 0.9750 / 0.9525 / 0.9433 at 1/2/4/6 t/ha, endpoint caps and interpolation pass. The model crossover is approximately **1.54545 t/ha**; values at 1.50, 1.54, 1.545, 1.55 and 1.60 are smooth. Extreme/irrigated can still make wider rows detrimental.
- **Presentation:** chart and table use the same backend metrics, preserve signed negative values, deduplicate the no-adaptation current run, sort by unrounded yield and show only selected alternatives. Three-, four- and five-bar cases work; table membership adapts to one through four relevant scenarios in automated render tests.
- **Insights:** all matrix cases generate three insights and a scenario-qualified conclusion. Numerical signs and rankings agree with backend facts. Existing tests cover close differences, negative outcomes, combined being worse than stubble, synthetic yield/economic ranking differences and optional-AI failure. No AI service is required.

## E. State, navigation and accessibility

- Fresh Setup validates missing fields; actual NSW location search, baseline and 3D assets load. Results becomes available only at Week 12 (including intentionally seeking to the end).
- Current strategy is visibly muted, readable, labelled Current simulation, retains its cost, and is a disabled native button with `aria-disabled="true"`. Keyboard activation is blocked. No-adaptation runs leave all three alternatives enabled.
- Multi-select preserves other selections when one is toggled; all three are allowed for no adaptations. Empty selection disables Next. Rapid double-click did not skip a Results stage.
- Results refresh intentionally returns to Final Key Metrics, reloads the completed run and retains its comparison selections. Reloading/revisiting Simulation intentionally starts at Week 0 and invalidates old Results. Forward to Results then shows the recoverable missing-run state.
- Finished keeps farm inputs but clears the run and comparisons. Repeated runs and 50→500 ha changes show new values, with no stale Results leakage.
- Old versions, snapshot/checksum mismatch, malformed flags, missing/string/nonfinite hectares and corrupted persisted data are rejected by automated API/state tests. No plausible metrics are returned for invalid runs.

## F. Public-demo, responsive and runtime checks

Results metrics, comparison cards, yield chart/table and summary were examined at **1440, 1280, 768 and 390 px** widths. No accidental document-wide horizontal overflow was observed. Dense chart/table content deliberately scrolls inside labelled regions at small widths; both responded to arrow-key scrolling after the fix. Current screenshots: [mobile comparison](screenshots/qa-mobile-yield.png), [live summary](screenshots/qa-live-summary.png).

Observed browser warning/error logs were empty after the repeated and final live journeys. The full asset/route/API verification detected no missing runtime assets or failed calculation endpoints. Source inspection found one Results load per page, not per component render; comparison selection is local and immediate. No freezes, duplicate cards/bars or runaway updates were observed. This was a responsiveness smoke test, not a load benchmark.

Production assets use deployment-safe, same-origin API paths. No developer filesystem or localhost dependency was detected in frontend/backend/build output. The 99-file scan found no common credential patterns; this is not an exhaustive security audit. Render's install log also reported zero audited dependency vulnerabilities. No external AI/API key is configured or necessary. Educational CDI/SWI, model-reference, cost, price and wider-row caveats are retained; Implementation cost terminology is consistent.

## G. Remaining limitations

**No known blocking Results issues.**

- Render Free can sleep after inactivity; its dashboard warns that waking can delay requests by 50 seconds or more. Open the link ahead of the presentation/recording. The public URL remains unchanged.
- New location searches depend on the external Photon geocoder. The bundled official CDI snapshot remains 31 August 2026. Projections remain educational and provisional.
- Only Chromium was available/tested. No claim of Safari/Firefox engine coverage.
- Browser-level request throttling/interception was not exposed by the available browser controls. Delayed, failed and timed-out Results were tested at the actual client boundary with controlled fetch responses, alongside async-code inspection; no browser throttling claim is made.
- The video itself must still be recorded/uploaded by the team and submitted separately. No video URL was invented.

## H. Final status

`npm run build` = **PASS**  
`npm run typecheck` = **PASS**  
`npm test` = **100 passed / 0 failed**  
Final local HTTP and public HTTPS asset/API checks = **PASS**  
Overall Results demo readiness = **READY**

This report covers the requested checklist across calculation/API tests, generated matrices, source audits, responsive checks and real browser journeys. It does not claim every fault was injected into a live browser or every one of the 336 cases was manually clicked.
