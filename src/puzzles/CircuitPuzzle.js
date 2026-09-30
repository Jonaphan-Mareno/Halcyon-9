// "Overload": the generator's circuit panel, zoomed in.
//
// A grid of wire tiles sits between a battery on the left and two indicator
// lamps on the right. Click a tile to turn it a quarter turn (Shift or right
// click turns it back). Carry the power from the battery through the wires to
// BOTH lamps before the countdown runs out. Live wires glow. Three live fuses
// sit among the tiles: power flowing into one zaps the player.
//
// Every layout is generated, never hand-made: a random path is carved from the
// battery to each lamp (so it is always solvable), decoy tiles and fuses fill
// the rest, and then every tile is turned to a random angle.
//
// Look: a worn industrial panel, not a toy. Scratched and stained gunmetal
// plates (procedural grime texture), ribbed rubber-sleeved cables, dim
// indicator lamps, ceramic fuses with hazard tape. Everything is dark, and the
// player's torch picks out the area around the mouse.
//
// The puzzle owns its overlay, input and drawing; the Game owns the
// consequences (blackout, damage, ARIA's reactions) and reacts via callbacks.

const W = 900;
const H = 480;

const COLS = 8;
const ROWS = 5;
const TILE = 68;
const GX = 150; // grid left
const GY = 94;  // grid top

// Connection bits: which sides of a tile have wire
const N = 1;
const E = 2;
const S = 4;
const Wd = 8;
const DIRS = [
  { bit: N, dx: 0, dy: -1, opposite: S },
  { bit: E, dx: 1, dy: 0, opposite: Wd },
  { bit: S, dx: 0, dy: 1, opposite: N },
  { bit: Wd, dx: -1, dy: 0, opposite: E }
];

// Muted insulation colours: oxblood, ochre, moss, steel blue, dull violet
const WIRE_COLORS = ['#8c2e2e', '#a8862f', '#56803f', '#3f7894', '#7d4f90'];

const FUSE_COUNT = 3;
const MIN_PATH_TILES = 15;       // shorter solutions are regenerated: keeps it a real puzzle
const FUSE_ZAP_INTERVAL = 1.6;   // seconds between zaps while a fuse stays live

const rotateMask = (mask, turns) => {
  let m = mask;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
};
const countBits = (m) => ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1));

// Darken or brighten a #rrggbb colour
const shade = (hex, factor) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
};

// ---------------------------------------------------------
// A procedural grime texture, generated once: stains, fine pitting, scratches
// and rust streaks. Drawn over every plate so nothing looks like clean plastic.
// ---------------------------------------------------------
let grimeCanvas = null;
function getGrime() {
  if (grimeCanvas) return grimeCanvas;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');

  // Large soft stains
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 40 + Math.random() * 120;
    const stain = g.createRadialGradient(x, y, 0, x, y, r);
    const brown = Math.random() < 0.4;
    stain.addColorStop(0, brown ? `rgba(70, 40, 20, ${0.10 + Math.random() * 0.14})` : `rgba(0, 0, 0, ${0.12 + Math.random() * 0.16})`);
    stain.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = stain;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Rust streaks running down from edges and rivets
  for (let i = 0; i < 34; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size * 0.7;
    const len = 50 + Math.random() * 180;
    const w = 2 + Math.random() * 7;
    const streak = g.createLinearGradient(0, y, 0, y + len);
    streak.addColorStop(0, `rgba(120, 64, 28, ${0.10 + Math.random() * 0.16})`);
    streak.addColorStop(1, 'rgba(120, 64, 28, 0)');
    g.fillStyle = streak;
    g.fillRect(x, y, w, len);
  }
  // Fine pitting and dust
  for (let i = 0; i < 16000; i++) {
    const light = Math.random() < 0.45;
    g.fillStyle = light ? `rgba(200, 210, 215, ${Math.random() * 0.10})` : `rgba(0, 0, 0, ${Math.random() * 0.22})`;
    const s = Math.random() < 0.85 ? 1 : 2;
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  // Scratches
  g.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = Math.random() * Math.PI;
    const l = 8 + Math.random() * 60;
    g.strokeStyle = `rgba(210, 220, 225, ${0.05 + Math.random() * 0.14})`;
    g.lineWidth = 0.6 + Math.random() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  grimeCanvas = canvas;
  return canvas;
}

export class CircuitPuzzle {
  constructor(root, callbacks = {}) {
    this.cb = callbacks;

    // Dims the room behind the zoomed-in panel
    this.backdrop = document.createElement('div');
    this.backdrop.id = 'puzzle-backdrop';
    root.appendChild(this.backdrop);

    this.container = document.createElement('div');
    this.container.id = 'puzzle';
    root.appendChild(this.container);

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'puzzle-canvas';
    this.canvas.width = W;
    this.canvas.height = H;
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.closeButton = document.createElement('button');
    this.closeButton.id = 'puzzle-close';
    this.closeButton.textContent = 'Step away (Esc)';
    this.container.appendChild(this.closeButton);
    this.closeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.onClose?.();
    });

    this.active = false;
    this.paused = false;   // the countdown waits while ARIA is speaking
    this.frozen = false;   // no input or countdown: overload or solved
    this.hasTorch = true;

    this.timeLimit = 60;
    this.timeLeft = 60;
    this.time = 0;

    this.tiles = [];       // tiles[row][col]
    this.sourceRow = 0;
    this.bulbRows = [0, 1];
    this.bulbLit = [false, false];
    this.pointer = { x: W / 2, y: H / 2, inside: false };

    // Pooled 2D sparks (positions in canvas pixels)
    this.particles = Array.from({ length: 180 }, () => ({ life: 0, x: 0, y: 0, vx: 0, vy: 0, color: '#fff' }));
    this._particleCursor = 0;

    this.canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('pointermove', (e) => this._onMove(e));
    this.canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    this.canvas.addEventListener('pointerenter', () => { this.pointer.inside = true; });
  }

  get stress() {
    return this.active ? 1 - Math.max(0, this.timeLeft) / this.timeLimit : 0;
  }

  // ---------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------
  open({ timeLimit = 60, hasTorch = true } = {}) {
    this.hasTorch = hasTorch;
    this.active = true;
    this.container.classList.add('visible');
    this.backdrop.classList.add('visible');
    this.reset({ timeLimit });
  }

  close() {
    this.active = false;
    this.container.classList.remove('visible');
    this.backdrop.classList.remove('visible');
  }

  // A fresh circuit and a refilled timer
  reset({ timeLimit = this.timeLimit } = {}) {
    this.timeLimit = timeLimit;
    this.timeLeft = timeLimit;
    this.frozen = false;
    this.paused = false;
    this._generate();
    this._propagate(false);
  }

  // ---------------------------------------------------------
  // Generating a solvable circuit
  // ---------------------------------------------------------
  _generate() {
    for (let attempt = 0; attempt < 400; attempt++) {
      const layout = this._carvePaths();
      if (!layout) continue;
      const used = layout.masks.filter((m) => m !== 0).length;
      if (used < MIN_PATH_TILES) continue; // too short to be interesting
      this._fill(layout);
      // Scramble, and make sure the circuit does not start anywhere near complete
      for (let tries = 0; tries < 40; tries++) {
        for (const row of this.tiles) {
          for (const t of row) {
            t.rot = t.kind === 'hazard' || t.kind === 'empty' ? 0 : Math.floor(Math.random() * 4);
            t.angle = (t.rot * Math.PI) / 2;
          }
        }
        this._propagate(false);
        const progress = this.tiles.flat().filter((t) => t.kind === 'path' && t.powered).length;
        if (!this.bulbLit.every(Boolean) && progress <= 2) return;
      }
    }
    // Extremely unlikely: fall back to whatever the last attempt produced
  }

  // Carve one path from the battery to each lamp. Returns masks per cell, or null to retry.
  _carvePaths() {
    const key = (x, y) => y * COLS + x;
    const masks = new Array(ROWS * COLS).fill(0);
    const owner = new Array(ROWS * COLS).fill(-1); // which path (0 or 1) first used the cell
    const visited = new Set();

    const link = (ax, ay, bx, by) => {
      const d = DIRS.find((dir) => dir.dx === bx - ax && dir.dy === by - ay);
      masks[key(ax, ay)] |= d.bit;
      masks[key(bx, by)] |= d.opposite;
    };

    // Walk from (sx, sy) to (COLS - 1, targetRow), always making progress right.
    // Vertical moves are favoured, so the route winds instead of running straight.
    const walk = (sx, sy, targetRow, pathId) => {
      let x = sx;
      let y = sy;
      const cells = [[x, y]];
      visited.add(key(x, y));
      if (owner[key(x, y)] < 0) owner[key(x, y)] = pathId;
      for (let steps = 0; steps < 100; steps++) {
        if (x === COLS - 1 && y === targetRow) return cells;
        const options = [];
        if (x === COLS - 1) {
          const ny = y + Math.sign(targetRow - y);
          if (!visited.has(key(x, ny))) options.push([x, ny, 1]);
        } else {
          if (!visited.has(key(x + 1, y))) options.push([x + 1, y, 2]);
          for (const dy of [-1, 1]) {
            const ny = y + dy;
            if (ny >= 0 && ny < ROWS && !visited.has(key(x, ny))) options.push([x, ny, 2]);
          }
        }
        if (!options.length) return null;
        const total = options.reduce((sum, o) => sum + o[2], 0);
        let roll = Math.random() * total;
        let pick = options[0];
        for (const o of options) {
          roll -= o[2];
          if (roll <= 0) { pick = o; break; }
        }
        link(x, y, pick[0], pick[1]);
        x = pick[0];
        y = pick[1];
        visited.add(key(x, y));
        if (owner[key(x, y)] < 0) owner[key(x, y)] = pathId;
        cells.push([x, y]);
      }
      return null;
    };

    const sourceRow = Math.floor(Math.random() * ROWS);
    const bulbA = Math.floor(Math.random() * ROWS);
    let bulbB;
    do { bulbB = Math.floor(Math.random() * ROWS); } while (bulbB === bulbA);

    masks[key(0, sourceRow)] |= Wd;
    const first = walk(0, sourceRow, bulbA, 0);
    if (!first) return null;
    masks[key(COLS - 1, bulbA)] |= E;

    // The second lamp branches off the first path somewhere in the middle
    const branchable = first.filter(([x]) => x >= 1 && x < COLS - 1);
    if (!branchable.length) return null;
    const [bx, by] = branchable[Math.floor(Math.random() * branchable.length)];
    if (visited.has(key(COLS - 1, bulbB))) return null;
    const second = walk(bx, by, bulbB, 1);
    if (!second) return null;
    masks[key(COLS - 1, bulbB)] |= E;

    this.sourceRow = sourceRow;
    this.bulbRows = [bulbA, bulbB];
    return { masks, owner };
  }

  // Turn the carved masks into tiles, then add decoys and fuses
  _fill({ masks, owner }) {
    const key = (x, y) => y * COLS + x;
    const pathColors = [Math.floor(Math.random() * WIRE_COLORS.length), 0];
    do { pathColors[1] = Math.floor(Math.random() * WIRE_COLORS.length); } while (pathColors[1] === pathColors[0]);

    this.tiles = [];
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        const mask = masks[key(x, y)];
        row.push({
          kind: mask ? 'path' : 'decoy',
          base: mask,
          rot: 0,
          angle: 0,
          color: mask ? pathColors[owner[key(x, y)]] : Math.floor(Math.random() * WIRE_COLORS.length),
          powered: false,
          zapTimer: 0,
          // Each plate shows a different patch of the grime texture
          grimeX: Math.floor(Math.random() * (512 - TILE)),
          grimeY: Math.floor(Math.random() * (512 - TILE))
        });
      }
      this.tiles.push(row);
    }

    // Live fuses next to the path, where a stray wire could reach them
    const candidates = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (this.tiles[y][x].kind !== 'decoy') continue;
        const nextToPath = DIRS.some((d) => {
          const t = this.tiles[y + d.dy]?.[x + d.dx];
          return t && t.kind === 'path';
        });
        if (nextToPath) candidates.push([x, y]);
      }
    }
    for (let n = 0; n < FUSE_COUNT && candidates.length; n++) {
      const [x, y] = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
      Object.assign(this.tiles[y][x], { kind: 'hazard', base: 15 });
    }

    // Everything else left as a decoy: random wire shapes, some blank plates
    for (const row of this.tiles) {
      for (const t of row) {
        if (t.kind !== 'decoy') continue;
        const roll = Math.random();
        if (roll < 0.16) { t.kind = 'empty'; t.base = 0; }
        else if (roll < 0.44) t.base = N | S;            // straight
        else if (roll < 0.76) t.base = N | E;            // corner
        else t.base = N | E | S;                         // T junction
      }
    }
  }

  // ---------------------------------------------------------
  // Power flow
  // ---------------------------------------------------------
  _mask(tile) {
    return rotateMask(tile.base, tile.rot);
  }

  // Flood outward from the battery through connected wires. Returns the
  // powered fuses so the caller can react to them.
  _propagate() {
    for (const row of this.tiles) for (const t of row) t.powered = false;
    const live = [];
    const start = this.tiles[this.sourceRow][0];
    if (this._mask(start) & Wd && start.kind !== 'hazard') {
      const queue = [[0, this.sourceRow]];
      start.powered = true;
      while (queue.length) {
        const [x, y] = queue.shift();
        const mask = this._mask(this.tiles[y][x]);
        for (const d of DIRS) {
          if (!(mask & d.bit)) continue;
          const nx = x + d.dx;
          const ny = y + d.dy;
          const next = this.tiles[ny]?.[nx];
          if (!next || next.powered) continue;
          if (!(this._mask(next) & d.opposite)) continue;
          next.powered = true;
          if (next.kind === 'hazard') live.push(next);
          else queue.push([nx, ny]); // fuses are dead ends: they take power, they do not pass it on
        }
      }
    }
    this.bulbLit = this.bulbRows.map((row) => {
      const t = this.tiles[row][COLS - 1];
      return t.powered && (this._mask(t) & E) !== 0 && t.kind !== 'hazard';
    });
    return live;
  }

  // ---------------------------------------------------------
  // Input
  // ---------------------------------------------------------
  _toCanvas(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height)
    };
  }

  _tileAt(p) {
    const gx = Math.floor((p.x - GX) / TILE);
    const gy = Math.floor((p.y - GY) / TILE);
    return gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS ? { gx, gy } : null;
  }

  _onMove(e) {
    const p = this._toCanvas(e);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.inside = true;
    const over = this._tileAt(p);
    const tile = over && this.tiles[over.gy][over.gx];
    this.canvas.style.cursor = tile && tile.kind !== 'hazard' && tile.kind !== 'empty' ? 'pointer' : 'crosshair';
  }

  _onDown(e) {
    if (!this.active || this.frozen) return;
    const p = this._toCanvas(e);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    const cell = this._tileAt(p);
    if (!cell) return;
    const tile = this.tiles[cell.gy][cell.gx];
    if (tile.kind === 'hazard' || tile.kind === 'empty') return; // nothing to turn

    // Left click turns clockwise; Shift or right click turns back
    tile.rot += e.shiftKey || e.button === 2 ? -1 : 1;
    this.cb.onRotate?.();
    this._propagate();

    if (this.bulbLit.every(Boolean)) {
      this.frozen = true;
      for (const row of this.bulbRows) this._sparks(GX + COLS * TILE + 66, GY + row * TILE + TILE / 2, '#ffc070', 26);
      // Called from the click event, so the Game may re-lock the mouse
      this.cb.onSolved?.();
    }
  }

  // ---------------------------------------------------------
  // Per frame
  // ---------------------------------------------------------
  update(delta) {
    if (!this.active) return;
    this.time += delta;

    if (!this.frozen && !this.paused) {
      this.timeLeft -= delta;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.frozen = true;
        this.cb.onOverload?.();
      }
    }

    // Tiles ease round to their target angle
    const ease = 1 - Math.exp(-16 * delta);
    for (const row of this.tiles) {
      for (const t of row) {
        t.angle += ((t.rot * Math.PI) / 2 - t.angle) * ease;
      }
    }

    // A fuse that is receiving power zaps, again and again until it is cut off
    if (!this.frozen) {
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const t = this.tiles[y][x];
          if (t.kind !== 'hazard') continue;
          if (t.powered) {
            t.zapTimer -= delta;
            if (t.zapTimer <= 0) {
              t.zapTimer = FUSE_ZAP_INTERVAL;
              this._sparks(GX + x * TILE + TILE / 2, GY + y * TILE + TILE / 2, '#ff6a3a', 26);
              this.cb.onZap?.();
            }
          } else {
            t.zapTimer = 0; // the next connection zaps straight away
          }
        }
      }
    }

    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= delta;
      p.vy += 520 * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
    }

    this._draw();
  }

  _sparks(x, y, color, count) {
    for (let n = 0; n < count; n++) {
      const p = this.particles[this._particleCursor];
      this._particleCursor = (this._particleCursor + 1) % this.particles.length;
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 260;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 120;
      p.life = 0.3 + Math.random() * 0.5;
      p.color = color;
    }
  }

  // Overload feedback drawn on the panel itself
  flashOverload() {
    for (let i = 0; i < 8; i++) this._sparks(60 + Math.random() * 780, 100 + Math.random() * 340, '#ff6a3a', 18);
  }

  // ---------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------
  _draw() {
    const ctx = this.ctx;
    const t = this.time;
    const stress = this.stress;
    const grime = getGrime();

    // Under stress the whole panel flickers, like the power failing
    const flicker = stress > 0.45 && Math.sin(t * 37) * Math.sin(t * 11) > 0.55 ? 1 - 0.6 * stress : 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = flicker;

    // The panel itself: dark gunmetal, stained and scratched
    const panel = ctx.createLinearGradient(0, 0, W, H);
    panel.addColorStop(0, '#20262a');
    panel.addColorStop(1, '#0e1113');
    ctx.fillStyle = panel;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = flicker * 0.85;
    ctx.drawImage(grime, 0, 0, 512, 512, 0, 0, W, H);
    ctx.globalAlpha = flicker;
    this._hazardTape(ctx, 0, H - 14, W, 14);
    ctx.strokeStyle = '#05080a';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    for (const [sx, sy] of [[16, 16], [W - 16, 16], [16, H - 30], [W - 16, H - 30]]) this._bolt(ctx, sx, sy, 7);

    // Stencilled header and a segmented countdown bar
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillStyle = 'rgba(190, 200, 195, 0.55)';
    ctx.fillText('GEN-CORE 02  //  AUXILIARY CIRCUIT', 34, 28);
    this._countdown(ctx);

    // Battery, lamps and the fixed cables linking them to the grid
    this._drawSourceAndBulbs(ctx);

    // The tiles
    const hover = this.pointer.inside ? this._tileAt(this.pointer) : null;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        this._drawTile(ctx, this.tiles[y][x], GX + x * TILE, GY + y * TILE, hover && hover.gx === x && hover.gy === y, grime);
      }
    }

    // The torch: a pool of light around the mouse, the rest of the panel in deep shadow
    if (this.hasTorch && this.pointer.inside) {
      const { x, y } = this.pointer;
      const shadow = ctx.createRadialGradient(x, y, 70, x, y, 300);
      shadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
      shadow.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
      ctx.fillStyle = shadow;
      ctx.fillRect(0, 0, W, H);
      const warm = ctx.createRadialGradient(x, y, 0, x, y, 150);
      warm.addColorStop(0, 'rgba(255, 236, 200, 0.10)');
      warm.addColorStop(1, 'rgba(255, 236, 200, 0)');
      ctx.fillStyle = warm;
      ctx.fillRect(x - 150, y - 150, 300, 300);
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, W, H);
    }

    // Sparks
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = flicker * Math.min(1, p.life * 2.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = flicker;

    // Instructions, stencilled on the panel
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(170, 185, 180, 0.6)';
    ctx.fillText(
      'CLICK A TILE TO TURN IT (SHIFT: BACK)  //  POWER BOTH LAMPS  //  KEEP LIVE WIRE AWAY FROM THE FUSES',
      W / 2, H - 28
    );

    ctx.globalAlpha = 1;
  }

  // Yellow and black warning tape
  _hazardTape(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#0b0c0d';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(176, 140, 38, 0.72)';
    for (let i = -h; i < w + h; i += 22) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + 11, y + h);
      ctx.lineTo(x + i + 11 + h, y);
      ctx.lineTo(x + i + h, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // A hex bolt: dark head, a glint, a shadow ring
  _bolt(ctx, x, y, r) {
    const head = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0.5, x, y, r);
    head.addColorStop(0, '#6d777c');
    head.addColorStop(0.6, '#2a3033');
    head.addColorStop(1, '#0b0d0e');
    ctx.fillStyle = head;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + 0.3;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // The countdown as a row of LED segments: amber, going red, like old equipment
  _countdown(ctx) {
    const segments = 42;
    const frac = Math.max(0, this.timeLeft) / this.timeLimit;
    const lit = Math.ceil(frac * segments);
    const colour = frac > 0.5 ? '#c9a13a' : frac > 0.25 ? '#d2741f' : '#d63a2e';
    const blink = frac < 0.25 && Math.floor(this.time * 4) % 2 === 0;
    for (let i = 0; i < segments; i++) {
      const x = 34 + i * 20;
      const on = i < lit && !(blink && i >= lit - 2);
      ctx.fillStyle = on ? colour : '#151a1c';
      if (on) {
        ctx.save();
        ctx.shadowColor = colour;
        ctx.shadowBlur = 6;
        ctx.fillRect(x, 48, 15, 12);
        ctx.restore();
      } else {
        ctx.fillRect(x, 48, 15, 12);
      }
    }
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillStyle = colour;
    ctx.fillText(`OVERLOAD IN ${this.timeLeft.toFixed(1)}s`, W - 34, 28);
  }

  // A worn gunmetal plate: edges darkened, corner bolts, patch of grime
  _plate(ctx, x, y, size, tint, grime, tile) {
    const r = 6;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, size - 4, size - 4, r);
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, tint[0]);
    g.addColorStop(1, tint[1]);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    if (tile) ctx.drawImage(grime, tile.grimeX, tile.grimeY, size, size, x, y, size, size);
    // Edge wear: darker towards the rim
    const rim = ctx.createRadialGradient(x + size / 2, y + size / 2, size * 0.25, x + size / 2, y + size / 2, size * 0.78);
    rim.addColorStop(0, 'rgba(0, 0, 0, 0)');
    rim.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = rim;
    ctx.fillRect(x, y, size, size);
    ctx.restore();

    // A thin lit edge top-left and a dark one bottom-right
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(200, 215, 220, 0.14)';
    ctx.beginPath();
    ctx.moveTo(x + 3, y + size - 9);
    ctx.lineTo(x + 3, y + 9);
    ctx.quadraticCurveTo(x + 3, y + 3, x + 9, y + 3);
    ctx.lineTo(x + size - 9, y + 3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.moveTo(x + size - 3, y + 9);
    ctx.lineTo(x + size - 3, y + size - 9);
    ctx.quadraticCurveTo(x + size - 3, y + size - 3, x + size - 9, y + size - 3);
    ctx.lineTo(x + 9, y + size - 3);
    ctx.stroke();
    this._bolt(ctx, x + 9, y + 9, 3.2);
    this._bolt(ctx, x + size - 9, y + 9, 3.2);
    this._bolt(ctx, x + 9, y + size - 9, 3.2);
    this._bolt(ctx, x + size - 9, y + size - 9, 3.2);
  }

  // A heavy rubber-sleeved cable along a path. Dead wires are dull; live wires
  // have a hot core, a faint bloom and a flicker of current running along them.
  _cable(ctx, trace, color, powered) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Drop shadow on the plate
    ctx.translate(2, 3);
    trace();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.translate(-2, -3);

    // Outer sleeve
    trace();
    ctx.strokeStyle = '#050607';
    ctx.lineWidth = 13;
    ctx.stroke();

    // Insulation
    if (powered) {
      ctx.save();
      ctx.shadowColor = 'rgba(255, 190, 120, 0.9)';
      ctx.shadowBlur = 12;
    }
    trace();
    ctx.strokeStyle = powered ? shade(color, 1.05) : shade(color, 0.55);
    ctx.lineWidth = 9;
    ctx.stroke();
    if (powered) ctx.restore();

    // Ribbing: short dark dashes across the sleeve
    trace();
    ctx.save();
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.restore();

    // A soft highlight along the top edge of the tube
    ctx.translate(-1.6, -2);
    trace();
    ctx.strokeStyle = powered ? 'rgba(255, 235, 210, 0.42)' : 'rgba(210, 220, 225, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.translate(1.6, 2);

    if (powered) {
      // A hot core and a pulse of current travelling along the wire
      const buzz = 0.75 + 0.25 * Math.sin(this.time * 40 + color.length);
      trace();
      ctx.strokeStyle = `rgba(255, 224, 170, ${0.55 * buzz})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      trace();
      ctx.save();
      ctx.setLineDash([4, 26]);
      ctx.lineDashOffset = -this.time * 90;
      ctx.strokeStyle = 'rgba(200, 235, 255, 0.95)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawTile(ctx, tile, x, y, hovered, grime) {
    const tint = tile.kind === 'hazard' ? ['#2a1d1d', '#140e0e'] : ['#2d3439', '#15191c'];
    this._plate(ctx, x, y, TILE, tint, grime, tile);

    if (hovered && tile.kind !== 'hazard' && tile.kind !== 'empty') {
      ctx.strokeStyle = 'rgba(190, 215, 225, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x + 4, y + 4, TILE - 8, TILE - 8, 5);
      ctx.stroke();
    }

    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    const edge = TILE / 2 - 2;

    if (tile.kind === 'hazard') {
      this._drawFuse(ctx, tile, x, y, cx, cy);
      return;
    }
    if (tile.kind === 'empty') {
      // A blank plate with cooling slots
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.roundRect(cx - 18, cy + i * 10 - 2, 36, 4, 2);
        ctx.fill();
      }
      return;
    }

    // A small status LED in the corner: dark, or amber when the tile is live
    ctx.fillStyle = tile.powered ? '#e8a13a' : '#241c14';
    if (tile.powered) {
      ctx.save();
      ctx.shadowColor = '#e8a13a';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x + TILE - 14, y + 14, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(x + TILE - 14, y + 14, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // The wire shape is drawn in its own orientation and rotated by the tile's
    // animated angle, so turning looks like turning
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tile.angle);
    const color = WIRE_COLORS[tile.color];
    const bits = countBits(tile.base);
    const sides = DIRS.filter((d) => tile.base & d.bit);
    const pt = (d) => [d.dx * edge, d.dy * edge];

    if (bits === 2 && (tile.base === (N | S) || tile.base === (E | Wd))) {
      const [ax, ay] = pt(sides[0]);
      const [bx, by] = pt(sides[1]);
      this._cable(ctx, () => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }, color, tile.powered);
    } else if (bits === 2) {
      const [ax, ay] = pt(sides[0]);
      const [bx, by] = pt(sides[1]);
      this._cable(ctx, () => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(0, 0, bx, by); }, color, tile.powered);
    } else {
      for (const d of sides) {
        const [ax, ay] = pt(d);
        this._cable(ctx, () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ax, ay); }, color, tile.powered);
      }
      // A junction block clamped over the joined cables
      ctx.fillStyle = '#0a0c0d';
      ctx.beginPath();
      ctx.roundRect(-11, -11, 22, 22, 4);
      ctx.fill();
      const block = ctx.createLinearGradient(-9, -9, 9, 9);
      block.addColorStop(0, '#59636a');
      block.addColorStop(1, '#1d2326');
      ctx.fillStyle = block;
      ctx.beginPath();
      ctx.roundRect(-9, -9, 18, 18, 3);
      ctx.fill();
      this._bolt(ctx, 0, 0, 3.2);
    }
    ctx.restore();
  }

  // A ceramic fuse in a holder with hazard tape. Live, it glows and sputters.
  _drawFuse(ctx, tile, x, y, cx, cy) {
    // Hazard tape round the edge of the plate
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 3, y + 3, TILE - 6, TILE - 6);
    ctx.rect(x + 9, y + 9, TILE - 18, TILE - 18);
    ctx.clip('evenodd');
    this._hazardTape(ctx, x + 3, y + 3, TILE - 6, TILE - 6);
    ctx.restore();

    const live = tile.powered;
    const pulse = 0.65 + 0.35 * Math.sin(this.time * 18 + cx);
    if (live) {
      const glow = ctx.createRadialGradient(cx, cy, 3, cx, cy, TILE * 0.75);
      glow.addColorStop(0, `rgba(255, 90, 40, ${0.6 * pulse})`);
      glow.addColorStop(1, 'rgba(255, 90, 40, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x, y, TILE, TILE);
    }

    // Brass end caps and the ceramic body
    const capColor = ctx.createLinearGradient(0, cy - 9, 0, cy + 9);
    capColor.addColorStop(0, '#9c8245');
    capColor.addColorStop(0.5, '#e0c77a');
    capColor.addColorStop(1, '#5a4a26');
    ctx.fillStyle = capColor;
    ctx.fillRect(cx - 20, cy - 8, 8, 16);
    ctx.fillRect(cx + 12, cy - 8, 8, 16);
    const body = ctx.createLinearGradient(0, cy - 8, 0, cy + 8);
    body.addColorStop(0, live ? '#ff7a4a' : '#8b6f5e');
    body.addColorStop(0.5, live ? '#ffb27a' : '#c4a892');
    body.addColorStop(1, live ? '#b53a1a' : '#5a4638');
    ctx.fillStyle = body;
    ctx.fillRect(cx - 12, cy - 7, 24, 14);
    // The filament inside
    ctx.strokeStyle = live ? '#fff1c0' : 'rgba(40, 28, 20, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.stroke();
    ctx.font = 'bold 8px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = live ? '#ffe2c0' : 'rgba(210, 195, 175, 0.55)';
    ctx.fillText('440V', cx, cy + 17);
  }

  _drawSourceAndBulbs(ctx) {
    const gridRight = GX + COLS * TILE;
    const sy = GY + this.sourceRow * TILE + TILE / 2;

    // The battery: a heavy industrial cell with brass terminals and a worn label
    const bx = 70;
    ctx.fillStyle = '#050607';
    ctx.beginPath();
    ctx.roundRect(bx - 40, sy - 30, 80, 60, 5);
    ctx.fill();
    const casing = ctx.createLinearGradient(bx - 36, sy - 26, bx + 36, sy + 26);
    casing.addColorStop(0, '#3a4448');
    casing.addColorStop(1, '#161b1d');
    ctx.fillStyle = casing;
    ctx.beginPath();
    ctx.roundRect(bx - 37, sy - 27, 74, 54, 4);
    ctx.fill();
    ctx.drawImage(getGrime(), 60, 80, 74, 54, bx - 37, sy - 27, 74, 54);
    ctx.fillStyle = 'rgba(200, 190, 140, 0.55)';
    ctx.fillRect(bx - 28, sy - 15, 44, 22);
    ctx.fillStyle = 'rgba(20, 20, 18, 0.75)';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CELL 02', bx - 25, sy - 6);
    ctx.fillText('DC  48V', bx - 25, sy + 4);
    ctx.fillStyle = '#b8a060';                   // brass terminal
    ctx.fillRect(bx + 34, sy - 7, 12, 14);
    const led = 0.6 + 0.4 * Math.sin(this.time * 2.4);
    ctx.fillStyle = `rgba(90, 230, 120, ${led})`; // a living status LED
    ctx.beginPath();
    ctx.arc(bx + 22, sy + 17, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Fixed cable from the battery to the first tile: always live
    this._cable(ctx, () => { ctx.beginPath(); ctx.moveTo(bx + 44, sy); ctx.lineTo(GX + 4, sy); }, '#56803f', true);

    // The two indicator lamps on the right
    for (let i = 0; i < this.bulbRows.length; i++) {
      const row = this.bulbRows[i];
      const by = GY + row * TILE + TILE / 2;
      const lit = this.bulbLit[i];
      this._cable(ctx, () => { ctx.beginPath(); ctx.moveTo(gridRight - 4, by); ctx.lineTo(gridRight + 34, by); }, '#a8862f', lit);

      const lx = gridRight + 64;
      if (lit) {
        // A warm bloom on the panel around a lit lamp, with a slight flicker
        const halo = ctx.createRadialGradient(lx, by, 4, lx, by, 66);
        const f = 0.85 + 0.15 * Math.sin(this.time * 23 + i * 2);
        halo.addColorStop(0, `rgba(255, 184, 96, ${0.55 * f})`);
        halo.addColorStop(1, 'rgba(255, 184, 96, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(lx - 70, by - 70, 140, 140);
      }
      // Housing ring
      const ring = ctx.createLinearGradient(lx - 26, by - 26, lx + 26, by + 26);
      ring.addColorStop(0, '#727d82');
      ring.addColorStop(1, '#1d2326');
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(lx, by, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#040506';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Glass dome
      const glass = ctx.createRadialGradient(lx - 6, by - 7, 1, lx, by, 20);
      glass.addColorStop(0, lit ? '#fff0c8' : '#3d4a4f');
      glass.addColorStop(0.55, lit ? '#ffb45a' : '#1a2225');
      glass.addColorStop(1, lit ? '#a8541a' : '#080b0c');
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.arc(lx, by, 19, 0, Math.PI * 2);
      ctx.fill();
      // Filament
      ctx.strokeStyle = lit ? '#fffbe8' : '#2d383c';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(lx - 8, by + 9);
      ctx.lineTo(lx - 4, by - 3);
      ctx.lineTo(lx, by + 3);
      ctx.lineTo(lx + 4, by - 3);
      ctx.lineTo(lx + 8, by + 9);
      ctx.stroke();
      // Specular glint on the glass
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.ellipse(lx - 7, by - 9, 6, 3, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
