import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWideRowAdjustment, wideRowMultiplier, referenceYieldFromSwiLoss } from '../src/backend/results/yield-model.js';
import { calculateResults } from '../src/backend/results/economics.js';
import { RESULTS_ASSUMPTIONS } from '../src/backend/results/assumptions.js';
import { projectScenario, sampleProjection } from '../src/backend/simulation/project-scenario.js';
import { FARM_FORWARD_MODEL_V1 as model } from '../src/backend/simulation/farm-forward-model-v1.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const economicsInput = patch => ({ farmAreaHa: 100, normalYieldTPerHa: 3, droughtReferenceYieldTPerHa: 2.1,
  adaptedReferenceYieldTPerHa: 2.1, wheatPriceAudPerTonne: 350,
  adaptations: { stubbleRetention: false, widerRows: true }, strategyCosts: { stubbleCostPerHa: null, widerRowsCostPerHa: null }, ...patch });
const baseline = Object.freeze({ official: true, rainfallIndex: 41.9, soilWaterIndex: 50.4, plantGrowthIndex: 58.1 });
const yieldFor = p => referenceYieldFromSwiLoss(3, p.baseline.soilWaterIndex, p.projectedEnd.soilWaterIndex, p.scenario.droughtIntensity, RESULTS_ASSUMPTIONS.baseDroughtLoss);

test('wide-row evidence points, interpolation, endpoint caps, signed trade-off and crossover', () => {
  for (const [reference, expected] of [[1, 1.03], [2, 1.95], [4, 3.81], [6, 5.6598], [3, 2.89125]]) close(applyWideRowAdjustment(reference), expected);
  close(wideRowMultiplier(3), .96375);
  close(wideRowMultiplier(1 + .03 / .055), 1);
  assert.ok(applyWideRowAdjustment(1.35) > 1.35);
  assert.ok(applyWideRowAdjustment(2.1) < 2.1);
  for (const n of [0, .01, .5, 1, 3, 6, 8, 100]) {
    close(applyWideRowAdjustment(n, false), n);
    close(wideRowMultiplier(n, false), 1);
    if (n < 1) close(wideRowMultiplier(n), 1.03);
    if (n > 6) close(wideRowMultiplier(n), .9433);
  }
  for (const n of [-1, NaN, Infinity, null, '3']) assert.throws(() => applyWideRowAdjustment(n));
  assert.throws(() => applyWideRowAdjustment(2, 'true'));
});

test('severity SWI-loss calibration uses raw max/decline rule, bounds and no PGI ratio', () => {
  const losses = RESULTS_ASSUMPTIONS.baseDroughtLoss;
  for (const [severity, expected] of [['moderate', 2.55], ['severe', 2.1], ['extreme', 1.35]]) {
    const raw = Math.max(50.4 - model.drought[severity].soilWaterTarget, 50.4 * model.drought[severity].minimumDecline);
    const output = referenceYieldFromSwiLoss(3, 50.4, 50.4 - raw, severity, losses);
    close(output.referenceYieldTPerHa, expected);
    close(output.conditionFactor, 1);
  }
  const low = referenceYieldFromSwiLoss(3, 5, 4.55, 'severe', losses);
  close(low.rawSeveritySWILoss, .5);
  close(low.conditionFactor, .9);
  close(low.referenceYieldTPerHa, 2.19);
  close(referenceYieldFromSwiLoss(3, 1, 0, 'moderate', losses).referenceYieldTPerHa, 0);
  close(referenceYieldFromSwiLoss(3, 1, 2, 'moderate', losses).referenceYieldTPerHa, 3);
  assert.throws(() => referenceYieldFromSwiLoss(3, 0, 0, 'extreme', losses), /Zero raw/);
  for (const invalid of [null, 0, NaN, Infinity, -3]) assert.throws(() => referenceYieldFromSwiLoss(invalid, 50, 25, 'severe', losses));
  assert.throws(() => referenceYieldFromSwiLoss(3, 50, 25, 'severe', {}));
});

test('48 scenarios preserve official SWI, multiplicative protection, and yield through SWI only', () => {
  for (const droughtIntensity of ['moderate', 'severe', 'extreme']) for (const soilType of ['clay', 'sandy'])
    for (const waterSupply of ['rainfed', 'irrigated']) for (const stubbleRetention of [false, true]) {
      const input = { baselineCDI: baseline, droughtIntensity, soilType, waterSupply, adaptations: { stubbleRetention, widerRows: false } };
      const p = projectScenario(input);
      const wide = projectScenario({ ...input, adaptations: { stubbleRetention, widerRows: true } });
      assert.deepEqual(p.projectedEnd, wide.projectedEnd);
      assert.equal(sampleProjection(p, 0).soilWaterIndex, baseline.soilWaterIndex);
      const raw = Math.max(baseline.soilWaterIndex - model.drought[droughtIntensity].soilWaterTarget, baseline.soilWaterIndex * model.drought[droughtIntensity].minimumDecline);
      const expectedSWI = Math.max(0, baseline.soilWaterIndex - raw * model.soil[soilType].waterLossMultiplier * (waterSupply === 'irrigated' ? .65 : 1) * (stubbleRetention ? .85 : 1));
      close(p.projectedEnd.soilWaterIndex, expectedSWI);
      for (let day = 0; day <= 84; day++) assert.ok(sampleProjection(p, day).soilWaterIndex >= 0 && sampleProjection(p, day).soilWaterIndex <= 100);
      const outcome = yieldFor(p);
      const sameSWIWithOtherPGI = projectScenario({ ...input, baselineCDI: { ...baseline, plantGrowthIndex: 2, rainfallIndex: 2 } });
      close(yieldFor(sameSWIWithOtherPGI).referenceYieldTPerHa, outcome.referenceYieldTPerHa);
      close(outcome.referenceYieldTPerHa, Math.max(0, Math.min(3, 3 * (1 - RESULTS_ASSUMPTIONS.baseDroughtLoss[droughtIntensity] * (baseline.soilWaterIndex - expectedSWI) / raw))));
      assert.ok(outcome.referenceYieldTPerHa >= 0 && outcome.referenceYieldTPerHa <= 3);
      const sand = projectScenario({ ...input, soilType: 'sandy' });
      const irrigated = projectScenario({ ...input, waterSupply: 'irrigated' });
      const stubble = projectScenario({ ...input, adaptations: { stubbleRetention: true, widerRows: false } });
      assert.ok(sand.projectedEnd.soilWaterIndex <= p.projectedEnd.soilWaterIndex);
      assert.ok(irrigated.projectedEnd.soilWaterIndex >= p.projectedEnd.soilWaterIndex);
      assert.ok(stubble.projectedEnd.soilWaterIndex >= p.projectedEnd.soilWaterIndex);
    }
  close(1 - .65 * .85, .4475);
});

test('production scales with hectares; wide rows can produce negative saved crop and net benefit', () => {
  // Synthetic costs test arithmetic only; these are not default/validated costs.
  const a = calculateResults(economicsInput({ strategyCosts: { stubbleCostPerHa: null, widerRowsCostPerHa: 5 } }));
  const b = calculateResults(economicsInput({ farmAreaHa: 200, strategyCosts: { stubbleCostPerHa: null, widerRowsCostPerHa: 5 } }));
  close(a.finalYieldTPerHa, b.finalYieldTPerHa);
  for (const key of ['normalProductionT', 'droughtBaselineProductionT', 'finalProductionT', 'cropSavedT', 'strategyCostAud', 'netBenefitAud', 'revenueAfterDroughtAud']) close(b[key], 2 * a[key]);
  assert.ok(a.cropSavedT < 0);
  assert.ok(a.netBenefitAud < 0);
  close(a.netBenefitAud, a.cropSavedT * 350 - 500);
  assert.notEqual(a.netBenefitAud, a.revenueAfterDroughtAud - a.strategyCostAud);
});

test('unknown selected costs stay null; no adaptation has no cost; zero costs can be explicitly provided', () => {
  const unknown = calculateResults(economicsInput());
  assert.equal(unknown.strategyCostAud, null);
  assert.equal(unknown.netBenefitAud, null);
  assert.deepEqual(unknown.missingCostStrategies, ['wider-rows']);
  const none = calculateResults(economicsInput({ adaptations: { stubbleRetention: false, widerRows: false } }));
  assert.equal(none.costStatus, 'not-applicable');
  assert.equal(none.strategyCostAud, 0);
  assert.equal(none.netBenefitAud, 0);
  const known = calculateResults(economicsInput({ strategyCosts: { stubbleCostPerHa: null, widerRowsCostPerHa: 0 } }));
  assert.equal(known.costStatus, 'available');
  assert.equal(known.strategyCostAud, 0);
  assert.ok(known.netBenefitAud < 0);
  const combined = calculateResults(economicsInput({ adaptations: { stubbleRetention: true, widerRows: true }, strategyCosts: { stubbleCostPerHa: 4, widerRowsCostPerHa: 6 } }));
  assert.equal(combined.strategyCostAud, 1000);
});

test('invalid inputs fail explicitly; above-reference output keeps negative yield loss', () => {
  for (const farmAreaHa of [null, 0, -1, 10001, NaN, Infinity, '100']) assert.throws(() => calculateResults(economicsInput({ farmAreaHa })));
  for (const key of ['normalYieldTPerHa', 'wheatPriceAudPerTonne']) for (const value of [null, 0, -1, NaN, Infinity]) assert.throws(() => calculateResults(economicsInput({ [key]: value })));
  for (const key of ['droughtReferenceYieldTPerHa', 'adaptedReferenceYieldTPerHa']) for (const value of [null, -1, NaN, Infinity]) assert.throws(() => calculateResults(economicsInput({ [key]: value })));
  assert.throws(() => calculateResults(economicsInput({ strategyCosts: { stubbleCostPerHa: -1, widerRowsCostPerHa: null } })));
  assert.throws(() => calculateResults(economicsInput({ strategyCosts: undefined })));
  assert.throws(() => calculateResults(economicsInput({ wheatPriceAudPerTonne: Number.MAX_VALUE })));
  const above = calculateResults(economicsInput({ normalYieldTPerHa: .5, adaptedReferenceYieldTPerHa: .5, droughtReferenceYieldTPerHa: .5 }));
  assert.equal(above.aboveNormalReference, true);
  assert.ok(above.yieldLossPercent < 0);
  assert.ok(above.cropSavedT > 0);
});
