import './pause.css';
import { settings } from '../core/Settings.js';
import { DIFFICULTIES, getDifficulty } from '../core/Difficulty.js';

// The pause menu, for Level 1 and Level 2: Resume, Restart level, Options, Controls, Back to
// title. Esc opens it (so does P, and the pause button in the corner), and Esc again resumes.
// Releasing the mouse any other way (switching tabs, say) also opens it, so the game never keeps
// running while the player is away. The game does the actual pausing (game.pause / resume).
//
// It is attached to document.body, not the game's UI layer: Level 1's UI is thrown away when the
// lift takes Voss down to Level 2, and the menu has to survive that.

const SLIDERS = [
  ['music', 'Music', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
  ['voice', "ARIA's voice", 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
  ['effects', 'Sound effects', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'],
  ['sensitivity', 'Mouse sensitivity', 0.3, 2.5, 0.1, (v) => v.toFixed(1) + 'x']
];

export class PauseMenu {
  // hooks: { pause(), resume(), restartLevel(), toTitle(), state() }
  constructor(hooks) {
    this.hooks = hooks;
    this.isOpen = false;
    this._openedAt = 0;

    this.button = document.createElement('button');
    this.button.id = 'pause-btn';
    this.button.type = 'button';
    this.button.title = 'Pause (Esc)';
    this.button.innerHTML = '<span class="pb-bars"><i></i><i></i></span><span class="pb-key">ESC</span>';
    this.button.addEventListener('click', () => this.hooks.pause());
    document.body.appendChild(this.button);

    this.el = document.createElement('div');
    this.el.id = 'pause-menu';
    this.el.innerHTML = `
      <div class="pm-panel">
        <div class="pm-title">PAUSED</div>
        <div class="pm-page" data-page="main">
          <button class="pm-btn pm-primary" data-act="resume">Resume</button>
          <button class="pm-btn" data-act="restart">Restart level</button>
          <button class="pm-btn" data-act="options">Options</button>
          <button class="pm-btn" data-act="controls">Controls</button>
          <button class="pm-btn pm-quiet" data-act="title">Back to title</button>
        </div>
        <div class="pm-page" data-page="options"></div>
        <div class="pm-page" data-page="controls"></div>
        <div class="pm-confirm" data-page="confirm">
          <div class="pm-confirm-text"></div>
          <div class="pm-confirm-row">
            <button class="pm-btn pm-primary" data-act="yes">Yes</button>
            <button class="pm-btn" data-act="no">Cancel</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(this.el);
    this._buildOptions();
    this._buildControls();
    this.el.addEventListener('click', (e) => {
      const act = e.target.closest?.('[data-act]')?.dataset.act;
      if (act) this._act(act);
    });

    // Esc and P, before the game's own handlers see them (those may change the state)
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const state = this.hooks.state();
      if (state === 'PLAYING' && (e.code === 'Escape' || e.code === 'KeyP')) {
        this.hooks.pause();
      } else if (state === 'PAUSED' && performance.now() - this._openedAt > 400) {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          this._back();
        }
      }
    }, true);
    // the mouse was released (Esc while it was captured, or the player switched tabs)
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.hooks.state() === 'PLAYING' && this.hooks.shouldPauseOnUnlock?.() !== false) this.hooks.pause();
    });
  }

  _buildOptions() {
    const page = this.el.querySelector('[data-page="options"]');
    let html = `<div class="pm-sub">OPTIONS</div>
      <label class="pm-row"><span>Difficulty</span><select data-opt="difficulty">${Object.entries(DIFFICULTIES).map(([id, d]) => `<option value="${id}">${d.label}</option>`).join('')}</select><output></output></label>
      <div class="pm-hint" data-difficulty-note></div>`;
    for (const [key, label, min, max, step] of SLIDERS) {
      html += `<label class="pm-row"><span>${label}</span><input type="range" data-opt="${key}" min="${min}" max="${max}" step="${step}"><output data-out="${key}"></output></label>`;
    }
    html += `<label class="pm-row"><span>Graphics quality</span>
      <select data-opt="quality">
        <option value="auto">Automatic</option><option value="high">High</option>
        <option value="medium">Medium</option><option value="low">Low</option>
      </select><output></output></label>`;
    html += `<label class="pm-row"><span>Frame counter</span><input type="checkbox" data-opt="fps"><output></output></label>`;
    html += `<div class="pm-hint">Automatic lowers the quality by itself if the game runs slowly.</div>
      <div class="pm-row-btns"><button class="pm-btn" data-act="defaults">Reset to defaults</button><button class="pm-btn pm-primary" data-act="back">Back</button></div>`;
    page.innerHTML = html;
    this.inputs = {};
    for (const el of page.querySelectorAll('[data-opt]')) {
      const key = el.dataset.opt;
      this.inputs[key] = el;
      el.addEventListener('input', () => {
        settings.set(key, el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value));
      });
    }
    settings.onChange(() => this._syncOptions());
    this._syncOptions();
  }

  _syncOptions() {
    for (const [key, , , , , fmt] of SLIDERS) {
      const el = this.inputs[key];
      el.value = settings.get(key);
      this.el.querySelector(`[data-out="${key}"]`).textContent = fmt(settings.get(key));
    }
    this.inputs.quality.value = settings.get('quality');
    this.inputs.difficulty.value = settings.get('difficulty');
    this.el.querySelector('[data-difficulty-note]').textContent = getDifficulty().description;
    this.inputs.fps.checked = settings.get('fps');
    this.syncRunRules();
  }

  syncRunRules() {
    const locked = settings.difficultyLocked;
    this.inputs.difficulty.disabled = locked;
    const restart = this.el.querySelector('[data-act="restart"]');
    restart.disabled = locked;
    restart.title = locked ? 'Level restarts are unavailable during a permadeath run.' : '';
    this.el.querySelector('[data-difficulty-note]').textContent = getDifficulty().description +
      (locked ? ' Difficulty is fixed for this run.' : '');
  }

  _buildControls() {
    const page = this.el.querySelector('[data-page="controls"]');
    const rows = [
      ['W A S D', 'Move'],
      ['Mouse', 'Look'],
      ['Shift', 'Sprint (hold)'],
      ['C', 'Crouch (hold)'],
      ['Space', 'Jump'],
      ['V', 'First or third person view'],
      ['E', 'Use what you are looking at'],
      ['Enter', "Skip ARIA's line"],
      ['F', 'Torch (Level 1)'],
      ['I', 'Inventory (Level 1)'],
      ['Left click', 'Spray the water pipe (Level 2, once you have it)'],
      ['Q (hold)', 'ARIA freezes the wet drones (Level 2)'],
      ['M', 'Mute the music'],
      ['F3', 'Show or hide the frame counter'],
      ['Esc / P', 'Pause']
    ];
    page.innerHTML = '<div class="pm-sub">CONTROLS</div>' +
      rows.map(([k, d]) => `<div class="pm-row pm-ctl"><kbd>${k}</kbd><span>${d}</span></div>`).join('') +
      '<div class="pm-row-btns"><button class="pm-btn pm-primary" data-act="back">Back</button></div>';
  }

  _page(name) {
    for (const p of this.el.querySelectorAll('[data-page]')) p.classList.toggle('on', p.dataset.page === name);
    this.el.querySelector('.pm-title').textContent = name === 'main' || name === 'confirm' ? 'PAUSED' : '';
    this.page = name;
  }

  _back() {
    if (this.page === 'main' || this.page === undefined) this.hooks.resume();
    else this._page('main');
  }

  _act(act) {
    switch (act) {
      case 'resume': this.hooks.resume(); break;
      case 'options': this._syncOptions(); this._page('options'); break;
      case 'controls': this._page('controls'); break;
      case 'back': this._page('main'); break;
      case 'defaults': settings.reset(); break;
      case 'restart':
        if (!settings.difficultyLocked) this._confirm('Restart this level from the beginning? Your progress in it will be lost.', () => this.hooks.restartLevel());
        break;
      case 'title': this._confirm('Go back to the title screen? Your progress will be lost.', () => this.hooks.toTitle()); break;
      case 'yes': { const fn = this._yes; this._yes = null; fn?.(); break; }
      case 'no': this._page('main'); break;
    }
  }

  _confirm(text, yes) {
    this.el.querySelector('.pm-confirm-text').textContent = text;
    this._yes = yes;
    this._page('confirm');
  }

  open() {
    this.isOpen = true;
    this._openedAt = performance.now();
    this.el.classList.add('visible');
    this._page('main');
  }

  close() {
    this.isOpen = false;
    this.el.classList.remove('visible');
  }

  // called every frame with the game's state: the corner button shows while playing or paused
  update(state) {
    const show = state === 'PLAYING' || state === 'PAUSED';
    if (show !== this._shown) {
      this._shown = show;
      this.button.classList.toggle('visible', show);
    }
  }
}
