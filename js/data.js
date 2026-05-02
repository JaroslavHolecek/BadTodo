import { clearAppData, loadAppData, saveAppData } from './db.js';
import { createAppData, createContext, createTask } from './models.js';
import { deepClone } from './utils.js';

/** Plain-data application repository. Functions validate and mutate AppData intentionally. */
export const AppData = {
  data: null,
  onChange: null,

  async init() {
    this.data = await loadAppData();
    if (!this.data) {
      this.data = createAppData();
      await this.save();
    }
    return this.data;
  },

  async save() {
    await saveAppData(this.data);
    if (typeof this.onChange === 'function') this.onChange(this.data);
  },

  getActiveContext() {
    return this.data.contexts.find((context) => context.id === this.data.activeContextId) ?? this.data.contexts[0] ?? null;
  },

  async setActiveContext(contextId) {
    if (!this.data.contexts.some((context) => context.id === contextId)) return;
    this.data.activeContextId = contextId;
    await this.save();
  },

  async addContext(values) {
    const context = createContext(values);
    this.data.contexts.push(context);
    this.data.activeContextId = context.id;
    await this.save();
    return context;
  },

  async updateContext(contextId, values) {
    const context = this.data.contexts.find((item) => item.id === contextId);
    if (!context) return null;
    Object.assign(context, values, { updatedAt: new Date().toISOString() });
    await this.save();
    return context;
  },

  exportContext(contextId) {
    const context = this.data.contexts.find((item) => item.id === contextId);
    if (!context) throw new Error('Kontext nebyl nalezen.');
    return JSON.stringify(deepClone(context), null, 2);
  },

  async importContext(jsonText) {
    const imported = JSON.parse(jsonText);
    if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
      throw new Error('Import neobsahuje platný kontext.');
    }
    if (!Array.isArray(imported.tasks)) {
      throw new Error('Importovaný kontext neobsahuje pole úkolů.');
    }

    const context = createContext({
      ...deepClone(imported),
      id: undefined,
      createdAt: imported.createdAt,
    });
    this.data.contexts.push(context);
    this.data.activeContextId = context.id;
    await this.save();
    return context;
  },

  async deleteContext(contextId) {
    if (this.data.contexts.length <= 1) throw new Error('Aplikace musí mít alespoň jeden kontext.');
    this.data.contexts = this.data.contexts.filter((context) => context.id !== contextId);
    if (this.data.activeContextId === contextId) this.data.activeContextId = this.data.contexts[0].id;
    await this.save();
  },

  findTask(taskId, tasks = this.getActiveContext()?.tasks ?? [], parent = null) {
    for (const task of tasks) {
      if (task.id === taskId) return { task, parent, list: tasks };
      const found = this.findTask(taskId, task.subTasks ?? [], task);
      if (found) return found;
    }
    return null;
  },

  async addTask(contextId, values, parentTaskId = null) {
    const context = this.data.contexts.find((item) => item.id === contextId);
    if (!context) throw new Error('Kontext nebyl nalezen.');
    const task = createTask(values);
    if (parentTaskId) {
      const found = this.findTask(parentTaskId, context.tasks);
      if (!found) throw new Error('Nadřazený úkol nebyl nalezen.');
      found.task.subTasks = found.task.subTasks ?? [];
      found.task.subTasks.push(task);
      found.task.expanded = true;
    } else {
      context.tasks.push(task);
    }
    context.updatedAt = new Date().toISOString();
    await this.save();
    return task;
  },

  async updateTask(taskId, values) {
    const found = this.findTask(taskId);
    if (!found) return null;
    Object.assign(found.task, values, { updatedAt: new Date().toISOString() });
    await this.save();
    return found.task;
  },

  async deleteTask(taskId) {
    const found = this.findTask(taskId);
    if (!found) return;
    found.list.splice(found.list.findIndex((task) => task.id === taskId), 1);
    await this.save();
  },

  async updateSettings(values) {
    this.data.settings = { ...this.data.settings, ...values };
    await this.save();
  },

  async importData(jsonText) {
    const imported = JSON.parse(jsonText);
    if (!imported || !Array.isArray(imported.contexts)) throw new Error('Import neobsahuje platná data aplikace.');
    this.data = imported;
    await this.save();
  },

  exportData() {
    return JSON.stringify(this.data, null, 2);
  },

  async reset() {
    await clearAppData();
    this.data = createAppData();
    await this.save();
  },

  cloneDefaultTaskValues() {
    return {
      completion: this.data.settings.defaultCompletion,
      importance: deepClone(this.data.settings.defaultImportance),
      urgency: deepClone(this.data.settings.defaultUrgency),
    };
  },
};
