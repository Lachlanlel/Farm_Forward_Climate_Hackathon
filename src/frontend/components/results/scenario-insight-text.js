import { direction, INSIGHT_TOLERANCES } from './scenario-insight-analysis.js';
import { tonnes, moneyLabel } from './results-format.js';

const joined = scenarios => new Intl.ListFormat('en-AU', { type: 'conjunction' }).format(scenarios.map(s => s.name));
const moneyDirection = value => direction(value, INSIGHT_TOLERANCES.moneyAud);

function outcome(context) {
  const current = context.currentScenario;
  const change = direction(current.cropSavedT, INSIGHT_TOLERANCES.productionT);
  if (current.id === 'drought') return 'Your run is the no-adaptation drought baseline, so it shows the crop outcome before either strategy is applied. It provides the reference for judging any protection from the selected comparisons.';
  const result = change === 'higher'
    ? `${current.name} protected ${tonnes(current.cropSavedT)} of wheat compared with the same drought without adaptations.`
    : change === 'lower'
      ? `${current.name} reduced production by ${tonnes(Math.abs(current.cropSavedT))} compared with the same drought without adaptations.`
      : `${current.name} left production essentially unchanged from the same drought without adaptations.`;
  const waterEffect = direction(current.referenceYieldTPerHa - context.droughtBaseline.yieldTPerHa, INSIGHT_TOLERANCES.yieldTPerHa);
  const stubble = waterEffect === 'higher'
    ? 'In the model, residue slows soil-water loss, helping the crop maintain production.'
    : 'Residue slows soil-water loss in the model, but its yield effect was negligible in this run.';
  if (current.id === 'stubble') return `${result} ${stubble}`;
  const rowEffect = context.widerRows.current?.effect;
  if (current.id === 'wider') return `${result} ${rowEffect === 'higher'
    ? 'At this low yield level, the model’s wider-row response slightly improved production; that advantage does not apply at every yield level.'
    : rowEffect === 'lower'
      ? 'The yield level was above the range where wider spacing helps in this model, so the row response reduced yield.'
      : 'The wider-row response made essentially no difference at this yield level.'}`;
  const water = waterEffect === 'higher' ? 'Stubble improved the water-stress outcome' : 'Stubble made little difference to yield through water retention';
  return `${result} ${water}, while wider rows ${rowEffect === 'higher' ? 'then added a small yield gain at the resulting low yield level' : rowEffect === 'lower' ? 'then reduced yield at the resulting yield level' : 'made essentially no further yield difference'}.`;
}

function economics(context) {
  const c = context.current;
  if (c.netBenefitAud === null || c.implementationCostAud === null) return 'Implementation cost is missing for this scenario, so its net benefit cannot be assessed. Gross crop value alone does not establish a financial advantage.';
  if (context.currentScenario.id === 'drought') return 'Implementation cost is $0 for the no-adaptation baseline. Its incremental net benefit is $0 by definition, providing the financial reference for the strategies compared.';
  const net = moneyDirection(c.netBenefitAud);
  if (net === 'higher') {
    const absorbed = c.implementationCostAud > c.netBenefitAud;
    return `The protected crop value of ${moneyLabel(c.grossValueProtectedAud)} exceeded the Implementation cost of ${moneyLabel(c.implementationCostAud)}, leaving ${moneyLabel(c.netBenefitAud)} in positive net benefit.${absorbed ? ' More than half of that crop value was absorbed by the Implementation cost.' : ' This is an incremental gain over the drought baseline, not whole-farm profit.'}`;
  }
  if (net === 'lower' && c.grossValueProtectedAud < -INSIGHT_TOLERANCES.moneyAud) return `Production fell and the Implementation cost was ${moneyLabel(c.implementationCostAud)}, leaving a net benefit of ${moneyLabel(c.netBenefitAud)}. The strategy finished financially behind the same drought without adaptations.`;
  if (net === 'lower') return `The crop value gained did not cover the Implementation cost of ${moneyLabel(c.implementationCostAud)}, leaving a net benefit of ${moneyLabel(c.netBenefitAud)}. The yield outcome did not translate into a financial advantage over the drought baseline.`;
  return `The crop value change and Implementation cost of ${moneyLabel(c.implementationCostAud)} left the strategy approximately at break-even against the drought baseline. There is no meaningful financial advantage at the displayed precision.`;
}

function comparison(context) {
  const r = context.rankings, current = context.currentScenario;
  if (!context.selectedComparisons.length) {
    if (current.id === 'drought') return 'No alternative strategy was selected, so this run cannot identify a stronger adaptation. The drought baseline remains the reference for a future comparison.';
    const relation = context.currentVsDroughtBaseline;
    return `No alternative strategy was selected; the comparison is with the no-adaptation drought baseline. ${relation.netBenefitDirection === 'higher' ? 'The current strategy improved net benefit after its Implementation cost.' : relation.netBenefitDirection === 'lower' ? 'Keeping the baseline would have produced the stronger financial result in this simulation.' : relation.netBenefitDirection === 'unavailable' ? 'Yield can be compared, but the missing Implementation cost prevents an economic ranking.' : 'Neither option has a meaningful net-benefit advantage.'}`;
  }
  if (!r.economicsComparable) return `${joined(r.yieldLeaders)} ${r.yieldLeaders.length === 1 ? 'has the highest yield' : 'have similar leading yields'} among the scenarios compared. Missing Implementation cost data prevents a complete net-benefit ranking.`;
  const bestNet = r.highestNetBenefitScenario, bestYield = r.highestYieldScenario;
  if (r.netBenefitLeaders.length === 1 && !r.yieldLeaders.some(s => s.id === bestNet.id)) {
    const lowerCost = bestNet.implementationCostAud < bestYield.implementationCostAud;
    return `${bestYield.name} produced more wheat, but ${bestNet.name} delivered the strongest net benefit${lowerCost ? ' with a lower Implementation cost' : ''}. The highest-yield option was not the strongest financial result.`;
  }
  let first;
  const currentDifference = context.currentVsSelectedComparisons.find(c => c.comparedWithId === bestNet.id);
  if (r.netBenefitLeaders.length > 1) first = `${joined(r.netBenefitLeaders)} had essentially equal net benefits at the displayed precision.`;
  else if (bestNet.id !== current.id && currentDifference?.yieldDirection === 'lower' && currentDifference?.netBenefitDirection === 'lower') first = `${bestNet.name} outperformed your ${current.name} scenario in both yield and net benefit.`;
  else first = `${bestNet.name} delivered the strongest net benefit among the scenarios compared.`;
  const pair = context.combinedVsStubble;
  if (pair?.yieldDirection === 'lower') return `${first} Adding wider rows reduced part of the yield benefit from stubble alone.`;
  if (pair?.yieldDirection === 'higher' && pair.netBenefitDirection !== 'higher') return `${first} Adding wider rows to stubble increased yield, but did not meaningfully improve net benefit.`;
  if (pair?.yieldDirection === 'higher' && pair.netBenefitDirection === 'higher') return `${first} Adding wider rows to stubble improved both yield and net benefit in this low-yield case.`;
  if (pair?.yieldDirection === 'similar') return `${first} The combined approach added essentially no yield benefit over stubble alone.`;
  if (currentDifference?.yieldDirection === 'lower' && currentDifference?.netBenefitDirection === 'lower' && r.netBenefitLeaders.length === 1) return first;
  const yieldsSimilar = r.yieldLeaders.length === context.scenarios.length;
  return `${first} ${yieldsSimilar ? 'Yields were also very similar, so the additional spending provided little crop advantage.' : `${bestYield.name} ${r.yieldLeaders.length === 1 ? 'also produced the highest yield' : 'was among the similar highest-yield outcomes'}.`}`;
}

function conclusion(context) {
  const r = context.rankings;
  if (!r.economicsComparable) return `For this simulated scenario, ${joined(r.yieldLeaders)} ${r.yieldLeaders.length === 1 ? 'leads' : 'share the lead'} on yield; missing Implementation cost data prevents choosing a financial winner.`;
  const best = r.highestNetBenefitScenario;
  if (moneyDirection(best.netBenefitAud) === 'lower') return 'For this simulated scenario, no adaptations has the stronger financial result: every strategy compared finished behind the drought baseline.';
  if (moneyDirection(best.netBenefitAud) === 'similar') return 'For this simulated scenario, none of the strategies compared offers a meaningful net-benefit gain over no adaptations.';
  if (r.netBenefitLeaders.length > 1) return `For this simulated scenario, ${joined(r.netBenefitLeaders)} have essentially equal leading net benefits; there is no clear financial winner between them.`;
  const yieldTradeoff = !r.yieldLeaders.some(s => s.id === best.id);
  return `For this simulated scenario, ${best.name} delivers the highest net benefit among the scenarios compared${yieldTradeoff ? ', even though another option produces more wheat' : ''}.`;
}

export function deterministicScenarioInsights(context) {
  return { insight1: outcome(context), insight2: economics(context), insight3: comparison(context), recommendation: conclusion(context) };
}

// Optional AI wording is deliberately bounded to fact-checked alternatives.
// Unrestricted prose cannot be verified for new agricultural claims by a regex.
export function supportedInsightWordings(context) {
  const text = deterministicScenarioInsights(context);
  return Object.fromEntries(Object.entries(text).map(([key, value]) => [key, [value,
    key === 'recommendation' ? value.replace('For this simulated scenario,', 'Within this educational model,')
      : value.replace('compared with', 'relative to').replace('delivered the strongest net benefit', 'had the highest net benefit')]]));
}

export function validatedScenarioInsights(context, candidate) {
  const fallback = deterministicScenarioInsights(context);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return fallback;
  const keys = Object.keys(fallback), allowed = supportedInsightWordings(context);
  if (Object.keys(candidate).length !== keys.length || keys.some(key => typeof candidate[key] !== 'string' || candidate[key].length > 650 || !allowed[key].includes(candidate[key]))) return fallback;
  if (new Set([candidate.insight1, candidate.insight2, candidate.insight3]).size !== 3) return fallback;
  return Object.fromEntries(keys.map(key => [key, candidate[key]]));
}
