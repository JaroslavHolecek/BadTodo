import { AppData } from './data.js';
import { AppGUI } from './gui.js';

/** Application bootstrap. */
async function startApplication() {
  try {
    await AppData.init();
    AppData.onChange = () => {};
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      AppGUI.setDeferredInstallPrompt(event);
    });
    window.addEventListener('hashchange', () => AppGUI.render());
    AppGUI.render();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // PWA support is optional; the application keeps working without it.
      });
    }
  } catch (error) {
    document.querySelector('#app').innerHTML = `
      <section class="card error">
        <h1>Aplikaci se nepodařilo spustit</h1>
        <p>${error.message}</p>
      </section>`;
  }
}

startApplication();
