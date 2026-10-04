import { escapeHtml } from './html.js';

const definitions = [
  { key: 'rainfallIndex', art: 'rainfall', code: 'RI', label: 'Rainfall Index', className: 'rainfall' },
  { key: 'soilWaterIndex', art: 'soilWater', code: 'SWI', label: 'Soil water index', className: 'soil-water' },
  { key: 'plantGrowthIndex', art: 'plantGrowth', code: 'PGI', label: 'Plant growth', className: 'plant-growth' }
];

const landscapes = {
  rainfall: `<svg viewBox="0 0 160 78" preserveAspectRatio="none" aria-hidden="true"><path fill="#b8daf5" d="M0 44Q65 20 160 39V78H0Z"/><path fill="#8ec0e8" d="M0 58Q70 39 160 49V78H0Z"/><path fill="#5e9acf" d="M0 67Q76 52 160 59V78H0Z"/><path fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M63 39h18a8 8 0 0 0 1-16 11 11 0 0 0-20-3 9 9 0 0 0 1 19Z"/></svg>`,
  soilWater: `<svg viewBox="0 0 160 78" preserveAspectRatio="none" aria-hidden="true"><path fill="#d5ba91" d="M0 43Q60 22 160 34V78H0Z"/><path fill="#bd9b69" d="M0 58Q80 39 160 45V78H0Z"/><path fill="#a77e48" d="M0 68Q74 54 160 58V78H0Z"/><path fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M67 30q13-9 27 0H67Zm5-9 1.5-2m6-3 .5-2m8 6 1.5-2m-13 8 1-2m8 0 1-2"/><circle cx="74" cy="18" r="1.2" fill="white"/><circle cx="86" cy="14" r="1.2" fill="white"/></svg>`,
  plantGrowth: `<svg viewBox="0 0 160 78" preserveAspectRatio="none" aria-hidden="true"><path fill="#9fd2a5" d="M0 42Q70 20 160 37V78H0Z"/><path fill="#6eaf79" d="M0 57Q68 38 160 45V78H0Z"/><path fill="#478e58" d="M0 69Q73 51 160 57V78H0Z"/><path fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M82 32c-1-9 4-17 14-18 1 10-4 16-14 18Zm0 0c-3-6-7-8-11-9m11 9-1 8"/></svg>`
};

function percentileDisplay(value) {
  if (!Number.isFinite(value)) return null;
  // Display rounding only; the immutable baseline retains original precision.
  const label = Number(value.toFixed(1));
  const n = Math.round(label);
  const suffix = !Number.isInteger(label) || (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return { label, suffix };
}
function renderCard(definition, state) {
  const value = percentileDisplay(state.baselineCDI?.[definition.key]);
  const loading = state.status === 'loading';
  const label = value ? `${value.label}${value.suffix} percentile` : loading ? 'Loading' : 'Unavailable';
  return `<article class="cdi-card cdi-${definition.className}" aria-label="${escapeHtml(definition.label)}: ${escapeHtml(label)}">
    <div class="cdi-value"><div class="cdi-number">${value ? `${value.label}<sup>${value.suffix}</sup>` : '<span aria-hidden="true">—</span>'}</div><span>${value ? 'Percentile' : label}</span></div>
    <div class="cdi-lower"><strong>${definition.code}</strong><span>${definition.label}</span><div class="cdi-landscape">${landscapes[definition.art]}</div></div>
  </article>`;
}
export function renderCDIOverview(state = { status: 'loading' }, location = null) {
  const baseline = state.baselineCDI;
  const available = state.status === 'ready' && baseline?.official;
  const phase = available ? `Current phase: ${baseline.cdiPhase || 'Unavailable'}` : state.status === 'loading' ? 'Loading current drought conditions…' : 'Drought data unavailable for this location';
  const date = baseline?.snapshotDate ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(baseline.snapshotDate + 'T00:00:00Z')) : null;
  return `<section class="cdi-overview" aria-labelledby="cdi-heading" aria-busy="${state.status === 'loading'}">
    <h1 id="cdi-heading">Combined Drought Indicator</h1>
    <div class="cdi-cards">${definitions.map(definition => renderCard(definition, state)).join('')}</div>
    <div class="drought-phase" role="status">${escapeHtml(phase)}</div>
    <p class="phase-explanation">${escapeHtml(baseline?.location?.displayName || location?.displayName || 'Choose a NSW location in Farm Setup.')}</p>
    <p class="cdi-provenance">${available ? `Latest available NSW CDI data · ${escapeHtml(date)}<br><a href="${escapeHtml(baseline.source.url)}" target="_blank" rel="noopener">NSW DPIRD · ${escapeHtml(baseline.spatialArea.parish)} parish</a> · <a href="/data-attribution/">Data attribution</a>` : state.status === 'loading' ? 'Finding the latest locally available official snapshot.' : 'No official baseline is being substituted.'}</p>
    <p class="cdi-scope">Parish-level percentile indices; not individual farm measurements or physical percentages.</p>
  </section>`;
}

export function updateCDIOverview(element, baseline, frame) {
  const day = frame.simulationDay;
  const official = day === 0;
  const cards = element.querySelectorAll('.cdi-card');
  definitions.forEach((definition, index) => {
    const value = frame[definition.key];
    const card = cards[index];
    if (!card || !Number.isFinite(value)) return;
    const display = official ? percentileDisplay(value) : { label: Number(value.toFixed(1)) };
    card.querySelector('.cdi-number').innerHTML = official ? `${display.label}<sup>${display.suffix}</sup>` : `${display.label}`;
    card.querySelector('.cdi-value > span').textContent = official ? 'Percentile' : 'Projected score';
    card.setAttribute('aria-label', `${definition.label}: ${display.label} ${official ? 'official percentile' : 'Farm Forward projected condition score'}`);
  });
  element.querySelector('.drought-phase').textContent = official ? `Current phase: ${baseline.cdiPhase || 'Unavailable'}` : `Projected condition: ${frame.condition}`;
  element.querySelector('.phase-explanation').textContent = official ? `${baseline.location.displayName} · Official NSW baseline` : `Farm Forward projection · Week ${(day / 7).toFixed(day === 84 ? 0 : 1)} of 12`;
  element.querySelector('.cdi-scope').textContent = official ? 'Parish-level percentile indices; not individual farm measurements or physical percentages.' : 'Projected condition scores, not official NSW CDI observations or physical soil moisture.';
}
