# Farm Forward demo recording guide

Use the website built from this repository. No pre-recorded video is included; these instructions and current screenshots are the recording handoff.

Visual references: [Final yield comparison](docs/screenshots/yield-comparison.png) and [Scenario Summary](docs/screenshots/scenario-summary.png).

## Before recording

1. Follow the README installation commands and start `npm run dev`.
2. Open http://127.0.0.1:4174/ in a desktop browser with WebGL enabled.
3. Choose a comfortable desktop window size and keep browser zoom at 100%. Record the browser window using your normal screen recorder; retain the app's educational-model notice.
4. Search for **Wagga Wagga** and select the actual autocomplete result (typing without selecting is insufficient). Enter **100 hectares**, **Clay**, **Rain-fed**.
5. Continue to Simulation. Choose **Severe** drought and enable **Stubble retention** and **Wider Row Spacing**.
6. Rehearse once before recording. If an old session reports incompatible Results, rerun the simulation from the setup page.

## Suggested 90–120 second sequence

| Approximate time | Show | Suggested narration |
|---|---|---|
| 0–15 seconds | Farm setup and selected farm inputs | “Farm Forward explores how drought, soil, water supply and management choices interact in an educational wheat simulation.” |
| 15–45 seconds | Start the simulation and allow the 24-second playback to finish | “The run begins with official NSW parish indices. One timeline drives the crop, roots, soil and water presentation across twelve simulated weeks.” |
| 45–60 seconds | View results → Final Key Metrics | “Results are calculated for this completed run. Net benefit is the extra crop value compared with the same drought without adaptations, after Implementation cost.” |
| 60–75 seconds | Comparison selection | “We can select both individual strategies to compare with the combined strategy we ran.” |
| 75–95 seconds | Final yield comparison | “The chart orders backend yields from highest to lowest. The current run is marked, and only the selected alternatives appear alongside the two baselines.” |
| 95–115 seconds | Scenario Summary | “The summary explains the crop effect, financial trade-off and comparisons. In this scenario, stubble alone performs better than the combined strategy; the tool does not automatically endorse our original choice.” |

On the comparison page select **Stubble retention** and **Wider Row Spacing**. The Combined card is disabled because it is already the current simulation. Then press Next twice to reach the summary. Finished returns to setup and clears the completed Results journey; do not press it until the recording is complete.

## Expected reference results

These are regression outputs for the bundled South Wagga Wagga baseline, 100 ha, Severe / Clay / Rain-fed. Confirm the current UI rather than editing values for the video.

| Scenario | Yield shown | Crop saved | Implementation cost | Net benefit |
|---|---:|---:|---:|---:|
| Stubble retention | 2.311 t/ha | +12.15 t | $600 | +$3,652 |
| Combined strategy | 2.246 t/ha | +5.56 t | $840 | +$1,106 |
| Drought, no adaptations | 2.19 t/ha | 0 t | $0 | $0 |
| Wider Row Spacing | 2.131 t/ha | −5.94 t | $240 | −$2,320 |

Normal reference is 3 t/ha. The Combined run's final production is 224.56 t and gross revenue is $78,596. Gross revenue and net benefit are different measures.

The summary should conclude: “For this simulated scenario, Stubble retention delivers the highest net benefit among the scenarios compared.”

## Optional second clip: wider rows can help

Run **Extreme / Sandy / Rain-fed**, **100 ha**, **Wider Row Spacing on**, **Stubble off**, at the same selected Wagga location. Wider rows then give about **1.283 t/ha**, **+1.96 t** saved, **$240 Implementation cost** and **+$445 net benefit** versus the same drought without adaptations.

Say: “At this very low yield level, wider rows provide a small positive response. Their effect depends on the resulting yield level; selecting Extreme does not automatically guarantee an advantage.” If you select stubble or combined as comparisons, the conclusion may still favour them. Do not imply wider rows always win or that the simulator gives universal farm advice.

## If something prevents the recording

- **Location search unavailable:** check the internet connection and retry the autocomplete. There is no fake-location fallback.
- **Port already in use:** stop the other preview terminal or set a different `PORT` as described in the handoff guide.
- **No calculated Results:** complete a fresh simulation; do not open `/results/` without a completed run.
- **Source edits seem missing:** stop the server, run `npm run build`, then start `npm run dev` again and reload.
- **3D unavailable:** use a WebGL-capable browser with hardware acceleration; keep the browser error visible while diagnosing it rather than recording a placeholder.
- **Need your sister to access it:** share the GitHub repository with her account. She runs her own local server. The localhost link from your computer cannot be opened remotely.
