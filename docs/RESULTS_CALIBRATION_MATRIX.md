# Results calibration matrix

Generated from the production backend calculation service. Provisional educational
calibration, not an agronomic forecast. Normal reference 3.0 t/ha; wheat price
AUD 350/t; stubble allowance AUD 6.00/ha and wider-row allowance AUD 2.40/ha,
classified as research-informed scenario assumptions. Actual farm costs vary.
Costs affect economics only. Each cell is **18 cm yield
→ 30 cm yield in t/ha**. Unrounded values and SWI diagnostics are in
RESULTS_CALIBRATION_MATRIX.json.

Run date: 4 October 2026. Official baseline: South Wagga Wagga parish,
snapshot 2026-08-31, starting RI 41.9093,
SWI 50.3739, PGI 58.1328.
Results model: 1.0-educational-severity-swi-loss; assumptions 2026-10-04-v2.

| Soil | Water | Stubble | Moderate | Severe | Extreme |
|---|---|---|---|---|---|
| clay | rainfed | off | 2.5950 → 2.5128 (hurts) | 2.1900 → 2.1306 (hurts) | 1.5150 → 1.5175 (helps) |
| clay | rainfed | on | 2.6557 → 2.5698 (hurts) | 2.3115 → 2.2456 (hurts) | 1.7378 → 1.7194 (hurts) |
| clay | irrigated | off | 2.7367 → 2.6456 (hurts) | 2.4735 → 2.3985 (hurts) | 2.0347 → 1.9831 (hurts) |
| clay | irrigated | on | 2.7762 → 2.6826 (hurts) | 2.5525 → 2.4728 (hurts) | 2.1795 → 2.1206 (hurts) |
| sandy | rainfed | off | 2.5050 → 2.4281 (hurts) | 2.0100 → 1.9595 (hurts) | 1.2638 → 1.2834 (helps) |
| sandy | rainfed | on | 2.5793 → 2.4980 (hurts) | 2.1585 → 2.1007 (hurts) | 1.4573 → 1.4643 (helps) |
| sandy | irrigated | off | 2.6782 → 2.5909 (hurts) | 2.3565 → 2.2881 (hurts) | 1.8203 → 1.7927 (hurts) |
| sandy | irrigated | on | 2.7265 → 2.6361 (hurts) | 2.4530 → 2.3792 (hurts) | 1.9972 → 1.9476 (hurts) |

The model's interpolated crossover is **1.5454545 t/ha** (approximately 1.55).
This mathematical crossing between source points is not an empirically
established universal agronomic threshold.
At this baseline, wider rows help under Extreme in three configurations:
rainfed clay without stubble, and rainfed sandy soil with or without stubble.
All other table configurations are above the crossover and incur a yield penalty.
There is no rule that Extreme must benefit from wider rows.

The raw SWI loss is the current model's
max(startSWI - severity.soilWaterTarget, startSWI × severity.minimumDecline),
before soil/protection and clamping. Actual loss uses the clamped endpoint.
For extreme sandy rainfed without stubble, end SWI clamps to zero; consequently
conditionFactor is about 1.052221, not 1.10. This explains that row's reference yield.
These yields use one official baseline; low-starting-SWI endpoint clamping can
change the condition factor elsewhere. SWI is never a physical water percentage.

## Economic acceptance cases (100 ha; wider rows only)

Full-precision values are calculated from the accepted yields; approximations in
the request are not substituted into calculations. Net benefit is crop-value
change versus the same drought without adaptations, minus implementation cost.

| Severity / soil | Crop saved (t) | Gross value change (AUD) | Cost (AUD) | Net benefit (AUD) |
|---|---:|---:|---:|---:|
| severe / clay | -5.94311250 | -2080.08937500 | 240.00 | -2320.08937500 |
| extreme / sandy | 1.95755735 | 685.14507244 | 240.00 | 445.14507244 |
