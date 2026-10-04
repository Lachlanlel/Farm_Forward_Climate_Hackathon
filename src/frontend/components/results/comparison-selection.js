const comparisonIds = ['stubble', 'wider', 'combined'];

export function currentComparisonId(adaptations) {
  const stubble = adaptations?.stubbleRetention === true;
  const wider = adaptations?.widerRows === true;
  return stubble && wider ? 'combined' : stubble ? 'stubble' : wider ? 'wider' : null;
}

// Normalize saved selections and remove the exact current scenario on every run load.
export function availableSelections(selectedStrategies, adaptations) {
  const selected = new Set(Array.isArray(selectedStrategies) ? selectedStrategies : []);
  const currentId = currentComparisonId(adaptations);
  return comparisonIds.filter(id => selected.has(id) && id !== currentId);
}

export function toggleComparison(selectedStrategies, id, adaptations) {
  const selected = availableSelections(selectedStrategies, adaptations);
  if (!comparisonIds.includes(id) || id === currentComparisonId(adaptations)) return selected;
  return availableSelections(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id], adaptations);
}

export function selectedComparisons(data, selectedStrategies) {
  const selected = availableSelections(selectedStrategies, data.run.scenario.adaptations);
  return data.comparisons.filter(comparison => selected.includes(comparison.id));
}
