import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createWorker } from '../src/backend/worker.js';
import { wideRowMultiplier } from '../src/backend/results/yield-model.js';
import { buildDisplayedResultsScenarios } from '../src/frontend/components/results/displayed-results-scenarios.js';
import { buildScenarioInsightContext } from '../src/frontend/components/results/scenario-insight-analysis.js';
import { deterministicScenarioInsights } from '../src/frontend/components/results/scenario-insight-text.js';
import { renderYieldComparisonStep } from '../src/frontend/components/results/yield-comparison-step.js';
import { tonnes, moneyLabel, yieldLabel } from '../src/frontend/components/results/results-format.js';

const worker = createWorker(JSON.parse(await readFile(new URL('../src/backend/data/cdi-repository.json', import.meta.url))), {});
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);
const base = { location: { latitude: -35.115, longitude: 147.3677778, displayName: 'Wagga Wagga NSW 2650' }, simulationStartDate: '2026-10-04' };
const areas = [1, 10, 50, 100, 250, 500, 1000];
const combinations = [];
for (const droughtIntensity of ['moderate', 'severe', 'extreme']) for (const soilType of ['clay', 'sandy'])
  for (const waterSupply of ['rainfed', 'irrigated']) for (const stubbleRetention of [false, true]) for (const widerRows of [false, true])
    combinations.push({ droughtIntensity, soilType, waterSupply, adaptations: { stubbleRetention, widerRows } });
async function post(route, body) {
  const response = await worker.fetch(new Request(`https://qa.test${route}`, { method: 'POST', body: JSON.stringify(body) }));
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
async function exercise(scenario, farmAreaHa) {
  const p = await post('/api/simulation/project', { ...base, ...scenario, farmAreaHa });
  const result = await post('/api/results', { completedRun: { ...p.runDescriptor, completedDay: 84 } });
  assert.equal(p.samples.length, 85);
  for (const sample of p.samples) for (const key of ['rainfallIndex', 'soilWaterIndex', 'plantGrowthIndex'])
    assert.ok(Number.isFinite(sample[key]) && sample[key] >= 0 && sample[key] <= 100, key);
  assert.deepEqual(result.projection.projectedEnd, p.projection.projectedEnd);
  const { finalMetrics: m, yieldDiagnostics: d } = result;
  close(m.referenceYieldTPerHa, 3 * (1 - result.assumptions.baseDroughtLoss[scenario.droughtIntensity] * d.conditionFactor));
  close(m.finalYieldTPerHa, m.referenceYieldTPerHa * wideRowMultiplier(m.referenceYieldTPerHa, scenario.adaptations.widerRows));
  for (const [metric, adaptations] of [[m, scenario.adaptations], ...result.comparisons.map(c => [c.metrics, c.adaptations])]) {
    for (const key of ['farmAreaHa', 'normalYieldTPerHa', 'droughtBaselineYieldTPerHa', 'referenceYieldTPerHa', 'finalYieldTPerHa', 'wideRowMultiplier', 'normalProductionT', 'droughtBaselineProductionT', 'finalProductionT', 'cropSavedT', 'yieldLossPercent', 'revenueAfterDroughtAud', 'grossValueProtectedAud', 'strategyCostAud', 'netBenefitAud'])
      assert.ok(typeof metric[key] === 'number' && Number.isFinite(metric[key]), key);
    assert.ok(metric.finalYieldTPerHa >= 0 && metric.finalYieldTPerHa <= 3);
    assert.ok(metric.finalProductionT >= 0 && metric.yieldLossPercent >= 0 && metric.yieldLossPercent <= 100);
    close(metric.strategyCostAud, farmAreaHa * ((adaptations.stubbleRetention ? 6 : 0) + (adaptations.widerRows ? 2.4 : 0)));
    close(metric.normalProductionT, 3 * farmAreaHa);
    close(metric.droughtBaselineProductionT, metric.droughtBaselineYieldTPerHa * farmAreaHa);
    close(metric.finalProductionT, metric.finalYieldTPerHa * farmAreaHa);
    close(metric.cropSavedT, metric.finalProductionT - metric.droughtBaselineProductionT);
    close(metric.revenueAfterDroughtAud, metric.finalProductionT * 350);
    close(metric.grossValueProtectedAud, metric.cropSavedT * 350);
    close(metric.netBenefitAud, metric.grossValueProtectedAud - metric.strategyCostAud);
  }
  for (const selected of [[], ['stubble'], ['wider', 'combined'], ['stubble', 'wider', 'combined', 'stubble']]) {
    const displayed = buildDisplayedResultsScenarios(result, selected);
    assert.equal(new Set(displayed.chartScenarios.map(s => s.id)).size, displayed.chartScenarios.length);
    assert.equal(displayed.chartScenarios.filter(s => s.id === 'drought').length, 1);
    for (let i = 1; i < displayed.chartScenarios.length; i++) assert.ok(displayed.chartScenarios[i-1].value >= displayed.chartScenarios[i].value);
    const html = renderYieldComparisonStep(result, selected);
    for (const s of displayed.tableScenarios) {
      assert.ok(html.includes(yieldLabel(s.metrics.finalYieldTPerHa)));
      assert.ok(html.includes(moneyLabel(s.metrics.netBenefitAud, true)));
      assert.ok(html.includes(tonnes(s.metrics.cropSavedT, true)));
    }
    const context = buildScenarioInsightContext(result, selected);
    assert.equal(context.current.cropSavedT, m.cropSavedT);
    assert.equal(context.current.netBenefitAud, m.netBenefitAud);
    assert.equal(context.rankings.highestNetBenefitScenario.netBenefitAud, Math.max(...context.scenarios.map(s => s.netBenefitAud)));
    const text = deterministicScenarioInsights(context);
    for (const key of ['insight1', 'insight2', 'insight3', 'recommendation']) assert.ok(text[key]?.length > 20);
    assert.match(text.recommendation, /^For this simulated scenario/);
    assert.doesNotMatch(JSON.stringify(text), /NaN|undefined|Infinity|guaranteed|official NSW forecast/);
    if (m.cropSavedT < -.005) assert.doesNotMatch(text.insight1, /protected [\d.]+ t/);
    if (m.netBenefitAud < -1) assert.doesNotMatch(text.insight2, /in positive net benefit/);
  }
  return { scenario, farmAreaHa, startingIndices: p.projection.baseline, endingIndices: p.projection.projectedEnd, metrics: m, yieldDiagnostics: d };
}

test('release candidate: all 48 configurations × seven areas through projection and Results APIs', async () => {
  const rows = [];
  for (const scenario of combinations) {
    let perHa;
    for (const area of areas) {
      const row = await exercise(scenario, area);
      perHa ||= row.metrics;
      close(row.metrics.finalYieldTPerHa, perHa.finalYieldTPerHa);
      for (const key of ['normalProductionT', 'droughtBaselineProductionT', 'finalProductionT', 'cropSavedT', 'strategyCostAud', 'grossValueProtectedAud', 'netBenefitAud']) close(row.metrics[key], perHa[key] * area);
      rows.push(row);
    }
  }
  assert.equal(rows.length, 336);
  if (process.env.QA_REPORT_PATH) await writeFile(process.env.QA_REPORT_PATH, JSON.stringify({ configurations: 48, areas, cases: rows.length, rows }, null, 2) + '\n');
});

test('release candidate: 200 seeded fractional-area configurations preserve scaling and finite results', async () => {
  let seed = 20261004;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 100; i++) {
    const scenario = combinations[Math.floor(random() * combinations.length)];
    const area = Math.round((1 + random() * 4998) * 100) / 100;
    const a = await exercise(scenario, area), b = await exercise(scenario, area * 2);
    close(a.metrics.finalYieldTPerHa, b.metrics.finalYieldTPerHa);
    for (const key of ['finalProductionT', 'cropSavedT', 'strategyCostAud', 'grossValueProtectedAud', 'netBenefitAud']) close(a.metrics[key] * 2, b.metrics[key]);
  }
});

test('release candidate: crossover is smooth and signed rounding never invents a positive zero', () => {
  for (const [y, expected] of [[1, 1.03], [2, .975], [4, .9525], [6, .9433]]) close(wideRowMultiplier(y), expected);
  for (const y of [1.50, 1.54, 1.545, 1.55, 1.60]) {
    close(wideRowMultiplier(y), 1.03 - (y - 1) * .055);
    assert.ok(Math.abs(wideRowMultiplier(y + 1e-6) - wideRowMultiplier(y - 1e-6)) < 1e-6);
  }
  close(wideRowMultiplier(1 + .03 / .055), 1);
  assert.equal(tonnes(.0001, true), '0 t');
  assert.equal(tonnes(-.0001, true), '0 t');
  assert.equal(moneyLabel(.1, true), '$0');
});

test('release candidate: malformed completed runs cannot return plausible Results', async () => {
  const p = await post('/api/simulation/project', { ...base, ...combinations[0], farmAreaHa: 100 });
  const valid = { ...p.runDescriptor, completedDay: 84 };
  const invalid = [
    { ...valid, farmAreaHa: undefined }, { ...valid, farmAreaHa: NaN },
    { ...valid, farmAreaHa: Infinity }, { ...valid, farmAreaHa: '100' },
    { ...valid, scenario: { ...valid.scenario, adaptations: { stubbleRetention: 'false', widerRows: 0 } } },
    { ...valid, baselineIdentity: { ...valid.baselineIdentity, sourceChecksums: { tampered: '0'.repeat(64) } } },
    { ...valid, baselineIdentity: { ...valid.baselineIdentity, snapshotDate: '2020-01-01' } },
    { ...valid, assumptionsVersion: 'obsolete' }, { ...valid, resultsModelVersion: 'obsolete' },
  ];
  for (const completedRun of invalid) {
    const response = await worker.fetch(new Request('https://qa.test/api/results', { method: 'POST', body: JSON.stringify({ completedRun }) }));
    assert.ok(response.status >= 400 && response.status < 500);
    const error = await response.json();
    assert.ok(error.detail);
    assert.equal(error.finalMetrics, undefined);
  }
});
