import { AppData } from './data.js';
import { createDynamicValue, createValueDefinition } from './models.js';
import { drawDynamicChart, attachChartDrag } from './charts.js';
import { evaluateTask, evaluateValue } from './scoring.js';
import { addDaysISO, clamp, daysBetween, deepClone, escapeHtml, parseNumber, todayISO } from './utils.js';

const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const APP_META = {
  githubUrl: 'https://github.com/JaroslavHolecek/BadTodo',
  author: 'Jaroslav Holeček',
  license: 'GNU General Public License v3.0',
};

/** Rendering and UI event functions. */
export const AppGUI = {
  currentRoute: '/',
  homeViewMode: 'list',
  taskDetailSubtasksViewMode: 'list',
  deferredInstallPrompt: null,

  render() {
    this.currentRoute = location.hash.replace('#', '') || '/';
    document.querySelectorAll('.main-nav a').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${this.currentRoute}`);
    });

    if (this.currentRoute.startsWith('/task/')) return this.renderTaskPage(this.currentRoute.split('/')[2]);
    if (this.currentRoute === '/contexts') return this.renderContextsPage();
    if (this.currentRoute === '/settings') return this.renderSettingsPage();
    if (this.currentRoute === '/about') return this.renderAboutPage();
    return this.renderHomePage();
  },

  renderHomePage() {
    const context = AppData.getActiveContext();
    if (!context) {
      app.innerHTML = `<div class="empty">Neexistuje žádný kontext.</div>`;
      return;
    }
    const tasksHtml = this.homeViewMode === 'matrix'
      ? this.renderTaskMatrix(context.tasks)
      : this.renderTaskList(context.tasks, 0);
    app.innerHTML = `
      <section class="page-header">
        <div>
          <h1 class="context-title" data-toggle-context-description>${escapeHtml(context.title)}</h1>
          <div class="context-description card ${context.description ? '' : 'open'}" id="context-description">
            ${context.description ? escapeHtml(context.description) : 'Tento kontext zatím nemá popisek.'}
          </div>
        </div>
        <button class="btn primary" data-new-task>+ Nový úkol</button>
      </section>
      <section class="card stack">
        <div class="spread">
          <h2>Úkoly</h2>
          <div class="row">
            <button class="btn small ${this.homeViewMode === 'list' ? 'primary' : ''}" data-view-mode="list">Seznam</button>
            <button class="btn small ${this.homeViewMode === 'matrix' ? 'primary' : ''}" data-view-mode="matrix">Matice</button>
          </div>
        </div>
        ${tasksHtml || '<div class="empty">Zatím zde nejsou žádné úkoly. Vytvořte první.</div>'}
      </section>
    `;
    app.querySelector('[data-toggle-context-description]')?.addEventListener('click', () => {
      app.querySelector('#context-description')?.classList.toggle('open');
    });
    app.querySelectorAll('[data-view-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        this.homeViewMode = button.dataset.viewMode;
        this.renderHomePage();
      });
    });
    app.querySelector('[data-new-task]')?.addEventListener('click', () => this.showTaskModal(null));
    if (this.homeViewMode === 'matrix') this.bindTaskMatrixEvents(); else this.bindTaskListEvents();
  },

  renderTaskList(tasks, level) {
    const settings = AppData.data.settings;
    return [...(tasks ?? [])]
      .map((task) => evaluateTask(task, settings))
      .sort((a, b) => b.sortScore - a.sortScore)
      .map(({ task, recommendation, sortScore }) => {
        const subTaskAvg = this.getSubTaskCompletionAverage(task);
        const completionColor = this.getCompletionBackground(task.completion);
        const isCompleted = this.isTaskFullyCompleted(task);
        return `
        <article class="card task-card ${isCompleted ? 'completed' : ''}" data-task-id="${task.id}" style="background:${completionColor}">
          <div class="task-head">
            <div class="task-main-row">
              <h3 class="task-title">${escapeHtml(task.title || 'Bez názvu')}</h3>
              <div class="row task-metrics-row">
                <span class="metric-pill">splnění ${Math.round(task.completion)} %</span>
                ${subTaskAvg !== null ? `<span class="metric-pill">podúkoly ${Math.round(subTaskAvg)} %</span>` : ''}
                <span class="metric-pill">skóre ${Math.round(sortScore)}</span>
              </div>
            </div>
          </div>
          ${this.renderScoreLine(recommendation)}
          <div class="task-details ${task.expanded ? 'open' : ''}">
            <p>${escapeHtml(task.shortDescription || 'Bez krátkého popisku.')}</p>
            <div class="row">
              <button class="btn small" data-adjust-completion="${task.id}" data-adjust-delta="-10">-10 %</button>
              <button class="btn small" data-adjust-completion="${task.id}" data-adjust-delta="10">+10 %</button>
              <a class="btn small primary" href="#/task/${task.id}">Detail</a>
              <button class="btn small" data-add-subtask="${task.id}">+ Podúkol</button>
            </div>
            ${isCompleted ? `<div class="row" style="justify-content:flex-end"><button class="btn small danger" data-delete-quick-task="${task.id}">Smazat</button></div>` : ''}
            ${(task.subTasks?.length ?? 0) ? `<div class="subtasks">${this.renderTaskList(task.subTasks, level + 1)}</div>` : '<p class="subtle">Žádné podúkoly.</p>'}
          </div>
        </article>
      `;
      }).join('');
  },

  renderTaskMatrix(tasks, options = {}) {
    const { includeNested = false } = options;
    const settings = AppData.data.settings;
    const matrixTasks = includeNested ? this.flattenTasks(tasks) : [...(tasks ?? [])];
    const allTasks = matrixTasks
      .map((task) => evaluateTask(task, settings))
      .sort((a, b) => b.sortScore - a.sortScore);
    if (!allTasks.length) return '';

    const points = allTasks.map(({ task, importance, urgency, sortScore }) => {
      const x = 40 + (urgency / 100) * 520;
      const y = 360 - (importance / 100) * 320;
      const color = this.getCompletionPointColor(task.completion);
      const subTaskAvg = this.getSubTaskCompletionAverage(task);
      const subTaskColor = subTaskAvg !== null ? this.getCompletionPointColor(subTaskAvg) : null;
      const isCompleted = this.isTaskFullyCompleted(task);
      const outerOpacity = isCompleted ? 0.45 : 1;
      const innerCircle = subTaskColor
        ? `<circle cx="${x}" cy="${y}" r="3.6" fill="${subTaskColor}" opacity="${outerOpacity}" pointer-events="none"></circle>`
        : '';
      return `<g opacity="${outerOpacity}">
        <circle cx="${x}" cy="${y}" r="7" fill="${color}" stroke="#0f172a" stroke-width="1"
          data-matrix-task="${task.id}" data-matrix-title="${escapeHtml(task.title || 'Bez názvu')}" data-matrix-score="${Math.round(sortScore)}"></circle>
        ${innerCircle}
      </g>`;
    }).join('');

    return `
      <div class="matrix-wrap">
        <svg class="task-matrix" viewBox="0 0 620 420" role="img" aria-label="Matice úkolů podle naléhavosti a důležitosti">
          <rect x="40" y="40" width="520" height="320" fill="#ffffff" stroke="#d8dee9"></rect>
          <rect x="40" y="40" width="260" height="160" fill="rgba(245, 158, 11, 0.10)"></rect>
          <rect x="300" y="40" width="260" height="160" fill="rgba(239, 68, 68, 0.10)"></rect>
          <rect x="40" y="200" width="260" height="160" fill="rgba(156, 163, 175, 0.10)"></rect>
          <rect x="300" y="200" width="260" height="160" fill="rgba(59, 130, 246, 0.10)"></rect>
          <line x1="300" y1="40" x2="300" y2="360" stroke="#e5e7eb"></line>
          <line x1="40" y1="200" x2="560" y2="200" stroke="#e5e7eb"></line>
          <text x="170" y="125" text-anchor="middle" font-size="34" font-weight="800" fill="rgba(146, 64, 14, 0.16)">NAPLÁNOVAT</text>
          <text x="430" y="125" text-anchor="middle" font-size="38" font-weight="800" fill="rgba(185, 28, 28, 0.16)">ZAČÍT</text>
          <text x="170" y="285" text-anchor="middle" font-size="40" font-weight="800" fill="rgba(71, 85, 105, 0.16)">NIC</text>
          <text x="430" y="285" text-anchor="middle" font-size="32" font-weight="800" fill="rgba(30, 64, 175, 0.16)">DELEGOVAT</text>
          <text x="300" y="405" text-anchor="middle" font-size="13" fill="#475569">Naléhavost (X)</text>
          <text x="14" y="210" text-anchor="middle" font-size="13" fill="#475569" transform="rotate(-90 14 210)">Důležitost (Y)</text>
          ${points}
        </svg>
        <p class="subtle">Klikněte na bod úkolu pro popis a přechod do detailu.</p>
      </div>
    `;
  },

  renderScoreLine(scores) {
    return `
      <div class="score-line" title="Začni ${Math.round(scores.start)} %, naplánuj ${Math.round(scores.plan)} %, deleguj ${Math.round(scores.delegate)} %, nic ${Math.round(scores.drop)} %">
        <span class="score-start" style="width:${scores.start}%"></span>
        <span class="score-plan" style="width:${scores.plan}%"></span>
        <span class="score-delegate" style="width:${scores.delegate}%"></span>
        <span class="score-drop" style="width:${scores.drop}%"></span>
      </div>`;
  },

  renderLegend() {
    return [
      ['score-start', 'pustit se do toho'],
      ['score-plan', 'naplánovat'],
      ['score-delegate', 'delegovat'],
      ['score-drop', 'nic'],
    ].map(([className, label]) => `<span class="legend-item"><span class="swatch ${className}"></span>${label}</span>`).join('');
  },

  bindTaskListEvents() {
    app.querySelectorAll('.task-card[data-task-id]').forEach((card) => card.addEventListener('click', async (event) => {
      if (event.target.closest('[data-add-subtask], [data-edit-task], a, button')) return;
      if (event.target.closest('.task-card[data-task-id]') !== card) return;
      event.stopPropagation();
      const found = AppData.findTask(card.dataset.taskId);
      if (found) await AppData.updateTask(found.task.id, { expanded: !found.task.expanded });
      this.render();
    }));
    app.querySelectorAll('[data-add-subtask]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.showTaskModal(null, button.dataset.addSubtask);
    }));
    app.querySelectorAll('[data-adjust-completion]').forEach((button) => button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const delta = parseNumber(button.dataset.adjustDelta, 0);
      await this.adjustTaskCompletion(button.dataset.adjustCompletion, delta);
      this.render();
    }));
    app.querySelectorAll('[data-delete-quick-task]').forEach((button) => button.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!confirm('Opravdu smazat tento úkol včetně podúkolů?')) return;
      await AppData.deleteTask(button.dataset.deleteQuickTask);
      this.render();
    }));
    app.querySelectorAll('[data-edit-task]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.showTaskModal(AppData.findTask(button.dataset.editTask)?.task ?? null);
      });
    });
  },

  bindTaskMatrixEvents() {
    app.querySelectorAll('[data-matrix-task]').forEach((point) => {
      point.style.cursor = 'pointer';
      point.addEventListener('click', () => {
        this.openMatrixQuickDetail(point.dataset.matrixTask, point.dataset.matrixScore);
      });
    });
  },

  openMatrixQuickDetail(taskId, scoreLabel = null) {
    const found = AppData.findTask(taskId);
    if (!found) return;
    const { task } = found;
    const evaluated = evaluateTask(task, AppData.data.settings);
    const subTaskAvg = this.getSubTaskCompletionAverage(task);
    const shownScore = scoreLabel ?? Math.round(evaluated.sortScore);
    const modalBackground = this.getCompletionBackground(task.completion);
    const isCompleted = this.isTaskFullyCompleted(task);

    this.openModal(`
      <div class="modal stack" style="background:${modalBackground}">
        <h2>${escapeHtml(task.title || 'Bez názvu')}</h2>
        <p>${escapeHtml(task.shortDescription || 'Bez krátkého popisku.')}</p>
        <div class="row">
          <span class="metric-pill">splnění ${Math.round(task.completion)} %</span>
          ${subTaskAvg !== null ? `<span class="metric-pill">podúkoly ${Math.round(subTaskAvg)} %</span>` : ''}
          <span class="metric-pill">skóre ${escapeHtml(String(shownScore))}</span>
        </div>
        ${this.renderScoreLine(evaluated.recommendation)}
        ${this.renderSubTaskQuickList(task)}
        <div class="row">
          <button class="btn small" data-adjust-completion="${task.id}" data-adjust-delta="-10">-10 %</button>
          <button class="btn small" data-adjust-completion="${task.id}" data-adjust-delta="10">+10 %</button>
          <button class="btn small" data-add-subtask="${task.id}">+ Podúkol</button>
        </div>
        ${isCompleted ? `<div class="row" style="justify-content:flex-end"><button class="btn small danger" data-delete-quick-task="${task.id}">Smazat</button></div>` : ''}
        <div class="form-actions">
          <a class="btn primary" href="#/task/${task.id}" data-close-modal>Detail</a>
          <button type="button" class="btn" data-close-modal>Zavřít</button>
        </div>
      </div>
    `);

    modalRoot.querySelectorAll('[data-adjust-completion]').forEach((button) => button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const delta = parseNumber(button.dataset.adjustDelta, 0);
      await this.adjustTaskCompletion(button.dataset.adjustCompletion, delta);
      this.openMatrixQuickDetail(button.dataset.adjustCompletion);
      this.render();
    }));
    modalRoot.querySelectorAll('[data-add-subtask]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.showTaskModal(null, button.dataset.addSubtask);
    }));
    modalRoot.querySelectorAll('[data-delete-quick-task]').forEach((button) => button.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!confirm('Opravdu smazat tento úkol včetně podúkolů?')) return;
      await AppData.deleteTask(button.dataset.deleteQuickTask);
      this.closeModal();
      this.render();
    }));
  },

  renderTaskPage(taskId) {
    const found = AppData.findTask(taskId);
    if (!found) {
      app.innerHTML = `<div class="empty">Úkol nebyl nalezen. <a href="#/">Zpět na úvod</a></div>`;
      return;
    }
    const { task } = found;
    const evaluated = evaluateTask(task, AppData.data.settings);
    const subTasksHtml = !task.subTasks?.length
      ? '<div class="empty">Žádné podúkoly.</div>'
      : this.taskDetailSubtasksViewMode === 'matrix'
        ? this.renderTaskMatrix(task.subTasks, { includeNested: true })
        : this.renderTaskList(task.subTasks, 1);
    app.innerHTML = `
      <section class="page-header">
        <div><h1>${escapeHtml(task.title)}</h1><p class="subtle">Úplný detail a nastavení úkolu.</p></div>
        <div class="row">
          <button class="btn" data-add-subtask="${task.id}">+ Přidat podúkol</button>
          <button class="btn primary" data-edit-task="${task.id}">Upravit</button>
          <button class="btn danger" data-delete-task="${task.id}">Smazat</button>
        </div>
      </section>
      <div class="grid two">
        <section class="card stack">
          <h2>Hodnoty</h2>
          <p><strong>Splnění:</strong> ${Math.round(task.completion)} %</p>
          <p><strong>Důležitost dnes:</strong> ${Math.round(evaluated.importance)} %</p>
          <p><strong>Naléhavost dnes:</strong> ${Math.round(evaluated.urgency)} %</p>
          <p><strong>Vyhodnocené skóre:</strong> ${Math.round(evaluated.sortScore)}</p>
          ${this.renderScoreLine(evaluated.recommendation)}
          <div class="legend">${this.renderLegend()}</div>
          <div class="value-summary-grid">
            ${this.renderValueDefinitionSummary('Nastavení důležitosti', task.importance)}
            ${this.renderValueDefinitionSummary('Nastavení naléhavosti', task.urgency)}
          </div>
        </section>
        <section class="card stack">
          <h2>Popisky</h2>
          <p><strong>Krátký:</strong> ${escapeHtml(task.shortDescription || '—')}</p>
          <p><strong>Dlouhý:</strong></p>
          <p>${escapeHtml(task.longDescription || '—')}</p>
        </section>
      </div>
      <section class="card stack" style="margin-top:1rem">
        <div class="spread">
          <h2>Podúkoly</h2>
          <div class="row">
            <button class="btn small ${this.taskDetailSubtasksViewMode === 'list' ? 'primary' : ''}" data-task-sub-view="list">Seznam</button>
            <button class="btn small ${this.taskDetailSubtasksViewMode === 'matrix' ? 'primary' : ''}" data-task-sub-view="matrix">Matice</button>
          </div>
        </div>
        ${subTasksHtml}
      </section>
    `;
    app.querySelectorAll('[data-task-sub-view]').forEach((button) => {
      button.addEventListener('click', () => {
        this.taskDetailSubtasksViewMode = button.dataset.taskSubView;
        this.renderTaskPage(taskId);
      });
    });
    app.querySelector('[data-edit-task]')?.addEventListener('click', () => this.showTaskModal(task));
    app.querySelector('[data-add-subtask]')?.addEventListener('click', () => this.showTaskModal(null, task.id));
    app.querySelector('[data-delete-task]')?.addEventListener('click', async () => {
      if (confirm('Opravdu smazat tento úkol včetně podúkolů?')) {
        await AppData.deleteTask(task.id);
        location.hash = '#/';
      }
    });
    if (this.taskDetailSubtasksViewMode === 'matrix') this.bindTaskMatrixEvents(); else this.bindTaskListEvents();
  },

  renderContextsPage() {
    app.innerHTML = `
      <section class="page-header"><div><h1>Kontexty</h1><p class="subtle">Přepínejte mezi samostatnými seznamy úkolů.</p></div><div class="row"><button class="btn" data-import-context>Importovat kontext</button><button class="btn primary" data-new-context>+ Nový kontext</button></div></section>
      <section class="card stack">
        <table class="table"><thead><tr><th>Název</th><th>Popisek</th><th>Úkolů</th><th>Akce</th></tr></thead><tbody>
          ${AppData.data.contexts.map((context) => `<tr>
            <td><strong>${escapeHtml(context.title)}</strong>${context.id === AppData.data.activeContextId ? ' <span class="metric-pill">aktivní</span>' : ''}</td>
            <td>${escapeHtml(context.description || '—')}</td>
            <td>${context.tasks.length}</td>
            <td class="row">
              <button class="btn small" data-switch-context="${context.id}">Přepnout</button>
              <button class="btn small" data-export-context="${context.id}">Stáhnout JSON</button>
              <button class="btn small" data-edit-context="${context.id}">Upravit</button>
              <button class="btn small danger" data-delete-context="${context.id}">Smazat</button>
            </td>
          </tr>`).join('')}
        </tbody></table>
      </section>`;
    app.querySelector('[data-new-context]')?.addEventListener('click', () => this.showContextModal());
    app.querySelector('[data-import-context]')?.addEventListener('click', () => this.showImportContextModal());
    app.querySelectorAll('[data-switch-context]').forEach((button) => button.addEventListener('click', async () => { await AppData.setActiveContext(button.dataset.switchContext); this.render(); }));
    app.querySelectorAll('[data-export-context]').forEach((button) => button.addEventListener('click', () => this.downloadContextExport(button.dataset.exportContext)));
    app.querySelectorAll('[data-edit-context]').forEach((button) => button.addEventListener('click', () => this.showContextModal(AppData.data.contexts.find((context) => context.id === button.dataset.editContext))));
    app.querySelectorAll('[data-delete-context]').forEach((button) => button.addEventListener('click', async () => {
      if (confirm('Opravdu smazat kontext i se všemi úkoly?')) {
        try { await AppData.deleteContext(button.dataset.deleteContext); this.render(); }
        catch (error) { alert(error.message); }
      }
    }));
  },

  renderSettingsPage() {
    const settings = AppData.data.settings;
    const legacySlope = Math.min(0, parseNumber(settings.sortSlope, -1));
    const urgencyWeight = clamp(parseNumber(settings.urgencyWeight, 1 / (1 + Math.abs(legacySlope))), 0.15, 0.85);
    const importanceWeight = 1 - urgencyWeight;
    app.innerHTML = `
      <section class="page-header"><div><h1>Nastavení</h1><p class="subtle">Váha řazení, výchozí hodnoty a import/export dat.</p></div></section>
      <form class="card stack" id="settings-form">
        <div class="field">
          <label>Váha mezi naléhavostí a důležitostí</label>
          <input name="urgencyWeight" type="range" min="0.50" max="0.95" step="0.01" value="${urgencyWeight}">
          <span class="help" data-urgency-weight-help>Naléhavost ${Math.round(urgencyWeight * 100)} % / Důležitost ${Math.round(importanceWeight * 100)} %</span>
        </div>
        <div class="field"><label>Výchozí splnění nového úkolu</label><input name="defaultCompletion" type="number" min="0" max="100" value="${settings.defaultCompletion}"></div>
        <h2>Výchozí důležitost</h2><div id="default-importance"></div>
        <h2>Výchozí naléhavost</h2><div id="default-urgency"></div>
        <div class="form-actions"><button class="btn primary">Uložit nastavení</button><button type="button" class="btn" data-export>Exportovat JSON</button><button type="button" class="btn" data-import>Importovat JSON</button><button type="button" class="btn danger" data-reset>Reset</button></div>
      </form>`;
    const state = {
      defaultImportance: deepClone(settings.defaultImportance),
      defaultUrgency: deepClone(settings.defaultUrgency),
    };
    this.mountValueEditor(app.querySelector('#default-importance'), 'defaultImportance', state);
    this.mountValueEditor(app.querySelector('#default-urgency'), 'defaultUrgency', state);
    app.querySelector('[name="urgencyWeight"]')?.addEventListener('input', (event) => {
      const nextUrgencyWeight = clamp(parseNumber(event.target.value, 0.5), 0.50, 0.95);
      const nextImportanceWeight = 1 - nextUrgencyWeight;
      const help = app.querySelector('[data-urgency-weight-help]');
      if (help) help.textContent = `Naléhavost ${Math.round(nextUrgencyWeight * 100)} % / Důležitost ${Math.round(nextImportanceWeight * 100)} %`;
    });
    app.querySelector('#settings-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await AppData.updateSettings({
        urgencyWeight: clamp(parseNumber(form.get('urgencyWeight'), 0.5), 0.50, 0.95),
        defaultCompletion: clamp(parseNumber(form.get('defaultCompletion'), 0), 0, 100),
        defaultImportance: state.defaultImportance,
        defaultUrgency: state.defaultUrgency,
      });
      this.renderSettingsPage();
    });
    app.querySelector('[data-export]').addEventListener('click', () => this.downloadExport());
    app.querySelector('[data-import]').addEventListener('click', () => this.showImportModal());
    app.querySelector('[data-reset]').addEventListener('click', async () => { if (confirm('Smazat lokální data a začít znovu?')) { await AppData.reset(); this.render(); } });
  },

  renderAboutPage() {
    const installSupported = Boolean(this.deferredInstallPrompt) || ('BeforeInstallPromptEvent' in window);
    app.innerHTML = `
      <section class="page-header"><div><h1>Informace o aplikaci</h1><p class="subtle">BadTodo je lokální PWA správce úkolů podle Eisenhowerovy matice.</p></div></section>
      <div class="grid two">
        <section class="card stack"><h2>Použití</h2><p>Vytvořte kontext, přidejte úkoly, nastavte splnění, důležitost a naléhavost. U hodnot můžete zvolit konstantu nebo změnu v čase s logistickým přechodem.</p><p>Čtyřbarevná čára ukazuje doporučení: začít, naplánovat, delegovat nebo neřešit.</p><div class="legend">${this.renderLegend()}</div></section>
        <section class="card stack"><h2>PWA</h2><p>Aplikace běží lokálně v prohlížeči a po první návštěvě ji lze instalovat.</p><button class="btn primary" data-install-pwa ${installSupported ? '' : 'disabled'}>Stáhnout aplikaci</button><p class="notice">Pokud tlačítko není aktivní, použijte nabídku prohlížeče „Instalovat aplikaci“.</p></section>
        <section class="card stack"><h2>Odkazy</h2><p>GitHub: <a href="${escapeHtml(APP_META.githubUrl)}" target="_blank" rel="noreferrer">${escapeHtml(APP_META.githubUrl)}</a></p><p>Pokud mě chcete podpořit, můžete přes PayPal: <a href="paypal.me/JaroslavHolecek" target="_blank" rel="noreferrer">paypal.me/JaroslavHolecek</a><br>Nebo přímo na účet 2302921023 / 2010</p></section>
        <section class="card stack"><h2>Licence a autor</h2><p>Licence: ${escapeHtml(APP_META.license)}</p><p>Autor: ${escapeHtml(APP_META.author)}</p></section>
      </div>`;
    app.querySelector('[data-install-pwa]')?.addEventListener('click', async () => {
      if (!this.deferredInstallPrompt) {
        alert('Instalační dialog není aktuálně dostupný. Otevřete nabídku prohlížeče a zvolte instalaci aplikace.');
        return;
      }
      this.deferredInstallPrompt.prompt();
      await this.deferredInstallPrompt.userChoice.catch(() => null);
      this.deferredInstallPrompt = null;
      this.renderAboutPage();
    });
  },

  setDeferredInstallPrompt(event) {
    this.deferredInstallPrompt = event;
    if (this.currentRoute === '/about') this.renderAboutPage();
  },

  flattenTasks(tasks, bucket = []) {
    (tasks ?? []).forEach((task) => {
      bucket.push(task);
      if (task.subTasks?.length) this.flattenTasks(task.subTasks, bucket);
    });
    return bucket;
  },

  getSubTaskCompletionAverage(task) {
    if (!task?.subTasks?.length) return null;
    const allSubTasks = this.flattenTasks(task.subTasks, []);
    if (!allSubTasks.length) return null;
    const sum = allSubTasks.reduce((acc, subTask) => acc + clamp(parseNumber(subTask.completion, 0), 0, 100), 0);
    return sum / allSubTasks.length;
  },

  isTaskFullyCompleted(task) {
    const isCurrentDone = clamp(parseNumber(task?.completion, 0), 0, 100) >= 100;
    if (!isCurrentDone) return false;
    if (!(task?.subTasks?.length ?? 0)) return true;
    return task.subTasks.every((subTask) => this.isTaskFullyCompleted(subTask));
  },

  renderSubTaskQuickList(task) {
    if (!(task?.subTasks?.length ?? 0)) return '<p class="subtle">Žádné podúkoly.</p>';
    const rows = task.subTasks.map((subTask) => `
      <li style="background:${this.getCompletionBackground(subTask.completion)}">
        <span>${escapeHtml(subTask.title || 'Bez názvu')}</span>
        <span class="metric-pill">${Math.round(clamp(parseNumber(subTask.completion, 0), 0, 100))} %</span>
      </li>
    `).join('');
    return `<ul class="subtask-quick-list">${rows}</ul>`;
  },

  getCompletionBackground(completion) {
    const t = clamp(parseNumber(completion, 0), 0, 100) / 100;
    const start = { r: 255, g: 255, b: 255 };
    const end = { r: 209, g: 250, b: 229 };
    const mix = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${mix(start.r, end.r)} ${mix(start.g, end.g)} ${mix(start.b, end.b)})`;
  },

  getCompletionPointColor(completion) {
    const t = clamp(parseNumber(completion, 0), 0, 100) / 100;
    const hue = 18 + (102 * t);
    return `hsl(${hue} 72% 45%)`;
  },

  async adjustTaskCompletion(taskId, delta) {
    const found = AppData.findTask(taskId);
    if (!found) return;
    const nextCompletion = clamp(parseNumber(found.task.completion, 0) + parseNumber(delta, 0), 0, 100);
    await AppData.updateTask(taskId, { completion: nextCompletion });
  },

  renderValueDefinitionSummary(title, definition) {
    const safeDefinition = definition ?? createValueDefinition(0);
    if (!safeDefinition || safeDefinition.type === 'constant') {
      const value = clamp(parseNumber(safeDefinition?.value, 0), 0, 100);
      return `
        <section class="value-summary">
          <h3>${escapeHtml(title)}</h3>
          <p><strong>Režim:</strong> konstantní</p>
          <p><strong>Hodnota:</strong> ${Math.round(value)} %</p>
        </section>
      `;
    }

    const startValue = clamp(parseNumber(safeDefinition.startValue, 0), 0, 100);
    const endValue = clamp(parseNumber(safeDefinition.endValue, 0), 0, 100);
    return `
      <section class="value-summary">
        <h3>${escapeHtml(title)}</h3>
        <p><strong>Režim:</strong> logistická změna</p>
        <p><strong>První den:</strong> ${escapeHtml(safeDefinition.startDate)} (${Math.round(startValue)} %)</p>
        <p><strong>Poslední den:</strong> ${escapeHtml(safeDefinition.endDate)} (${Math.round(endValue)} %)</p>
        <p><strong>Strmost:</strong> ${Math.round(parseNumber(safeDefinition.steepness, 0) * 10) / 10}</p>
        <p><strong>Okamžik změny:</strong> ${Math.round(parseNumber(safeDefinition.midpoint, 0.5) * 100)} %</p>
      </section>
    `;
  },

  showContextModal(context = null) {
    this.openModal(`
      <div class="modal"><h2>${context ? 'Upravit kontext' : 'Nový kontext'}</h2>
      <form id="context-form" class="stack">
        <div class="field"><label>Název *</label><input name="title" required value="${escapeHtml(context?.title ?? '')}"></div>
        <div class="field"><label>Popisek</label><textarea name="description">${escapeHtml(context?.description ?? '')}</textarea></div>
        <div class="form-actions sticky-actions"><button class="btn primary">Uložit</button><button type="button" class="btn" data-close-modal>Zrušit</button></div>
      </form></div>`);
    modalRoot.querySelector('#context-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const values = { title: String(form.get('title')).trim(), description: String(form.get('description') ?? '') };
      if (context) await AppData.updateContext(context.id, values); else await AppData.addContext(values);
      this.closeModal(); this.render();
    });
  },

  showTaskModal(task = null, parentTaskId = null) {
    const defaults = AppData.cloneDefaultTaskValues();
    const values = task ? deepClone(task) : { ...defaults, title: '', shortDescription: '', longDescription: '' };
    const state = { importance: deepClone(values.importance), urgency: deepClone(values.urgency) };
    this.openModal(`
      <div class="modal"><h2>${task ? 'Upravit úkol' : parentTaskId ? 'Nový podúkol' : 'Nový úkol'}</h2>
      <form id="task-form" class="stack">
        <div class="field"><label>Název *</label><input name="title" required value="${escapeHtml(values.title ?? '')}"></div>
        <div class="field"><label>Krátký popisek</label><input name="shortDescription" value="${escapeHtml(values.shortDescription ?? '')}"></div>
        <div class="field"><label>Dlouhý popisek</label><textarea name="longDescription">${escapeHtml(values.longDescription ?? '')}</textarea></div>
        <div class="field"><label>Splnění 0–100 *</label><input name="completion" required type="number" min="0" max="100" value="${values.completion ?? defaults.completion}"></div>
        <h3>Důležitost</h3><div id="task-importance"></div>
        <h3>Naléhavost</h3><div id="task-urgency"></div>
        <div class="form-actions"><button class="btn primary">Uložit</button><button type="button" class="btn" data-close-modal>Zrušit</button></div>
      </form></div>`);
    this.mountValueEditor(modalRoot.querySelector('#task-importance'), 'importance', state);
    this.mountValueEditor(modalRoot.querySelector('#task-urgency'), 'urgency', state);
    modalRoot.querySelector('#task-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = {
        title: String(form.get('title')).trim(),
        shortDescription: String(form.get('shortDescription') ?? ''),
        longDescription: String(form.get('longDescription') ?? ''),
        completion: clamp(parseNumber(form.get('completion'), 0), 0, 100),
        importance: state.importance,
        urgency: state.urgency,
      };
      if (task) await AppData.updateTask(task.id, payload); else await AppData.addTask(AppData.getActiveContext().id, payload, parentTaskId);
      this.closeModal(); this.render();
    });
  },

  mountValueEditor(container, stateKey, state) {
    const definition = state[stateKey] ?? createValueDefinition(50);
    const dynamic = definition.type === 'dynamic';
    container.innerHTML = `
      <div class="value-editor" data-state-key="${stateKey}">
        <div class="mode-switch">
          <button type="button" class="btn small ${!dynamic ? 'primary' : ''}" data-mode="constant">Konstantní</button>
          <button type="button" class="btn small ${dynamic ? 'primary' : ''}" data-mode="dynamic">Měnící se</button>
        </div>
        <div class="value-editor-body"></div>
      </div>`;
    const editor = container.querySelector('.value-editor');
    const body = container.querySelector('.value-editor-body');
    const renderBody = () => {
      const def = state[stateKey];
      if (!def || def.type === 'constant') {
        body.innerHTML = `<div class="field"><label>Hodnota</label><input type="number" min="0" max="100" value="${def?.value ?? 50}" data-value-field="constant"></div>`;
        body.querySelector('[data-value-field]').addEventListener('input', (event) => { state[stateKey] = { type: 'constant', value: clamp(parseNumber(event.target.value, 0), 0, 100) }; });
        return;
      }
      body.innerHTML = `
        <div class="value-grid">
          <div class="field"><label>První den</label><input type="date" value="${def.startDate}" data-dyn="startDate"></div>
          <div class="field"><label>Hodnota v prvním dni</label><input type="number" min="0" max="100" value="${def.startValue}" data-dyn="startValue"></div>
          <div class="field"><label>Poslední den</label><input type="date" value="${def.endDate}" data-dyn="endDate"></div>
          <div class="field"><label>Hodnota v posledním dni</label><input type="number" min="0" max="100" value="${def.endValue}" data-dyn="endValue"></div>
          <div class="field"><label>Strmost</label><input type="range" min="0" max="40" step="0.1" value="${def.steepness}" data-dyn="steepness"><span class="help">${def.steepness}</span></div>
          <div class="field"><label>Okamžik změny</label><input type="range" min="0.02" max="0.98" step="0.01" value="${def.midpoint}" data-dyn="midpoint"><span class="help">${def.midpoint}</span></div>
        </div>
        <canvas aria-label="Graf měnící se hodnoty"></canvas>
        <p class="help">Černým bodem v grafu lze táhnout: doleva/doprava mění okamžik změny, nahoru/dolů strmost.</p>`;
      const canvas = body.querySelector('canvas');
      const update = () => {
        if (daysBetween(def.endDate, def.startDate) <= 0) def.endDate = addDaysISO(def.startDate, 1);
        drawDynamicChart(canvas, def);
      };
      body.querySelectorAll('[data-dyn]').forEach((input) => input.addEventListener('input', (event) => {
        const key = event.target.dataset.dyn;
        if (['startValue', 'endValue'].includes(key)) def[key] = clamp(parseNumber(event.target.value, 0), 0, 100);
        else if (['steepness'].includes(key)) def[key] = clamp(parseNumber(event.target.value, 0), 0, 40);
        else if (['midpoint'].includes(key)) def[key] = clamp(parseNumber(event.target.value, 0.5), 0.02, 0.98);
        else def[key] = event.target.value;
        event.target.closest('.field')?.querySelector('.help') && (event.target.closest('.field').querySelector('.help').textContent = event.target.value);
        update();
      }));
      attachChartDrag(canvas, def, () => {
        body.querySelector('[data-dyn="steepness"]').value = def.steepness;
        body.querySelector('[data-dyn="midpoint"]').value = def.midpoint;
        body.querySelector('[data-dyn="steepness"]').closest('.field').querySelector('.help').textContent = def.steepness;
        body.querySelector('[data-dyn="midpoint"]').closest('.field').querySelector('.help').textContent = def.midpoint;
        drawDynamicChart(canvas, def);
      });
      requestAnimationFrame(update);
    };
    editor.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      if (mode === 'constant') {
        const current = evaluateValue(state[stateKey], todayISO());
        state[stateKey] = { type: 'constant', value: Math.round(current) };
      } else {
        state[stateKey] = createDynamicValue({ startValue: evaluateValue(state[stateKey], todayISO()), endValue: 80 });
      }
      this.mountValueEditor(container, stateKey, state);
    }));
    renderBody();
  },

  showImportModal() {
    this.openModal(`<div class="modal"><h2>Import dat</h2><form id="import-form" class="stack"><div class="field"><label>JSON export</label><textarea name="json" required></textarea></div><div class="form-actions"><button class="btn primary">Importovat</button><button type="button" class="btn" data-close-modal>Zrušit</button></div></form></div>`);
    modalRoot.querySelector('#import-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await AppData.importData(new FormData(event.currentTarget).get('json')); this.closeModal(); this.render(); }
      catch (error) { alert(`Import selhal: ${error.message}`); }
    });
  },

  showImportContextModal() {
    this.openModal(`<div class="modal"><h2>Import kontextu</h2><form id="import-context-form" class="stack"><div class="field"><label>Soubor JSON s kontextem</label><input name="contextFile" type="file" accept="application/json,.json" required><span class="help">Vyberte soubor exportovaného kontextu.</span></div><div class="form-actions"><button class="btn primary">Importovat kontext</button><button type="button" class="btn" data-close-modal>Zrušit</button></div></form></div>`);
    modalRoot.querySelector('#import-context-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const file = new FormData(event.currentTarget).get('contextFile');
        if (!(file instanceof File) || !file.size) throw new Error('Vyberte JSON soubor s kontextem.');
        await AppData.importContext(await file.text());
        this.closeModal();
        this.renderContextsPage();
      } catch (error) {
        alert(`Import kontextu selhal: ${error.message}`);
      }
    });
  },

  downloadExport() {
    const blob = new Blob([AppData.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `badtodo-export-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  },

  downloadContextExport(contextId) {
    const context = AppData.data.contexts.find((item) => item.id === contextId);
    if (!context) return;
    const blob = new Blob([AppData.exportContext(contextId)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `badtodo-context-${(context.title || 'kontext').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  },

  openModal(html) {
    modalRoot.innerHTML = html;
    modalRoot.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => this.closeModal()));
    modalRoot.addEventListener('click', this.modalBackdropHandler);
  },

  modalBackdropHandler(event) {
    if (event.target === modalRoot) AppGUI.closeModal();
  },

  closeModal() {
    modalRoot.innerHTML = '';
    modalRoot.removeEventListener('click', this.modalBackdropHandler);
  },
};
