import test from 'node:test';
import assert from 'node:assert/strict';
import { projectScenario, sampleProjection, projectedCondition } from '../src/backend/simulation/project-scenario.js';
import { FARM_FORWARD_MODEL_V1 } from '../src/backend/simulation/farm-forward-model-v1.js';

const baselineCDI = Object.freeze({ official: true, rainfallIndex: 41.9, soilWaterIndex: 50.4, plantGrowthIndex: 58.1, cdiPhase: 'Recovery' });
const make = (patch = {}) => projectScenario({ baselineCDI, droughtIntensity: 'severe', soilType: 'clay', waterSupply: 'rain-fed', adaptations: { stubbleRetention: false, widerRows: false }, ...patch });
const rounded = result => Object.values(result.projectedEnd).map(value => Number(value.toFixed(1)));

test('Wagga Week-12 drought severity regression', () => {
  assert.deepEqual(rounded(make({ droughtIntensity: 'moderate' })), [20, 27.5, 36.5]);
  assert.deepEqual(rounded(make()), [5, 11.8, 16.7]);
  assert.deepEqual(rounded(make({ droughtIntensity: 'extreme' })), [2, 7.3, 8.1]);
  assert.deepEqual([baselineCDI.rainfallIndex, baselineCDI.soilWaterIndex, baselineCDI.plantGrowthIndex], [41.9, 50.4, 58.1]);
});

test('soil, water, stubble and wider-row effects follow v1 boundaries', () => {
  assert.deepEqual(rounded(make({ adaptations: { stubbleRetention: true, widerRows: false } })), [5, 17.6, 19.9]);
  assert.deepEqual(rounded(make({ soilType: 'sandy' })), [5, 3.2, 12]);
  assert.deepEqual(rounded(make({ waterSupply: 'irrigated' })), [5, 25.3, 24.2]);
  assert.deepEqual(rounded(make({ waterSupply: 'irrigated', adaptations: { stubbleRetention: true, widerRows: false } })), [5, 29.1, 26.3]);
  assert.deepEqual(make({ adaptations: { stubbleRetention: false, widerRows: true } }).projectedEnd, make().projectedEnd);
  assert.equal(FARM_FORWARD_MODEL_V1.adaptations.widerRows.costStatus, 'placeholder');
  assert.equal(FARM_FORWARD_MODEL_V1.adaptations.widerRows.directImplementationCostPerHa, 0);
});

test('master-day sample starts official and reaches exact projection endpoint', () => {
  const projection = make();
  assert.deepEqual({ ...sampleProjection(projection, 0) }, { simulationDay: 0, ...projection.baseline });
  assert.deepEqual({ ...sampleProjection(projection, 84) }, { simulationDay: 84, ...projection.projectedEnd });
  assert.equal(sampleProjection(projection, 42).rainfallIndex, (41.9 + 5) / 2);
  assert.equal(projectedCondition(sampleProjection(projection, 84)), 'Drought Affected-like');
  assert.equal(projection.playbackDurationSeconds, 24);
});

test('missing or fabricated official indices cannot enter the projection', () => {
  assert.throws(() => make({ baselineCDI: { ...baselineCDI, plantGrowthIndex: null } }), /official NSW CDI/);
  assert.throws(() => make({ baselineCDI: { ...baselineCDI, official: false } }), /official NSW CDI/);
  assert.throws(() => make({ soilType: 'unknown' }), /Valid drought/);
});
