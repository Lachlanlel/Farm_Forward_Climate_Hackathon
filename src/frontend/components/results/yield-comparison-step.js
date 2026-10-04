import { escapeHtml } from '../html.js';
import { icons } from '../icons.js';
import { renderResultsNavigation } from './results-navigation.js';
import { numberLabel, yieldLabel, tonnes, percentLabel, moneyLabel } from './results-format.js';
import { buildDisplayedResultsScenarios } from './displayed-results-scenarios.js';

const nameList = new Intl.ListFormat('en-AU', { style: 'long', type: 'conjunction' });

function renderYieldChart({ currentName, comparisonNames, chartScenarios: bars }) {
  // Axis/width calculations are presentation of backend yields, not a yield model.
  const maximum = Math.max(0.5, Math.ceil(Math.max(...bars.map(bar => bar.value)) * 1.2 * 2) / 2);
  const axis = Array.from({ length: 7 }, (_, i) => numberLabel(maximum * (6 - i) / 6, 2));
  const explanation = `Provisional educational yields from this run. Current simulation: ${currentName}. Comparing with: ${nameList.format(comparisonNames) || 'None'}. Not an official NSW grain-yield forecast.`;
  return `<figure class="yield-chart"><figcaption>${escapeHtml(explanation)}</figcaption><div class="yield-chart-scroll" tabindex="0" role="region" aria-label="Yield chart; scroll horizontally to compare all scenarios"><div class="yield-chart-inner" style="--chart-min-width:${37 + bars.length * 125}px"><span class="chart-axis-title">Yield (t/ha)</span><div class="chart-plot"><div class="chart-axis">${axis.map(value => `<span>${value}</span>`).join('')}</div><div class="chart-bars" style="grid-template-columns:repeat(${bars.length},minmax(0,1fr))">${bars.map(bar => `<div class="chart-column ${bar.tone}" data-comparison-id="${bar.id}" data-scenario-role="${bar.role}" style="--bar-height:${bar.value / maximum * 100}%"><div class="chart-bar-space"><span class="chart-bar-value">${yieldLabel(bar.value)}</span><span class="chart-bar ${bar.tone}"></span></div><div class="chart-label"><strong>${escapeHtml(bar.chartName || bar.name)}</strong>${bar.role === 'current' ? '<small>(current simulation)</small>' : bar.role === 'comparison' ? '<small>(selected comparison)</small>' : ''}</div></div>`).join('')}</div></div></div></div></figure>`;
}

function renderComparisonTable({ tableScenarios: comparisons }) {
  const rows = [
    { label: 'Crop saved', note: '(whole-farm t)', key: 'cropSavedT', format: n => tonnes(n, true), icon: icons.leaf },
    { label: 'Yield loss', note: '(vs. normal reference)', key: 'yieldLossPercent', format: percentLabel, icon: icons.haze },
    { label: 'Net benefit', note: '(vs. same drought, no adaptations)', key: 'netBenefitAud', format: n => n === null ? 'Unavailable' : moneyLabel(n, true), icon: icons.gear }
  ];
  return `<div class="comparison-table-scroll" tabindex="0" role="region" aria-label="Comparison table; scroll horizontally to compare all scenarios"><table class="comparison-table" style="--table-min-width:${(comparisons.length + 1) * 175}px"><thead><tr><th scope="col">METRIC</th>${comparisons.map(strategy => `<th scope="col" data-comparison-id="${strategy.id}" data-scenario-role="${strategy.role}" class="${strategy.role === 'comparison' ? 'combined-column' : ''}"><span class="table-header-icon">${strategy.id === 'stubble' ? icons.leaf : strategy.id === 'wider' ? icons.rows : icons.gear}</span>${escapeHtml(strategy.name)}<small class="table-scenario-role">${strategy.role === 'current' ? 'Current simulation' : 'Selected comparison'}</small></th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><th scope="row"><span class="table-row-icon">${row.icon}</span><span>${row.label}<small>${row.note}</small></span></th>${comparisons.map(strategy => `<td class="${strategy.role === 'comparison' ? 'combined-column' : ''}">${row.format(strategy.metrics[row.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function renderYieldComparisonStep(data, selected) {
  const scenarios = buildDisplayedResultsScenarios(data, selected);
  return `<section class="results-screen results-cream-screen results-yield-screen" data-page-stage aria-labelledby="results-screen-heading">
    <div class="numbered-heading"><span>02</span><h1 id="results-screen-heading" tabindex="-1">Final yield comparison</h1></div>
    <p class="comparison-scroll-hint">Swipe or scroll sideways across the chart and table to view all scenarios.</p>
    ${renderYieldChart(scenarios)}
    ${renderComparisonTable(scenarios)}
    ${renderResultsNavigation('Next', 'next')}
  </section>`;
}
