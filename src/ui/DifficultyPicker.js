import { settings } from '../core/Settings.js';
import { DIFFICULTIES, getDifficulty } from '../core/Difficulty.js';
import './difficulty-picker.css';

// The visible difficulty choice on the opening screen. Options and the pause menu share the same
// saved setting, so changing it anywhere updates every copy before the next game starts.
export function createDifficultyPicker() {
  const element = document.createElement('fieldset');
  element.className = 'difficulty-picker';
  element.innerHTML = `
    <legend>DIFFICULTY</legend>
    <div class="difficulty-picker__options" role="radiogroup" aria-label="Difficulty">
      ${Object.entries(DIFFICULTIES).map(([id, difficulty]) => `
        <button type="button" role="radio" data-difficulty="${id}" aria-checked="false">${difficulty.label}</button>
      `).join('')}
    </div>
    <p class="difficulty-picker__description" aria-live="polite"></p>`;

  const buttons = [...element.querySelectorAll('[data-difficulty]')];
  const description = element.querySelector('.difficulty-picker__description');
  const sync = () => {
    const selected = settings.get('difficulty');
    for (const button of buttons) {
      const active = button.dataset.difficulty === selected;
      button.setAttribute('aria-checked', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    description.textContent = getDifficulty().description;
  };
  const select = (id, focus = false) => {
    if (!(id in DIFFICULTIES)) return;
    settings.set('difficulty', id);
    sync();
    if (focus) element.querySelector(`[data-difficulty="${id}"]`)?.focus();
  };

  for (const button of buttons) {
    button.addEventListener('click', () => select(button.dataset.difficulty));
    button.addEventListener('keydown', (event) => {
      const current = buttons.indexOf(button);
      let next;
      if (event.code === 'ArrowRight' || event.code === 'ArrowDown') next = (current + 1) % buttons.length;
      else if (event.code === 'ArrowLeft' || event.code === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
      else return;
      event.preventDefault();
      select(buttons[next].dataset.difficulty, true);
    });
  }

  const unsubscribe = settings.onChange(sync);
  sync();
  return {
    element,
    sync,
    dispose() {
      unsubscribe();
      element.remove();
    }
  };
}
