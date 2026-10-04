import { escapeHtml } from '../html.js';

export function renderResultsNavigation(label, action, disabled = false) {
  return `<nav class="results-navigation" aria-label="Results navigation">
    <button class="continue-button results-previous" type="button" data-results-action="previous"><span class="continue-label">Previous</span></button>
    <button class="continue-button results-cta" type="button" data-results-action="${escapeHtml(action)}"${disabled ? ' disabled' : ''}><span class="continue-label">${escapeHtml(label)}</span></button>
  </nav>`;
}
