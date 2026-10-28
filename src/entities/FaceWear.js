import * as THREE from 'three';
import { FACE_UV, CM } from './vossFaceUV.js';

// Voss getting more and more worn through his video logs: a copy of his head texture with the
// wear painted on (dark bags under the eyes, pallor, cuts and scabs, a bruise, bloodshot eyes,
// hollow cheeks). Painted once per level when first asked for and kept until dispose(); nothing
// is drawn per frame. The gameplay Voss wears level 4 on his own copy of the head material
// (Player._wearFace); the shared materials are never touched.
//
// Everything is placed on the texture through the face landmarks Blender measured
// (vossFaceUV.js); the face is laid out as seen from the front, so offsets are in cm across/down.

// level -> what is painted, and how the face behaves (FaceRig preset, the wound, the light)
export const CONDITION = [
  // 0, log-0: the living Voss, healthy and bright
  { eyeBag: 0,    pallor: 0,    cuts: 0, bruise: 0,   bloodshot: 0,   gaunt: 0,   bloodLine: false, wound: false },
  // 1, log-1: the same man under strain: a faint shadow under the eyes
  { eyeBag: 0.28, pallor: 0.05, cuts: 0, bruise: 0,   bloodshot: 0,   gaunt: 0,   bloodLine: false, wound: false },
  // 2, log-2 (Cycle 2): reconstructed: noticeable bags, pale, a scratch or two
  { eyeBag: 0.55, pallor: 0.3,  cuts: 2, bruise: 0,   bloodshot: 0.25, gaunt: 0.15, bloodLine: false, wound: true },
  // 3, log-5 (Cycle 5): heavy bags, paler, more cuts, a bruise at the temple, bloodshot eyes
  { eyeBag: 0.8,  pallor: 0.5,  cuts: 4, bruise: 0.7, bloodshot: 0.6, gaunt: 0.4, bloodLine: false, wound: true },
  // 4, log-8 (Cycle 8): the darkest bags, gaunt, cuts and scabs everywhere, dried blood
  { eyeBag: 1,    pallor: 0.7,  cuts: 8, bruise: 0.9, bloodshot: 0.85, gaunt: 0.8, bloodLine: true, wound: true }
];

// Where cuts go, in order (a level with n cuts has the first n): landmark, offset (cm across, cm
// down), length (cm), angle (degrees), scab (dried dark) or fresh
const CUTS = [
  ['cheekR', [-0.4, -0.2], 1.6, -25, false],
  ['foreheadL', [0.3, 0.1], 1.2, 15, false],
  ['chinSideR', [-0.1, 0.2], 0.9, 70, true],
  ['cheekboneL', [-0.2, 0.3], 1.4, -10, false],
  ['browR', [-0.4, -0.45], 0.8, 30, true],
  ['jawL', [-0.3, 0.1], 1.7, 55, false],
  ['noseBridge', [0.2, 0.25], 0.6, -40, true],
  ['foreheadR', [-0.2, -0.5], 1.9, -8, true]
];

// A small seeded random (the same marks every time)
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class FaceWear {
  // base: the head's texture (M_Head_albedo, as loaded)
  constructor(base) {
    this.base = base;
    this.cache = new Map();
  }

  // The worn texture for a condition level (0 is the texture itself)
  texture(level) {
    if (!level || !this.base?.image) return this.base;
    if (!this.cache.has(level)) this.cache.set(level, this._paint(CONDITION[level]));
    return this.cache.get(level);
  }

  dispose() {
    for (const t of this.cache.values()) t.dispose();
    this.cache.clear();
  }

  _paint(c) {
    const img = this.base.image;
    const W = img.width, H = img.height;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0);
    // landmark -> canvas pixels, with an offset in cm (across toward his left on the image is +x)
    const at = (name, dx = 0, dy = 0) => {
      const [u, v] = FACE_UV[name].uv;
      return [(u + dx * CM[0]) * W, (v + dy * CM[1]) * H];
    };
    const px = CM[0] * W;                   // pixels per cm across
    const rnd = random(9);                  // (the same sequence at every level, so the wear only adds up)

    // all the skin of the texture (the face, ears, neck, scalp): all of it but the strip down the
    // right edge holding the eyeballs and the mouth's parts, which keep their own colours
    const skin = () => {
      const left = FACE_UV.eyeballL.box[0] - 0.02, bottom = FACE_UV.eyeballL.box[3] + 0.03;
      g.beginPath();
      g.rect(0, 0, left * W, H);                                  // everything left of the strip
      g.rect(0, bottom * H, W, H);                                // everything below it
    };

    // pallor: less colour, a cooler and greyer skin
    if (c.pallor > 0) {
      g.save();
      skin();
      g.clip();
      g.globalCompositeOperation = 'saturation';
      g.fillStyle = `rgba(128,128,128,${0.55 * c.pallor})`;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgba(214,226,236,${c.pallor})`;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'screen';
      g.fillStyle = `rgba(40,44,50,${0.5 * c.pallor})`;
      g.fillRect(0, 0, W, H);
      g.restore();
    }

    // hollow cheeks and sunken temples
    if (c.gaunt > 0) {
      g.save();
      g.globalCompositeOperation = 'multiply';
      for (const s of ['L', 'R']) {
        const dir = s === 'L' ? 1 : -1;
        this._blob(g, ...at('cheek' + s, 0.35 * dir, 0.45), px * 1.5, px * 0.9, `rgba(120,96,100,${0.55 * c.gaunt})`);
        this._blob(g, ...at('temple' + s, 0, 0.3), px * 0.9, px * 1.2, `rgba(130,105,110,${0.4 * c.gaunt})`);
      }
      g.restore();
    }

    // bags under the eyes, darkest by the nose
    if (c.eyeBag > 0) {
      g.save();
      g.globalCompositeOperation = 'multiply';
      for (const s of ['L', 'R']) {
        const dir = s === 'L' ? 1 : -1;
        const [x, y] = at('underEye' + s, 0, 0.25);
        this._blob(g, x, y, px * 1.45, px * 0.55, `rgba(92,58,72,${0.75 * c.eyeBag})`);
        this._blob(g, ...at('eyeInner' + s, -0.1 * dir, 0.35), px * 0.5, px * 0.45, `rgba(70,45,60,${0.6 * c.eyeBag})`);
        // the upper lids go a little darker and redder too
        this._blob(g, ...at('lidUpper' + s, 0, -0.05), px * 1.1, px * 0.32, `rgba(150,95,100,${0.45 * c.eyeBag})`);
      }
      g.restore();
    }

    // a bruise at his right temple: violet in the middle, going yellow-green at the edge
    if (c.bruise > 0) {
      g.save();
      g.globalCompositeOperation = 'multiply';
      const [x, y] = at('templeR', 0.6, 0.5);
      this._blob(g, x, y, px * 1.5, px * 1.25, `rgba(196,200,140,${0.45 * c.bruise})`);
      this._blob(g, x, y, px * 1.0, px * 0.85, `rgba(110,80,150,${0.6 * c.bruise})`);
      this._blob(g, x + px * 0.15, y - px * 0.1, px * 0.5, px * 0.45, `rgba(80,50,110,${0.55 * c.bruise})`);
      g.restore();
    }

    // cuts and scabs: thin ragged lines, each with a paler swollen rim
    for (let i = 0; i < c.cuts; i++) {
      const [name, [ox, oy], len, deg, scab] = CUTS[i];
      const [x, y] = at(name, ox, oy);
      this._cut(g, x, y, len * px, (deg * Math.PI) / 180, scab, rnd);
    }

    // dried blood running from the fresh forehead cut, down past his right eye
    if (c.bloodLine) {
      const [x0, y0] = at('foreheadR', -0.3, -0.4);
      g.save();
      g.strokeStyle = 'rgba(90,18,16,0.75)';
      g.lineCap = 'round';
      let x = x0, y = y0;
      for (let k = 0; k < 26; k++) {
        const nx = x + (rnd() - 0.55) * px * 0.12, ny = y + px * 0.12;
        g.lineWidth = px * (0.11 - k * 0.0025);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(nx, ny);
        g.stroke();
        x = nx;
        y = ny;
      }
      g.restore();
    }

    // bloodshot whites (the eyeballs have their own part of the texture)
    if (c.bloodshot > 0) {
      for (const s of ['L', 'R']) {
        const { box, pupil } = FACE_UV['eyeball' + s];
        const cx = pupil[0] * W, cy = pupil[1] * H;
        const r = (box[2] - box[0]) * W * 0.5;
        g.save();
        g.globalCompositeOperation = 'multiply';
        this._blob(g, cx, cy, r * 0.55, r * 0.55, `rgba(255,170,165,${0.5 * c.bloodshot})`);
        g.restore();
        g.save();
        g.strokeStyle = `rgba(170,30,30,${0.75 * c.bloodshot})`;
        g.lineCap = 'round';
        const veins = Math.round(10 + 16 * c.bloodshot);
        for (let v = 0; v < veins; v++) {
          let a = rnd() * Math.PI * 2;
          let d = r * (0.45 + rnd() * 0.15);
          let x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
          g.lineWidth = 1.6 + rnd() * 1.2;
          g.beginPath();
          g.moveTo(x, y);
          const steps = 4 + Math.floor(rnd() * 4);
          for (let k = 0; k < steps; k++) {
            a += (rnd() - 0.5) * 0.5;
            d -= r * (0.035 + rnd() * 0.03);
            if (d < r * 0.12) break;
            x = cx + Math.cos(a) * d;
            y = cy + Math.sin(a) * d;
            g.lineTo(x, y);
          }
          g.stroke();
        }
        g.restore();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = this.base.flipY;
    tex.colorSpace = this.base.colorSpace;
    tex.wrapS = this.base.wrapS;
    tex.wrapT = this.base.wrapT;
    tex.channel = this.base.channel;
    tex.anisotropy = this.base.anisotropy;
    return tex;
  }

  // a soft elliptical patch, strongest in the middle
  _blob(g, x, y, rx, ry, color) {
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = grad;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  }

  _cut(g, x, y, len, angle, scab, rnd) {
    const pts = [];
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const t = k / n - 0.5;
      const off = (rnd() - 0.5) * len * 0.07;
      pts.push([x + Math.cos(angle) * t * len - Math.sin(angle) * off, y + Math.sin(angle) * t * len + Math.cos(angle) * off]);
    }
    const line = (width, color) => {
      g.lineWidth = width;
      g.strokeStyle = color;
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.stroke();
    };
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalCompositeOperation = 'multiply';
    line(len * 0.16, 'rgba(225,150,140,0.55)');                     // swollen, reddened skin
    g.globalCompositeOperation = 'source-over';
    line(len * 0.05, scab ? 'rgba(70,28,22,0.92)' : 'rgba(130,16,18,0.95)');
    if (scab) {
      for (let k = 1; k < pts.length - 1; k += 2) {                   // the crust breaks up
        g.fillStyle = 'rgba(55,22,18,0.9)';
        g.beginPath();
        g.arc(pts[k][0], pts[k][1], len * 0.04 * (0.6 + rnd() * 0.6), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }
}
