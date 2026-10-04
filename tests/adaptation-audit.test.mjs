import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { projectScenario, sampleProjection } from '../src/backend/simulation/project-scenario.js';
import { FARM_FORWARD_MODEL_V1 } from '../src/backend/simulation/farm-forward-model-v1.js';

const bundle = await build({stdin:{contents:`
export {createWaterPlayback} from './src/frontend/scene/water-playback';
export {createCrackPlayback} from './src/frontend/scene/crack-playback';
export {conditionPresentation} from './src/frontend/scene/condition-playback';
export {sampleCropRows} from './src/frontend/scene/three/RowStratifiedPlacement';
export {areaToVisualFootprint} from './src/frontend/scene/three/visualAdapter';
`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {createWaterPlayback,createCrackPlayback,conditionPresentation,sampleCropRows,areaToVisualFootprint} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const baselineCDI={official:true,rainfallIndex:41.9,soilWaterIndex:50.4,plantGrowthIndex:58.1};
const make=(droughtIntensity,stubbleRetention,widerRows)=>{
  const options={droughtIntensity,soilType:'clay',waterSupply:'rainfed',adaptations:{stubbleRetention,widerRows}};
  const projection=projectScenario({baselineCDI,...options});
  const samples=Array.from({length:85},(_,day)=>sampleProjection(projection,day));
  const water=createWaterPlayback(samples,options);
  return {projection,samples,water,cracks:createCrackPlayback(water,'clay')};
};

test('all twelve adaptation/severity combinations retain exactly the v1 15% loss protection and no wider-row score bonus',()=>{
  const rows=[];
  for(const severity of ['moderate','severe','extreme']) {
    const [plain,stubble,wider,both]=[[false,false],[true,false],[false,true],[true,true]].map(flags=>make(severity,...flags));
    assert.deepEqual(wider.samples,plain.samples);
    assert.deepEqual(both.samples,stubble.samples);
    for(let day=0;day<=84;day++) {
      assert.equal(stubble.samples[day].rainfallIndex,plain.samples[day].rainfallIndex);
      const plainLoss=baselineCDI.soilWaterIndex-plain.samples[day].soilWaterIndex;
      const coveredLoss=baselineCDI.soilWaterIndex-stubble.samples[day].soilWaterIndex;
      assert.ok(Math.abs(coveredLoss-plainLoss*.85)<1e-10);
      if(day>0) assert.ok(stubble.samples[day].plantGrowthIndex>plain.samples[day].plantGrowthIndex);
    }
    for(const [name,scenario] of [['none',plain],['stubble',stubble],['wider',wider],['both',both]]) {
      rows.push({severity,adaptation:name,...Object.fromEntries(Object.entries(scenario.projection.projectedEnd).map(([key,value])=>[key,Number(value.toFixed(1))]))});
    }
  }
  console.table(rows);
  assert.deepEqual(FARM_FORWARD_MODEL_V1.adaptations.widerRows.yieldResponse,[
    {yieldTPerHa:1,multiplier:1.03},{yieldTPerHa:2,multiplier:.975},
    {yieldTPerHa:4,multiplier:.9525},{yieldTPerHa:6,multiplier:.9433}
  ]);
});

test('full visual propagation: same rain, modest stubble moisture/stress benefit, geometry-only wider rows, additive combination',()=>{
  for(const severity of ['moderate','severe','extreme']) {
    const [plain,stubble,wider,both]=[[false,false],[true,false],[false,true],[true,true]].map(flags=>make(severity,...flags));
    assert.deepEqual(stubble.water.events,plain.water.events);
    for(let day=0;day<=84;day+=.5) {
      const p=plain.water.at(day),s=stubble.water.at(day),w=wider.water.at(day),b=both.water.at(day);
      assert.deepEqual(w,p);
      assert.deepEqual(b,s);
      assert.deepEqual(s.water,p.water);
      assert.ok(s.moisture.topsoil>=p.moisture.topsoil-1e-10);
      assert.ok(s.evaporation.activity<=p.evaporation.activity+1e-10);
      assert.ok(stubble.cracks.at(day)<=plain.cracks.at(day)+1e-10);
      assert.equal(wider.cracks.at(day),plain.cracks.at(day));
      assert.equal(both.cracks.at(day),stubble.cracks.at(day));
      const condition=scenario=>conditionPresentation(sampleProjection(scenario.projection,day),baselineCDI);
      assert.deepEqual(condition(wider),condition(plain));
      assert.deepEqual(condition(both),condition(stubble));
      assert.ok(condition(stubble).rootStress<=condition(plain).rootStress);
      assert.ok(condition(stubble).plantStress<=condition(plain).plantStress);
    }
    const p=conditionPresentation(plain.samples[84],baselineCDI),s=conditionPresentation(stubble.samples[84],baselineCDI);
    assert.ok(p.plantStress-s.plantStress<.1);
    assert.ok(p.rootStress-s.rootStress<.12);
    if(severity!=='moderate') assert.ok(s.plantStress>.65 && s.rootStress>.65);
  }
});

test('wider rows expose clear gaps without changing within-row spacing or plant variation',()=>{
  const footprint=areaToVisualFootprint({farmAreaHa:33});
  const normal=sampleCropRows(footprint,undefined,{widerRows:false});
  const wider=sampleCropRows(footprint,undefined,{widerRows:true});
  assert.ok(wider.dz>normal.dz*2);
  assert.ok(wider.rows<normal.rows);
  assert.equal(wider.columns,normal.columns);
  assert.equal(wider.dx,normal.dx);
  for(const slot of wider.slots) {
    const same=normal.slots.find(other=>other.row===slot.row&&other.column===slot.column);
    for(const key of ['x','template','yaw','height','width']) assert.equal(slot[key],same[key]);
  }
});
