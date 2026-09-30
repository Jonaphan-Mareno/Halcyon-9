import { MAX_INTEGRITY, MAX_RESTORES } from '../player/PlayerStats.js';

// The always-visible heads-up display: a health bar, lives (shown as discs),
// the torch slot (a live 3D model), a red flash when Voss is hurt, the "how
// this works" card shown the first time the HUD appears, and the death and
// game over screens.

export class HUD {
  constructor(root, { onRestart } = {}) {
    this.root = root;
    this.onRestart = onRestart;

    // Health and lives, bottom-left
    this.panel = this._div('hud');
    this.panel.innerHTML = `
      <div class="hud-row">
        <span class="hud-label">HEALTH</span>
        <div class="hud-bar"><div class="hud-fill" id="hud-fill"></div></div>
        <span class="hud-value" id="hud-value"></span>
      </div>
      <div class="hud-row">
        <span class="hud-label">LIVES</span>
        <div class="hud-restores" id="hud-restores"></div>
      </div>`;
    this.fill = this.panel.querySelector('#hud-fill');
    this.value = this.panel.querySelector('#hud-value');
    this.restoreBox = this.panel.querySelector('#hud-restores');
    for (let i = 0; i < MAX_RESTORES; i++) {
      const disk = document.createElement('span');
      disk.className = 'restore-disk';
      this.restoreBox.appendChild(disk);
    }

    // The torch slot (a turning 3D model) and the inventory hint, bottom-right
    this.slots = this._div('hud-slots');
    this.slots.innerHTML = `
      <div class="hud-slot" id="hud-torch"><canvas id="hud-torch-canvas" width="112" height="112"></canvas><span class="slot-key">F</span></div>
      <div class="hud-hint-line">I &nbsp;Inventory</div>`;
    this.torchSlot = this.slots.querySelector('#hud-torch');
    this.torchCanvas = this.slots.querySelector('#hud-torch-canvas');

    this.flashEl = this._div('damage-flash');

    // First-time explanation of the HUD
    this.tutorial = this._div('hud-tutorial');
    this.tutorial.innerHTML = `
      <div class="tut-panel">
        <div class="tut-title">HOW THIS WORKS</div>
        <div class="tut-item"><b class="tut-health">HEALTH</b>
          <span>The green bar in the bottom-left. Electric shocks, live fuses and generator overloads drain it.</span></div>
        <div class="tut-item"><b class="tut-lives">LIVES</b>
          <span>The three glowing discs. If your health runs out, ARIA brings you back from a saved copy and you lose one disc. Lose all three and it is game over.</span></div>
        <div class="tut-item"><b class="tut-key">F</b>
          <span>Switch your torch on or off, once you have found it. It sits in the bottom-right corner.</span></div>
        <div class="tut-item"><b class="tut-key">I</b>
          <span>Open your inventory: what you are carrying, your health and lives, and your stats.</span></div>
        <div class="tut-continue">Press Space, Enter or click to continue</div>
      </div>`;

    this.death = this._div('death-screen');
    this.death.innerHTML = '<div id="death-title"></div><div id="death-sub"></div>';
    this.deathTitle = this.death.querySelector('#death-title');
    this.deathSub = this.death.querySelector('#death-sub');

    this.gameOver = this._div('gameover-screen');
    this.gameOver.innerHTML = `
      <div id="gameover-title">CONNECTION LOST</div>
      <div id="gameover-aria"></div>
      <div id="gameover-stats"></div>
      <button id="gameover-restart">RESTART</button>`;
    this.gameOverAria = this.gameOver.querySelector('#gameover-aria');
    this.gameOverStats = this.gameOver.querySelector('#gameover-stats');
    this.restartButton = this.gameOver.querySelector('#gameover-restart');
    this.restartButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRestart?.();
    });

    this._last = { integrity: -1, restores: -1 };
    this.setVisible(false);
  }

  _div(id) {
    const el = document.createElement('div');
    el.id = id;
    this.root.appendChild(el);
    return el;
  }

  // The panel stays hidden until the player can actually be hurt
  setVisible(visible) {
    this.panel.classList.toggle('visible', visible);
    this.slots.classList.toggle('visible', visible);
  }

  // Cheap enough to call every frame: it only touches the DOM when a value changed
  update(player) {
    if (player.integrity !== this._last.integrity) {
      this._last.integrity = player.integrity;
      const fraction = player.integrity / MAX_INTEGRITY;
      this.fill.style.width = `${(fraction * 100).toFixed(1)}%`;
      this.fill.style.background = fraction > 0.5 ? '#3dff7a' : fraction > 0.25 ? '#ffb020' : '#ff3b3b';
      this.value.textContent = `${Math.round(player.integrity)}%`;
      this.panel.classList.toggle('critical', fraction <= 0.25);
    }
    if (player.restores !== this._last.restores) {
      this._last.restores = player.restores;
      [...this.restoreBox.children].forEach((disk, i) => disk.classList.toggle('spent', i >= player.restores));
    }
  }

  setTorch(has, on) {
    this.torchSlot.classList.toggle('owned', has);
    this.torchSlot.classList.toggle('on', has && on);
  }

  showTutorial() {
    this.tutorial.classList.add('visible');
  }

  hideTutorial() {
    this.tutorial.classList.remove('visible');
  }

  // A red flash around the screen edges when Voss takes damage
  flash() {
    this.flashEl.classList.remove('hit');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('hit');
  }

  showDeath(title, sub) {
    this.deathTitle.textContent = title;
    this.deathSub.textContent = sub;
    this.death.classList.add('visible');
  }

  hideDeath() {
    this.death.classList.remove('visible');
  }

  showGameOver(ariaText, statsText) {
    this.gameOverAria.textContent = ariaText;
    this.gameOverStats.textContent = statsText;
    this.gameOver.classList.add('visible');
  }

  hideGameOver() {
    this.gameOver.classList.remove('visible');
  }
}
