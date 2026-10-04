import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { createWorker } from '../src/backend/worker.js';
import { createCdiRepository } from '../src/backend/data/cdi-repository.js';
import { lookupBaseline } from '../src/backend/services/cdi-lookup-service.js';
import { projectScenario, sampleProjection } from '../src/backend/simulation/project-scenario.js';
import { createRunDescriptor, calculateRunResults } from '../src/backend/results/results-service.js';
import { validateResultsResponse } from '../src/shared/results-contract.js';
import { loadResults } from '../src/frontend/services/results-client.js';
import { renderFinalKeyMetrics } from '../src/frontend/components/results/final-key-metrics.js';
import { renderYieldComparisonStep } from '../src/frontend/components/results/yield-comparison-step.js';
import { renderAISummaryStep } from '../src/frontend/components/results/ai-summary-step.js';
import { moneyLabel } from '../src/frontend/components/results/results-format.js';

const dataset = JSON.parse(await readFile(new URL('../src/backend/data/cdi-repository.json', import.meta.url)));
const worker = createWorker(dataset, {});
const repository = createCdiRepository(dataset);
const requestInput = { location: { latitude: -35.115, longitude: 147.3677778, displayName: 'Wagga Wagga NSW 2650' },
  simulationStartDate: '2026-10-04', droughtIntensity: 'severe', soilType: 'clay', waterSupply: 'rain-fed', farmAreaHa: 100,
  adaptations: { stubbleRetention: false, widerRows: true } };
const post = (path, body, server = worker) => server.fetch(new Request(`http://test${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const projected = await (await post('/api/simulation/project', requestInput)).json();
const run = { ...projected.runDescriptor, completedDay: 84 };
const result = await calculateRunResults(repository, run);

test('server Results reproduces official projection and all comparisons, ignoring request-side assumptions', async () => {
  const response = await post('/api/results', { completedRun: run, normalYieldTPerHa: 1000, wheatPriceAudPerTonne: 9000, strategyCosts: { widerRowsCostPerHa: 0 } });
  assert.equal(response.status, 200);
  const body = await response.json();
  validateResultsResponse(body);
  assert.equal(body.assumptions.normalYieldTPerHa, 3);
  assert.equal(body.assumptions.wheatPriceAudPerTonne, 350);
  assert.deepEqual(body.projection.projectedEnd, projected.projection.projectedEnd);
  assert.equal(body.baselineCDI.snapshotDate, '2026-08-31');
  assert.deepEqual(body.finalMetrics, body.comparisons.find(c => c.id === 'wider').metrics);
  assert.ok(body.finalMetrics.cropSavedT < 0);
  assert.equal(body.finalMetrics.netBenefitAud, body.finalMetrics.grossValueProtectedAud - 240);
  assert.ok(body.finalMetrics.netBenefitAud < 0);
  assert.equal(body.finalMetrics.strategyCostAud, 240);
  assert.equal(body.finalMetrics.costStatus, 'research-informed-scenario-assumption');
  assert.equal(body.finalMetrics.costBasis[0].basis, 'representative annualised equipment/setup allowance');
  assert.equal(body.finalMetrics.farmAreaHa, 100);
  const noneProjection = await (await post('/api/simulation/project', { ...requestInput, adaptations: { stubbleRetention: false, widerRows: false } })).json();
  const none = await calculateRunResults(repository, { ...noneProjection.runDescriptor, completedDay: 84 });
  assert.equal(none.finalMetrics.netBenefitAud, 0);
  assert.equal(none.finalMetrics.strategyCostAud, 0);
  assert.equal(none.finalMetrics.cropSavedT, 0);
});

test('missing, incomplete, invalid area, incompatible versions and tampered indices do not render numbers', async () => {
  const cases = [
    [null, 400, 'missing-completed-run'],
    [{ ...run, completedDay: 42 }, 400, 'incomplete-run'],
    [{ ...run, farmAreaHa: 0 }, 400, 'invalid-results-input'],
    [{ ...run, farmAreaHa: '100' }, 400, 'invalid-results-input'],
    [{ ...run, contractVersion: 'old' }, 409, 'incompatible-run'],
    [{ ...run, simulationModelVersion: 'old' }, 409, 'stale-model-or-assumptions'],
    [{ ...run, resultsModelVersion: 'old' }, 409, 'stale-model-or-assumptions'],
    [{ ...run, assumptionsVersion: 'old' }, 409, 'stale-model-or-assumptions'],
    [{ ...run, configurationIdentity: 'f'.repeat(64) }, 409, 'stale-model-or-assumptions'],
    [{ ...run, baselineIdentity: null }, 400, 'missing-baseline-identity'],
    [{ ...run, officialStartingIndices: { ...run.officialStartingIndices, soilWaterIndex: 1 } }, 409, 'run-reproduction-mismatch'],
    [{ ...run, projectedEnd: { ...run.projectedEnd, plantGrowthIndex: 70 } }, 409, 'run-reproduction-mismatch'],
    [{ ...run, projectedEnd: { ...run.projectedEnd, soilWaterIndex: null } }, 400, 'invalid-results-input']
  ];
  for (const [completedRun, status, error] of cases) {
    const response = await post('/api/results', { completedRun });
    assert.equal(response.status, status, error);
    const body = await response.json();
    assert.equal(body.error, error);
    assert.equal(body.finalMetrics, undefined);
  }
});

test('updated dataset snapshot/checksum and missing official baseline are explicit errors', async () => {
  const newer = structuredClone(dataset);
  newer.snapshots[0].snapshotDate = '2026-09-30';
  const response = await post('/api/results', { completedRun: run }, createWorker(newer, {}));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'stale-cdi-snapshot');
  const changed = structuredClone(dataset);
  changed.snapshots[0].source.checksums['20260831_edisbyParish.csv'] = 'e'.repeat(64);
  assert.equal((await post('/api/results', { completedRun: run }, createWorker(changed, {}))).status, 409);
  const absent = await post('/api/results', { completedRun: run }, createWorker({ snapshots: [] }, {}));
  assert.equal(absent.status, 422);
  assert.equal((await absent.json()).error, 'official-baseline-unavailable');
});

test('method/size/JSON errors and new projection hectares validation', async () => {
  assert.equal((await worker.fetch(new Request('http://test/api/results'))).status, 405);
  assert.equal((await worker.fetch(new Request('http://test/api/results', { method: 'POST', body: '{' }))).status, 400);
  assert.equal((await worker.fetch(new Request('http://test/api/results', { method: 'POST', body: ' '.repeat(10001) }))).status, 413);
  assert.equal((await post('/api/simulation/project', { ...requestInput, farmAreaHa: null })).status, 400);
  const legacy = { ...requestInput }; delete legacy.farmAreaHa;
  assert.equal((await (await post('/api/simulation/project', legacy)).json()).runDescriptor, null);
});

test('zero starting SWI yields an explicit unavailable calibration instead of a fabricated yield', async () => {
  const baselineCDI = lookupBaseline(repository, requestInput).baselineCDI;
  const zeroBaseline = { ...baselineCDI, soilWaterIndex: 0 };
  const projection = projectScenario({ baselineCDI: zeroBaseline, ...run.scenario });
  const zeroRun = { ...await createRunDescriptor(zeroBaseline, projection, 100), completedDay: 84 };
  const zeroRepo = { latestOnOrBefore: () => {
    const snapshot = structuredClone(dataset.snapshots[0]);
    snapshot.areas.find(area => area.id === baselineCDI.spatialArea.id).soilWaterIndex = 0;
    return snapshot;
  } };
  await assert.rejects(calculateRunResults(zeroRepo, zeroRun), { code: 'yield-assumption-unavailable' });
});

test('rain/irrigation wetness and arbitrary replay order leave SWI and final Results unchanged', async () => {
  const bundled = await build({ stdin: { contents: `export { createWaterPlayback } from './src/frontend/scene/water-playback'; export { layerMoistureAt } from './src/frontend/scene/layer-moisture-presentation';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
  const { createWaterPlayback, layerMoistureAt } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  for (const waterSupply of ['rain-fed', 'irrigated']) {
    const data = await (await post('/api/simulation/project', { ...requestInput, waterSupply })).json();
    const completed = { ...data.runDescriptor, completedDay: 84 };
    const before = JSON.stringify(data);
    const beforeResults = await calculateRunResults(repository, completed);
    const playback = createWaterPlayback(data.samples, data.projection.scenario);
    for (const kind of ['rain', ...(waterSupply === 'irrigated' ? ['irrigation'] : [])]) {
      const event = playback.events.find(e => e.kind === kind);
      assert.ok(event);
      const day = event.start + 2;
      assert.ok(playback.at(day).moisture.topsoil > layerMoistureAt(data.samples, day).topsoil);
    }
    for (const day of [84, 0, 46, 8, 34, 0, 84, 12, 62, 84]) playback.at(day);
    assert.equal(JSON.stringify(data), before);
    assert.deepEqual(await calculateRunResults(repository, completed), beforeResults);
  }
});

test('Results render production units, signed negatives, scenario costs, unavailable fallback and no positive badge', () => {
  const html = renderFinalKeyMetrics(result);
  assert.match(html, /Final Production/);
  assert.doesNotMatch(html, /Final Yield|positive-pill|Positive result|NaN|undefined/);
  assert.match(html, /−[\d,.]+ t/);
  assert.match(html, /actual farm costs vary/);
  assert.match(html, /\$240/);
  assert.match(html, /−\$2,320/);
  assert.doesNotMatch(html, /Validated selected implementation cost|awaiting validation/);
  const unavailable = structuredClone(result);
  unavailable.finalMetrics.costStatus = 'unavailable';
  unavailable.finalMetrics.strategyCostAud = null;
  unavailable.finalMetrics.netBenefitAud = null;
  assert.match(renderFinalKeyMetrics(unavailable), /Implementation cost is unavailable/);
  assert.equal(moneyLabel(-4100, true), '−$4,100');
  assert.equal(moneyLabel(4100, true), '+$4,100');
  const syntheticKnownCosts = structuredClone(result);
  syntheticKnownCosts.finalMetrics.netBenefitAud = -2500;
  syntheticKnownCosts.finalMetrics.strategyCostAud = 1000;
  syntheticKnownCosts.finalMetrics.costStatus = 'available';
  assert.match(renderFinalKeyMetrics(syntheticKnownCosts), /−\$2,500/);
  const chart = renderYieldComparisonStep(result, ['stubble', 'combined']);
  assert.match(chart, /t\/ha/);
  assert.match(chart, /whole-farm t/);
  assert.doesNotMatch(chart, /Illustrative demo|100t|NaN/);
  assert.notEqual(renderAISummaryStep(result, ['stubble']), renderAISummaryStep(result, ['combined']));
  const missing = renderFinalKeyMetrics(null, 'Complete a simulation');
  assert.match(missing, /disabled/);
  assert.doesNotMatch(missing, /26,600|NaN/);
});

test('Results client rejects invalid stored run/API data without fixture fallback', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify(result), { status: 200 }); };
    await assert.rejects(loadResults(null), /Complete a simulation/);
    assert.equal(calls, 0);
    assert.deepEqual(await loadResults(run), result);
    const broken = structuredClone(result); broken.finalMetrics.finalProductionT = null;
    globalThis.fetch = async () => new Response(JSON.stringify(broken), { status: 200 });
    await assert.rejects(loadResults(run), /finite number/);
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Stale run' }), { status: 409 });
    await assert.rejects(loadResults(run), /Stale run/);
  } finally { globalThis.fetch = originalFetch; }
});
