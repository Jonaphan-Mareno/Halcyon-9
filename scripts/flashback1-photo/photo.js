import * as THREE from 'three';
import { Player } from '../../src/entities/Player.js';
import { BriefingFlashback } from '../../src/story/BriefingFlashback.js';

// The photograph of Flashback 1 (public/assets/textures/flashback1/briefing-photo.webp): the same
// room as the flashback, the same people where they stand at the flash, seen from the speaker's
// camera rather than through Voss's eyes. Then made into an old print: warm and a little faded,
// the faces stained out (coffee), and torn off where Voss stood: the tear runs down through
// Lindqvist's shoulder, so her arm round him went with him. The torn part is see-through (the frame's backing shows in
// the lift).
//
// Run `node scripts/flashback1-photo/render.mjs` (it starts the dev server and a headless Chrome,
// and writes the file). Open this page in the dev server to see the result; ?t=12 instead shows
// the flashback itself as it looks 12 s in (for checking poses).

const params = new URLSearchParams(location.search);
const W = 1200, H = 800;          // the print, 3:2
const BORDER = 0.028;             // its white border, as a share of the width

async function main() {
  const player = new Player(new THREE.Scene());
  await player.load();
  const fb = new BriefingFlashback(player, { root: null });
  window.__fb = fb;
  if (params.has('t')) return preview(fb);
  return photo(fb);
}

// The flashback at any moment, through its own look. window.__at(t) moves on to a later time;
// window.__at(t, [x, y, z, tx, ty, tz]) looks from somewhere else (to check the poses).
async function preview(fb) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(1280, 720);
  document.body.appendChild(renderer.domElement);
  window.__renderer = renderer;
  await fb.preload(renderer);
  let now = 0;
  window.__at = (t, cam = null) => {
    if (t < now) now = 0;
    for (; now < t; now += 1 / 30) {
      fb.t = now;
      fb._animate(now, now === 0 ? 0 : 1 / 30);
    }
    fb.t = t;
    fb._animate(t, 1 / 30);
    if (cam) {
      fb.camera.position.set(cam[0], cam[1], cam[2]);
      fb.camera.lookAt(cam[3], cam[4], cam[5]);
    }
    fb._draw(renderer, t);
    return fb.T;
  };
  window.__at(parseFloat(params.get('t')) || 0);
  window.__ready = true;
}

async function photo(fb) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const inner = [Math.round(W * (1 - 2 * BORDER)), Math.round(H - W * 2 * BORDER)];
  renderer.setSize(inner[0], inner[1]);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  await fb.preload(renderer);
  const shot = fb.posePhoto(inner[0] / inner[1]);
  renderer.render(fb.scene, shot.camera);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const b = Math.round(W * BORDER);
  g.fillStyle = '#f2ede2';
  g.fillRect(0, 0, W, H);
  g.filter = 'sepia(0.3) saturate(0.85) contrast(1.14) brightness(0.98)';
  g.drawImage(renderer.domElement, b, b, inner[0], inner[1]);
  g.filter = 'none';

  // world -> pixels on the print
  const px = (p) => {
    const n = p.clone().project(shot.camera);
    return { x: b + (n.x * 0.5 + 0.5) * inner[0], y: b + (-n.y * 0.5 + 0.5) * inner[1] };
  };
  const size = (p, metres) => Math.abs(px(p).y - px(p.clone().setY(p.y + metres)).y);

  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // age: a warm fade toward the edges, a little light leak, grain
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
  v.addColorStop(0, 'rgba(255, 240, 210, 0)');
  v.addColorStop(1, 'rgba(120, 80, 40, 0.35)');
  g.fillStyle = v;
  g.fillRect(b, b, inner[0], inner[1]);
  const leak = g.createLinearGradient(b, b, b + inner[0] * 0.3, b + inner[1] * 0.4);
  leak.addColorStop(0, 'rgba(255, 170, 90, 0.18)');
  leak.addColorStop(1, 'rgba(255, 170, 90, 0)');
  g.fillStyle = leak;
  g.fillRect(b, b, inner[0], inner[1]);

  // the stains: one spill over each face, with drips and a darker tide line
  const blob = (x, y, r, fill, line) => {
    const n = 30, pts = [];
    const ph = rnd() * 6, ph2 = rnd() * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 0.86 + 0.12 * Math.sin(a * 3 + ph) + 0.08 * Math.sin(a * 7 + ph2) + 0.05 * (rnd() - 0.5);
      pts.push([x + Math.cos(a) * r * k * 1.05, y + Math.sin(a) * r * k]);
    }
    g.beginPath();
    pts.forEach(([px2, py], i) => (i ? g.lineTo(px2, py) : g.moveTo(px2, py)));
    g.closePath();
    const grad = g.createRadialGradient(x, y, r * 0.1, x, y, r * 1.05);
    grad.addColorStop(0, fill[0]);
    grad.addColorStop(0.75, fill[1]);
    grad.addColorStop(1, fill[2]);
    g.fillStyle = grad;
    g.fill();
    if (line) {
      g.lineWidth = Math.max(2, r * 0.07);
      g.strokeStyle = line;
      g.stroke();
    }
  };
  const coffee = ['rgba(92, 56, 24, 0.95)', 'rgba(118, 74, 34, 0.9)', 'rgba(140, 92, 46, 0.7)'];
  for (const f of shot.faces) {
    const p = px(f);
    const r = size(f, 0.15) * 1.05;
    blob(p.x + (rnd() - 0.5) * r * 0.2, p.y + (rnd() - 0.5) * r * 0.15, r, coffee, 'rgba(66, 36, 12, 0.7)');
    for (let i = 0; i < 3; i++) {
      const a = rnd() * Math.PI * 2;
      blob(p.x + Math.cos(a) * r * (0.9 + rnd() * 0.4), p.y + Math.sin(a) * r * (0.8 + rnd() * 0.4), r * (0.12 + rnd() * 0.15), coffee, null);
    }
  }
  // a water ring or two on the paper
  for (const [x, y, r] of [[W * 0.2, H * 0.78, 70], [W * 0.62, H * 0.86, 46]]) {
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(130, 100, 60, 0.35)';
    g.beginPath();
    g.ellipse(x, y, r, r * 0.92, 0.3, 0, Math.PI * 2);
    g.stroke();
  }
  // grain
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 16;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // a crease across a corner
  g.strokeStyle = 'rgba(255, 250, 240, 0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(W * 0.02, H * 0.3);
  g.lineTo(W * 0.24, H * 0.02);
  g.stroke();

  // the tear: down through Lindqvist's shoulder, the one next to Voss (her arm was round him, so
  // none of it can be left); everything beyond it gone
  const edge = px(shot.shoulder).x + size(shot.shoulder, 0.04);
  const path = [];
  for (let y = -10; y <= H + 10; y += 9) {
    const slant = ((y - H / 2) / H) * -W * 0.03;
    const wob = Math.sin(y * 0.021) * 9 + Math.sin(y * 0.11 + 1) * 4 + (rnd() - 0.5) * 7;
    path.push([edge + slant + wob, y]);
  }
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';               // (fully: what it removes goes by the fill's own alpha)
  g.beginPath();
  path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.lineTo(W + 10, H + 10);
  g.lineTo(W + 10, -10);
  g.closePath();
  g.fill();
  g.restore();
  // the white core of the paper along the torn edge (only on what is left)
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (const [w, a] of [[12, 0.55], [7, 0.85]]) {
    g.lineWidth = w;
    g.strokeStyle = `rgba(250, 247, 240, ${a})`;
    g.beginPath();
    path.forEach(([x, y], i) => {
      const jx = x + (rnd() - 0.5) * 3;
      if (i) g.lineTo(jx, y); else g.moveTo(jx, y);
    });
    g.stroke();
  }
  g.restore();

  c.id = 'out';
  document.body.appendChild(c);
  window.__photo = c.toDataURL('image/webp', 0.86);
  window.__ready = true;
}

main().catch((e) => {
  console.error(e);
  window.__error = String(e && e.stack || e);
});
