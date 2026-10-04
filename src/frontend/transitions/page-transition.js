const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pause = ms => new Promise(resolve => window.setTimeout(resolve, ms));
let navigating = false;

export function installPageTransition() {
  try {
    if (sessionStorage.getItem('farm-forward:navigating')) {
      sessionStorage.removeItem('farm-forward:navigating');
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.classList.remove('ff-pre-enter');
      if (!reducedMotion()) {
        document.documentElement.classList.add('ff-entering');
        window.setTimeout(() => document.documentElement.classList.remove('ff-entering'), 320);
      }
    }
  } catch { document.documentElement.classList.remove('ff-pre-enter'); }

  const api = Object.freeze({
    async navigate(url) {
      if (navigating) return;
      navigating = true;
      if (!reducedMotion()) {
        document.documentElement.style.backgroundColor = url.includes('/results/') ? '#0c3025' : '#f6f3ea';
        document.documentElement.classList.add('ff-exiting');
        await pause(175);
      }
      try { sessionStorage.setItem('farm-forward:navigating', '1'); } catch { /* Navigation still works. */ }
      window.location.assign(url);
    }
  });
  window.farmForwardTransition = api;
  return api;
}

export async function swapPageStage(host, renderNext, direction = 'forward') {
  if (host.dataset.transitioning === 'true') return false;
  host.dataset.transitioning = 'true';
  const current = host.querySelector('[data-page-stage]');
  if (!reducedMotion() && current) {
    current.classList.toggle('ff-stage-backward', direction === 'backward');
    current.classList.add('ff-stage-exiting');
    await pause(175);
  }
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  renderNext();
  const next = host.querySelector('[data-page-stage]');
  if (!reducedMotion() && next) {
    next.classList.toggle('ff-stage-backward', direction === 'backward');
    next.classList.add('ff-stage-entering');
    await pause(300);
    next.classList.remove('ff-stage-entering', 'ff-stage-backward');
  }
  host.dataset.transitioning = 'false';
  next?.querySelector('h1, h2')?.focus({ preventScroll: true });
  return true;
}
