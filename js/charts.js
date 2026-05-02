import { evaluateValue } from './scoring.js';
import { clamp, daysBetween, parseNumber } from './utils.js';

/** Draw the normalized logistic value editor chart. */
export function drawDynamicChart(canvas, definition) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 220;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const pad = 26;
  const chartW = width - pad * 2;
  const chartH = height - pad * 2;
  const mapX = (t) => pad + t * chartW;
  const mapY = (value) => pad + (1 - value / 100) * chartH;

  ctx.strokeStyle = '#d8dee9';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad + (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
  }

  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 120; i += 1) {
    const t = i / 120;
    const start = new Date(`${definition.startDate}T00:00:00Z`);
    const endDays = Math.max(1, daysBetween(definition.endDate, definition.startDate));
    start.setUTCDate(start.getUTCDate() + Math.round(t * endDays));
    const value = evaluateValue(definition, start.toISOString().slice(0, 10));
    const x = mapX(t);
    const y = mapY(value);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const points = [
    { t: 0, y: definition.startValue, label: 'start' },
    { t: 1, y: definition.endValue, label: 'end' },
    { t: clamp(definition.midpoint, 0, 1), y: (parseNumber(definition.startValue) + parseNumber(definition.endValue)) / 2, label: 'control' },
  ];
  points.forEach((point) => {
    ctx.beginPath();
    ctx.fillStyle = point.label === 'control' ? '#111827' : '#2563eb';
    ctx.arc(mapX(point.t), mapY(point.y), point.label === 'control' ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#667085';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`${definition.startDate} / ${Math.round(definition.startValue)}`, pad, height - 7);
  const endDays = Math.max(1, daysBetween(definition.endDate, definition.startDate));
  const midpointDate = new Date(`${definition.startDate}T00:00:00Z`);
  midpointDate.setUTCDate(midpointDate.getUTCDate() + Math.round(clamp(definition.midpoint, 0, 1) * endDays));
  const midpointLabel = midpointDate.toISOString().slice(0, 10);
  ctx.fillText(midpointLabel, mapX(0.5) - (ctx.measureText(midpointLabel).width / 2), height - 7);
  const endLabel = `${definition.endDate} / ${Math.round(definition.endValue)}`;
  ctx.fillText(endLabel, width - pad - ctx.measureText(endLabel).width, height - 7);
}

/** Attach drag behavior to the chart control point. Horizontal changes midpoint, vertical changes steepness. */
export function attachChartDrag(canvas, definition, onChange) {
  let dragging = false;
  const updateFromPointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    const xRatio = clamp((event.clientX - rect.left) / rect.width, 0.02, 0.98);
    const yRatio = clamp((event.clientY - rect.top) / rect.height, 0.02, 0.98);
    definition.midpoint = Number(xRatio.toFixed(3));
    definition.steepness = Number(clamp((1 - yRatio) * 40, 0, 40).toFixed(2));
    onChange(definition);
  };
  canvas.onpointerdown = (event) => { dragging = true; canvas.setPointerCapture(event.pointerId); updateFromPointer(event); };
  canvas.onpointermove = (event) => { if (dragging) updateFromPointer(event); };
  canvas.onpointerup = () => { dragging = false; };
  canvas.onpointercancel = () => { dragging = false; };
}
