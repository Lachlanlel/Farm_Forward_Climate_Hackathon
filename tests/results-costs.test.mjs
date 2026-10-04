import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCdiRepository } from '../src/backend/data/cdi-repository.js';
import { lookupBaseline } from '../src/backend/services/cdi-lookup-service.js';
import { projectScenario } from '../src/backend/simulation/project-scenario.js';
import { createRunDescriptor, calculateRunResults } from '../src/backend/results/results-service.js';
import { RESULTS_ASSUMPTIONS, STUBBLE_RETENTION_COST_AUD_PER_HA, WIDER_ROWS_COST_AUD_PER_HA } from '../src/backend/results/assumptions.js';
import { validateResultsResponse } from '../src/shared/results-contract.js';
import { renderFinalKeyMetrics } from '../src/frontend/components/results/final-key-metrics.js';

const repository = createCdiRepository(JSON.parse(await readFile(new URL('../src/backend/data/cdi-repository.json', import.meta.url))));
const baselineCDI = lookupBaseline(repository, { location: { latitude: -35.115, longitude: 147.3677778, displayName: 'Wagga Wagga NSW 2650' }, simulationStartDate: '2026-10-04' }).baselineCDI;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
async function results(stubbleRetention, widerRows, farmAreaHa = 100, droughtIntensity = 'severe', soilType = 'clay') {
  const projection = projectScenario({ baselineCDI, droughtIntensity, soilType, waterSupply: 'rainfed', adaptations: { stubbleRetention, widerRows } });
  return calculateRunResults(repository, { ...await createRunDescriptor(baselineCDI, projection, farmAreaHa), completedDay: 84 });
}

test('configured strategy allowances, sum, no-adaptation zero and selected cost bases', async () => {
  assert.equal(STUBBLE_RETENTION_COST_AUD_PER_HA, 6);
  assert.equal(WIDER_ROWS_COST_AUD_PER_HA, 2.4);
  assert.equal(RESULTS_ASSUMPTIONS.costBasis.wider.calculation.annualDepreciationAndInterestAud / RESULTS_ASSUMPTIONS.costBasis.wider.calculation.annualUtilisationHa, 2.4);
  for (const [stubble, wider, expected] of [[false, false, 0], [true, false, 600], [false, true, 240], [true, true, 840]]) {
    const data = await results(stubble, wider), m = data.finalMetrics;
    close(m.strategyCostAud, expected);
    close(m.netBenefitAud, m.cropSavedT * 350 - expected);
    assert.equal(m.costStatus, expected ? 'research-informed-scenario-assumption' : 'not-applicable');
    assert.deepEqual(m.costBasis.map(b => b.strategyId), [...(stubble ? ['stubble-retention'] : []), ...(wider ? ['wider-rows'] : [])]);
    for (const b of m.costBasis) {
      assert.equal(b.status, 'research-informed-scenario-assumption');
      assert.equal(b.basis, b.strategyId === 'stubble-retention' ? 'representative residue-management allowance' : 'representative annualised equipment/setup allowance');
    }
    if (!expected) { assert.equal(m.cropSavedT, 0); assert.equal(m.netBenefitAud, 0); }
    assert.ok(data.comparisons.every(c => typeof c.metrics.netBenefitAud === 'number'));
    validateResultsResponse(data);
  }
});

test('hectares scale implementation cost, production and incremental financial values without changing yield or indices', async () => {
  for (const [stubble, wider] of [[true, false], [false, true], [true, true]]) {
    const a = await results(stubble, wider, 100), b = await results(stubble, wider, 200);
    assert.deepEqual(a.projection, b.projection);
    close(a.finalMetrics.finalYieldTPerHa, b.finalMetrics.finalYieldTPerHa);
    assert.deepEqual(a.finalMetrics.costBasis, b.finalMetrics.costBasis);
    for (const key of ['normalProductionT', 'droughtBaselineProductionT', 'finalProductionT', 'cropSavedT', 'strategyCostAud', 'grossValueProtectedAud', 'netBenefitAud', 'revenueAfterDroughtAud']) close(b.finalMetrics[key], a.finalMetrics[key] * 2);
  }
});

test('Severe clay rainfed wider-only preserves full-precision losses after the 240 AUD allowance', async () => {
  const data = await results(false, true), m = data.finalMetrics;
  close(m.referenceYieldTPerHa, 2.19);
  close(m.finalYieldTPerHa, 2.130568875);
  close(m.cropSavedT, -5.9431125);
  close(m.grossValueProtectedAud, -2080.089375);
  close(m.strategyCostAud, 240);
  close(m.netBenefitAud, -2320.089375);
  assert.notEqual(m.netBenefitAud, m.revenueAfterDroughtAud - m.strategyCostAud);
  const html = renderFinalKeyMetrics(data);
  assert.match(html, /−5\.94 t/);
  assert.match(html, /−\$2,320/);
  assert.match(html, /\$2\.40\/ha representative annualised equipment\/setup allowance/);
  assert.doesNotMatch(html, /Positive result|positive-pill/);
});

test('Extreme sandy rainfed wider-only retains positive incremental value after the 240 AUD allowance', async () => {
  const data = await results(false, true, 100, 'extreme', 'sandy'), m = data.finalMetrics;
  // Fixed official Wagga baseline and the accepted calibrated yield: independent golden values.
  close(m.referenceYieldTPerHa, 1.263836140360405);
  close(m.finalYieldTPerHa, 1.2834117138585797);
  close(m.cropSavedT, 1.9575573498174634);
  close(m.grossValueProtectedAud, 685.1450724361122);
  close(m.strategyCostAud, 240);
  close(m.netBenefitAud, 445.1450724361122);
  assert.ok(m.cropSavedT > 0);
  assert.ok(m.netBenefitAud > 445 && m.netBenefitAud < 447);
  assert.match(renderFinalKeyMetrics(data), /\+\$445/);
});

test('scenario costs require complete basis metadata and former assumption-version runs are rejected', async () => {
  const data = await results(false, true);
  for (const mutate of [d => d.finalMetrics.costBasis = [], d => d.finalMetrics.costBasis[0].valueAudPerHa = NaN, d => d.finalMetrics.costBasis[0].basis = '']) {
    const bad = structuredClone(data); mutate(bad); assert.throws(() => validateResultsResponse(bad));
  }
  await assert.rejects(calculateRunResults(repository, { ...data.run, assumptionsVersion: '2026-10-04-v1' }), { code: 'stale-model-or-assumptions' });
});
