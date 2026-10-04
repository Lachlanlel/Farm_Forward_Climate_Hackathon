// Formatting only; all scientific and financial calculations come from backend.
const decimal = (value, places) => Number(Math.abs(value).toFixed(places)).toLocaleString('en-AU', { maximumFractionDigits: places });
export function numberLabel(value, places = 2, signed = false) {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(value)) throw new TypeError('Cannot render an invalid Results number.');
  const rounded = Number(value.toFixed(places));
  return `${rounded < 0 ? '−' : signed && rounded > 0 ? '+' : ''}${decimal(value, places)}`;
}
export const tonnes = (value, signed = false) => value == null ? '—' : `${numberLabel(value, 2, signed)} t`;
export const yieldLabel = value => value == null ? '—' : `${numberLabel(value, 3)} t/ha`;
export const percentLabel = value => value == null ? '—' : `${numberLabel(value, 1)}%`;
export function moneyLabel(value, signed = false) {
  if (value == null) return '—';
  if (!Number.isFinite(value)) throw new TypeError('Cannot render an invalid Results amount.');
  const rounded = Math.round(Math.abs(value));
  return `${rounded && value < 0 ? '−' : rounded && signed && value > 0 ? '+' : ''}$${rounded.toLocaleString('en-AU')}`;
}
export const costLabel = metrics => metrics.costStatus === 'unavailable' ? 'Unavailable' : moneyLabel(metrics.strategyCostAud);
