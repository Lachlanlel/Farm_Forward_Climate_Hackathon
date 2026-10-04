import { readFile, writeFile } from 'node:fs/promises';
import { createCdiRepository } from '../src/backend/data/cdi-repository.js';
import { lookupBaseline } from '../src/backend/services/cdi-lookup-service.js';
import { projectScenario } from '../src/backend/simulation/project-scenario.js';
import { createRunDescriptor, calculateRunResults } from '../src/backend/results/results-service.js';
import { RESULTS_ASSUMPTIONS, RESULTS_MODEL_VERSION } from '../src/backend/results/assumptions.js';

const root = new URL('../', import.meta.url);
const repository = createCdiRepository(JSON.parse(await readFile(new URL('src/backend/data/cdi-repository.json', root))));
const baselineCDI = lookupBaseline(repository, {
  location: { latitude: -35.115, longitude: 147.3677778, displayName: 'Wagga Wagga NSW 2650' },
  simulationStartDate: '2026-10-04'
}).baselineCDI;
const rows = [];
for (const soilType of ['clay', 'sandy']) for (const waterSupply of ['rainfed', 'irrigated']) for (const stubbleRetention of [false, true]) {
  const row = { soilType, waterSupply, stubbleRetention, outcomes: {} };
  for (const droughtIntensity of ['moderate', 'severe', 'extreme']) {
    const projection = projectScenario({ baselineCDI, droughtIntensity, soilType, waterSupply, adaptations: { stubbleRetention, widerRows: false } });
    const result = await calculateRunResults(repository, { ...await createRunDescriptor(baselineCDI, projection, 100), completedDay: 84 });
    const wide = result.comparisons.find(c => c.id === (stubbleRetention ? 'combined' : 'wider')).metrics;
    row.outcomes[droughtIntensity] = {
      startingSWI: projection.baseline.soilWaterIndex, endingSWI: projection.projectedEnd.soilWaterIndex,
      ...result.yieldDiagnostics, reference18cmYieldTPerHa: result.finalMetrics.finalYieldTPerHa,
      wider30cmYieldTPerHa: wide.finalYieldTPerHa, wideRowMultiplier: wide.wideRowMultiplier,
      widerRowChangeTPerHa: wide.finalYieldTPerHa - result.finalMetrics.finalYieldTPerHa,
      widerRowsEffect: wide.finalYieldTPerHa > result.finalMetrics.finalYieldTPerHa ? 'helps' : wide.finalYieldTPerHa < result.finalMetrics.finalYieldTPerHa ? 'hurts' : 'neutral'
    };
  }
  rows.push(row);
}
const economicAcceptanceCases = [];
for (const [droughtIntensity, soilType] of [['severe', 'clay'], ['extreme', 'sandy']]) {
  const projection = projectScenario({ baselineCDI, droughtIntensity, soilType, waterSupply: 'rainfed', adaptations: { stubbleRetention: false, widerRows: true } });
  const result = await calculateRunResults(repository, { ...await createRunDescriptor(baselineCDI, projection, 100), completedDay: 84 });
  economicAcceptanceCases.push({ droughtIntensity, soilType, waterSupply: 'rainfed', stubbleRetention: false, widerRows: true, metrics: result.finalMetrics });
}
const report = { simulationModelVersion: '1.0-hackathon', resultsModelVersion: RESULTS_MODEL_VERSION,
  assumptions: RESULTS_ASSUMPTIONS, baselineCDI, rows, economicAcceptanceCases };
const cell = result => `${result.reference18cmYieldTPerHa.toFixed(4)} → ${result.wider30cmYieldTPerHa.toFixed(4)} (${result.widerRowsEffect})`;
const text = `# Results calibration matrix

Generated from the production backend calculation service. Provisional educational
calibration, not an agronomic forecast. Normal reference 3.0 t/ha; wheat price
AUD 350/t; stubble allowance AUD 6.00/ha and wider-row allowance AUD 2.40/ha,
classified as research-informed scenario assumptions. Actual farm costs vary.
Costs affect economics only. Each cell is **18 cm yield
→ 30 cm yield in t/ha**. Unrounded values and SWI diagnostics are in
RESULTS_CALIBRATION_MATRIX.json.

Run date: 4 October 2026. Official baseline: South Wagga Wagga parish,
snapshot ${baselineCDI.snapshotDate}, starting RI ${baselineCDI.rainfallIndex},
SWI ${baselineCDI.soilWaterIndex}, PGI ${baselineCDI.plantGrowthIndex}.
Results model: ${RESULTS_MODEL_VERSION}; assumptions ${RESULTS_ASSUMPTIONS.version}.

| Soil | Water | Stubble | Moderate | Severe | Extreme |
|---|---|---|---|---|---|
${rows.map(row => `| ${row.soilType} | ${row.waterSupply} | ${row.stubbleRetention ? 'on' : 'off'} | ${cell(row.outcomes.moderate)} | ${cell(row.outcomes.severe)} | ${cell(row.outcomes.extreme)} |`).join('\n')}

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
conditionFactor is about ${(baselineCDI.soilWaterIndex / (baselineCDI.soilWaterIndex - 2.5)).toFixed(6)}, not 1.10. This explains that row's reference yield.
These yields use one official baseline; low-starting-SWI endpoint clamping can
change the condition factor elsewhere. SWI is never a physical water percentage.

## Economic acceptance cases (100 ha; wider rows only)

Full-precision values are calculated from the accepted yields; approximations in
the request are not substituted into calculations. Net benefit is crop-value
change versus the same drought without adaptations, minus implementation cost.

| Severity / soil | Crop saved (t) | Gross value change (AUD) | Cost (AUD) | Net benefit (AUD) |
|---|---:|---:|---:|---:|
${economicAcceptanceCases.map(c => `| ${c.droughtIntensity} / ${c.soilType} | ${c.metrics.cropSavedT.toFixed(8)} | ${c.metrics.grossValueProtectedAud.toFixed(8)} | ${c.metrics.strategyCostAud.toFixed(2)} | ${c.metrics.netBenefitAud.toFixed(8)} |`).join('\n')}
`;
await writeFile(new URL('docs/RESULTS_CALIBRATION_MATRIX.json', root), JSON.stringify(report, null, 2) + '\n');
await writeFile(new URL('docs/RESULTS_CALIBRATION_MATRIX.md', root), text);
console.log(text);
