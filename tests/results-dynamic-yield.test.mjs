import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCdiRepository } from '../src/backend/data/cdi-repository.js';
import { lookupBaseline } from '../src/backend/services/cdi-lookup-service.js';
import { projectScenario } from '../src/backend/simulation/project-scenario.js';
import { createRunDescriptor, calculateRunResults } from '../src/backend/results/results-service.js';
import { buildDisplayedResultsScenarios } from '../src/frontend/components/results/displayed-results-scenarios.js';
import { renderYieldComparisonStep } from '../src/frontend/components/results/yield-comparison-step.js';

const repository = createCdiRepository(JSON.parse(await readFile(new URL('../src/backend/data/cdi-repository.json', import.meta.url))));
const baselineCDI = lookupBaseline(repository, { location: { latitude: -35.115, longitude: 147.3677778, displayName: 'Wagga Wagga NSW 2650' }, simulationStartDate: '2026-10-04' }).baselineCDI;
const runs = {};
for (const [id, stubbleRetention, widerRows] of [['drought', false, false], ['stubble', true, false], ['wider', false, true], ['combined', true, true]]) {
  const projection = projectScenario({ baselineCDI, droughtIntensity: 'severe', soilType: 'clay', waterSupply: 'rainfed', adaptations: { stubbleRetention, widerRows } });
  runs[id] = await calculateRunResults(repository, { ...await createRunDescriptor(baselineCDI, projection, 100), completedDay: 84 });
}
const ids = scenarios => scenarios.map(scenario => scenario.id);
const renderedIds = html => [...html.matchAll(/data-comparison-id="([^"]+)"/g)].map(match => match[1]);
const chartHtml = html => html.match(/<figure[\s\S]*?<\/figure>/)[0];
const tableHtml = html => html.match(/<table[\s\S]*?<\/table>/)[0];
const descending = scenarios => scenarios.every((scenario, i) => i === 0 || scenarios[i - 1].value >= scenario.value);

for (const [title, current, selected, expected] of [
  ['A: stubble with wider only', 'stubble', ['wider'], ['normal', 'drought', 'stubble', 'wider']],
  ['B: stubble with both alternatives', 'stubble', ['wider', 'combined'], ['normal', 'drought', 'stubble', 'wider', 'combined']],
  ['C: combined with both individual strategies', 'combined', ['stubble', 'wider'], ['normal', 'drought', 'combined', 'stubble', 'wider']],
  ['D: no adaptations with stubble', 'drought', ['stubble'], ['normal', 'drought', 'stubble']]
]) {
  test(`dynamic yield scenarios ${title}`, () => {
    const data = runs[current], before = JSON.stringify(data);
    const view = buildDisplayedResultsScenarios(data, selected);
    assert.deepEqual(ids(view.chartScenarios).toSorted(), expected.toSorted());
    assert.deepEqual(ids(view.tableScenarios).toSorted(), [current, ...selected].toSorted());
    assert.ok(descending(view.chartScenarios));
    assert.ok(descending(view.tableScenarios));
    assert.deepEqual(view.tableScenarios, view.chartScenarios.filter(scenario => scenario.role !== 'reference'));
    assert.equal(view.chartScenarios.find(scenario => scenario.id === current).role, 'current');
    for (const id of selected) assert.equal(view.chartScenarios.find(scenario => scenario.id === id).role, 'comparison');
    const html = renderYieldComparisonStep(data, selected);
    assert.deepEqual(renderedIds(chartHtml(html)), ids(view.chartScenarios));
    assert.deepEqual(renderedIds(tableHtml(html)), ids(view.tableScenarios));
    assert.equal((html.match(/\(current simulation\)/g) || []).length, 1);
    assert.equal((html.match(/\(selected comparison\)/g) || []).length, selected.length);
    assert.equal(JSON.stringify(data), before);
  });
}

test('current strategy names come from all four completed-run configurations', () => {
  for (const [id, expected] of [['drought', 'No adaptations'], ['stubble', 'Stubble retention'], ['wider', 'Wider Row Spacing'], ['combined', 'Combined strategy']]) {
    const view = buildDisplayedResultsScenarios(runs[id], ['combined', 'stubble', 'wider']);
    assert.equal(view.currentName, expected);
    const current = view.tableScenarios.find(scenario => scenario.role === 'current');
    assert.equal(current.name, expected);
    assert.strictEqual(current.metrics, runs[id].finalMetrics);
    assert.equal(current.chartName, id === 'drought' ? 'Drought, no adaptations' : expected);
  }
});

test('duplicate, current-matching and unknown selections cannot add duplicate scenarios', () => {
  const selected = ['wider', 'stubble', 'wider', 'combined', 'combined', 'unknown', 'normal', 'drought'];
  const before = [...selected];
  const view = buildDisplayedResultsScenarios(runs.stubble, selected);
  assert.equal(view.chartScenarios.length, 5);
  assert.equal(new Set(ids(view.chartScenarios)).size, 5);
  assert.equal(view.tableScenarios.length, 3);
  assert.deepEqual(view.comparisonNames, ['Wider Row Spacing', 'Combined strategy']);
  assert.deepEqual(selected, before);
  assert.deepEqual(ids(buildDisplayedResultsScenarios(runs.drought, null).chartScenarios).toSorted(), ['drought', 'normal']);
});

test('chart and table sort unrounded backend yields, including differences hidden by display rounding', () => {
  const data = structuredClone(runs.stubble);
  data.finalMetrics.normalYieldTPerHa = 3;
  data.finalMetrics.droughtBaselineYieldTPerHa = 2.505;
  data.finalMetrics.finalYieldTPerHa = 2.579;
  data.comparisons.find(c => c.id === 'wider').metrics.finalYieldTPerHa = 2.428;
  data.comparisons.find(c => c.id === 'combined').metrics.finalYieldTPerHa = 2.498;
  let html = renderYieldComparisonStep(data, ['wider', 'combined']);
  assert.deepEqual(renderedIds(chartHtml(html)), ['normal', 'stubble', 'drought', 'combined', 'wider']);
  assert.deepEqual(renderedIds(tableHtml(html)), ['stubble', 'combined', 'wider']);
  data.comparisons.find(c => c.id === 'wider').metrics.finalYieldTPerHa = 2.57904;
  data.comparisons.find(c => c.id === 'combined').metrics.finalYieldTPerHa = 2.57903;
  html = renderYieldComparisonStep(data, ['combined', 'wider']);
  assert.deepEqual(renderedIds(chartHtml(html)), ['normal', 'wider', 'combined', 'stubble', 'drought']);
  assert.deepEqual(renderedIds(tableHtml(html)), ['wider', 'combined', 'stubble']);
  assert.equal((chartHtml(html).match(/2\.579 t\/ha/g) || []).length, 3);
});

test('exact ties use normal, drought, current, then incoming selected-array order', () => {
  const data = structuredClone(runs.stubble);
  data.finalMetrics.normalYieldTPerHa = data.finalMetrics.droughtBaselineYieldTPerHa = data.finalMetrics.finalYieldTPerHa = 2;
  for (const c of data.comparisons) c.metrics.finalYieldTPerHa = 2;
  const view = buildDisplayedResultsScenarios(data, ['combined', 'wider']);
  assert.deepEqual(ids(view.chartScenarios), ['normal', 'drought', 'stubble', 'combined', 'wider']);
  assert.deepEqual(ids(view.tableScenarios), ['stubble', 'combined', 'wider']);
  assert.deepEqual(buildDisplayedResultsScenarios(data, ['combined', 'wider']), view);
});

test('one, two, three and four relevant scenarios render only actual table cells and chart slots', () => {
  for (const selected of [[], ['stubble'], ['stubble', 'wider'], ['stubble', 'wider', 'combined']]) {
    const html = renderYieldComparisonStep(runs.drought, selected), count = selected.length + 1;
    const table = tableHtml(html), chart = chartHtml(html);
    assert.equal(renderedIds(table).length, count);
    assert.equal((table.match(/scope="col"/g) || []).length, count + 1);
    for (const row of table.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      assert.equal((row[1].match(/<td /g) || []).length, count);
    }
    assert.ok(table.includes(`--table-min-width:${(count + 1) * 175}px`));
    assert.equal(renderedIds(chart).length, count + 1);
    assert.ok(chart.includes(`grid-template-columns:repeat(${count + 1},minmax(0,1fr))`));
    assert.ok(chart.includes(`--chart-min-width:${37 + (count + 1) * 125}px`));
    assert.doesNotMatch(table, /<td[^>]*>\s*<\/td>|<t[hd][^>]*\shidden(?:\s|=|>)|<t[hd][^>]*display:\s*none/);
  }
});

test('chart yields and every table metric bind directly to changed current and comparison backend results', () => {
  const data = structuredClone(runs.stubble);
  Object.assign(data.finalMetrics, { normalYieldTPerHa: 9.876, droughtBaselineYieldTPerHa: 1.234, finalYieldTPerHa: 4.321, cropSavedT: 12.34, yieldLossPercent: 45.6, netBenefitAud: -12345 });
  Object.assign(data.comparisons.find(c => c.id === 'wider').metrics, { finalYieldTPerHa: 5.678, cropSavedT: -98.76, yieldLossPercent: 12.3, netBenefitAud: 98765 });
  const view = buildDisplayedResultsScenarios(data, ['wider']);
  assert.strictEqual(view.tableScenarios[0].metrics, data.comparisons.find(c => c.id === 'wider').metrics);
  assert.strictEqual(view.tableScenarios[1].metrics, data.finalMetrics);
  const html = renderYieldComparisonStep(data, ['wider']);
  for (const value of ['9.876 t/ha', '1.234 t/ha', '4.321 t/ha', '5.678 t/ha']) assert.ok(chartHtml(html).includes(value));
  for (const value of ['+12.34 t', '45.6%', '−$12,345', '−98.76 t', '12.3%', '+$98,765']) assert.ok(tableHtml(html).includes(value));
  data.comparisons.find(c => c.id === 'wider').metrics.netBenefitAud = null;
  assert.match(tableHtml(renderYieldComparisonStep(data, ['wider'])), /Unavailable/);
});

test('caption names the completed run and joins every relevant selected comparison naturally', () => {
  const html = renderYieldComparisonStep(runs.combined, ['stubble', 'wider', 'combined', 'stubble']);
  assert.match(html, /Provisional educational yields from this run\. Current simulation: Combined strategy\. Comparing with: Stubble retention and Wider Row Spacing\. Not an official NSW grain-yield forecast\./);
  assert.match(renderYieldComparisonStep(runs.drought, ['stubble']), /Current simulation: No adaptations\. Comparing with: Stubble retention\./);
  assert.match(renderYieldComparisonStep(runs.drought, []), /Comparing with: None\./);
});

test('zero backend yields retain all actual scenarios without invalid chart dimensions', () => {
  const data = structuredClone(runs.drought);
  data.finalMetrics.normalYieldTPerHa = data.finalMetrics.droughtBaselineYieldTPerHa = data.finalMetrics.finalYieldTPerHa = 0;
  const html = renderYieldComparisonStep(data, []);
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.equal((html.match(/--bar-height:0%/g) || []).length, 2);
});
