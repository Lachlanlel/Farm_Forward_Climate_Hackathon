import { escapeHtml } from '../html.js';
import { renderResultsNavigation } from './results-navigation.js';
import { costLabel } from './results-format.js';
import { availableSelections, currentComparisonId } from './comparison-selection.js';

const descriptions = {
  stubble: 'Keeps more moisture in the soil, helping protect the crop during drought.',
  wider: 'Can help in very dry conditions, but may reduce yield when conditions are better.',
  combined: 'Uses both strategies together to see whether the combined approach performs better.'
};

export function renderStrategyComparisonStep(data, selected) {
  const currentId = currentComparisonId(data.run.scenario.adaptations);
  const selectedStrategies = availableSelections(selected, data.run.scenario.adaptations);
  return `<section class="results-screen results-cream-screen results-strategy-screen" data-page-stage aria-labelledby="results-screen-heading">
    <div class="drought-banner"><div class="banner-shade"></div><h1 id="results-screen-heading" tabindex="-1">Moisture is the constraint. Timing <br>determines how much value survives.</h1><span>${escapeHtml(data.baselineCDI.location.displayName || data.baselineCDI.spatialArea.parish)} · WEEK 12</span></div>
    <div class="numbered-heading"><span>01</span><h2>Choose the responses to compare.</h2></div>
    <div class="strategy-result-grid" role="group" aria-label="Choose one or more strategies to compare">${data.comparisons.map(strategy => {
      const disabled = strategy.id === currentId;
      const isSelected = selectedStrategies.includes(strategy.id);
      return `<button class="strategy-result-card${isSelected ? ' is-selected' : ''}" type="button" data-results-strategy="${escapeHtml(strategy.id)}" aria-pressed="${isSelected}"${disabled ? ' disabled aria-disabled="true"' : ''}><span class="strategy-result-interior"><strong>${escapeHtml(strategy.name)}</strong>${disabled ? '<small class="current-simulation-label">Current simulation</small>' : ''}<b>Implementation cost: ${costLabel(strategy.metrics)}</b><span>${escapeHtml(descriptions[strategy.id])}</span></span></button>`;
    }).join('')}</div>
    ${renderResultsNavigation('Next', 'next', selectedStrategies.length === 0)}
  </section>`;
}
