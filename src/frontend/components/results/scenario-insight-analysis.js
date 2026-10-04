import { buildDisplayedResultsScenarios } from './displayed-results-scenarios.js';

// Interpretation tolerances only; these never change model outputs or rankings.
export const INSIGHT_TOLERANCES = Object.freeze({ yieldTPerHa: 0.005, productionT: 0.005, moneyAud: 1 });
export const direction = (difference, tolerance) => difference === null ? 'unavailable' : difference > tolerance ? 'higher' : difference < -tolerance ? 'lower' : 'similar';
const difference = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? a - b : null;

/** Copy existing backend outputs into a small interpretation record.
 * @param {import('../../../shared/results-types.js').Metrics} metrics */
function metricFacts(metrics) {
  return {
    yieldTPerHa: metrics.finalYieldTPerHa, referenceYieldTPerHa: metrics.referenceYieldTPerHa,
    productionT: metrics.finalProductionT, cropSavedT: metrics.cropSavedT,
    implementationCostAud: metrics.strategyCostAud, grossValueProtectedAud: metrics.grossValueProtectedAud,
    netBenefitAud: metrics.netBenefitAud
  };
}

function compare(a, b) {
  if (!a || !b) return null;
  const yieldDifferenceTPerHa = difference(a.yieldTPerHa, b.yieldTPerHa);
  const netBenefitDifferenceAud = difference(a.netBenefitAud, b.netBenefitAud);
  return {
    scenarioId: a.id, comparedWithId: b.id,
    yieldDifferenceTPerHa, productionDifferenceT: difference(a.productionT, b.productionT),
    netBenefitDifferenceAud, implementationCostDifferenceAud: difference(a.implementationCostAud, b.implementationCostAud),
    yieldDirection: direction(yieldDifferenceTPerHa, INSIGHT_TOLERANCES.yieldTPerHa),
    netBenefitDirection: direction(netBenefitDifferenceAud, INSIGHT_TOLERANCES.moneyAud),
    addedMeaningfulBenefit: netBenefitDifferenceAud === null
      ? direction(yieldDifferenceTPerHa, INSIGHT_TOLERANCES.yieldTPerHa) === 'higher'
      : direction(netBenefitDifferenceAud, INSIGHT_TOLERANCES.moneyAud) === 'higher'
  };
}

function rank(scenarios, key, tolerance, ascending = false) {
  const ordered = scenarios.filter(s => Number.isFinite(s[key])).toSorted((a, b) =>
    (ascending ? a[key] - b[key] : b[key] - a[key]) || a.priority - b.priority);
  const best = ordered[0] || null;
  return { best, leaders: best ? ordered.filter(s => Math.abs(s[key] - best[key]) <= tolerance) : [], complete: ordered.length === scenarios.length };
}

/** Deterministic comparisons of backend outputs, never an agronomic/economic model.
 * Uses the exact scenario membership shared with Final yield comparison.
 * @param {import('../../../shared/results-types.js').ResultsResponse} data
 * @param {string[]} selectedStrategies */
export function buildScenarioInsightContext(data, selectedStrategies) {
  const displayed = buildDisplayedResultsScenarios(data, selectedStrategies);
  const scenarios = displayed.tableScenarios.map(s => ({ id: s.id, name: s.name, role: s.role, priority: s.priority, ...metricFacts(s.metrics) }));
  const currentScenario = scenarios.find(s => s.role === 'current');
  const selectedComparisons = scenarios.filter(s => s.role === 'comparison');
  // Zero incremental benefit/cost defines this same-drought comparison baseline.
  const droughtBaseline = { id: 'drought', name: 'No adaptations', role: 'baseline', priority: 1,
    yieldTPerHa: data.finalMetrics.droughtBaselineYieldTPerHa, productionT: data.finalMetrics.droughtBaselineProductionT,
    cropSavedT: 0, implementationCostAud: 0, grossValueProtectedAud: 0, netBenefitAud: 0 };
  const byId = new Map(scenarios.map(s => [s.id, s]));
  const yieldRanking = rank(scenarios, 'yieldTPerHa', INSIGHT_TOLERANCES.yieldTPerHa);
  const netRanking = rank(scenarios, 'netBenefitAud', INSIGHT_TOLERANCES.moneyAud);
  const costRanking = rank(scenarios, 'implementationCostAud', INSIGHT_TOLERANCES.moneyAud, true);
  const widerRowEffects = scenarios.filter(s => s.id === 'wider' || s.id === 'combined').map(s => {
    // Backend final versus backend pre-row yield isolates the existing row response.
    const yieldEffectTPerHa = difference(s.yieldTPerHa, s.referenceYieldTPerHa);
    const effect = direction(yieldEffectTPerHa, INSIGHT_TOLERANCES.yieldTPerHa);
    return { scenarioId: s.id, yieldEffectTPerHa, effect, helpedYield: effect === 'unavailable' ? null : effect === 'higher', hurtYield: effect === 'unavailable' ? null : effect === 'lower' };
  });
  return {
    version: '1-educational-insights', tolerances: INSIGHT_TOLERANCES,
    droughtSeverity: data.run.scenario.droughtIntensity,
    currentScenario, current: metricFacts(data.finalMetrics), selectedComparisons, scenarios,
    droughtBaseline, normalReference: { yieldTPerHa: data.finalMetrics.normalYieldTPerHa, productionT: data.finalMetrics.normalProductionT },
    rankings: { highestYieldScenario: yieldRanking.best, highestNetBenefitScenario: netRanking.best,
      lowestImplementationCostScenario: costRanking.best, yieldLeaders: yieldRanking.leaders,
      netBenefitLeaders: netRanking.leaders, economicsComparable: netRanking.complete },
    currentVsDroughtBaseline: compare(currentScenario, droughtBaseline),
    currentVsSelectedComparisons: selectedComparisons.map(s => compare(currentScenario, s)),
    combinedVsStubble: compare(byId.get('combined'), byId.get('stubble')),
    combinedVsWider: compare(byId.get('combined'), byId.get('wider')),
    widerRows: { selected: widerRowEffects.length > 0, effects: widerRowEffects,
      current: widerRowEffects.find(effect => effect.scenarioId === currentScenario.id) || null }
  };
}
