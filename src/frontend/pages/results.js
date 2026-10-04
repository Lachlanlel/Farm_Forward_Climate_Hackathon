import { loadResults } from '../services/results-client.js';
import { escapeHtml } from '../components/html.js';
import { yieldLabel, moneyLabel } from '../components/results/results-format.js';
import { appSession } from '../state/app-session.js';
import { installPageTransition, swapPageStage } from '../transitions/page-transition.js';
import { installMetricTooltips } from '../components/results/info-tooltip.js';
import { renderFinalKeyMetrics } from '../components/results/final-key-metrics.js';
import { renderStrategyComparisonStep } from '../components/results/strategy-comparison-step.js';
import { renderYieldComparisonStep } from '../components/results/yield-comparison-step.js';
import { renderAISummaryStep } from '../components/results/ai-summary-step.js';
import { availableSelections, toggleComparison } from '../components/results/comparison-selection.js';

const pageTransition = installPageTransition();
const root = document.getElementById('results-root');
if (root) {
  let resultStep = 0;
  let selectedStrategies = appSession.get().results.selectedStrategies;
  let resultsData = null;
  let statusMessage = 'Loading validated Results…';
  const requestController = new AbortController();
  appSession.updateResults({ step: resultStep });

  function render() {
    root.classList.toggle('is-cream', resultStep > 0);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resultStep > 0 ? '#f4f2e8' : '#0c3025');
    root.innerHTML = !resultsData ? renderFinalKeyMetrics(null, statusMessage) : [
      () => renderFinalKeyMetrics(resultsData),
      () => renderStrategyComparisonStep(resultsData, selectedStrategies),
      () => renderYieldComparisonStep(resultsData, selectedStrategies),
      () => renderAISummaryStep(resultsData, selectedStrategies)
    ][resultStep]();
    const notice = resultsData ? `Provisional educational Results · ${yieldLabel(resultsData.assumptions.normalYieldTPerHa)} reference · ${moneyLabel(resultsData.assumptions.wheatPriceAudPerTonne)}/t scenario price · implementation cost uses representative allowances; actual farm costs vary.` : statusMessage;
    root.querySelector('[data-page-stage]').insertAdjacentHTML('afterbegin',
      `<p class="results-demo-notice" role="${resultsData ? 'note' : 'status'}">${escapeHtml(notice)}</p>`);
  }

  render();
  void loadResults(appSession.get().simulation.completedRun, requestController.signal).then(data => {
    resultsData = data;
    selectedStrategies = availableSelections(selectedStrategies, data.run.scenario.adaptations);
    appSession.updateResults({ selectedStrategies });
    statusMessage = '';
    render();
  }).catch(error => {
    if (error.name === 'AbortError') return;
    statusMessage = error.message || 'Results are unavailable. Run the simulation again.';
    render();
  });
  window.addEventListener('pagehide', () => requestController.abort(), { once: true });
  installMetricTooltips(root);
  root.addEventListener('click', async event => {
    const strategy = event.target.closest('[data-results-strategy]');
    if (strategy && resultsData && resultStep === 1 && root.dataset.transitioning !== 'true') {
      if (strategy.disabled) return;
      selectedStrategies = toggleComparison(selectedStrategies, strategy.dataset.resultsStrategy, resultsData.run.scenario.adaptations);
      appSession.updateResults({ selectedStrategies });
      root.querySelectorAll('[data-results-strategy]').forEach(card => {
        const selected = selectedStrategies.includes(card.dataset.resultsStrategy);
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-pressed', String(selected));
      });
      root.querySelector('[data-results-action="next"]').disabled = selectedStrategies.length === 0;
      return;
    }
    const action = event.target.closest('[data-results-action]');
    if (!action || action.disabled || root.dataset.transitioning === 'true') return;
    const direction = action.dataset.resultsAction;
    if (direction === 'finish') {
      root.dataset.transitioning = 'true';
      appSession.finishSession();
      await pageTransition.navigate('/');
      return;
    }
    if (direction === 'previous' && resultStep === 0) {
      root.dataset.transitioning = 'true';
      await pageTransition.navigate('/simulation/');
      return;
    }
    if (!resultsData) return;
    if (direction === 'next' && resultStep === 1 && selectedStrategies.length === 0) return;
    const nextStep = direction === 'previous' ? resultStep - 1 : Math.min(resultStep + 1, 3);
    await swapPageStage(root, () => {
      resultStep = nextStep;
      appSession.updateResults({ step: resultStep });
      render();
    }, direction === 'previous' ? 'backward' : 'forward');
  });
}
