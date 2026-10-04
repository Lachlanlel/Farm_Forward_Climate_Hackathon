import { escapeHtml } from '../html.js';

export function renderMetricInfo(id, label, explanation) {
  return `<span class="metric-info-wrap"><button class="metric-info-button" type="button" aria-label="About ${escapeHtml(label)}" aria-controls="info-${escapeHtml(id)}" aria-expanded="false" aria-describedby="info-${escapeHtml(id)}">i</button><span class="metric-tooltip" id="info-${escapeHtml(id)}" role="tooltip" hidden>${escapeHtml(explanation)}</span></span>`;
}

export function installMetricTooltips(root) {
  let pointerType = '';
  const closeAll = except => root.querySelectorAll('.metric-info-wrap').forEach(wrap => {
    if (wrap === except) return;
    wrap.querySelector('.metric-tooltip').hidden = true;
    wrap.querySelector('.metric-info-button').setAttribute('aria-expanded', 'false');
  });
  root.addEventListener('pointerdown', event => {
    const button = event.target.closest('.metric-info-button');
    if (button) pointerType = event.pointerType;
    else closeAll();
  });
  root.addEventListener('pointerover', event => {
    const wrap = event.target.closest('.metric-info-wrap');
    if (!wrap || event.pointerType === 'touch') return;
    closeAll(wrap);
    wrap.querySelector('.metric-tooltip').hidden = false;
    wrap.querySelector('.metric-info-button').setAttribute('aria-expanded', 'true');
  });
  root.addEventListener('pointerout', event => {
    const wrap = event.target.closest('.metric-info-wrap');
    if (!wrap || wrap.contains(event.relatedTarget) || event.pointerType === 'touch') return;
    if (!wrap.querySelector('.metric-info-button').matches(':focus-visible')) closeAll();
  });
  root.addEventListener('focusin', event => {
    if (!event.target.matches('.metric-info-button') || pointerType === 'touch') return;
    closeAll(event.target.parentElement);
    event.target.nextElementSibling.hidden = false;
    event.target.setAttribute('aria-expanded', 'true');
  });
  root.addEventListener('focusout', event => {
    if (event.target.matches('.metric-info-button')) closeAll();
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('.metric-info-button');
    if (!button) return;
    if (pointerType === 'touch') {
      const tooltip = button.nextElementSibling;
      const open = tooltip.hidden;
      closeAll();
      tooltip.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    }
    pointerType = '';
  });
  document.addEventListener('pointerdown', event => {
    if (!root.contains(event.target)) closeAll();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAll(); });
}
