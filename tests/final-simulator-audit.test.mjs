import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { projectScenario, sampleProjection, projectedCondition } from '../src/backend/simulation/project-scenario.js';
import { frameAtDay } from '../src/frontend/services/projection-client.js';
import { FARM_FORWARD_MODEL_V1 as model } from '../src/backend/simulation/farm-forward-model-v1.js';

const bundle = await build({ stdin: { contents: `
export { createWaterPlayback } from './src/frontend/scene/water-playback';
export { layerMoistureAt } from './src/frontend/scene/layer-moisture-presentation';
export { createCrackPlayback } from './src/frontend/scene/crack-playback';
export { EVAPORATION_DISPLAY } from './src/frontend/scene/evaporation-presentation';
export { SoilMoisture } from './src/frontend/scene/three/SoilMoisture';
export { createSoilCutaway } from './src/frontend/scene/three/SoilCutaway';
export { areaToVisualFootprint } from './src/frontend/scene/three/visualAdapter';
export { MoistureTransition } from './src/frontend/scene/three/soilMoisturePresentation';
export { adaptMoistureTransport } from './src/frontend/scene/three/soilMoistureTransport';
`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { createWaterPlayback, layerMoistureAt, createCrackPlayback, EVAPORATION_DISPLAY,
  SoilMoisture, createSoilCutaway, areaToVisualFootprint, MoistureTransition, adaptMoistureTransport } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const baseline = Object.freeze({ official: true, rainfallIndex: 41.9, soilWaterIndex: 50.4, plantGrowthIndex: 58.1 });
const scenarios = [];
for (const droughtIntensity of ['moderate', 'severe', 'extreme']) for (const soilType of ['clay', 'sandy'])
  for (const waterSupply of ['rainfed', 'irrigated']) for (const [stubbleRetention, widerRows] of [[false,false],[true,false],[false,true],[true,true]]) {
    const options = { droughtIntensity, soilType, waterSupply, adaptations: { stubbleRetention, widerRows } };
    const projection = projectScenario({ baselineCDI: baseline, ...options });
    const samples = Array.from({ length: 85 }, (_, day) => sampleProjection(projection, day));
    scenarios.push({ options, projection, samples, water: createWaterPlayback(samples, options) });
  }
const equivalent = (scenario, patch = {}, adaptations = {}) => scenarios.find(other => JSON.stringify(other.options) === JSON.stringify({
  ...scenario.options, ...patch, adaptations: { ...scenario.options.adaptations, ...adaptations }
}));

test('full 48-scenario matrix: daily model invariants, baseline immutability and no double benefits', () => {
  assert.equal(scenarios.length, 48);
  const original = JSON.stringify(baseline);
  for (const scenario of scenarios) {
    const { options, samples, projection } = scenario;
    assert.deepEqual(samples[0], { simulationDay: 0, rainfallIndex: 41.9, soilWaterIndex: 50.4, plantGrowthIndex: 58.1 });
    for (const [day, frame] of samples.entries()) {
      const clay = equivalent(scenario, { soilType: 'clay' }).samples[day];
      const irrigated = equivalent(scenario, { waterSupply: 'irrigated' }).samples[day];
      const covered = equivalent(scenario, {}, { stubbleRetention: true }).samples[day];
      const moderate = equivalent(scenario, { droughtIntensity: 'moderate' }).samples[day];
      const severe = equivalent(scenario, { droughtIntensity: 'severe' }).samples[day];
      const extreme = equivalent(scenario, { droughtIntensity: 'extreme' }).samples[day];
      const narrow = equivalent(scenario, {}, { widerRows: false }).samples[day];
      assert.ok(frame.soilWaterIndex <= clay.soilWaterIndex + 1e-10);
      assert.ok(frame.soilWaterIndex <= irrigated.soilWaterIndex + 1e-10);
      assert.ok(frame.soilWaterIndex <= covered.soilWaterIndex + 1e-10);
      assert.ok(extreme.soilWaterIndex <= severe.soilWaterIndex && severe.soilWaterIndex <= moderate.soilWaterIndex);
      assert.deepEqual(frame, narrow);
      const rainReference = scenarios.find(s => s.options.droughtIntensity === options.droughtIntensity).samples[day];
      assert.equal(frame.rainfallIndex, rainReference.rainfallIndex);
      for (const key of ['rainfallIndex','soilWaterIndex','plantGrowthIndex']) {
        assert.ok(Number.isFinite(frame[key]) && frame[key] >= 0 && frame[key] <= 100);
        if (day) assert.ok(frame[key] <= samples[day-1][key]);
      }
    }
    const severity = model.drought[options.droughtIntensity];
    const combined = 1 - (1 - (options.waterSupply === 'irrigated' ? .35 : 0)) * (1 - (options.adaptations.stubbleRetention ? .15 : 0));
    const expected = 50.4 - Math.max(50.4 - severity.soilWaterTarget, 50.4 * severity.minimumDecline) * model.soil[options.soilType].waterLossMultiplier * (1 - combined);
    assert.ok(Math.abs(projection.projectedEnd.soilWaterIndex - Math.max(0, expected)) < 1e-10);
    assert.equal(EVAPORATION_DISPLAY.demand[options.droughtIntensity], severity.evapDemandMultiplier);
  }
  assert.equal(JSON.stringify(baseline), original);
});

test('full 48-scenario matrix: production transport clocks, bounds, no overlapping sources and wetting suppresses evaporation', () => {
  for (const scenario of scenarios) {
    const before = JSON.stringify(scenario.samples);
    const cracks = createCrackPlayback(scenario.water, scenario.options.soilType);
    const narrow = equivalent(scenario, {}, { widerRows: false });
    for (let day = 0; day <= 84; day += .25) {
      const frame = scenario.water.at(day);
      assert.equal(frame.water.timeSeconds, day / 84 * 24);
      assert.ok(!(frame.water.rainfallRate > 0 && frame.water.irrigationRate > 0));
      if (scenario.options.waterSupply === 'rainfed') assert.equal(frame.water.irrigationRate, 0);
      if (frame.water.rainfallRate > 0 || frame.water.irrigationRate > 0) assert.equal(frame.evaporation.activity, 0);
      for (const value of Object.values(frame.moisture)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
      assert.deepEqual(frame, narrow.water.at(day));
      if (scenario.options.soilType === 'sandy') assert.equal(cracks.at(day), 0);
    }
    assert.equal(JSON.stringify(scenario.samples), before);
  }
});

test('all eight requested rounded Wagga regressions', () => {
  const rows = [
    ['moderate','clay','rainfed',false,[20,27.5,36.5]],
    ['moderate','clay','rainfed',true,[20,31,38]],
    ['severe','clay','rainfed',false,[5,11.8,16.7]],
    ['severe','clay','rainfed',true,[5,17.6,19.9]],
    ['severe','sandy','rainfed',false,[5,3.2,12]],
    ['severe','clay','irrigated',false,[5,25.3,24.2]],
    ['severe','clay','irrigated',true,[5,29.1,26.3]],
    ['extreme','clay','rainfed',false,[2,7.3,8.1]],
  ];
  for (const [severity,soil,water,stubble,expected] of rows) {
    const scenario = scenarios.find(({options:o}) => o.droughtIntensity === severity && o.soilType === soil && o.waterSupply === water && o.adaptations.stubbleRetention === stubble && !o.adaptations.widerRows);
    assert.deepEqual(Object.values(scenario.projection.projectedEnd).map(n => +n.toFixed(1)), expected);
  }
});

test('5 / 30 / 50 boundaries and fractional-day UI labels match the displayed numbers', () => {
  const classify = n => projectedCondition({ rainfallIndex:n, soilWaterIndex:n, plantGrowthIndex:n });
  assert.equal(classify(4.999), 'Intense Drought-like');
  assert.equal(classify(5), 'Drought Affected-like');
  assert.equal(classify(29.999), 'Drought Affected-like');
  assert.equal(classify(30), 'Recovery-like');
  assert.equal(classify(50), 'Recovery-like');
  assert.equal(classify(50.001), 'Non-Drought-like');
  const samples = Array.from({length:85}, (_,simulationDay) => ({ simulationDay, rainfallIndex:31-simulationDay, soilWaterIndex:40, plantGrowthIndex:40, condition:'OLD LABEL' }));
  assert.equal(frameAtDay(samples, .5).condition, 'Recovery-like');
  assert.equal(frameAtDay(samples, 1.1).condition, 'Drought Affected-like');
  assert.equal(frameAtDay(samples, 0).condition, 'OLD LABEL'); // official start label retained
});

test('three visual layers retain distinct, buffered dry trajectories without inventing physical percentages', () => {
  for (const scenario of scenarios) {
    const at = day => layerMoistureAt(scenario.samples, day);
    const initial = at(0);
    for (const day of [1,3,18,24,28,56,84]) {
      const current = at(day);
      assert.ok(current.deepSoil > current.rootZone && current.rootZone > current.topsoil);
      const losses = Object.fromEntries(Object.keys(initial).map(key => [key, initial[key] - current[key]]));
      assert.ok(losses.topsoil >= losses.rootZone && losses.rootZone >= losses.deepSoil);
    }
    assert.equal(at(3).rootZone, initial.rootZone);
    assert.equal(at(9).deepSoil, initial.deepSoil);
  }
});

test('reduced-motion soil presentation removes travelling fronts but preserves wetness and cracks', () => {
  const frame = scenarios[0].water.at(8);
  const transition = new MoistureTransition(frame.transport.previousMoisture);
  transition.setState(adaptMoistureTransport(frame.transport));
  transition.seekSimulationTime(8);
  const footprint = areaToVisualFootprint({farmAreaHa:33});
  const soil = createSoilCutaway(footprint);
  const view = new SoilMoisture(soil, footprint, transition, {soilType:'clay',surfaceCrackSeverity:.4});
  const material = soil.children[0].material;
  const shader = {uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <normal_fragment_maps>'};
  material.onBeforeCompile(shader);
  const colour = material.color.clone(), displayed = {...transition.displayed};
  assert.ok(shader.uniforms.uMoistureFronts.value.some(v=>v.w>0));
  view.setReducedMotion(true);
  assert.ok(shader.uniforms.uMoistureFronts.value.every(v=>v.w===0));
  assert.equal(shader.uniforms.uMoistureMorph.value,0);
  assert.ok(material.color.equals(colour));
  assert.equal(shader.uniforms.uSoilCrackSeverity.value,.4);
  assert.deepEqual(transition.displayed,displayed);
  view.setReducedMotion(false);
  assert.ok(shader.uniforms.uMoistureFronts.value.some(v=>v.w>0));
  view.dispose(); soil.children.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});
});
