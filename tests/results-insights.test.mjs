import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCdiRepository } from '../src/backend/data/cdi-repository.js';
import { lookupBaseline } from '../src/backend/services/cdi-lookup-service.js';
import { projectScenario } from '../src/backend/simulation/project-scenario.js';
import { createRunDescriptor, calculateRunResults } from '../src/backend/results/results-service.js';
import { buildDisplayedResultsScenarios } from '../src/frontend/components/results/displayed-results-scenarios.js';
import { buildScenarioInsightContext, INSIGHT_TOLERANCES } from '../src/frontend/components/results/scenario-insight-analysis.js';
import { deterministicScenarioInsights, supportedInsightWordings, validatedScenarioInsights } from '../src/frontend/components/results/scenario-insight-text.js';
import { resolveScenarioInsights, scenarioInsightsPayload } from '../src/frontend/services/scenario-insights-presenter.js';
import { renderAISummaryStep } from '../src/frontend/components/results/ai-summary-step.js';

const repository = createCdiRepository(JSON.parse(await readFile(new URL('../src/backend/data/cdi-repository.json', import.meta.url))));
const baselineCDI = lookupBaseline(repository, { location: { latitude: -35.115, longitude: 147.3677778, displayName: 'Wagga Wagga NSW 2650' }, simulationStartDate: '2026-10-04' }).baselineCDI;
async function results(id, droughtIntensity = 'severe', soilType = 'clay', waterSupply = 'rainfed') {
  const adaptations = { stubbleRetention: ['stubble', 'combined'].includes(id), widerRows: ['wider', 'combined'].includes(id) };
  const projection = projectScenario({ baselineCDI, droughtIntensity, soilType, waterSupply, adaptations });
  return calculateRunResults(repository, { ...await createRunDescriptor(baselineCDI, projection, 100), completedDay: 84 });
}
const stubble = await results('stubble'), wider = await results('wider'), combined = await results('combined');
const extreme = await results('wider', 'extreme', 'sandy');
const interpret = (data, selected) => deterministicScenarioInsights(buildScenarioInsightContext(data, selected));

test('positive stubble insights explain protection, positive economics and selected comparisons', () => {
  const context = buildScenarioInsightContext(stubble, ['wider', 'combined']);
  const text = deterministicScenarioInsights(context);
  assert.match(text.insight1, /protected 12\.15 t.*same drought/);
  assert.match(text.insight1, /residue slows soil-water loss/);
  assert.match(text.insight2, /Implementation cost of \$600.*positive net benefit/);
  assert.match(text.insight3, /Stubble retention delivered the strongest net benefit/);
  assert.match(text.insight3, /Adding wider rows reduced/);
  assert.match(text.recommendation, /^For this simulated scenario, Stubble retention/);
  assert.equal(context.rankings.highestNetBenefitScenario.id, 'stubble');
});

test('negative wider rows recognises lost crop and does not favour the current losing strategy', () => {
  const text = interpret(wider, ['stubble']);
  assert.match(text.insight1, /reduced production by 5\.94 t/);
  assert.doesNotMatch(text.insight1, /slightly improved|protected/);
  assert.match(text.insight2, /net benefit of −\$2,320/);
  assert.match(text.insight3, /Stubble retention outperformed your Wider Row Spacing scenario in both yield and net benefit/);
  assert.match(text.recommendation, /^For this simulated scenario, Stubble retention/);
  assert.doesNotMatch(JSON.stringify(text), /Combined strategy/);
});

test('extreme sandy rainfed wider rows explains its small local benefit without generalising', () => {
  const context = buildScenarioInsightContext(extreme, []), text = deterministicScenarioInsights(context);
  assert.equal(context.widerRows.current.helpedYield, true);
  assert.ok(context.widerRows.current.yieldEffectTPerHa > 0);
  assert.match(text.insight1, /protected 1\.96 t/);
  assert.match(text.insight1, /low yield level.*slightly improved.*does not apply at every yield level/);
  assert.match(text.insight2, /\$445 in positive net benefit/);
  assert.match(text.recommendation, /^For this simulated scenario, Wider Row Spacing/);
});

test('combined comparisons isolate the backend row effect and compare both individuals', () => {
  const context = buildScenarioInsightContext(combined, ['stubble', 'wider']);
  assert.equal(context.combinedVsStubble.yieldDirection, 'lower');
  assert.equal(context.combinedVsStubble.netBenefitDirection, 'lower');
  assert.equal(context.combinedVsStubble.addedMeaningfulBenefit, false);
  assert.equal(context.combinedVsWider.yieldDirection, 'higher');
  assert.equal(context.combinedVsWider.netBenefitDirection, 'higher');
  assert.equal(context.combinedVsWider.addedMeaningfulBenefit, true);
  assert.equal(context.widerRows.current.hurtYield, true);
  assert.equal(context.widerRows.current.yieldEffectTPerHa, combined.finalMetrics.finalYieldTPerHa - combined.finalMetrics.referenceYieldTPerHa);
  assert.match(deterministicScenarioInsights(context).insight1, /Stubble improved.*wider rows then reduced yield/);
});

test('a higher-yield strategy with lower net benefit loses the economic ranking', () => {
  // Controlled backend response proves presentation follows output values, not IDs.
  const data = structuredClone(combined);
  Object.assign(data.finalMetrics, { finalYieldTPerHa: 2.8, referenceYieldTPerHa: 2.79, netBenefitAud: 100, strategyCostAud: 900 });
  Object.assign(data.comparisons.find(c => c.id === 'stubble').metrics, { finalYieldTPerHa: 2.7, netBenefitAud: 200, strategyCostAud: 300 });
  const context = buildScenarioInsightContext(data, ['stubble']), text = deterministicScenarioInsights(context);
  assert.equal(context.rankings.highestYieldScenario.id, 'combined');
  assert.equal(context.rankings.highestNetBenefitScenario.id, 'stubble');
  assert.match(text.insight3, /Combined strategy produced more wheat, but Stubble retention.*lower Implementation cost/);
  assert.match(text.recommendation, /Stubble retention delivers the highest net benefit.*another option produces more wheat/);
});

test('summary membership matches the yield-page helper, deduplicates and excludes irrelevant strategies', async () => {
  for (const data of [stubble, wider, combined, await results('drought')]) {
    for (const selected of [[], ['stubble'], ['wider', 'combined'], ['combined', 'wider', 'stubble', 'stubble', 'invalid']]) {
      const before = JSON.stringify(data), selections = [...selected];
      const context = buildScenarioInsightContext(data, selected);
      assert.deepEqual(context.scenarios.map(s => s.id), buildDisplayedResultsScenarios(data, selected).tableScenarios.map(s => s.id));
      const html = renderAISummaryStep(data, selected);
      assert.equal((html.match(/class="summary-card"/g) || []).length, 1);
      assert.equal((html.match(/class="summary-row"/g) || []).length, 3);
      assert.equal((html.match(/class="summary-recommendation"/g) || []).length, 1);
      assert.match(html, /scenario insights/);
      assert.match(html, /Key takeaways from your simulation and selected comparisons\./);
      assert.match(html, /Previous/);
      assert.match(html, /FINISHED/);
      assert.equal(JSON.stringify(data), before);
      assert.deepEqual(selected, selections);
    }
  }
});

test('no comparisons still produces three useful insights; losing current strategy can favour baseline', async () => {
  const text = interpret(wider, []);
  assert.match(text.insight3, /No alternative strategy was selected/);
  assert.match(text.recommendation, /no adaptations has the stronger financial result/);
  const none = interpret(await results('drought'), []);
  assert.match(none.insight1, /no-adaptation drought baseline/);
  assert.match(none.insight2, /Implementation cost is \$0/);
  assert.match(none.insight3, /cannot identify a stronger adaptation/);
});

test('negligible differences and exact ties avoid arbitrary claims of meaningful superiority', () => {
  const data = structuredClone(combined), alternative = data.comparisons.find(c => c.id === 'stubble').metrics;
  data.finalMetrics.finalYieldTPerHa = alternative.finalYieldTPerHa + 0.001;
  data.finalMetrics.netBenefitAud = alternative.netBenefitAud + 0.5;
  const context = buildScenarioInsightContext(data, ['stubble']), text = deterministicScenarioInsights(context);
  assert.equal(context.combinedVsStubble.yieldDirection, 'similar');
  assert.equal(context.combinedVsStubble.netBenefitDirection, 'similar');
  assert.equal(context.combinedVsStubble.addedMeaningfulBenefit, false);
  assert.equal(context.rankings.netBenefitLeaders.length, 2);
  assert.match(text.insight3, /essentially equal net benefits/);
  assert.match(text.recommendation, /no clear financial winner/);
  assert.equal(INSIGHT_TOLERANCES.yieldTPerHa, 0.005);
});

test('missing costs are handled honestly without treating gross value as net benefit or recommending a partial winner', () => {
  const data = structuredClone(stubble);
  data.finalMetrics.netBenefitAud = data.finalMetrics.strategyCostAud = null;
  const context = buildScenarioInsightContext(data, ['wider']), text = deterministicScenarioInsights(context);
  assert.equal(context.rankings.economicsComparable, false);
  assert.match(text.insight2, /Implementation cost is missing/);
  assert.match(text.recommendation, /prevents choosing a financial winner/);
  assert.equal(scenarioInsightsPayload(context).bestNetBenefitStrategy, null);
});

test('missing, failed, empty and timed-out AI adapters always return the complete deterministic fallback', async () => {
  const context = buildScenarioInsightContext(stubble, ['wider']), fallback = deterministicScenarioInsights(context);
  assert.deepEqual(await resolveScenarioInsights(context), fallback);
  assert.deepEqual(await resolveScenarioInsights(context, { rewrite: () => { throw new Error('offline'); } }), fallback);
  assert.deepEqual(await resolveScenarioInsights(context, { rewrite: async () => null }), fallback);
  let signal;
  assert.deepEqual(await resolveScenarioInsights(context, { timeoutMs: 5, rewrite: (_, options) => { signal = options.signal; return new Promise(() => {}); } }), fallback);
  assert.equal(signal.aborted, true);
  assert.equal((renderAISummaryStep(stubble, ['wider'], null).match(/class="summary-row"/g) || []).length, 3);
});

test('AI contract rejects malformed content, unsupported numbers, new claims, advice and incorrect rankings', async () => {
  const context = buildScenarioInsightContext(stubble, ['wider']), fallback = deterministicScenarioInsights(context);
  for (const candidate of [
    {}, [], JSON.stringify(fallback), { ...fallback, extra: 'data' },
    { ...fallback, insight1: 'This strategy saves 9000 t.' },
    { ...fallback, insight1: fallback.insight1 + ' It also prevents all pests.' },
    { ...fallback, recommendation: 'Farmers should always choose wider rows.' },
    { ...fallback, recommendation: 'For this simulated scenario, Wider Row Spacing performs best.' },
    { ...fallback, insight3: fallback.insight1 }, { ...fallback, insight2: 'x'.repeat(700) }
  ]) {
    assert.deepEqual(await resolveScenarioInsights(context, { rewrite: async () => candidate }), fallback);
    assert.deepEqual(validatedScenarioInsights(context, candidate), fallback);
  }
});

test('optional adapter receives only a compact structured payload and supported wording can render', async () => {
  const context = buildScenarioInsightContext(stubble, ['wider']), choices = supportedInsightWordings(context);
  const candidate = Object.fromEntries(Object.entries(choices).map(([key, values]) => [key, values.at(-1)]));
  const text = await resolveScenarioInsights(context, { rewrite: async (payload, options) => {
    assert.deepEqual(Object.keys(payload).sort(), ['version','currentStrategy','droughtSeverity','current','comparisons','widerRows','bestYieldStrategy','bestNetBenefitStrategy','supportedWordings'].sort());
    assert.ok(JSON.stringify(payload).length < 7000);
    assert.doesNotMatch(JSON.stringify(payload), /latitude|longitude|baselineCDI|soilWaterIndex|<html|timeline|sourceChecksums/);
    assert.match(options.instruction, /Do not calculate/);
    const originalYield = context.current.yieldTPerHa;
    payload.current.yieldTPerHa = 9000;
    payload.widerRows.effects.length = 0;
    assert.equal(context.current.yieldTPerHa, originalYield);
    assert.equal(context.widerRows.effects.length, 1);
    return candidate;
  } });
  assert.deepEqual(text, candidate);
  assert.match(renderAISummaryStep(stubble, ['wider'], text), /Within this educational model,/);
});

test('all 48 production scenarios produce three distinct concise insights and qualified conclusions', async () => {
  for (const severity of ['moderate', 'severe', 'extreme']) for (const soil of ['clay', 'sandy']) for (const water of ['rainfed', 'irrigated']) for (const id of ['drought', 'stubble', 'wider', 'combined']) {
    const data = await results(id, severity, soil, water);
    const context = buildScenarioInsightContext(data, ['stubble', 'wider', 'combined']);
    const text = deterministicScenarioInsights(context);
    assert.equal(new Set([text.insight1, text.insight2, text.insight3]).size, 3);
    for (const value of Object.values(text)) assert.ok(value.length <= 650, value);
    assert.match(text.recommendation, /^For this simulated scenario,/);
    assert.doesNotMatch(JSON.stringify(text), /conditionFactor|rawSeveritySWILoss|multiplier|interpolation|PGI weighting|RI weighting|AI unavailable|Strategy Cost|Adaptation Cost|Management Cost|Implementation Cost|awaiting validation|No farm recommendation/);
    for (const effect of context.widerRows.effects) {
      const scenario = context.scenarios.find(s => s.id === effect.scenarioId);
      assert.equal(effect.yieldEffectTPerHa, scenario.yieldTPerHa - scenario.referenceYieldTPerHa);
    }
  }
});
