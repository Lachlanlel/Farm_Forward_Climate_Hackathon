import { renderMetricInfo } from './info-tooltip.js';
import { renderResultsNavigation } from './results-navigation.js';
import { escapeHtml } from '../html.js';
import { moneyLabel, tonnes, yieldLabel, percentLabel } from './results-format.js';

function metricCard(id, value, label, description, explanation = description) {
  return `<article class="metric-card"><strong class="metric-card-value">${value}</strong><h3>${label} ${renderMetricInfo(id, label, explanation)}</h3><p>${escapeHtml(description)}</p></article>`;
}

function contourArt() {
  return `<svg class="contour-art" viewBox="0 0 560 350" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><g stroke="currentColor" stroke-width="1.1" opacity=".35"><path d="M-20 250C56 166 146 271 202 190s160-16 207-72S430 21 540-16"/><path d="M-20 263C62 179 146 288 213 208s165-20 215-81S448 34 555-3"/><path d="M-20 277C69 193 153 303 224 225s168-25 222-88S464 47 573 11"/><path d="M-20 292C76 209 158 319 235 241s171-28 231-93S480 60 590 24"/><path d="M-20 307C82 225 163 333 246 258s176-33 238-102S497 73 607 37"/><path d="M-20 323C91 241 172 348 258 274s178-36 245-109S512 86 624 50"/><path d="M-20 340C99 256 179 364 269 290s184-40 254-116S528 99 642 64"/></g><circle cx="407" cy="117" r="9" stroke="#d7ed90" stroke-width="2"/><circle cx="407" cy="117" r="4" fill="#d7ed90"/></svg>`;
}

export function renderFinalKeyMetrics(data, statusMessage = '') {
  const m = data?.finalMetrics;
  const unavailableCost = m?.costStatus === 'unavailable';
  const yieldDescription = m ? `Whole-farm production; final yield ${yieldLabel(m.finalYieldTPerHa)}.` : 'Whole-farm production after drought.';
  const lossDescription = m?.aboveNormalReference ? 'Above the normal reference; signed loss is retained.' : 'Remaining loss versus the reference season.';
  const netExplanation = unavailableCost ? 'Net benefit unavailable: implementation cost is unavailable.' : 'Incremental crop value versus the same drought without adaptations, minus implementation cost.';
  const reference = data?.assumptions;
  const costCaption = unavailableCost ? 'Implementation cost is unavailable.' : m?.costStatus === 'not-applicable' ? 'No selected adaptations; no implementation cost.' : 'Estimated implementation cost; actual farm costs vary.';
  const costExplanation = unavailableCost ? costCaption : `Estimated implementation cost based on representative Australian management/equipment assumptions. Actual farm costs vary. ${(m?.costBasis || []).map(b => `${b.strategyId === 'stubble-retention' ? 'Stubble retention' : 'Wider rows'}: $${b.valueAudPerHa.toFixed(2)}/ha ${b.basis}.`).join(' ')}`;
  const yieldExplanation = `Whole-farm tonnes = backend yield × hectares. Provisional reference ${reference ? yieldLabel(reference.normalYieldTPerHa) : 'unavailable'}; severity loss scaled by actual/raw SWI decline, bounded 0–reference before the 18→30 cm row adjustment. Not an official NSW yield forecast.`;
  const signalMaximum = m ? Math.max(m.normalProductionT, m.finalProductionT) : null;
  const signalWidth = m && signalMaximum > 0 ? m.finalProductionT / signalMaximum * 100 : 0;
  return `<section class="results-screen results-metrics-screen" data-page-stage aria-labelledby="results-screen-heading">
    <div class="metrics-composition">
    <div class="metrics-left">
      <div class="metrics-title"><p class="results-eyebrow"><span></span>DROUGHT SCENARIO · FINAL OUTPUT</p><h1 id="results-screen-heading" tabindex="-1">Final Key Metrics</h1></div>
      ${contourArt()}
      <div class="net-benefit"><strong aria-label="${escapeHtml(netExplanation)}">${moneyLabel(m?.netBenefitAud, true)}</strong><div><span>NET BENEFIT</span></div></div>
    </div>
    <div class="metrics-right">
      <div class="metrics-right-heading"><h2>Yield protection translated into measurable value.</h2><p>${escapeHtml(statusMessage || 'Hover or tap the ⓘ icon to understand each metric.')}</p></div>
      <article class="revenue-card"><div class="revenue-copy"><strong>${moneyLabel(m?.revenueAfterDroughtAud)}</strong><h3>Revenue after drought ${renderMetricInfo('revenue', 'Revenue after drought', `Gross revenue = final production × ${reference ? moneyLabel(reference.wheatPriceAudPerTonne) : 'unavailable'} per tonne. Scenario price assumption, not profit or a guaranteed sale price.`)}</h3><p>Gross revenue from final simulated production.</p></div><div class="yield-signal"><div><span>YIELD SIGNAL</span><b>${tonnes(m?.finalProductionT)}</b></div><span class="yield-signal-track"><i style="width:${signalWidth}%"></i></span><div class="yield-signal-scale"><span>0 t</span><span>${tonnes(signalMaximum)}</span></div></div></article>
      <div class="metric-card-grid">
        ${metricCard('yield', tonnes(m?.finalProductionT), 'Final Production', yieldDescription, yieldExplanation)}
        ${metricCard('saved', tonnes(m?.cropSavedT, true), 'Crop Saved', 'Change versus the same drought without adaptations.')}
        ${metricCard('loss', percentLabel(m?.yieldLossPercent), 'Yield Loss', lossDescription)}
        ${metricCard('cost', moneyLabel(m?.strategyCostAud), 'Implementation cost', costCaption, costExplanation)}
      </div>
      <p class="system-note"><span></span>${escapeHtml(unavailableCost ? 'Net benefit unavailable until implementation cost is available.' : 'Read the season as a system: yield retained, cost applied, value returned.')}</p>
    </div>
    </div>
    ${renderResultsNavigation('Next', 'next').replace('data-results-action="next"', `data-results-action="next"${data ? '' : ' disabled'}`)}
  </section>`;
}
