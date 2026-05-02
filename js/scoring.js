import { clamp, daysBetween } from './utils.js';

/** Logistic sigmoid function. */
export function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/** Normalized logistic transition where transition(0)=0 and transition(1)=1. */
export function transition(t, k, m = 0.5) {
  const safeT = clamp(t, 0, 1);
  const safeM = clamp(m, 0.001, 0.999);
  if (Math.abs(k) < 0.0001) return safeT;

  const a = sigmoid(k * (0 - safeM));
  const b = sigmoid(k * (1 - safeM));
  const value = sigmoid(k * (safeT - safeM));
  const denominator = b - a;
  if (Math.abs(denominator) < 1e-8) return safeT;
  return clamp((value - a) / denominator, 0, 1);
}

/** Return a value in 0..100 for constant or dynamic definitions on a given date. */
export function evaluateValue(definition, dateString = new Date().toISOString().slice(0, 10)) {
  if (!definition || definition.type === 'constant') {
    return clamp(definition?.value ?? definition ?? 0, 0, 100);
  }

  const startValue = clamp(definition.startValue, 0, 100);
  const endValue = clamp(definition.endValue, 0, 100);
  const totalDays = Math.max(1, daysBetween(definition.endDate, definition.startDate));
  const currentDays = daysBetween(dateString, definition.startDate);

  if (currentDays <= 0) return startValue;
  if (currentDays >= totalDays) return endValue;

  const t = currentDays / totalDays;
  const s = transition(t, Number(definition.steepness), Number(definition.midpoint));
  return clamp(startValue + (endValue - startValue) * s, 0, 100);
}

/** Recommendation percentages for Eisenhower quadrants. */
export function recommendationPercentages(importance, urgency) {
  const i = clamp(importance, 0, 100) / 100;
  const u = clamp(urgency, 0, 100) / 100;
  const start = i * u;
  const plan = i * (1 - u);
  const delegate = (1 - i) * u;
  const drop = (1 - i) * (1 - u);
  const sum = start + plan + delegate + drop || 1;
  return {
    start: (start / sum) * 100,
    plan: (plan / sum) * 100,
    delegate: (delegate / sum) * 100,
    drop: (drop / sum) * 100,
  };
}

/** Sorting score from urgency/importance weighted blend. */
export function taskSortScore(importance, urgency, urgencyWeight = 0.5) {
  const safeUrgencyWeight = clamp(Number(urgencyWeight), 0.15, 0.85);
  const importanceWeight = 1 - safeUrgencyWeight;
  const weighted = (urgency * safeUrgencyWeight) + (importance * importanceWeight);
  const quadrantBonus = recommendationPercentages(importance, urgency);
  return weighted + quadrantBonus.start * 0.25 + quadrantBonus.plan * 0.1;
}

/** Enriched task data used for rendering and sorting. */
export function evaluateTask(task, settings, dateString = new Date().toISOString().slice(0, 10)) {
  const importance = evaluateValue(task.importance, dateString);
  const urgency = evaluateValue(task.urgency, dateString);
  const recommendation = recommendationPercentages(importance, urgency);
  const legacySlope = Math.min(0, Number(settings?.sortSlope ?? -1));
  const legacyUrgencyWeight = 1 / (1 + Math.abs(legacySlope));
  const urgencyWeight = settings?.urgencyWeight ?? legacyUrgencyWeight;
  return {
    task,
    importance,
    urgency,
    recommendation,
    sortScore: taskSortScore(importance, urgency, urgencyWeight),
  };
}
