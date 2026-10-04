export function renderStepNavigation() {
  return `<footer class="simulation-footer" aria-label="Simulator navigation">
    <div class="simulation-actions"><button class="continue-button simulation-previous" id="simulation-previous" type="button"><span class="continue-label">Previous</span></button>
    <button class="continue-button simulation-cta" id="simulation-cta" type="button"><span class="continue-label"><span class="simulation-cta-text" aria-live="polite">Start simulation</span><span class="continue-arrow" aria-hidden="true">→</span></span></button></div>
    <ol class="setup-steps" aria-label="Simulator progress">
      <li class="completed"><b>1</b><span>Setup</span></li>
      <li class="current" aria-current="step"><b>2</b><span>Simulation</span></li>
      <li><b>3</b><span>Results</span></li>
    </ol>
  </footer>`;
}
