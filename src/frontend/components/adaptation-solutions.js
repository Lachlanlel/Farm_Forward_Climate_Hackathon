import { escapeHtml } from './html.js';
import { icons } from './icons.js';

function renderStrategy(strategy, index, selected) {
  const icon = icons[strategy.icon] || icons.leaf;
  return `<label class="strategy-card" data-strategy="${escapeHtml(strategy.id)}">
    <input type="checkbox" name="adaptationStrategy" value="${escapeHtml(strategy.id)}" ${selected ? 'checked' : ''}>
    <span class="strategy-top"><span class="strategy-number">${index + 1}</span><span class="strategy-icon">${icon}</span><strong>${escapeHtml(strategy.name)}</strong><span class="strategy-check" aria-hidden="true"></span></span>
    <span class="strategy-description">${escapeHtml(strategy.description)}</span>
  </label>`;
}

export function renderAdaptationSolutions(strategies, selectedStrategies) {
  const selected = new Set(selectedStrategies);
  return `<section class="control-panel adaptation-solutions" aria-labelledby="adaptation-heading">
    <div class="panel-heading"><span class="heading-icon">${icons.leaf}</span><h2 id="adaptation-heading">Adaptation solutions</h2></div>
    <div class="strategy-list">${strategies.map((strategy, index) => renderStrategy(strategy, index, selected.has(strategy.id))).join('')}</div>
  </section>`;
}
