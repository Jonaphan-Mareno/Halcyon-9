import * as THREE from 'three';

// What the big window looks out on: the dark deep sea, with creatures drifting past.
//
// It is a looping "projection": a canvas animated live (no video file) and shown on a curved
// screen just outside the glass, so it covers exactly the window. Each creature has its own
// cycle, offset from the others, so the scene never repeats in an obvious way and there are
// always one or two things to see. Most of the picture is black, as the real deep sea is;
// what you see is what makes its own light (bioluminescence).
//
//   anglerfish  - glowing lure on a stalk, teeth
//   jellyfish   - pulsing bells, trailing tentacles
//   viperfish   - long body, rows of light organs, fangs
//   lanternfish - small schools with glowing dots
//   squid       - a big, dim, distant shape
//   plankton    - twinkling specks, and the odd flash of blue

const W = 1536;
const H = 576;
const PX_PER_M = 44;

// The curved screen sits just outside the glass (window: angles 15..75 degrees, 16..29 m up)
const SCREEN_RADIUS = 33.0;
const SCREEN_BOTTOM = 16.0;
const SCREEN_HEIGHT = 13.0;
const A0 = 15;
const A1 = 75;

const TAU = Math.PI * 2;
const fract = (x) => x - Math.floor(x);
const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);

function glow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(0.35, `rgba(${color},${alpha * 0.35})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---------------------------------------------------------------- creatures (all face +x)
function angler(ctx, t, s) {
  // body
  ctx.fillStyle = '#0a1219';
  ctx.beginPath();
  ctx.ellipse(0, 0, 52 * s, 36 * s, 0, 0, TAU);
  ctx.fill();
  // tail
  ctx.beginPath();
  ctx.moveTo(-46 * s, 0);
  ctx.lineTo(-96 * s, -26 * s);
  ctx.lineTo(-86 * s, 0);
  ctx.lineTo(-96 * s, 26 * s);
  ctx.closePath();
  ctx.fill();
  // the lure lights the front of the body
  const lx = 78 * s, ly = -66 * s;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, 52 * s, 36 * s, 0, 0, TAU);
  ctx.clip();
  glow(ctx, lx, ly, 150 * s, '70,170,190', 0.5);
  ctx.restore();
  // jaw and teeth
  ctx.strokeStyle = 'rgba(150,190,200,0.55)';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(14 * s, 14 * s);
  ctx.quadraticCurveTo(46 * s, 26 * s, 58 * s, 2 * s);
  ctx.stroke();
  ctx.fillStyle = 'rgba(220,235,240,0.8)';
  for (let i = 0; i < 7; i++) {
    const x = (24 + i * 5.2) * s;
    const y = (18 - Math.sin(i * 0.45) * 8 - i * 1.4) * s;
    ctx.beginPath();
    ctx.moveTo(x - 1.6 * s, y);
    ctx.lineTo(x, y - 9 * s);
    ctx.lineTo(x + 1.6 * s, y);
    ctx.fill();
  }
  // eye
  ctx.fillStyle = 'rgba(120,200,210,0.6)';
  ctx.beginPath();
  ctx.arc(34 * s, -10 * s, 3 * s, 0, TAU);
  ctx.fill();
  // stalk and pulsing lure
  ctx.strokeStyle = 'rgba(120,170,180,0.6)';
  ctx.lineWidth = 2.2 * s;
  ctx.beginPath();
  ctx.moveTo(18 * s, -34 * s);
  ctx.bezierCurveTo(20 * s, -80 * s, 55 * s, -88 * s, lx, ly);
  ctx.stroke();
  const pulse = 0.65 + 0.35 * Math.sin(t * 3.1);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, lx, ly, 70 * s * (0.8 + 0.3 * pulse), '120,235,255', 0.85 * pulse);
  glow(ctx, lx, ly, 16 * s, '255,255,255', 0.9);
  ctx.globalCompositeOperation = 'source-over';
}

function jelly(ctx, t, s, rgb, phase) {
  const beat = Math.sin(t * 2.2 + phase);
  const w = 30 * s * (1 + 0.14 * beat);
  const h = 24 * s * (1 - 0.18 * beat);
  ctx.globalCompositeOperation = 'lighter';
  // tentacles
  ctx.lineWidth = 1.6 * s;
  for (let i = 0; i < 9; i++) {
    const x0 = -w + (i * 2 * w) / 8;
    const len = (70 + (i % 3) * 26) * s;
    ctx.strokeStyle = `rgba(${rgb},${0.28 + 0.1 * (i % 2)})`;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.bezierCurveTo(x0 + Math.sin(t * 1.4 + i + phase) * 12 * s, len * 0.35,
      x0 - Math.sin(t * 1.1 + i * 1.7) * 14 * s, len * 0.7, x0 + Math.sin(t * 1.7 + i) * 10 * s, len);
    ctx.stroke();
  }
  // bell
  const g = ctx.createRadialGradient(0, -h * 0.2, 2, 0, 0, w * 1.1);
  g.addColorStop(0, `rgba(${rgb},0.55)`);
  g.addColorStop(0.7, `rgba(${rgb},0.2)`);
  g.addColorStop(1, `rgba(${rgb},0.05)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.quadraticCurveTo(-w, -h * 1.5, 0, -h * 1.5);
  ctx.quadraticCurveTo(w, -h * 1.5, w, 0);
  ctx.quadraticCurveTo(0, h * 0.35, -w, 0);
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb},0.85)`;
  ctx.lineWidth = 1.8 * s;
  ctx.stroke();
  glow(ctx, 0, -h * 0.5, w * 1.6, rgb, 0.25);
  ctx.globalCompositeOperation = 'source-over';
}

function viper(ctx, t, s) {
  const n = 26;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);                       // 0 head .. 1 tail
    const x = -u * 190 * s;
    const y = Math.sin(t * 2.4 - u * 5.0) * (4 + u * 20) * s;
    const th = (16 * (1 - u) + 3) * s;           // thickness
    pts.push({ x, y, th });
  }
  ctx.fillStyle = '#0b141b';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y - p.th) : ctx.moveTo(p.x, p.y - p.th)));
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y + pts[i].th);
  ctx.closePath();
  ctx.fill();
  // head: open mouth with fangs
  ctx.fillStyle = '#0b141b';
  ctx.beginPath();
  ctx.moveTo(0, -14 * s);
  ctx.lineTo(34 * s, -8 * s);
  ctx.lineTo(38 * s, 0);
  ctx.lineTo(30 * s, 12 * s);
  ctx.lineTo(0, 16 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(225,240,245,0.85)';
  for (let i = 0; i < 6; i++) {
    const x = (8 + i * 5) * s;
    ctx.beginPath();
    ctx.moveTo(x, -9 * s);
    ctx.lineTo(x + 1.5 * s, -9 * s + (12 - i) * s * 0.9);
    ctx.lineTo(x + 3 * s, -9 * s);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, 12 * s);
    ctx.lineTo(x + 1.5 * s, 12 * s - (11 - i) * s * 0.9);
    ctx.lineTo(x + 3 * s, 12 * s);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  // light organs along the belly
  for (let i = 2; i < n; i += 1) {
    const p = pts[i];
    const a = 0.35 + 0.35 * Math.sin(t * 4 + i);
    glow(ctx, p.x, p.y + p.th * 0.7, 7 * s, '110,230,255', a);
  }
  glow(ctx, 12 * s, -6 * s, 10 * s, '255,90,60', 0.6);   // eye shine
  const tail = pts[n - 1];
  glow(ctx, tail.x - 6 * s, tail.y, 26 * s, '255,60,40', 0.5 + 0.3 * Math.sin(t * 3));
  ctx.globalCompositeOperation = 'source-over';
}

function lanternfish(ctx, t, s, seed) {
  const flick = Math.sin(t * 9 + seed * 7) * 2 * s;
  ctx.fillStyle = '#0d1a22';
  ctx.beginPath();
  ctx.ellipse(0, 0, 11 * s, 4.2 * s, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-9 * s, 0);
  ctx.lineTo(-17 * s, -5 * s + flick);
  ctx.lineTo(-17 * s, 5 * s + flick);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) glow(ctx, (-5 + i * 3.2) * s, 2.4 * s, 3.2 * s, '120,240,255', 0.75);
  glow(ctx, 8 * s, -1 * s, 4 * s, '255,255,255', 0.5);
  ctx.globalCompositeOperation = 'source-over';
}

function squid(ctx, t, s) {
  ctx.fillStyle = '#10181f';
  ctx.beginPath();
  ctx.moveTo(60 * s, 0);
  ctx.quadraticCurveTo(10 * s, -26 * s, -70 * s, -14 * s);
  ctx.lineTo(-80 * s, 0);
  ctx.lineTo(-70 * s, 14 * s);
  ctx.quadraticCurveTo(10 * s, 26 * s, 60 * s, 0);
  ctx.fill();
  // fins
  ctx.beginPath();
  ctx.moveTo(-50 * s, -12 * s);
  ctx.lineTo(-84 * s, -30 * s + Math.sin(t * 1.4) * 5 * s);
  ctx.lineTo(-74 * s, -2 * s);
  ctx.closePath();
  ctx.fill();
  // tentacles
  ctx.strokeStyle = '#10181f';
  ctx.lineWidth = 4 * s;
  for (let i = 0; i < 8; i++) {
    const y = (-10 + i * 2.8) * s;
    ctx.beginPath();
    ctx.moveTo(58 * s, y * 0.5);
    ctx.bezierCurveTo(100 * s, y + Math.sin(t * 1.6 + i) * 10 * s, 150 * s, y * 1.4 - Math.sin(t * 1.2 + i) * 12 * s, 190 * s, y * 1.8 + Math.sin(t + i) * 8 * s);
    ctx.stroke();
  }
  // dim, flickering colour patches and a great eye
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    glow(ctx, (-50 + i * 11) * s, Math.sin(i * 2) * 8 * s, 9 * s, '190,60,60', 0.18 + 0.14 * Math.sin(t * 1.5 + i * 1.3));
  }
  glow(ctx, 38 * s, -4 * s, 9 * s, '150,210,230', 0.45);
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- the screen
export class DeepSeaWindow {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;

    const geo = new THREE.CylinderGeometry(SCREEN_RADIUS, SCREEN_RADIUS, SCREEN_HEIGHT, 48, 1, true,
      ((A0 + 90) * Math.PI) / 180, ((A1 - A0) * Math.PI) / 180);
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.BackSide, fog: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = SCREEN_BOTTOM + SCREEN_HEIGHT / 2;
    this.mesh.name = 'DeepSeaWindow';

    this.time = 0;
    this._acc = 0;
    this._frustum = new THREE.Frustum();
    this._viewProj = new THREE.Matrix4();
    this.draw(0);
  }

  update(delta, camera = null) {
    this.time += delta;
    this._acc += delta;
    if (this._acc < 1 / 20) return;   // 20 frames a second is plenty for slow swimmers
    this._acc = 0;
    // Redrawing and re-uploading the picture costs time, so skip it while the window is off screen
    if (camera) {
      this._viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this._frustum.setFromProjectionMatrix(this._viewProj);
      if (!this._frustum.intersectsObject(this.mesh)) return;
    }
    this.draw(this.time);
    this.texture.needsUpdate = true;
  }

  // x position of something crossing the screen once every `period` seconds
  _cross(t, period, offset, dir = -1, margin = 260) {
    const p = fract(t / period + offset);
    return dir < 0 ? W + margin - p * (W + margin * 2) : -margin + p * (W + margin * 2);
  }

  draw(t) {
    const ctx = this.ctx;
    // deep water: black at the top, a trace of blue-green far below
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#01060a');
    bg.addColorStop(0.55, '#020c12');
    bg.addColorStop(1, '#04202a');
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // a faint glow from the vent far below
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, W * 0.62, H * 1.15, 520, '30,110,130', 0.28 + 0.05 * Math.sin(t * 0.4));

    // twinkling plankton, and a flash of blue now and then
    for (let i = 0; i < 70; i++) {
      const x = hash(i) * W;
      const y = hash(i + 100) * H;
      const a = 0.12 + 0.28 * Math.max(0, Math.sin(t * (0.6 + hash(i + 7)) + i * 3));
      glow(ctx, x, y, 3.2, '130,220,240', a);
    }
    const cycle = Math.floor(t / 8.5);
    const phase = fract(t / 8.5);
    if (phase < 0.35) {
      const fx = hash(cycle + 31) * W * 0.8 + W * 0.1;
      const fy = hash(cycle + 57) * H * 0.7 + H * 0.15;
      const e = phase / 0.35;
      glow(ctx, fx, fy, 14 + e * 80, '90,190,255', 0.55 * (1 - e));
    }
    ctx.globalCompositeOperation = 'source-over';

    const put = (x, y, dir, s, fn, alpha = 1, ...rest) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.scale(dir, 1);
      fn(ctx, t, s, ...rest);
      ctx.restore();
    };

    // far and dim: the big squid, crossing once every two minutes
    put(this._cross(t, 120, 0.3, 1, 320), H * 0.34 + Math.sin(t * 0.2) * 14, 1, 2.3, squid, 0.6);

    // jellyfish drifting up and sideways
    const jellies = [
      { period: 70, off: 0.0, x: 0.22, s: 1.8, rgb: '255,120,200' },
      { period: 55, off: 0.45, x: 0.5, s: 1.3, rgb: '120,200,255' },
      { period: 90, off: 0.7, x: 0.78, s: 2.2, rgb: '180,140,255' }
    ];
    for (const j of jellies) {
      const p = fract(t / j.period + j.off);
      const y = H + 160 - p * (H + 420);
      const x = W * j.x + Math.sin(t * 0.3 + j.off * 9) * 46;
      put(x, y, 1, j.s, jelly, 0.9, j.rgb, j.off * 6);
    }

    // schools of lanternfish
    for (const [period, off, yy, s, count, dir] of [[41, 0.1, 0.72, 1.7, 16, -1], [57, 0.6, 0.28, 1.25, 12, 1]]) {
      const cx = this._cross(t, period, off, dir, 200);
      for (let i = 0; i < count; i++) {
        const fx = cx + (hash(i + off * 40) - 0.5) * 300 + Math.sin(t * 0.9 + i) * 14;
        const fy = H * yy + (hash(i + 60 + off * 40) - 0.5) * 140 + Math.sin(t * 1.3 + i * 2) * 12;
        put(fx, fy, dir > 0 ? 1 : -1, s * (0.8 + hash(i + 3) * 0.4), lanternfish, 0.9, i);
      }
    }

    // the viperfish, then the anglerfish: the stars of the show
    put(this._cross(t, 62, 0.2, 1, 480), H * 0.6 + Math.sin(t * 0.5) * 18, 1, 1.7, viper, 0.95);
    put(this._cross(t, 83, 0.55, -1, 340), H * 0.46 + Math.sin(t * 0.6) * 22, -1, 2.0, angler, 1);

    ctx.globalAlpha = 1;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}
