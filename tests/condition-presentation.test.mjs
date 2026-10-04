import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { projectScenario, sampleProjection } from '../src/backend/simulation/project-scenario.js';

const bundle = await build({ stdin: { contents: `
export { conditionPresentation } from './src/frontend/scene/condition-playback';
export { resolveRootCondition } from './src/frontend/scene/three/rootCondition';
export { WheatCropVisual } from './src/frontend/scene/three/WheatCropVisual';
export { MeshStandardMaterial } from 'three';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { conditionPresentation, resolveRootCondition, WheatCropVisual, MeshStandardMaterial } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const baselineCDI = { official: true, rainfallIndex: 41.9, soilWaterIndex: 50.4, plantGrowthIndex: 58.1 };
const make = (patch = {}) => projectScenario({ baselineCDI, droughtIntensity: 'severe', soilType: 'clay', waterSupply: 'rainfed', adaptations: { stubbleRetention: false, widerRows: false }, ...patch });
const finalStress = projection => conditionPresentation(sampleProjection(projection, 84), projection.baseline);

test('all scenario combinations start healthy; finite zero baselines and improving conditions stay healthy', () => {
  for (const droughtIntensity of ['moderate','severe','extreme']) for (const soilType of ['sandy','clay'])
    for (const waterSupply of ['rainfed','irrigated']) for (const stubbleRetention of [false,true]) for (const widerRows of [false,true]) {
      const projection = make({ droughtIntensity,soilType,waterSupply,adaptations:{stubbleRetention,widerRows} });
      assert.deepEqual(conditionPresentation(sampleProjection(projection,0),projection.baseline), {rootStress:0,plantStress:0});
    }
  assert.deepEqual(conditionPresentation({soilWaterIndex:0,plantGrowthIndex:0},{soilWaterIndex:0,plantGrowthIndex:0}),{rootStress:0,plantStress:0});
  assert.deepEqual(conditionPresentation({soilWaterIndex:100,plantGrowthIndex:100},baselineCDI),{rootStress:0,plantStress:0});
});

test('roots and wheat progress together; roots fade gradually without removing principal structure', () => {
  const projection = make();
  let previous = { rootStress:0,plantStress:0 };
  for (let day = 0; day <= 84; day += .5) {
    const stress = conditionPresentation(sampleProjection(projection,day),projection.baseline);
    assert.ok(stress.rootStress >= previous.rootStress && stress.plantStress >= previous.plantStress);
    assert.ok(stress.rootStress - previous.rootStress < .02);
    const roots = resolveRootCondition(stress.rootStress);
    assert.equal(roots.principalOpacity,1);
    assert.ok(roots.fineOpacity >= .65);
    previous = stress;
  }
  const states = ['moderate','severe','extreme'].map(droughtIntensity=>finalStress(make({droughtIntensity})));
  assert.ok(states[0].rootStress < states[1].rootStress && states[1].rootStress < states[2].rootStress);
  assert.ok(states[0].plantStress < states[1].plantStress && states[1].plantStress < states[2].plantStress);
  assert.ok(resolveRootCondition(states[2].rootStress).fineOpacity < .75);
  assert.deepEqual(conditionPresentation(sampleProjection(projection,0),projection.baseline),{rootStress:0,plantStress:0});
});

test('adaptations affect appearance only through projected scores; wider rows cannot recolour crop or roots', () => {
  const plain = finalStress(make()), stubble = finalStress(make({adaptations:{stubbleRetention:true,widerRows:false}}));
  const both = finalStress(make({adaptations:{stubbleRetention:true,widerRows:true}}));
  assert.deepEqual(stubble,both);
  assert.ok(stubble.plantStress < plain.plantStress && stubble.rootStress < plain.rootStress);
  assert.deepEqual(finalStress(make({adaptations:{stubbleRetention:false,widerRows:true}})),plain);
});

test('one material uses the supplied stress gradient without maturity or instance colour overrides', () => {
  const source = new MeshStandardMaterial();
  const visual = new WheatCropVisual(source);
  const shader = { uniforms:{}, vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>' };
  visual.material.onBeforeCompile(shader,{});
  assert.match(shader.fragmentShader,/diffuseColor.rgb = cropStressColor\(uCropStress\)/);
  assert.doesNotMatch(shader.fragmentShader,/Maturity|cropInstanceState|cropPlantState/);
  visual.setState({cropDevelopment:.48,cropStress:.5});
  const colors = visual.uniforms.uCropColors.value.map(color=>color.getHexString());
  visual.setState({cropDevelopment:.96,cropStress:.5});
  assert.deepEqual(visual.uniforms.uCropColors.value.map(color=>color.getHexString()),colors);
  assert.equal(visual.uniforms.uCropStress.value,.5);
  visual.disposeShadow(); visual.material.dispose(); source.dispose();
});
