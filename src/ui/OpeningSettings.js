import { settings } from '../core/Settings.js';
import { DIFFICULTIES, getDifficulty } from '../core/Difficulty.js';

const SLIDERS = [
  ['music', 'Music', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
  ['voice', "ARIA's voice", 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
  ['effects', 'Sound effects', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
  ['sensitivity', 'Mouse sensitivity', 0.3, 2.5, 0.1, (v) => v.toFixed(1) + 'x']
];

// A pre-start copy of the same options used by PauseMenu. Settings are shared and persisted by
// Settings.js, so changes made here are applied when Game initializes.
export function createOpeningSettings(host, buttonClass = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'SETTINGS';
  button.className = buttonClass;
  button.setAttribute('aria-haspopup', 'dialog');

  const panel = document.createElement('div');
  panel.className = 'opening-settings';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Game settings');
  panel.innerHTML = `
    <section class="opening-settings__panel">
      <h2>SETTINGS</h2>
      <div class="opening-settings__rows"></div>
      <p class="opening-settings__hint">Automatic quality lowers graphics settings if the game runs slowly.</p>
      <div class="opening-settings__buttons">
        <button type="button" data-action="defaults">Reset to defaults</button>
        <button type="button" data-action="close">Back</button>
      </div>
    </section>`;
  host.appendChild(panel);

  const rows = panel.querySelector('.opening-settings__rows');
  let html = `<label class="opening-settings__row"><span>Difficulty</span><select data-opt="difficulty">${Object.entries(DIFFICULTIES).map(([id, d]) => `<option value="${id}">${d.label}</option>`).join('')}</select></label>`;
  html += '<p class="opening-settings__hint" data-difficulty-note></p>';
  for (const [key, label, min, max, step] of SLIDERS) {
    html += `<label class="opening-settings__row"><span>${label}</span><input type="range" data-opt="${key}" min="${min}" max="${max}" step="${step}"><output data-out="${key}"></output></label>`;
  }
  html += `<label class="opening-settings__row"><span>Graphics quality</span><select data-opt="quality"><option value="auto">Automatic</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>`;
  html += `<label class="opening-settings__row"><span>Frame counter</span><input type="checkbox" data-opt="fps"></label>`;
  rows.innerHTML = html;

  const inputs = Object.fromEntries([...panel.querySelectorAll('[data-opt]')].map((el) => [el.dataset.opt, el]));
  const sync = () => {
    for (const [key, , , , , format] of SLIDERS) {
      inputs[key].value = settings.get(key);
      panel.querySelector(`[data-out="${key}"]`).textContent = format(settings.get(key));
    }
    inputs.quality.value = settings.get('quality');
    inputs.difficulty.value = settings.get('difficulty');
    panel.querySelector('[data-difficulty-note]').textContent = getDifficulty().description;
    inputs.fps.checked = settings.get('fps');
  };
  for (const [key, el] of Object.entries(inputs)) {
    el.addEventListener('input', () => settings.set(key,
      el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value)));
  }
  const unsubscribe = settings.onChange(sync);
  sync();

  const close = () => {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.focus({ preventScroll: true });
  };
  button.addEventListener('click', () => {
    sync();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    panel.querySelector('[data-opt="music"]').focus({ preventScroll: true });
  });
  panel.querySelector('[data-action="close"]').addEventListener('click', close);
  panel.querySelector('[data-action="defaults"]').addEventListener('click', () => settings.reset());
  panel.addEventListener('click', (event) => { if (event.target === panel) close(); });
  const onKey = (event) => {
    if (!panel.hidden && event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);

  return {
    button,
    panel,
    get isOpen() { return !panel.hidden; },
    close,
    dispose() {
      unsubscribe();
      window.removeEventListener('keydown', onKey, true);
      panel.remove();
      button.remove();
    }
  };
}
