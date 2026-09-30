// "Overload": the generator's coupling panel, zoomed in.
//
// Five coloured cables hang on the left; five sockets sit on the right, each
// with an LED ring in one of the cable colours, in a shuffled order. Drag every
// cable into the socket that glows the same colour before the countdown runs
// out. The panel is dark: the socket colours are only visible inside the beam of
// the player's torch, which follows the mouse. A wrong plug sparks and costs
// time. If the timer hits zero the generator overloads (handled by the Game).
//
// The puzzle owns its overlay and input; the Game owns the consequences
// (blackout, ARIA's reactions, restoring power) and reacts through callbacks.

const W = 900;
const H = 440;

const COLORS = [
  { name: 'cyan',    hex: '#33e6ff' },
  { name: 'green',   hex: '#39ff6a' },
  { name: 'red',     hex: '#ff4d4d' },
  { name: 'yellow',  hex: '#ffd23f' },
  { name: 'magenta', hex: '#ff4df0' }
];

const COUNT = COLORS.length;
const ROW_Y = (i) => 122 + i * 62;
const ANCHOR_X = 46;
const REST_X = 230;
const SOCKET_X = 790;
const PICK_RADIUS = 30;
const SNAP_RADIUS = 42;
const BEAM_RADIUS = 125;
const MISTAKE_PENALTY = 3; // seconds
const HEAD_CENTRE = 13;    // the plug head spans x-4 .. x+30 around its position
const HEAD_TIP = 30;

export class CablePuzzle {
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

    this.timeLimit = 45;
    this.timeLeft = 45;
    this.time = 0;

    this.sockets = [];
    this.plugs = [];
    this.pointer = { x: W / 2, y: H / 2, inside: false };
    this.dragging = null;

    // Pooled 2D sparks (positions in canvas pixels)
    this.particles = Array.from({ length: 140 }, () => ({ life: 0, x: 0, y: 0, vx: 0, vy: 0, color: '#fff' }));
    this._particleCursor = 0;

    this.canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this._onUp(e));
    this.canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    this.canvas.addEventListener('pointerenter', () => { this.pointer.inside = true; });
  }

  get stress() {
    return this.active ? 1 - Math.max(0, this.timeLeft) / this.timeLimit : 0;
  }

  get connectedCount() {
    return this.plugs.filter((p) => p.socket >= 0).length;
  }

  // ---------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------
  open({ timeLimit = 45, hasTorch = true } = {}) {
    this.hasTorch = hasTorch;
    this.active = true;
    this.container.classList.add('visible');
    this.backdrop.classList.add('visible');
    this.reset({ timeLimit });
  }

  close() {
    this.active = false;
    this.dragging = null;
    this.container.classList.remove('visible');
    this.backdrop.classList.remove('visible');
  }

  // A fresh arrangement: shuffled sockets, cables back at rest, timer refilled
  reset({ timeLimit = this.timeLimit } = {}) {
    this.timeLimit = timeLimit;
    this.timeLeft = timeLimit;
    this.frozen = false;
    this.paused = false;
    this.dragging = null;

    // Shuffle the socket colours, making sure most are not already in line
    let order;
    do {
      order = COLORS.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    } while (order.filter((c, i) => c === i).length > 1);

    this.sockets = order.map((colorIndex, i) => ({ colorIndex, x: SOCKET_X, y: ROW_Y(i), plugged: false }));
    this.plugs = COLORS.map((_, i) => ({
      colorIndex: i,
      ax: ANCHOR_X, ay: ROW_Y(i),
      x: REST_X, y: ROW_Y(i),
      socket: -1
    }));
  }

  // Index (1-based, top to bottom) of the socket a given plug colour belongs in
  socketNumberFor(colorIndex) {
    return this.sockets.findIndex((s) => s.colorIndex === colorIndex) + 1;
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

  _onDown(e) {
    if (!this.active || this.frozen) return;
    const p = this._toCanvas(e);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    for (const plug of this.plugs) {
      if (plug.socket >= 0) continue;
      if (Math.hypot(plug.x + HEAD_CENTRE - p.x, plug.y - p.y) < PICK_RADIUS) {
        this.dragging = plug;
        try { this.canvas.setPointerCapture?.(e.pointerId); } catch (err) { /* not capturable: fine */ }
        break;
      }
    }
  }

  _onMove(e) {
    const p = this._toCanvas(e);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.inside = true;
    if (this.dragging && !this.frozen) {
      this.dragging.x = Math.min(W - 40, Math.max(20, p.x - HEAD_CENTRE));
      this.dragging.y = Math.min(H - 10, Math.max(20, p.y));
    }
  }

  _onUp(e) {
    const plug = this.dragging;
    this.dragging = null;
    if (!plug || !this.active || this.frozen) return;

    // Which free socket, if any, is the plug being dropped on?
    const index = this.sockets.findIndex((s) => !s.plugged && Math.hypot(s.x - (plug.x + HEAD_TIP), s.y - plug.y) < SNAP_RADIUS);
    if (index < 0) return; // dropped in mid-air: the cable slides back on its own

    const socket = this.sockets[index];
    if (socket.colorIndex === plug.colorIndex) {
      plug.socket = index;
      socket.plugged = true;
      plug.x = socket.x - HEAD_TIP;
      plug.y = socket.y;
      this._sparks(socket.x, socket.y, COLORS[plug.colorIndex].hex, 14);
      this.cb.onConnect?.(this.connectedCount);
      if (this.connectedCount === COUNT) {
        this.frozen = true;
        // Called from the pointerup event, so the Game may re-lock the mouse
        this.cb.onSolved?.();
      }
    } else {
      // Wrong socket: sparks, a time penalty, and the cable is thrown back
      this._sparks(socket.x, socket.y, '#ffb060', 22);
      this.timeLeft = Math.max(0.05, this.timeLeft - MISTAKE_PENALTY);
      this.cb.onMistake?.();
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
        this.dragging = null;
        this.cb.onOverload?.();
      }
    }

    // Loose cables slide back to rest
    const ease = 1 - Math.exp(-14 * delta);
    for (const plug of this.plugs) {
      if (plug === this.dragging || plug.socket >= 0) continue;
      plug.x += (REST_X - plug.x) * ease;
      plug.y += (ROW_Y(this.plugs.indexOf(plug)) - plug.y) * ease;
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
    for (let i = 0; i < 6; i++) this._sparks(60 + Math.random() * 780, 100 + Math.random() * 300, '#ff5533', 18);
  }

  // ---------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------
  _draw() {
    const ctx = this.ctx;
    const t = this.time;
    const stress = this.stress;

    // Under stress the whole panel flickers, like the power failing
    const flicker = stress > 0.45 && Math.sin(t * 37) * Math.sin(t * 11) > 0.55 ? 1 - 0.55 * stress : 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = flicker;

    // Panel
    ctx.fillStyle = '#04090d';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#124450';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    for (const [sx, sy] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]]) {
      ctx.fillStyle = '#0d2a33';
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Header and countdown bar
    ctx.font = '13px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3ab6c9';
    ctx.textAlign = 'left';
    ctx.fillText('GENERATOR COUPLING PANEL', 30, 26);
    const frac = Math.max(0, this.timeLeft) / this.timeLimit;
    const barColor = frac > 0.5 ? '#33e6ff' : frac > 0.25 ? '#ffb020' : '#ff3b3b';
    ctx.fillStyle = '#08161b';
    ctx.fillRect(30, 46, 840, 14);
    ctx.fillStyle = barColor;
    ctx.fillRect(30, 46, 840 * frac, 14);
    ctx.textAlign = 'right';
    ctx.fillStyle = barColor;
    ctx.fillText(`OVERLOAD IN ${this.timeLeft.toFixed(1)}s`, W - 30, 26);

    // Sockets: dim silhouettes first
    for (let i = 0; i < this.sockets.length; i++) this._drawSocket(ctx, i, false);

    // The torch beam reveals the true colours
    if (this.hasTorch && this.pointer.inside) {
      const { x, y } = this.pointer;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, BEAM_RADIUS, 0, Math.PI * 2);
      ctx.clip();
      const glow = ctx.createRadialGradient(x, y, 10, x, y, BEAM_RADIUS);
      glow.addColorStop(0, 'rgba(255, 244, 214, 0.22)');
      glow.addColorStop(1, 'rgba(255, 244, 214, 0.02)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - BEAM_RADIUS, y - BEAM_RADIUS, BEAM_RADIUS * 2, BEAM_RADIUS * 2);
      for (let i = 0; i < this.sockets.length; i++) this._drawSocket(ctx, i, true);
      ctx.restore();
    }
    // Sockets that are already connected always stay lit
    for (let i = 0; i < this.sockets.length; i++) {
      if (this.sockets[i].plugged) this._drawSocket(ctx, i, true);
    }

    // Cables and plugs
    for (const plug of this.plugs) this._drawCable(ctx, plug);

    // Sparks
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = flicker * Math.min(1, p.life * 2.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = flicker;

    // Instructions
    ctx.font = '13px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2f8a99';
    ctx.fillText(
      this.hasTorch
        ? 'Drag each cable into the socket that glows the same colour. Sweep your torch over the sockets to read them.'
        : 'It is too dark to read the sockets.',
      W / 2, H - 22
    );

    ctx.globalAlpha = 1;
  }

  _drawSocket(ctx, i, revealed) {
    const s = this.sockets[i];
    const color = COLORS[s.colorIndex].hex;

    ctx.fillStyle = '#0a1218';
    ctx.strokeStyle = '#1c3a44';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // LED ring: the true colour when revealed, a dim grey when not
    ctx.lineWidth = 5;
    if (revealed) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = color;
    } else {
      ctx.strokeStyle = '#26363c';
    }
    ctx.beginPath();
    ctx.arc(s.x, s.y, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#02060a';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '13px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3a6470';
    ctx.fillText(String(i + 1), s.x + 40, s.y);
  }

  _drawCable(ctx, plug) {
    const color = COLORS[plug.colorIndex].hex;
    const dx = plug.x - plug.ax;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(plug.ax, plug.ay);
      ctx.bezierCurveTo(plug.ax + dx * 0.5, plug.ay, plug.ax + dx * 0.5, plug.y + 28, plug.x, plug.y);
    };
    path();
    ctx.strokeStyle = '#02060a';
    ctx.lineWidth = 12;
    ctx.stroke();
    path();
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.stroke();
    path();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Anchor bolt and the plug head
    ctx.fillStyle = '#0d2a33';
    ctx.beginPath();
    ctx.arc(plug.ax, plug.ay, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#02060a';
    ctx.fillRect(plug.x - 4, plug.y - 12, 34, 24);
    ctx.fillStyle = color;
    ctx.fillRect(plug.x - 2, plug.y - 10, 22, 20);
    ctx.fillStyle = '#b8c2c6';
    ctx.fillRect(plug.x + 20, plug.y - 5, 10, 10);
  }
}
