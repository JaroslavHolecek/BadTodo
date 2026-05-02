/** Utility helpers used by UI, scoring and data modules. */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(dateString, referenceDateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const reference = new Date(`${referenceDateString}T00:00:00Z`);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((date - reference) / msPerDay);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function parseNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function deepClone(value) {
  return structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
