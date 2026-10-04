import { escapeHtml } from '../html.js';
import { renderResultsNavigation } from './results-navigation.js';
import { buildScenarioInsightContext, direction, INSIGHT_TOLERANCES } from './scenario-insight-analysis.js';
import { validatedScenarioInsights } from './scenario-insight-text.js';

export function renderAISummaryStep(data, selected, optionalWording = null) {
  const context = buildScenarioInsightContext(data, selected);
  const text = validatedScenarioInsights(context, optionalWording);
  const outcome = direction(context.current.cropSavedT, INSIGHT_TOLERANCES.productionT);
  const economics = direction(context.current.netBenefitAud, INSIGHT_TOLERANCES.moneyAud);
  const rows = [
    { label: 'Crop outcome', value: outcome === 'higher' ? 'Protected' : outcome === 'lower' ? 'Reduced' : 'Unchanged', description: text.insight1 },
    { label: 'Economic trade-off', value: economics === 'higher' ? 'Positive' : economics === 'lower' ? 'Negative' : economics === 'unavailable' ? 'Incomplete' : 'Break-even', description: text.insight2 },
    { label: 'Compared strategies', value: context.selectedComparisons.length ? 'Trade-offs' : 'Baseline', description: text.insight3 }
  ];
  return `<section class="results-screen results-cream-screen results-summary-screen" data-page-stage aria-labelledby="results-screen-heading">
    <div class="numbered-heading"><span>03</span><h1 id="results-screen-heading" tabindex="-1">Scenario Summary</h1></div>
    <article class="summary-card" data-scenario-ids="${context.scenarios.map(s => s.id).join(' ')}"><h2>${escapeHtml(context.currentScenario.name)} — scenario insights</h2><p>Key takeaways from your simulation and selected comparisons.</p><div class="summary-rows">${rows.map((row, index) => `<div class="summary-row"><span class="summary-index">0${index + 1}</span><strong>${escapeHtml(row.label)}</strong><b>${escapeHtml(row.value)}</b><span>${escapeHtml(row.description)}</span></div>`).join('')}</div><div class="summary-recommendation"><b>CONCLUSION</b><strong>${escapeHtml(text.recommendation)}</strong></div></article>
    ${renderResultsNavigation('FINISHED', 'finish')}
  </section>`;
}
