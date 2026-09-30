// The inventory screen (press I): a grid of item slots, what is still to find,
// and Voss's status and statistics. Purely a view: it needs no mouse, so the
// pointer stays captured while it is open. Owned items show as a turning 3D
// model (drawn by ItemPreview into the canvas this creates).

const SLOT_COUNT = 6;

// Every item the game can give. Items not owned yet show as a shadowed "???".
export const ITEMS = {
  torch: {
    name: 'Torch',
    description: 'A heavy-duty torch. It lights the dark rooms and lets you read the generator wiring. Press F to switch it on and off.'
  }
};

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export class Inventory {
  constructor(root) {
    this.owned = [];
    this.statusFor = {}; // itemId -> () => 'ON' | 'OFF' ..., shown on the slot

    this.el = document.createElement('div');
    this.el.id = 'inventory';
    root.appendChild(this.el);

    this.open = false;
  }

  reset() {
    this.owned = [];
    this.close();
  }

  add(id) {
    if (!ITEMS[id] || this.owned.includes(id)) return;
    this.owned.push(id);
  }

  has(id) {
    return this.owned.includes(id);
  }

  // The canvas showing the turning 3D torch, once the screen has been drawn
  get torchCanvas() {
    return this.el.querySelector('#inv-torch-canvas');
  }

  show(player, objective) {
    this.render(player, objective);
    this.el.classList.add('visible');
    this.open = true;
  }

  close() {
    this.el.classList.remove('visible');
    this.open = false;
  }

  render(player, objective) {
    const slots = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const id = this.owned[i];
      if (id) {
        const item = ITEMS[id];
        const status = this.statusFor[id]?.();
        slots.push(`
          <div class="inv-slot owned">
            <canvas id="inv-${id}-canvas" class="inv-3d" width="240" height="150"></canvas>
            <div class="inv-name">${item.name}</div>
            ${status ? `<div class="inv-status">${status}</div>` : ''}
          </div>`);
      } else {
        slots.push('<div class="inv-slot empty"><div class="inv-name">???</div></div>');
      }
    }

    const details = this.owned.length
      ? this.owned.map((id) => `<p><b>${ITEMS[id].name}.</b> ${ITEMS[id].description}</p>`).join('')
      : '<p>You are not carrying anything yet.</p>';

    this.el.innerHTML = `
      <div class="inv-panel">
        <div class="inv-title">INVENTORY <span class="inv-close">I / Esc to close</span></div>
        <div class="inv-grid">${slots.join('')}</div>
        <div class="inv-details">${details}</div>
        <div class="inv-title small">STATUS</div>
        <div class="inv-stats">
          <div><span>Health</span><b>${Math.round(player.integrity)}%</b></div>
          <div><span>Lives left</span><b>${player.restores}</b></div>
          <div><span>Generator overloads</span><b>${player.overloads}</b></div>
          <div><span>Live fuses touched</span><b>${player.zaps}</b></div>
          <div><span>Times revived</span><b>${player.deaths}</b></div>
          <div><span>Puzzles solved</span><b>${player.puzzlesSolved}</b></div>
          <div><span>Time played</span><b>${formatTime(player.playSeconds)}</b></div>
        </div>
        <div class="inv-help">Health: if it reaches zero you lose a life and ARIA revives you. No lives left means game over.</div>
        <div class="inv-objective"><span>Current objective</span> ${objective || '-'}</div>
      </div>`;
  }
}
