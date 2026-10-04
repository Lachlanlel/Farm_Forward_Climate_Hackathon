const svg = (paths, className = 'ui-icon') => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = Object.freeze({
  gear: svg('<path d="M10.4 2.9h3.2l.5 2.1c.5.2 1 .5 1.5.8l2-.8 2.2 2.2-.9 2c.3.5.6 1 .8 1.5l2.2.5v3.2l-2.2.5c-.2.5-.5 1-.8 1.5l.9 2-2.2 2.2-2-.8c-.5.3-1 .6-1.5.8l-.5 2.1h-3.2l-.5-2.1c-.5-.2-1-.5-1.5-.8l-2 .8-2.2-2.2.8-2c-.3-.5-.6-1-.8-1.5l-2.1-.5v-3.2l2.1-.5c.2-.5.5-1 .8-1.5l-.8-2 2.2-2.2 2 .8c.5-.3 1-.6 1.5-.8l.5-2.1Z"/><circle cx="12" cy="12" r="3.2"/>'),
  leaf: svg('<path d="M20.5 3.5c-8.5.2-15.6 3.1-16.2 10.3-.3 3.5 2 6.5 5.6 6.6 7.3.3 10.5-7.1 10.6-16.9Z"/><path d="M4 20c3.5-4.6 7-7.2 12-9.7"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  cloud: svg('<path d="M6.3 18h11.3a3.8 3.8 0 0 0 .2-7.6 6.2 6.2 0 0 0-11.6-1.7A4.7 4.7 0 0 0 6.3 18Z"/>'),
  sun: svg('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2.3M12 19.7V22M2 12h2.3M19.7 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6"/>'),
  haze: svg('<circle cx="12" cy="9" r="3.2"/><path d="M3 16h18M5 20h14M12 2v2M3.4 9H5M19 9h1.6M5.6 3.6 7 5M17 5l1.4-1.4"/>'),
  stubble: svg('<path d="M3 19c5-2 13-2 18 0M4 22c5-2 11-2 16 0M7 17V7m0 4-2-2m2 1 2-2M12 17V4m0 4-2-2m2 3 2-2M17 17V8m0 4-2-2m2 1 2-2"/>'),
  rows: svg('<path d="M3 21V5m0 5 2-2m-2 0L1 6m0 15h4M12 21V5m0 5 2-2m-2 0-2-2m0 15h4M21 21V5m0 5 2-2m-2 0-2-2m0 15h4"/>')
});
