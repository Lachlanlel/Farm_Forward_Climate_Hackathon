import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCdiRepository } from '../src/backend/data/cdi-repository.js';
import { lookupBaseline } from '../src/backend/services/cdi-lookup-service.js';
import { projectScenario } from '../src/backend/simulation/project-scenario.js';
import { createRunDescriptor, calculateRunResults } from '../src/backend/results/results-service.js';
import { currentComparisonId, availableSelections, toggleComparison } from '../src/frontend/components/results/comparison-selection.js';
import { renderStrategyComparisonStep } from '../src/frontend/components/results/strategy-comparison-step.js';
import { renderFinalKeyMetrics } from '../src/frontend/components/results/final-key-metrics.js';
import { renderYieldComparisonStep } from '../src/frontend/components/results/yield-comparison-step.js';
import { renderAISummaryStep } from '../src/frontend/components/results/ai-summary-step.js';
import { calculateResults } from '../src/backend/results/economics.js';
import { validateResultsResponse } from '../src/shared/results-contract.js';

const ids = ['stubble', 'wider', 'combined'];
const repository = createCdiRepository(JSON.parse(await readFile(new URL('../src/backend/data/cdi-repository.json', import.meta.url))));
const baselineCDI = lookupBaseline(repository, { location: { latitude: -35.115, longitude: 147.3677778, displayName: 'Wagga Wagga NSW 2650' }, simulationStartDate: '2026-10-04' }).baselineCDI;
const flags = (stubbleRetention, widerRows) => ({ stubbleRetention, widerRows });
async function results(adaptations = flags(false, false), farmAreaHa = 100) {
  const projection = projectScenario({ baselineCDI, droughtIntensity: 'severe', soilType: 'clay', waterSupply: 'rainfed', adaptations });
  return calculateRunResults(repository, { ...await createRunDescriptor(baselineCDI, projection, farmAreaHa), completedDay: 84 });
}
const nextIsDisabled = html => /data-results-action="next" disabled/.test(html);
const cards = html => [...html.matchAll(/<button class="strategy-result-card[\s\S]*?<\/button>/g)].map(match => match[0]);

test('each current-run mapping disables only its exact card and permits all other alternatives together', async () => {
  for (const [stubble, wider, disabledId] of [[true, false, 'stubble'], [false, true, 'wider'], [true, true, 'combined'], [false, false, null]]) {
    const data = await results(flags(stubble, wider));
    assert.equal(currentComparisonId(data.run.scenario.adaptations), disabledId);
    let selected = [];
    for (const id of ids) selected = toggleComparison(selected, id, data.run.scenario.adaptations);
    assert.deepEqual(selected, ids.filter(id => id !== disabledId));
    const rendered = cards(renderStrategyComparisonStep(data, selected));
    for (let index = 0; index < ids.length; index++) {
      const disabled = ids[index] === disabledId;
      assert.equal(rendered[index].includes(' disabled aria-disabled="true"'), disabled);
      assert.equal(rendered[index].includes('Current simulation'), disabled);
      assert.equal(rendered[index].includes('is-selected'), !disabled);
      assert.equal(rendered[index].includes('aria-pressed="true"'), !disabled);
    }
  }
});

test('selection toggles independently, reaches empty state and never changes the completed scenario or calculated metrics', async () => {
  const data = await results(), before = JSON.stringify(data), adaptations = data.run.scenario.adaptations;
  let selected = toggleComparison([], 'stubble', adaptations);
  selected = toggleComparison(selected, 'wider', adaptations);
  assert.deepEqual(selected, ['stubble', 'wider']);
  selected = toggleComparison(selected, 'stubble', adaptations);
  assert.deepEqual(selected, ['wider']);
  selected = toggleComparison(selected, 'wider', adaptations);
  assert.deepEqual(selected, []);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(toggleComparison(['stubble'], 'combined', flags(true, true)), ['stubble']);
});

test('loading a new current run removes only its matching former selection and discards invalid or duplicate saved ids', () => {
  assert.deepEqual(availableSelections(['stubble', 'wider', 'combined'], flags(true, true)), ['stubble', 'wider']);
  assert.deepEqual(availableSelections(['combined'], flags(true, true)), []);
  assert.deepEqual(availableSelections(['stubble', 'wider', 'combined'], flags(true, false)), ['wider', 'combined']);
  assert.deepEqual(availableSelections(['stubble', 'wider', 'combined'], flags(false, true)), ['stubble', 'combined']);
  assert.deepEqual(availableSelections(['combined', 'stubble', 'stubble', 'invalid'], flags(false, false)), ['stubble', 'combined']);
  assert.deepEqual(availableSelections(null, flags(false, false)), []);
});

test('comparison cards use whole-farm backend costs at 100, 250 and 500 ha, including the disabled current card', async () => {
  for (const [area, expected] of [[100, ['$600', '$240', '$840']], [250, ['$1,500', '$600', '$2,100']], [500, ['$3,000', '$1,200', '$4,200']]]) {
    const data = await results(flags(true, false), area);
    const rendered = cards(renderStrategyComparisonStep(data, ['wider', 'combined']));
    for (let i = 0; i < 3; i++) assert.ok(rendered[i].includes(`Implementation cost: ${expected[i]}`), rendered[i]);
    assert.ok(rendered[0].includes('Current simulation'));
    assert.equal(data.run.farmAreaHa, area);
    assert.ok(Math.abs(data.comparisons[2].metrics.strategyCostAud - data.comparisons[0].metrics.strategyCostAud - data.comparisons[1].metrics.strategyCostAud) < 1e-9);
    assert.doesNotMatch(rendered.join(''), /\/ha|Unavailable/);
  }
  // Prove presentation consumes backend metrics rather than recomputing prices.
  const custom = structuredClone(await results());
  custom.comparisons[0].metrics.strategyCostAud = 1234;
  assert.match(cards(renderStrategyComparisonStep(custom, []))[0], /Implementation cost: \$1,234/);
});

test('main card copy is concise, matches the requested descriptions and excludes model terminology', async () => {
  const html = renderStrategyComparisonStep(await results(), []);
  assert.match(html, /Keeps more moisture in the soil, helping protect the crop during drought\./);
  assert.match(html, /Can help in very dry conditions, but may reduce yield when conditions are better\./);
  assert.match(html, /Uses both strategies together to see whether the combined approach performs better\./);
  assert.doesNotMatch(html, /\bSWI\b|\bRI\b|\bPGI\b|multiplier|interpolation|conditionFactor|18 cm|research-based adjustment/);
});

test('Next requires an available selection and every selected comparison reaches the chart, table and summary', async () => {
  for (const adaptations of [flags(false, false), flags(true, false), flags(false, true), flags(true, true)]) {
    const data = await results(adaptations), selected = availableSelections(ids, adaptations);
    assert.ok(nextIsDisabled(renderStrategyComparisonStep(data, [])));
    const currentId = currentComparisonId(adaptations);
    if (currentId) assert.ok(nextIsDisabled(renderStrategyComparisonStep(data, [currentId])));
    for (const selection of [selected.slice(0, 1), selected]) {
      assert.equal(nextIsDisabled(renderStrategyComparisonStep(data, selection)), false);
      const chart = renderYieldComparisonStep(data, selection), summary = renderAISummaryStep(data, selection);
      assert.match(chart, /Current simulation/);
      for (const id of ids) {
        assert.equal(chart.includes(`data-comparison-id="${id}"`), selection.includes(id) || currentId === id);
        const summaryIds = summary.match(/data-scenario-ids="([^"]+)"/)[1].split(' ');
        assert.equal(summaryIds.includes(id), selection.includes(id) || currentId === id);
      }
      assert.equal((summary.match(/class="summary-card"/g) || []).length, 1);
      assert.equal((summary.match(/class="summary-row"/g) || []).length, 3);
      assert.equal((chart.match(/\(selected comparison\)/g) || []).length, selection.length);
    }
  }
});

test('production Results labels, tooltips and unavailable/error states consistently use Implementation cost', async () => {
  const data = await results(), unavailable = structuredClone(data);
  unavailable.finalMetrics.costStatus = 'unavailable';
  unavailable.finalMetrics.strategyCostAud = unavailable.finalMetrics.netBenefitAud = null;
  for (const c of unavailable.comparisons) {
    c.metrics.costStatus = 'unavailable';
    c.metrics.strategyCostAud = c.metrics.netBenefitAud = null;
  }
  const html = [renderFinalKeyMetrics(data), renderFinalKeyMetrics(null, 'Loading validated Results…'), renderFinalKeyMetrics(null, 'Complete a simulation'), renderFinalKeyMetrics(unavailable), renderStrategyComparisonStep(data, ids), renderYieldComparisonStep(data, ids), renderAISummaryStep(data, ids), renderAISummaryStep(unavailable, ids)].join('');
  assert.match(html, />Implementation cost /);
  assert.match(html, /About Implementation cost/);
  assert.doesNotMatch(html, /\b(?:Strategy|Adaptation|Management) costs?\b/i);
  assert.doesNotMatch(html, /Implementation Cost/);
  assert.throws(() => calculateResults({ ...data.finalMetrics, adaptations: flags(false, false), wheatPriceAudPerTonne: 350, droughtReferenceYieldTPerHa: 2, adaptedReferenceYieldTPerHa: 2 }), /Implementation cost configuration/);
  const invalid = structuredClone(data);
  invalid.finalMetrics.costStatus = 'unavailable';
  invalid.finalMetrics.strategyCostAud = 1;
  assert.throws(() => validateResultsResponse(invalid), /Unavailable implementation cost/);
});

test('multiple comparison selections survive refresh, migrate legacy state and are filtered for a newly loaded current run', async () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  const { appSession } = await import('../src/frontend/state/app-session.js?multi');
  const combined = await results(flags(true, true));
  appSession.updateSimulation({ status: 'complete', completedRun: combined.run });
  appSession.updateResults({ selectedStrategies: ids, step: 2 });
  assert.deepEqual(appSession.get().results.selectedStrategies, ['stubble', 'wider']);
  assert.deepEqual(appSession.get().simulation.completedRun, combined.run);
  const refreshed = (await import('../src/frontend/state/app-session.js?multi-refresh')).appSession;
  assert.deepEqual(refreshed.get().results.selectedStrategies, ['stubble', 'wider']);
  refreshed.updateResults({ step: 3 });
  assert.deepEqual(refreshed.get().results.selectedStrategies, ['stubble', 'wider']);
  const stubble = await results(flags(true, false));
  refreshed.updateSimulation({ status: 'complete', completedRun: stubble.run });
  refreshed.updateResults({ step: 0 });
  assert.deepEqual(refreshed.get().results.selectedStrategies, ['wider']);
  storage.set('farm-forward:experience:v1', JSON.stringify({ results: { comparisonStrategy: 'combined' } }));
  assert.deepEqual((await import('../src/frontend/state/app-session.js?single-migration')).appSession.get().results.selectedStrategies, ['combined']);
  refreshed.finishSession();
  assert.deepEqual(refreshed.get().results.selectedStrategies, []);
});
