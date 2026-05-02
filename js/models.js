import { addDaysISO, generateId, todayISO } from './utils.js';

/** Create a plain-data dynamic value definition. */
export function createDynamicValue(overrides = {}) {
  const startDate = overrides.startDate ?? todayISO();
  return {
    type: 'dynamic',
    startDate,
    startValue: overrides.startValue ?? 50,
    endDate: overrides.endDate ?? addDaysISO(startDate, 30),
    endValue: overrides.endValue ?? 80,
    steepness: overrides.steepness ?? 8,
    midpoint: overrides.midpoint ?? 0.5,
  };
}

/** Create a value definition that can be constant or dynamic. */
export function createValueDefinition(value = 50) {
  if (typeof value === 'object' && value !== null) return value;
  return { type: 'constant', value };
}

/** Create a plain-data Task object. */
export function createTask(overrides = {}) {
  return {
    id: overrides.id ?? generateId('task'),
    title: overrides.title ?? '',
    shortDescription: overrides.shortDescription ?? '',
    longDescription: overrides.longDescription ?? '',
    completion: overrides.completion ?? 0,
    importance: overrides.importance ?? createValueDefinition(50),
    urgency: overrides.urgency ?? createValueDefinition(50),
    subTasks: overrides.subTasks ?? [],
    expanded: overrides.expanded ?? false,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Create a plain-data Context object. */
export function createContext(overrides = {}) {
  return {
    id: overrides.id ?? generateId('context'),
    title: overrides.title ?? 'Můj kontext',
    description: overrides.description ?? '',
    tasks: overrides.tasks ?? [],
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Create the whole AppData object used by the application. */
export function createAppData() {
  const defaultContext = createContext({
    title: 'Osobní úkoly',
    description: 'Výchozí lokální kontext. Můžete ho přejmenovat nebo vytvořit další.',
  });
  return {
    version: 1,
    activeContextId: defaultContext.id,
    settings: {
      urgencyWeight: 0.5,
      defaultCompletion: 0,
      defaultImportance: createValueDefinition(50),
      defaultUrgency: createValueDefinition(50),
      githubUrl: '',
      donateUrl: '',
      author: '',
      license: 'MIT',
    },
    contexts: [defaultContext],
  };
}
