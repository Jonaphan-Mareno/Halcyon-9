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
// Look: real electrical equipment, not a toy. The tiles are rotary switch
// modules on a circuit board: flat copper contacts run from each module's hub
// to copper pads where they meet the next module's. Live copper heats up and
// current crackles along it (jittering arcs, the odd spark at a joint). Heavy
// black power cables with copper lugs, ceramic fuses with hazard tape, a
// grimy gunmetal panel. Everything is dark, and the player's torch picks out
// the area around the mouse. After a failed attempt ARIA can mark the next
// switches to turn (showHint).
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

// A repeatable random number in 0..1 for any input (keeps the arcs' shapes steady within a frame)
const noise = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

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
    this.hint = [];        // switches ARIA has marked (showHint)
    this.hintUntil = 0;
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
    this.hint = [];
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

    // The circuit board, the battery, the lamps and the cables linking them to the board
    this._board(ctx);
    this._drawSourceAndBulbs(ctx);

    // The switch modules
    const hover = this.pointer.inside ? this._tileAt(this.pointer) : null;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        this._drawTile(ctx, this.tiles[y][x], GX + x * TILE, GY + y * TILE, hover && hover.gx === x && hover.gy === y);
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

    // ARIA's marks show through the dark
    this._drawHint(ctx);

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
      'CLICK A SWITCH TO TURN IT (SHIFT: BACK)  //  POWER BOTH LAMPS  //  KEEP THE CURRENT AWAY FROM THE FUSES',
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

  // ---------------------------------------------------------
  // The board and its switch modules
  //
  // Not a grid of game tiles: a circuit board with rotary switch modules mounted on it. Each
  // module carries flat copper contacts from its hub out to copper pads on the board, where they
  // meet the next module's. Turning a module turns its contacts. Live copper heats up and current
  // crackles along it as jittering arcs, with the odd spark at a joint.
  // ---------------------------------------------------------

  // Dark fibreglass, a faint weave, stencilled column and row marks, mounting holes
  _board(ctx) {
    const x0 = GX - 12;
    const y0 = GY - 12;
    const w = COLS * TILE + 24;
    const h = ROWS * TILE + 24;
    ctx.save();
    ctx.fillStyle = '#030504';
    ctx.beginPath();
    ctx.roundRect(x0 - 3, y0 - 3, w + 6, h + 6, 8);
    ctx.fill();
    const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
    g.addColorStop(0, '#14241c');
    g.addColorStop(1, '#08120d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, 6);
    ctx.fill();
    ctx.clip();
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * 0.4;
    ctx.drawImage(getGrime(), 0, 0, 512, 512, x0, y0, w, h);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(130, 180, 150, 0.045)';
    ctx.lineWidth = 1;
    for (let i = 0; i < w + h; i += 6) {
      ctx.beginPath();
      ctx.moveTo(x0 + i, y0);
      ctx.lineTo(x0 + i - h, y0 + h);
      ctx.stroke();
    }
    ctx.restore();

    ctx.font = '9px "Courier New", monospace';
    ctx.fillStyle = 'rgba(205, 225, 210, 0.32)';
    ctx.textAlign = 'center';
    for (let c = 0; c < COLS; c++) ctx.fillText(String.fromCharCode(65 + c), GX + c * TILE + TILE / 2, GY - 5);
    ctx.textAlign = 'right';
    for (let r = 0; r < ROWS; r++) ctx.fillText(String(r + 1), GX - 3, GY + r * TILE + TILE / 2);
    for (const [hx, hy] of [[x0 + 7, y0 + 7], [x0 + w - 7, y0 + 7], [x0 + 7, y0 + h - 7], [x0 + w - 7, y0 + h - 7]]) {
      ctx.fillStyle = '#b08a4a';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#020302';
      ctx.beginPath();
      ctx.arc(hx, hy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // A jagged line from a to b that changes shape many times a second: current arcing along copper
  _jagged(ctx, ax, ay, bx, by, seed, amp) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const segs = 6;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const o = (noise(seed * 13.7 + i * 3.1) - 0.5) * 2 * amp;
      ctx.lineTo(ax + dx * t + nx * o, ay + dy * t + ny * o);
    }
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // A copper pad on the board, where two modules' contacts meet
  _pad(ctx, x, y, live) {
    ctx.fillStyle = '#050403';
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    const p = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 4.5);
    p.addColorStop(0, live ? '#ffe3b8' : '#c8925a');
    p.addColorStop(1, live ? '#d0782e' : '#5e3a1c');
    ctx.fillStyle = p;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // One flat copper contact from the hub out along direction d (in the module's own frame)
  _contact(ctx, d, reach, live, heat) {
    const ex = d.dx * reach;
    const ey = d.dy * reach;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#1a0e06';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = live
      ? `rgb(${Math.round(225 + 30 * heat)}, ${Math.round(140 + 70 * heat)}, ${Math.round(80 + 80 * heat)})`
      : '#9c6437';
    ctx.lineWidth = 6;
    ctx.stroke();
    // a brushed highlight down one edge
    ctx.strokeStyle = live ? 'rgba(255, 244, 225, 0.65)' : 'rgba(255, 214, 175, 0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-d.dy * 1.6, d.dx * 1.6);
    ctx.lineTo(ex - d.dy * 1.6, ey + d.dx * 1.6);
    ctx.stroke();
  }

  _drawTile(ctx, tile, x, y, hovered) {
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    const reach = TILE / 2 - 3;   // the contacts run out to the pads at the module's edge

    if (tile.kind === 'hazard') {
      ctx.fillStyle = '#160d0b';
      ctx.beginPath();
      ctx.roundRect(x + 4, y + 4, TILE - 8, TILE - 8, 6);
      ctx.fill();
      this._drawFuse(ctx, tile, x, y, cx, cy);
      return;
    }

    // the pads this module's contacts reach right now (lit when live)
    const mask = this._mask(tile);
    for (const d of DIRS) {
      if (mask & d.bit) this._pad(ctx, cx + d.dx * reach, cy + d.dy * reach, tile.powered);
    }

    // the module: a knurled bezel, an insulating disc, the contacts and a brass hub
    const R = 25;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 3, R + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tile.angle);
    const bezel = ctx.createLinearGradient(-R, -R, R, R);
    bezel.addColorStop(0, '#5c666b');
    bezel.addColorStop(1, '#171b1d');
    ctx.fillStyle = bezel;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (R - 3.5), Math.sin(a) * (R - 3.5));
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      ctx.stroke();
    }
    const disc = ctx.createRadialGradient(-5, -6, 2, 0, 0, R - 4);
    disc.addColorStop(0, '#3a2a1f');
    disc.addColorStop(1, '#160f0a');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(0, 0, R - 4.5, 0, Math.PI * 2);
    ctx.fill();

    if (tile.kind === 'empty') {
      // a blanking cover: no contacts
      ctx.restore();
      ctx.font = 'bold 8px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(200, 190, 175, 0.4)';
      ctx.fillText('N/C', cx, cy + 1);
      return;
    }

    const heat = tile.powered ? 0.55 + 0.45 * Math.sin(this.time * 31 + cx * 0.7 + cy) : 0;
    const sides = DIRS.filter((d) => tile.base & d.bit);
    for (const d of sides) this._contact(ctx, d, reach, tile.powered, heat);
    const hub = ctx.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, 6);
    hub.addColorStop(0, '#f0d8a0');
    hub.addColorStop(1, '#6a5028');
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    // a white index mark on the bezel, so the turn is easy to follow
    ctx.fillStyle = 'rgba(235, 238, 240, 0.7)';
    ctx.fillRect(-1, -R + 1, 2, 4);

    // live: current crackling along the copper, in this frame so it turns with the module
    if (tile.powered) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = '#7fd0ff';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(160, 220, 255, 0.85)';
      ctx.lineWidth = 1.3;
      const step = Math.floor(this.time * 18);
      sides.forEach((d, i) => this._jagged(ctx, 0, 0, d.dx * reach, d.dy * reach, step + cx * 0.31 + cy * 0.17 + i * 5.3, 3.5));
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // now and then a spark jumps at a live joint
    if (tile.powered && noise(Math.floor(this.time * 9) + cx * 1.3 + cy * 0.7) > 0.985) {
      const d = sides[Math.floor(noise(cx + cy + this.time) * sides.length)] || sides[0];
      const ang = tile.angle;
      const px = cx + (d.dx * Math.cos(ang) - d.dy * Math.sin(ang)) * reach;
      const py = cy + (d.dx * Math.sin(ang) + d.dy * Math.cos(ang)) * reach;
      this._sparks(px, py, '#bfe6ff', 6);
    }

    if (hovered) {
      ctx.strokeStyle = 'rgba(190, 220, 230, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // a small status LED beside the module: amber when live
    ctx.fillStyle = tile.powered ? '#e8a13a' : '#241c14';
    ctx.save();
    if (tile.powered) {
      ctx.shadowColor = '#e8a13a';
      ctx.shadowBlur = 6;
    }
    ctx.beginPath();
    ctx.arc(x + TILE - 8, y + 8, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ARIA's hint: the next switches to turn pulse with an amber ring and a turn arrow
  _drawHint(ctx) {
    if (!this.hint.length || this.time > this.hintUntil) return;
    const fade = Math.min(1, (this.hintUntil - this.time) / 1.5);
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 6);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = this.tiles[y][x];
        if (!this.hint.includes(t) || this._mask(t) === t.base) continue;   // (done already)
        const cx = GX + x * TILE + TILE / 2;
        const cy = GY + y * TILE + TILE / 2;
        ctx.save();
        ctx.strokeStyle = `rgba(255, 176, 64, ${0.9 * pulse * fade})`;
        ctx.shadowColor = '#ffb040';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 30, 0, Math.PI * 2);
        ctx.stroke();
        // a clockwise arrow round the top
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 36, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.stroke();
        const ax = cx + Math.cos(-Math.PI * 0.2) * 36;
        const ay = cy + Math.sin(-Math.PI * 0.2) * 36;
        ctx.beginPath();
        ctx.moveTo(ax - 6, ay - 4);
        ctx.lineTo(ax + 1, ay + 1);
        ctx.lineTo(ax - 2, ay - 8);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Mark the next `count` switches on the solution that are not turned right yet
  showHint(count, seconds) {
    const order = [];
    const seen = new Set();
    const queue = [[0, this.sourceRow]];
    while (queue.length) {
      const [x, y] = queue.shift();
      const k = y * COLS + x;
      if (seen.has(k)) continue;
      seen.add(k);
      const t = this.tiles[y]?.[x];
      if (!t || t.kind !== 'path') continue;
      order.push(t);
      for (const d of DIRS) {
        if (!(t.base & d.bit)) continue;
        const n = this.tiles[y + d.dy]?.[x + d.dx];
        if (n && n.kind === 'path' && (n.base & d.opposite)) queue.push([x + d.dx, y + d.dy]);
      }
    }
    this.hint = order.filter((t) => this._mask(t) !== t.base).slice(0, count);
    this.hintUntil = this.time + seconds;
  }

  // A heavy black power cable with a copper ring lug bolted down at the board end
  _powerCable(ctx, x1, y, x2, live) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(x1 + 2, y + 3);
    ctx.lineTo(x2 + 2, y + 3);
    ctx.stroke();
    ctx.strokeStyle = '#0b0c0d';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(170, 180, 186, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y - 3);
    ctx.lineTo(x2, y - 3);
    ctx.stroke();
    // printed rating on the jacket (where there is room for it)
    if (Math.abs(x2 - x1) > 70) {
    ctx.font = '7px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(200, 200, 190, 0.35)';
    ctx.fillText('600V  6mm²', (x1 + x2) / 2, y + 1);
    }
    // the lug
    const lx = x2;
    const lug = ctx.createRadialGradient(lx - 1.5, y - 1.5, 0.5, lx, y, 7);
    lug.addColorStop(0, live ? '#ffe2b0' : '#d39a5c');
    lug.addColorStop(1, live ? '#c86a24' : '#5d3a1b');
    ctx.fillStyle = lug;
    ctx.beginPath();
    ctx.arc(lx, y, 7, 0, Math.PI * 2);
    ctx.fill();
    this._bolt(ctx, lx, y, 3.4);
    if (live) {
      const glow = ctx.createRadialGradient(lx, y, 2, lx, y, 16);
      glow.addColorStop(0, `rgba(150, 215, 255, ${0.35 + 0.15 * Math.sin(this.time * 37)})`);
      glow.addColorStop(1, 'rgba(150, 215, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(lx - 16, y - 16, 32, 32);
    }
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
    this._powerCable(ctx, bx + 44, sy, GX - 3, true);

    // The two indicator lamps on the right
    for (let i = 0; i < this.bulbRows.length; i++) {
      const row = this.bulbRows[i];
      const by = GY + row * TILE + TILE / 2;
      const lit = this.bulbLit[i];
      this._powerCable(ctx, gridRight + 38, by, gridRight + 3, lit);

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
