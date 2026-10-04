import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCdiRepository } from '../src/backend/data/cdi-repository.js';
import { lookupBaseline } from '../src/backend/services/cdi-lookup-service.js';
import { findContainingArea } from '../src/backend/services/spatial-lookup.js';
import { createSimulationContext } from '../src/backend/simulation/context.js';
const dataset = JSON.parse(await readFile(new URL('../src/backend/data/cdi-repository.json', import.meta.url)));
const repo = createCdiRepository(dataset);
const narrabri = { displayName: 'Narrabri NSW 2390', suburbOrTown: 'Narrabri', postcode: '2390', latitude: -30.3296154, longitude: 149.7814491 };
const wagga = { displayName: 'Wagga Wagga NSW 2650', latitude: -35.115, longitude: 147.3677778 };
const lookup = location => lookupBaseline(repo, { location, simulationStartDate: '2026-10-04' }, '2026-10-04');
test('real spatial records, provenance and original values for two selected towns', () => {
  const a = lookup(narrabri), b = lookup(wagga);
  assert.equal(a.status, 'ready'); assert.equal(b.status, 'ready');
  assert.notEqual(a.baselineCDI.spatialArea.id, b.baselineCDI.spatialArea.id);
  for (const result of [a,b]) {
    const m=result.baselineCDI;
    assert.equal(m.snapshotDate,'2026-08-31');
    assert.equal(m.simulationStartDate,'2026-10-04');
    const record=dataset.snapshots[0].areas.find(x=>x.id===m.spatialArea.id);
    assert.equal(m.rainfallIndex,record.rainfallIndex);
    assert.equal(m.soilWaterIndex,record.soilWaterIndex);
    assert.equal(m.plantGrowthIndex,record.plantGrowthIndex);
    assert.equal(m.cdiPhase,record.cdiPhase);
    assert.equal(m.source.official,true);
  }
  console.log('Official matches:',a.baselineCDI.spatialArea,a.baselineCDI.rainfallIndex,a.baselineCDI.soilWaterIndex,a.baselineCDI.plantGrowthIndex,b.baselineCDI.spatialArea,b.baselineCDI.rainfallIndex,b.baselineCDI.soilWaterIndex,b.baselineCDI.plantGrowthIndex);
});
test('newest eligible snapshot, not a future snapshot', () => {
  const repository=createCdiRepository({snapshots:[{snapshotDate:'2026-08-31'},{snapshotDate:'2026-09-30'},{snapshotDate:'2026-10-31'}]});
  assert.equal(repository.latestOnOrBefore('2026-10-04').snapshotDate,'2026-09-30');
  assert.equal(repository.latestOnOrBefore('2020-01-01'),null);
  assert.equal(lookupBaseline(repo,{location:narrabri,simulationStartDate:'2026-08-01'},'2026-10-04').status,'unavailable');
});
test('immutable official baseline and separate 12-week projection contract', () => {
  const baseline=lookup(narrabri).baselineCDI;
  assert.throws(()=>{baseline.soilWaterIndex=0;},TypeError);
  assert.throws(()=>{baseline.source.snapshotDate='2020-01-01';},TypeError);
  const context=createSimulationContext(baseline,{paddockSizeHa:12.5,soilType:'clay',waterSupply:'irrigated'},{droughtIntensity:'extreme',selectedStrategies:['stubble-retention','wider-rows']});
  assert.deepEqual(context.timeline.map(x=>x.week),[0,4,8,12]);
  assert.equal(context.timeline[1].plantAvailableWater,null);
  assert.equal(context.baseline,baseline);
  assert.equal(context.settings.adaptations.widerRows,true);
});
test('missing field remains null while valid zero is retained', () => {
  const data=structuredClone(dataset); const area=data.snapshots[0].areas.find(x=>x.id===lookup(narrabri).baselineCDI.spatialArea.id);
  area.rainfallIndex=0; area.plantGrowthIndex=null;
  const result=lookupBaseline(createCdiRepository(data),{location:narrabri},'2026-10-04');
  assert.equal(result.baselineCDI.rainfallIndex,0);assert.equal(result.baselineCDI.plantGrowthIndex,null);
  assert.ok(result.baselineCDI.missingFields.includes('plantGrowthIndex'));
});
test('invalid dates and coordinates do not fabricate a baseline', () => {
  for(const input of [{location:{latitude:0,longitude:0}},{location:narrabri,simulationStartDate:'2027-01-01'},{location:narrabri,simulationStartDate:'2026-02-31'}])assert.equal(lookupBaseline(repo,input,'2026-10-04').official,false);
});
function ring(points) {
  let last=[0,0], output='';
  for(const point of points) for(let k=0;k<2;k++) {
    const n=Math.round(point[k]*1e7),delta=n-last[k];last[k]=n;
    let v=delta>=0?delta*2:-delta*2-1;
    while(v>=32){output+=String.fromCharCode(63+(32|(v&31)));v=Math.floor(v/32);}
    output+=String.fromCharCode(63+v);
  }
  return output;
}
test('spatial lookup handles holes, detached rings, boundary uncertainty and no match', () => {
  const area={id:'test',bbox:[0,0,12,12],rings:[ring([[0,0],[10,0],[10,10],[0,10],[0,0]]),ring([[2,2],[4,2],[4,4],[2,4],[2,2]]),ring([[11,11],[12,11],[12,12],[11,12],[11,11]])]};
  assert.equal(findContainingArea([area],1,1).area.id,'test');
  assert.equal(findContainingArea([area],3,3).reason,'no-containing-parish');
  assert.equal(findContainingArea([area],11.5,11.5).area.id,'test');
  assert.equal(findContainingArea([area],0,1).reason,'location-near-parish-boundary');
  assert.equal(findContainingArea([area],20,20).area,null);
});
