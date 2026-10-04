import { currentComparisonId, selectedComparisons } from './comparison-selection.js';

const currentNames = {
  drought: 'No adaptations',
  stubble: 'Stubble retention',
  wider: 'Wider Row Spacing',
  combined: 'Combined strategy'
};

// Presentation only: retain backend metrics and sort their unrounded yields.
export function buildDisplayedResultsScenarios(data, selectedStrategies) {
  const currentId = currentComparisonId(data.run.scenario.adaptations) || 'drought';
  const currentName = currentNames[currentId];
  const scenarios = new Map([
    ['normal', { id: 'normal', name: 'Normal reference', value: data.finalMetrics.normalYieldTPerHa, tone: 'normal', role: 'reference', priority: 0 }],
    ['drought', { id: 'drought', name: 'Drought, no adaptations', value: data.finalMetrics.droughtBaselineYieldTPerHa, tone: 'drought', role: 'reference', priority: 1 }]
  ]);
  // A no-adaptation run replaces the drought baseline instead of adding a bar.
  scenarios.set(currentId, {
    id: currentId, name: currentName,
    chartName: currentId === 'drought' ? 'Drought, no adaptations' : currentName,
    value: data.finalMetrics.finalYieldTPerHa, metrics: data.finalMetrics,
    tone: currentId === 'drought' ? 'drought' : 'strategy', role: 'current',
    priority: currentId === 'drought' ? 1 : 2
  });
  const available = new Map(selectedComparisons(data, selectedStrategies).map(comparison => [comparison.id, comparison]));
  const comparisonNames = [];
  for (const id of Array.isArray(selectedStrategies) ? selectedStrategies : []) {
    const comparison = available.get(id);
    if (!comparison || scenarios.has(id)) continue;
    scenarios.set(id, {
      id, name: comparison.name, value: comparison.metrics.finalYieldTPerHa,
      metrics: comparison.metrics, tone: 'strategy', role: 'comparison',
      priority: 3 + comparisonNames.length
    });
    comparisonNames.push(comparison.name);
  }
  const chartScenarios = [...scenarios.values()].sort((a, b) => b.value - a.value || a.priority - b.priority);
  return {
    currentName, comparisonNames, chartScenarios,
    tableScenarios: chartScenarios.filter(scenario => scenario.role !== 'reference')
  };
}
