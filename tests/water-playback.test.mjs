import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { projectScenario, sampleProjection } from '../src/backend/simulation/project-scenario.js';

const bundle = await build({ stdin: { contents: `export { createWaterPlayback } from './src/frontend/scene/water-playback';
export { adaptMoistureTransport } from './src/frontend/scene/three/soilMoistureTransport';
export { createCrackPlayback, targetCrackSeverity } from './src/frontend/scene/crack-playback';
export { MoistureTransition } from './src/frontend/scene/three/soilMoisturePresentation';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { createWaterPlayback, adaptMoistureTransport, MoistureTransition, createCrackPlayback, targetCrackSeverity } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const make = (severity = 'severe', waterSupply = 'rainfed', stubble = false, widerRows = false) => {
  const projection = projectScenario({ baselineCDI: { official: true, rainfallIndex: 41.9, soilWaterIndex: 50.4, plantGrowthIndex: 58.1 }, droughtIntensity: severity, soilType: 'clay', waterSupply, adaptations: { stubbleRetention: stubble, widerRows } });
  const samples = Array.from({ length: 85 }, (_, day) => sampleProjection(projection, day));
  return { projection, samples, playback: createWaterPlayback(samples, { droughtIntensity: severity, waterSupply, adaptations: { stubbleRetention: stubble } }) };
};
const seek = (playback, day) => {
  const frame = playback.at(day);
  const transition = new MoistureTransition(frame.transport.previousMoisture);
  transition.setState(adaptMoistureTransport(frame.transport));
  transition.seekSimulationTime(day);
  return { frame, transition };
};

test('severity changes rain activity; only irrigated activates spray; adaptations do not manufacture rain', () => {
  const rates = ['moderate', 'severe', 'extreme'].map(s => make(s).playback.at(8).water.rainfallRate);
  assert.ok(rates[0] > rates[1] && rates[1] > rates[2] && rates[2] > 0);
  assert.equal(make().playback.at(8).water.irrigationRate, 0);
  assert.ok(make('severe', 'irrigated').playback.at(46).water.irrigationRate > 0);
  assert.deepEqual(make().playback.at(8).water, make('severe', 'rainfed', true, true).playback.at(8).water);
});

test('supplied transport creates wetting, redistribution, retention and drying without changing projection data', () => {
  for (const water of ['rainfed', 'irrigated']) {
    const { playback, samples, projection } = make('severe', water);
    const before = JSON.stringify({ samples, projection });
    const wet = seek(playback, 8).transition;
    assert.ok(wet.fronts.some(front => front.kind === 'wetting' && front.activity > 0));
    assert.ok(wet.displayed.topsoil > samples[8].soilWaterIndex / 100);
    const after = seek(playback, 11);
    assert.equal(after.frame.water.rainfallRate, 0);
    assert.equal(after.frame.water.irrigationRate, 0);
    assert.ok(after.transition.displayed.topsoil > samples[8].soilWaterIndex / 100);
    assert.ok(after.transition.fronts.some(front => front.kind === 'transfer'));
    const dry = seek(playback, 14).transition;
    assert.ok(dry.cues.topsoil.surfaceDrying > 0);
    assert.ok(dry.displayed.topsoil < after.transition.displayed.topsoil);
    assert.equal(JSON.stringify({ samples, projection }), before);
  }
});

test('all intervals join continuously, seek deterministically, and stop/reset on the master day', () => {
  for (const severity of ['moderate', 'severe', 'extreme']) for (const water of ['rainfed', 'irrigated']) {
    const { playback, samples } = make(severity, water);
    for (let day = 0; day <= 84; day += .5) {
      const { frame, transition } = seek(playback, day);
      assert.equal(transition.simulationTime, day);
      assert.equal(frame.water.timeSeconds, day / 84 * 24);
      assert.deepEqual(frame, playback.at(day));
      assert.deepEqual(frame.moisture, transition.displayed);
      for (const value of Object.values(transition.displayed)) assert.ok(value >= 0 && value <= 1);
    }
    for (const day of playback.events.flatMap(event => [event.start, event.start + 4, event.start + 6, event.start + 10]).filter(day => day > 0 && day < 84)) {
      const left = seek(playback, day - .00001).transition.displayed;
      const right = seek(playback, day).transition.displayed;
      for (const key of Object.keys(left)) assert.ok(Math.abs(left[key] - right[key]) < .00001);
    }
    for (const day of [0,84]) {
      const { frame, transition } = seek(playback, day);
      assert.equal(frame.water.rainfallRate, 0);
      assert.equal(frame.water.irrigationRate, 0);
      assert.equal(transition.displayed.topsoil, samples[day].soilWaterIndex / 100);
      assert.ok(transition.displayed.deepSoil > transition.displayed.rootZone);
      assert.ok(transition.displayed.rootZone > transition.displayed.topsoil);
    }
  }
});

test('stubble retains the existing SWI advantage; wider rows add no moisture bonus', () => {
  const plain = make(), stubble = make('severe', 'rainfed', true), wider = make('severe', 'rainfed', false, true);
  assert.ok(seek(stubble.playback, 23).transition.displayed.topsoil > seek(plain.playback, 23).transition.displayed.topsoil);
  assert.deepEqual(seek(wider.playback, 23).transition.displayed, seek(plain.playback, 23).transition.displayed);
});

 test('rain takes priority and postponed irrigation runs only in dry windows, including boundaries and scrubs', () => {
  for (const severity of ['moderate', 'severe', 'extreme']) {
    const rainfed = make(severity).playback, irrigated = make(severity, 'irrigated').playback;
    let sawRain = false, sawIrrigation = false;
    for (let day = 0; day <= 84; day += .05) {
      const frame = irrigated.at(day), rain = rainfed.at(day).water;
      const water = frame.water;
      assert.ok(!(water.rainfallRate > 0 && water.irrigationRate > 0));
      assert.equal(water.rainfallRate, rain.rainfallRate);
      assert.equal(rain.irrigationRate, 0);
      sawRain ||= water.rainfallRate > 0; sawIrrigation ||= water.irrigationRate > 0;
    }
    assert.ok(sawRain && sawIrrigation);
    const event = irrigated.events.find(e => e.kind === 'irrigation');
    const water = seek(irrigated, event.start + 2);
    assert.ok(water.frame.water.irrigationRate > 0);
    assert.ok(water.transition.fronts.some(f => f.kind === 'wetting' && f.activity > 0));
    assert.equal(water.frame.water.rainfallRate, 0);
  }
});


test('irrigation responds to displayed refill condition, recent rain and cooldown; 20 mm is metadata only', () => {
  const counts = [];
  for (const severity of ['moderate','severe','extreme']) {
    const {playback} = make(severity,'irrigated');
    const events = playback.events.filter(e => e.kind === 'irrigation');
    counts.push(events.length);
    for (const [index,event] of events.entries()) {
      assert.ok(event.triggerRootZone < playback.refillLevel);
      assert.equal(event.representativeDepthMm,20);
      if (index) assert.ok(event.start - events[index-1].start >= 14);
      for (const rain of playback.events.filter(e=>e.kind === 'rain')) {
        assert.ok(event.start + 10 <= rain.start || event.start >= rain.start + 10);
        if (rain.start < event.start) assert.ok(event.start >= rain.start + 4 + playback.recentRainDays);
      }
    }
  }
  assert.ok(counts[0] < counts[1] && counts[1] <= counts[2]);
  const wetSamples = Array.from({length:85},()=>({soilWaterIndex:90}));
  assert.equal(createWaterPlayback(wetSamples,{droughtIntensity:'extreme',waterSupply:'irrigated'}).events.filter(e=>e.kind==='irrigation').length,0);
  assert.equal(make().playback.events.filter(e=>e.kind==='irrigation').length,0);
});

test('clay cracks follow displayed topsoil: delayed closure after wetting, then reopening; sand never cracks', () => {
  const {playback} = make('severe','irrigated');
  const clay = createCrackPlayback(playback,'clay');
  const sandy = createCrackPlayback(playback,'sandy');
  const event = playback.events.find(e=>e.kind==='irrigation');
  const start = event.start;
  assert.ok(clay.at(start) > .05);
  assert.ok(Math.abs(clay.at(start + .01) - clay.at(start)) < .005);
  assert.ok(playback.at(start + 4).moisture.topsoil > playback.at(start).moisture.topsoil);
  assert.ok(clay.at(start + 5) < clay.at(start) * .7);
  assert.ok(clay.at(start + 14) > clay.at(start + 5));
  assert.equal(clay.at(0),0);
  for(let day=0;day<=84;day+=.25) {
    const before=clay.at(day);
    clay.at(84); clay.at(0);
    assert.equal(clay.at(day),before);
    assert.equal(sandy.at(day),0);
    assert.ok(before >= 0 && before <= 1);
  }
  assert.equal(targetCrackSeverity('clay',.8),0);
  assert.ok(targetCrackSeverity('clay',.1) > targetCrackSeverity('clay',.3));
  const extreme = createCrackPlayback(make('extreme').playback,'clay');
  assert.ok(extreme.at(84) > createCrackPlayback(make('moderate').playback,'clay').at(84));
  const plain = createCrackPlayback(make().playback,'clay');
  const stubble = createCrackPlayback(make('severe','rainfed',true).playback,'clay');
  const wider = createCrackPlayback(make('severe','rainfed',false,true).playback,'clay');
  assert.ok(stubble.at(84) < plain.at(84));
  assert.equal(wider.at(84),plain.at(84));
});

test('evaporation explains surface decline with severity and stubble cues, without adding water protection', () => {
  const {samples} = make();
  const before = JSON.stringify(samples);
  // Identical input trajectory isolates visual demand from numerical drought.
  const frames = ['moderate','severe','extreme'].map(droughtIntensity => {
    const playback = createWaterPlayback(samples, {droughtIntensity, waterSupply:'rainfed'});
    return seek(playback,24);
  });
  assert.ok(frames[0].transition.cues.topsoil.surfaceDrying > 0);
  assert.ok(frames[0].frame.evaporation.activity < frames[1].frame.evaporation.activity);
  assert.ok(frames[1].frame.evaporation.activity < frames[2].frame.evaporation.activity);
  const covered = createWaterPlayback(samples, {droughtIntensity:'severe',waterSupply:'rainfed',adaptations:{stubbleRetention:true}});
  const bare = createWaterPlayback(samples, {droughtIntensity:'severe',waterSupply:'rainfed'});
  // A strategy flag alone cannot manufacture an extra visual benefit. The
  // already-protected model trajectory must supply the reduced drying slope.
  assert.deepEqual(seek(covered,24).frame.evaporation.activity,seek(bare,24).frame.evaporation.activity);
  assert.ok(seek(make('severe','rainfed',true).playback,24).transition.cues.topsoil.surfaceDrying < seek(bare,24).transition.cues.topsoil.surfaceDrying);
  for(let day=0;day<=84;day+=.5) assert.deepEqual(covered.at(day).moisture,bare.at(day).moisture);
  assert.deepEqual(covered.events,bare.events);
  assert.equal(JSON.stringify(samples),before);
});

test('surface evaporation stops during rain/irrigation and retention, then resumes gradually on the master clock', () => {
  for (const severity of ['moderate','severe','extreme']) for (const waterSupply of ['rainfed','irrigated']) {
    const {playback} = make(severity,waterSupply);
    for(const event of playback.events) {
      for(let offset=0;offset<=6;offset+=.25) {
        const {frame,transition} = seek(playback,event.start+offset);
        assert.equal(frame.evaporation.activity,0);
        assert.equal(transition.cues.topsoil.surfaceDrying,0);
      }
      const early=playback.at(event.start+6.1), later=playback.at(event.start+7.5);
      assert.ok(later.evaporation.activity > early.evaporation.activity);
      assert.ok(later.moisture.topsoil < early.moisture.topsoil);
    }
    for(let day=0;day<=84;day+=.25) {
      const frame=playback.at(day);
      if(frame.water.rainfallRate > 0 || frame.water.irrigationRate > 0) assert.equal(frame.evaporation.activity,0);
      playback.at(84); playback.at(0);
      assert.deepEqual(playback.at(day).evaporation,frame.evaporation);
    }
    assert.equal(playback.at(0).evaporation.activity,0);
    assert.equal(playback.at(84).evaporation.activity,0);
  }
});

test('evaporation never explains steady/rising soil or directly dries root/deep layers or invents uptake', () => {
  const samples=Array.from({length:85},(_,day)=>({soilWaterIndex:day<20?60:day<25?60-(day-20):day<30?55:55+(day-30)*.1}));
  const playback=createWaterPlayback(samples,{droughtIntensity:'extreme',waterSupply:'rainfed'});
  for(const day of [2,18,20,25,26,29,30,31,32]) assert.equal(playback.at(day).evaporation.activity,0);
  const {transition,frame}=seek(playback,23);
  assert.ok(frame.evaporation.activity>0);
  assert.ok(transition.cues.topsoil.surfaceDrying>0);
  assert.equal(transition.cues.rootZone.surfaceDrying,0);
  assert.equal(transition.cues.deepSoil.surfaceDrying,0);
  assert.ok(transition.fronts.filter(front=>front.kind==='drying').every(front=>front.to<.5));
  assert.ok(Object.values(transition.cues).every(cue=>cue.uptake===0));
});

test('short dry intervals stay restrained; sustained drying is clearer without changing stored moisture or endpoints', () => {
  const sample = days => {
    const previousMoisture={topsoil:.6,rootZone:.5,deepSoil:.4};
    const nextMoisture={topsoil:.5,rootZone:.5,deepSoil:.4};
    const transition=new MoistureTransition(previousMoisture);
    transition.setState(adaptMoistureTransport({previousMoisture,nextMoisture,
      durationSeconds:days/84*24,simulationTiming:{startTime:0,stepDuration:days,timeUnit:'day'},
      fluxes:{evaporationLoss:1},fluxReference:1}));
    transition.seekSimulationTime(days/2);
    const result={moisture:{...transition.displayed},cue:transition.cues.topsoil.surfaceDrying,front:transition.fronts.find(f=>f.kind==='drying').weight};
    transition.seekSimulationTime(days);
    assert.deepEqual(transition.displayed,nextMoisture);
    assert.equal(transition.cues.topsoil.surfaceDrying,0);
    assert.equal(transition.fronts.length,0);
    return result;
  };
  const brief=sample(1),sustained=sample(18);
  assert.deepEqual(brief.moisture,sustained.moisture);
  assert.ok(brief.cue<sustained.cue*.1);
  assert.ok(brief.front<sustained.front*.1);
  const moderate=seek(make('moderate').playback,24).transition.cues.topsoil.surfaceDrying;
  const severe=seek(make().playback,24).transition.cues.topsoil.surfaceDrying;
  const extreme=seek(make('extreme').playback,24).transition.cues.topsoil.surfaceDrying;
  assert.ok(moderate<severe && severe<extreme);
  assert.ok(seek(make('severe','irrigated').playback,24).transition.cues.topsoil.surfaceDrying<severe);
  assert.ok(seek(make('severe','rainfed',true).playback,24).transition.cues.topsoil.surfaceDrying<severe);
});
