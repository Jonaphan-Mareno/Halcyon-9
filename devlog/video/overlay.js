// The devlog's drawn layer: everything on top of the footage (the doodles and their handoff gags,
// the screen's frame, code cards, the Blender interface, tags, titles and diagrams). Rendered one
// frame at a time by build.mjs: window.renderAt(t) draws the frame at t seconds, on a
// transparent page, from build/data.json (the timeline with its times, the code, the outliners).
import { doodle, el, heightOf, NAMES } from './doodles.js';

const W = 1280, H = 720;
const S = { x: 170, y: 44, w: 1080, h: 506 };          // the screen the footage plays in
const HOST = { x: 88, y: 708, s: 0.56 };                // the speaker's spot, bottom left
const CODE = { x: S.x + 12, y: S.y + 12, w: 640, h: S.h - 24 };   // a code card (the footage plays small to its right)
const CODE_W = 640;
const K = 1.25;                                         // the speaker's doodle: this much bigger than the team sheet's 0.56
const CORNER = new Set(['intro', 'shove', 'pile-in', 'end-card', 'naomi-fps']);   // (gags that use the whole frame)
const ORDER = ['naomi', 'jonaphan', 'tariro', 'sivu', 'thabiso', 'simphiwe'];

let DATA;
const stage = document.getElementById('stage');
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = (u) => u * u * (3 - 2 * u);
const back = (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };   // overshoot
const pop = (t, at, d = 0.35) => (t < at ? 0 : t > at + d ? 1 : back((t - at) / d));
const lerp = (a, b, u) => a + (b - a) * u;

async function init() {
  DATA = await (await fetch('./build/data.json?' + Date.now())).json();
  await document.fonts.load('24px "Gloria Hallelujah"');
  await document.fonts.load('13px "JetBrains Mono"');
  await document.fonts.load('11px "Inter"');
  await document.fonts.ready;
  // each code card's lines, syntax-coloured one by one (GLSL for the shader files' strings)
  DATA.html = {};
  for (const [k, c] of Object.entries(DATA.code)) {
    DATA.html[k] = c.lines.map((l) => window.hljs ? window.hljs.highlight(l, { language: c.lang, ignoreIllegals: true }).value : l.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  }
  window.overlayReady = true;
}
init();

function beatAt(t) {
  const B = DATA.beats;
  let i = 0;
  while (i + 1 < B.length && t >= B[i + 1].start) i++;
  return i;
}

// ---------------------------------------------------------------- the frame
window.renderAt = (t, { prompter = false } = {}) => {
  stage.innerHTML = '';
  const i = beatAt(t), b = DATA.beats[i];
  const lt = t - b.start, u = clamp(lt / b.len);
  const prev = DATA.beats[i - 1], next = DATA.beats[i + 1];
  const svg = el(stage, 'svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const defs = el(svg, 'defs', {});
  // the hand-drawn wobble, boiling a little (three looks, eight times a second)
  const f = el(defs, 'filter', { id: 'wob', x: '-20%', y: '-20%', width: '140%', height: '140%' });
  el(f, 'feTurbulence', { type: 'fractalNoise', baseFrequency: '0.014', numOctaves: '1', seed: String(1 + (Math.floor(t * 8) % 3)) });
  el(f, 'feDisplacementMap', { in: 'SourceGraphic', scale: '2.4' });

  const black = b.black || (b.handoff && !b.gp && !b.seq && !b.old && !b.split);
  if (black) el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: '#000' });
  const ctx = { svg, t, lt, u, b, i, prev, next };

  if (!black) screenFrame(ctx);
  if (b.blender || b.blenderSplit) blenderUI(ctx);
  if (b.code) codeCard(ctx);
  if (b.label) tag(b.label, S.x + 14, S.y + 14);
  if (b.labelR) tag(b.labelR, S.x + S.w / 2 + 14, S.y + 14);
  if (b.split && !b.blenderSplit) el(svg, 'line', { x1: S.x + S.w / 2, y1: S.y, x2: S.x + S.w / 2, y2: S.y + S.h, stroke: '#fff', 'stroke-width': 3 });
  if (b.diagram) DIAGRAMS[b.diagram]?.(ctx);
  if (b.scene) SCENES[b.scene]?.(ctx);
  if (b.title) title(ctx, b.title);

  const big = !(b.handoff && CORNER.has(b.handoff));
  const g = el(svg, 'g', { filter: 'url(#wob)', transform: big ? `translate(${HOST.x},${HOST.y}) scale(${K}) translate(${-HOST.x},${-HOST.y})` : '' });
  ctx.g = g;
  if (b.handoff) GAGS[b.handoff]?.(ctx);
  else if (b.offscreen) offscreen(ctx);
  else if (!b.noHost && b.scene !== 'team' && b.who !== 'everyone') host(ctx);
  return true;
};

function talking(ctx) {
  const { lt, b } = ctx;
  return b.line && lt > 0.15 && lt < b.len - 0.45;
}

function host(ctx) {
  const { b, g, t } = ctx;
  if (b.host === 'vlog') return vlog(g, HOST.x, HOST.y - 70, t, talking(ctx));
  doodle(g, b.who, { x: HOST.x, y: HOST.y, s: HOST.s, talk: talking(ctx), t });
}

// the voice from off the screen: a speech bubble poking in from the left edge
function offscreen(ctx) {
  const { g, b, lt } = ctx;
  const k = ease(seg(lt, 0, 0.3));
  const x = -20 + 140 * k;
  el(g, 'path', { d: `M${x - 150},640 L${x},640 Q${x + 18},640 ${x + 18},658 L${x + 18},690 Q${x + 18},706 ${x},706 L${x - 150},706 Z M${x - 40},706 L${x - 30},722 L${x - 20},706`, class: 'cloth' });
  el(g, 'text', { x: x - 64, y: 682, 'font-size': 18, 'text-anchor': 'middle' }).textContent = NAMES[b.who] + ' (off-screen)';
}

function vlog(g, x, y, t, talk) {
  // a little handheld screen with his face on it, scanlines and all
  const w = 150, h = 118;
  el(g, 'rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 12, class: 'cloth' });
  el(g, 'rect', { x: x - w / 2 + 8, y: y - h / 2 + 8, width: w - 16, height: h - 26, rx: 4, fill: '#0b2530', stroke: '#fff', 'stroke-width': 1.5 });
  const head = el(g, 'g', {});
  doodle(head, 'jonaphan', { x, y: y + 150, s: 0.62, talk, t });
  head.setAttribute('clip-path', 'url(#vclip)');
  const cp = el(ctx_defs(g), 'clipPath', { id: 'vclip' });
  el(cp, 'rect', { x: x - w / 2 + 8, y: y - h / 2 + 8, width: w - 16, height: h - 26 });
  for (let k = 0; k < 9; k++) el(g, 'line', { x1: x - w / 2 + 8, x2: x + w / 2 - 8, y1: y - h / 2 + 12 + k * 10 + (t * 20 % 10), y2: y - h / 2 + 12 + k * 10 + (t * 20 % 10), stroke: 'rgba(56,214,255,.25)', 'stroke-width': 2 });
  el(g, 'circle', { cx: x, cy: y + h / 2 - 9, r: 4, class: 'ink' });
}
function ctx_defs(g) { return g.ownerSVGElement.querySelector('defs'); }

// ---------------------------------------------------------------- the screen
function screenFrame({ svg, b }) {
  el(svg, 'rect', { x: S.x - 4, y: S.y - 4, width: S.w + 8, height: S.h + 8, rx: 6, fill: 'none', stroke: '#fff', 'stroke-width': 3, filter: 'url(#wob)' });
  if (b.dim) el(svg, 'rect', { x: S.x, y: S.y, width: S.w, height: S.h, fill: 'rgba(0,0,0,.58)' });
}

function tag(text, x, y) {
  const d = document.createElement('div');
  d.className = 'tag';
  d.textContent = text;
  d.style.left = x + 'px';
  d.style.top = y + 'px';
  stage.appendChild(d);
}

function title({ svg, lt }, text) {
  const k = seg(lt, 0.1, 0.9) * (1 - seg(lt, 3.4, 4.0));
  if (k <= 0) return;
  const g = el(svg, 'g', { opacity: Math.min(1, k * 3) });
  const y = S.y + S.h - 34;
  const w = Math.max(220, text.length * 15.5);
  el(g, 'rect', { x: S.x + S.w - w - 26, y: y - 34, width: w + 12, height: 48, rx: 6, fill: 'rgba(0,0,0,.72)' });
  const cp = el(svg.querySelector('defs'), 'clipPath', { id: 'tclip' });
  el(cp, 'rect', { x: S.x + S.w - w - 26, y: y - 50, width: (w + 20) * ease(seg(lt, 0.1, 0.9)), height: 70 });
  const tx = el(g, 'text', { x: S.x + S.w - 20, y, 'font-size': 26, 'text-anchor': 'end', 'clip-path': 'url(#tclip)' });
  tx.textContent = text;
}

// ---------------------------------------------------------------- the code card
function codeCard({ b, lt, u }) {
  const c = b.code, snip = DATA.code[c.file + ':' + c.from];
  if (!snip) return;
  const box = document.createElement('div');
  box.className = 'code';
  Object.assign(box.style, { left: CODE.x + 'px', top: CODE.y + 'px', width: CODE.w + 'px', height: CODE.h + 'px' });
  const k = ease(seg(lt, 0, 0.35));
  box.style.transform = `translateX(${(1 - k) * -40}px)`;
  box.style.opacity = k;
  const name = c.file.split('/').pop();
  box.innerHTML = `<div class="tab"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="name">${name}</span><span class="lines">${c.file} · lines ${c.from}–${c.to}</span></div>`;
  const pre = document.createElement('pre');
  // which highlight is on now: the ranges take turns over the beat
  const hl = c.hl || [];
  const n = hl.length;
  const active = n ? hl[Math.min(n - 1, Math.floor(clamp((u - 0.05) / 0.9) * n))] : null;
  const html = DATA.html[c.file + ':' + c.from];
  html.forEach((line, j) => {
    const no = c.from + j;
    const on = active && no >= active[0] && no <= active[1];
    const span = document.createElement('span');
    span.className = 'ln' + (on ? ' on' : (active && c.walk ? ' dim' : ''));
    span.innerHTML = `<span class="no">${no}</span>${line || ' '}`;
    pre.appendChild(span);
  });
  box.appendChild(pre);
  stage.appendChild(box);
}

// ---------------------------------------------------------------- Blender
function blenderUI({ b, lt }) {
  const name = b.blender || (b.split && b.split[1].seq && b.split[1].seq.split('/')[1]);
  const half = !!b.blenderSplit;
  const x = half ? S.x + S.w / 2 : S.x, w = half ? S.w / 2 : S.w;
  const out = DATA.outliner[name] || { file: name + '.blend', objects: [] };
  const box = document.createElement('div');
  box.className = 'bl';
  Object.assign(box.style, { left: x + 'px', top: S.y + 'px', width: w + 'px', height: S.h + 'px' });
  const ws = b.scripting ? 'Scripting' : 'Layout';
  box.innerHTML = `<div class="top"><b>${out.file}</b><span>File</span><span>Edit</span><span>Render</span><span>Window</span>`
    + ['Layout', 'Modeling', 'Shading', 'Scripting'].map((n) => `<span class="ws${n === ws ? ' on' : ''}">${n}</span>`).join('') + `</div>`
    + `<div class="tools">${'<i></i>'.repeat(9).replace('<i></i>', '<i class="on"></i>')}</div>`
    + `<div class="vp">User Perspective<br>(${Math.floor(lt * 24) % 999 + 1}) Collection</div>`
    + `<div class="bot"><span>Frame ${Math.floor(lt * 24) + 1}</span><span>|</span><span>${out.count || out.objects.length} objects</span></div>`;
  if (!half || w > 400) {
    const o = document.createElement('div');
    o.className = 'out';
    if (half) o.style.width = '170px';
    const rows = out.objects.filter((r) => r.name !== 'devlog_cam');
    const start = Math.floor(lt * 2.2) % Math.max(1, rows.length);
    let html = '<div class="hd">Scene Collection</div>';
    for (let k = 0; k < 26 && k < rows.length; k++) {
      const r = rows[(start + k) % rows.length];
      html += `<div class="row${k === 3 ? ' sel' : ''}"><span class="ic ${r.type}"></span>${r.name}</div>`;
    }
    o.innerHTML = html;
    box.appendChild(o);
  }
  if (b.scripting && DATA.script) {
    const s = document.createElement('div');
    s.className = 'script';
    const lines = DATA.script.split('\n');
    const shown = Math.floor(seg(lt, 0, b.len * 0.85) * lines.length);
    s.innerHTML = lines.slice(Math.max(0, shown - 30), shown).map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/(#.*)$/, '<span class="cm">$1</span>').replace(/\b(def|import|for|in|if|return|from|as|with|else|elif)\b/g, '<span class="kw">$1</span>')).join('\n') + '▌';
    box.appendChild(s);
  }
  stage.appendChild(box);
}

// ---------------------------------------------------------------- diagrams (white line, drawn on)
function panel(svg, x, y, w, h) {
  el(svg, 'rect', { x, y, width: w, height: h, rx: 10, fill: 'rgba(0,0,0,.78)', stroke: '#fff', 'stroke-width': 2.5, filter: 'url(#wob)' });
}
function box(g, x, y, w, h, text, k = 1, size = 18) {
  if (k <= 0) return;
  const gg = el(g, 'g', { opacity: Math.min(1, k * 2), transform: `translate(${x + w / 2},${y + h / 2}) scale(${0.85 + 0.15 * back(Math.min(1, k))}) translate(${-x - w / 2},${-y - h / 2})` });
  el(gg, 'rect', { x, y, width: w, height: h, rx: 8, class: 'cloth' });
  const lines = String(text).split('\n');
  lines.forEach((l, j) => {
    el(gg, 'text', { x: x + w / 2, y: y + h / 2 + 6 + (j - (lines.length - 1) / 2) * (size + 4), 'font-size': size, 'text-anchor': 'middle' }).textContent = l;
  });
}
function arrow(g, x1, y1, x2, y2, k = 1) {
  if (k <= 0) return;
  const x = lerp(x1, x2, k), y = lerp(y1, y2, k);
  el(g, 'path', { d: `M${x1},${y1} L${x},${y}`, class: 'ink' });
  if (k >= 1) {
    const a = Math.atan2(y2 - y1, x2 - x1), s = 11;
    el(g, 'path', { d: `M${x2 - s * Math.cos(a - 0.45)},${y2 - s * Math.sin(a - 0.45)} L${x2},${y2} L${x2 - s * Math.cos(a + 0.45)},${y2 - s * Math.sin(a + 0.45)}`, class: 'ink' });
  }
}
const DIAGRAMS = {
  scenegraph({ svg, u }) {
    const g = el(svg, 'g', { filter: 'url(#wob)' });
    const x0 = S.x + 120, y0 = S.y + 70;
    const nodes = [['scene', 0, 0], ['player', 0, 1], ['head', 0, 2], ['camera', 0, 3], ['torch', 0, 4], ['hinge pivot', 1, 1], ['door', 1, 2]];
    const at = (c, r) => [x0 + c * 360, y0 + r * 82];
    nodes.forEach(([n, c, r], j) => {
      const [x, y] = at(c, r);
      const k = seg(u, 0.05 + j * 0.1, 0.12 + j * 0.1);
      box(g, x, y, 180, 50, n, k, 22);
    });
    const link = (a, b2, j) => { const [x1, y1] = at(...a), [x2, y2] = at(...b2); arrow(g, x1 + 90, y1 + 52, x2 + (a[0] === b2[0] ? 90 : 20), y2 - 2, seg(u, 0.1 + j * 0.1, 0.18 + j * 0.1)); };
    link([0, 0], [0, 1], 0); link([0, 1], [0, 2], 1); link([0, 2], [0, 3], 2); link([0, 3], [0, 4], 3); link([0, 0], [1, 1], 4); link([1, 1], [1, 2], 5);
    if (u > 0.7) el(g, 'text', { x: x0 + 600, y: y0 + 330, 'font-size': 22, 'text-anchor': 'middle', opacity: seg(u, 0.7, 0.8) }).textContent = 'look → the light comes too';
  },
  ray({ svg, u }) {
    const x = S.x + S.w - 470, y = S.y + 30;
    panel(svg, x, y, 440, 300);
    const g = el(svg, 'g', { filter: 'url(#wob)' });
    el(g, 'rect', { x: x + 290, y: y + 50, width: 26, height: 200, class: 'ink' });
    el(g, 'text', { x: x + 303, y: y + 280, 'font-size': 16, 'text-anchor': 'middle' }).textContent = 'window';
    el(g, 'rect', { x: x + 50, y: y + 120, width: 34, height: 26, class: 'cloth' });
    el(g, 'text', { x: x + 67, y: y + 175, 'font-size': 15, 'text-anchor': 'middle' }).textContent = 'last frame';
    const k = seg(u, 0.15, 0.45);
    el(g, 'path', { d: `M${x + 84},${y + 133} L${x + 84 + 300 * k},${y + 140}`, class: 'ink', 'stroke-dasharray': '8 7' });
    if (u > 0.45) {
      el(g, 'rect', { x: x + 360, y: y + 128, width: 34, height: 26, class: 'cloth', opacity: 0.6 });
      el(g, 'text', { x: x + 377, y: y + 115, 'font-size': 15, 'text-anchor': 'middle' }).textContent = 'this frame';
      for (let a = 0; a < 8; a++) el(g, 'path', { d: `M${x + 303},${y + 136} l${Math.cos(a) * 28},${Math.sin(a) * 28}`, class: 'ink' });
      el(g, 'text', { x: x + 220, y: y + 40, 'font-size': 19, 'text-anchor': 'middle' }).textContent = 'the ray hits: crack!';
    }
  },
  perf({ svg, u }) {
    const x = S.x + 140, y = S.y + 40, w = 800;
    panel(svg, x, y, w, 420);
    const g = el(svg, 'g', { filter: 'url(#wob)' });
    const rows = [['', 'before', 'after'], ['atrium model', '12 MB', '3 MB (Draco)'], ['anti-aliasing', '4× MSAA · 9 ms', 'FXAA · 1 ms'], ['plants', 'full PBR · 5 ms', 'Lambert'], ['lights', '6', '2'], ['bloom', 'always', 'off on slow machines']];
    rows.forEach((r, j) => {
      const k = seg(u, 0.05 + j * 0.13, 0.12 + j * 0.13);
      if (k <= 0) return;
      const yy = y + 70 + j * 62;
      const op = Math.min(1, k * 2);
      el(g, 'text', { x: x + 40, y: yy, 'font-size': j ? 22 : 18, opacity: op }).textContent = r[0];
      el(g, 'text', { x: x + 330, y: yy, 'font-size': j ? 22 : 18, opacity: op }).textContent = r[1];
      el(g, 'text', { x: x + 560, y: yy, 'font-size': j ? 22 : 18, opacity: op }).textContent = r[2];
      if (j) el(g, 'path', { d: `M${x + 325},${yy - 8} L${x + 325 + 190 * ease(seg(u, 0.1 + j * 0.13, 0.2 + j * 0.13))},${yy - 10}`, stroke: '#ff5b5b', 'stroke-width': 3, fill: 'none' });
    });
  },
  drone({ svg, u, t }) {
    const cx = S.x + S.w - 230, cy = S.y + 200, R = 130;
    panel(svg, cx - 200, cy - 175, 400, 360);
    const g = el(svg, 'g', { filter: 'url(#wob)' });
    const st = ['drop', 'circle', 'warn (1 s)', 'dive', 'recover'];
    const on = Math.floor((t * 0.9) % st.length);
    st.forEach((n, j) => {
      const a = -Math.PI / 2 + (j / st.length) * Math.PI * 2;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      box(g, x - 62, y - 20, 124, 40, n, 1, 17);
      if (j === on) el(g, 'rect', { x: x - 66, y: y - 24, width: 132, height: 48, rx: 10, fill: 'none', stroke: j === 2 ? '#ff5b5b' : '#38d6ff', 'stroke-width': 3 });
    });
    el(g, 'text', { x: cx, y: cy + 8, 'font-size': 16, 'text-anchor': 'middle' }).textContent = 'one attacks at a time';
  },
  tentacle({ svg, u: u0 }) {
    // (after the footage has had its moment: from halfway through the line)
    if (u0 < 0.45) return;
    const u = seg(u0, 0.45, 1);
    const x = S.x + CODE_W + 26, y = S.y + 24, w = S.w - CODE_W - 38;
    panel(svg, x, y, w, S.h - 48);
    const g = el(svg, 'g', { filter: 'url(#wob)' });
    const steps = ['16 links: a chain', 'a 17-point curve', 'one row of a\nfloat texture', 'the vertex shader\nbends the arm'];
    steps.forEach((s, j) => {
      const k = seg(u, 0.05 + j * 0.18, 0.15 + j * 0.18);
      box(g, x + 30, y + 24 + j * 100, w - 60, 64, s, k, 17);
      if (j) arrow(g, x + w / 2, y + 24 + j * 100 - 34, x + w / 2, y + 24 + j * 100 - 4, k);
    });
    if (u > 0.8) el(g, 'text', { x: x + w / 2, y: y + S.h - 70, 'font-size': 19, 'text-anchor': 'middle' }).textContent = '= 1 draw call, all arms';
  },
  interior({ svg, u }) {
    const g = el(svg, 'g', { filter: 'url(#wob)' });
    const x = S.x + 180, y = S.y + 260;
    el(g, 'circle', { cx: x, cy: y, r: 16, class: 'ink' });
    el(g, 'circle', { cx: x + 5, cy: y, r: 5, class: 'fill' });
    el(g, 'text', { x, y: y + 46, 'font-size': 18, 'text-anchor': 'middle' }).textContent = 'you';
    el(g, 'line', { x1: x + 260, y1: y - 120, x2: x + 260, y2: y + 120, stroke: '#38d6ff', 'stroke-width': 4 });
    el(g, 'text', { x: x + 260, y: y - 134, 'font-size': 18, 'text-anchor': 'middle' }).textContent = 'the window';
    const k = seg(u, 0.1, 0.5);
    el(g, 'circle', { cx: x + 560, cy: y, r: 170, class: 'ink', 'stroke-dasharray': '10 9', opacity: seg(u, 0.25, 0.4) });
    el(g, 'text', { x: x + 560, y: y - 186, 'font-size': 18, 'text-anchor': 'middle', opacity: seg(u, 0.25, 0.4) }).textContent = 'an invisible round room';
    for (const dy of [-60, 0, 50]) {
      const ex = x + 20 + (690 - 20) * k, ey = y + (dy * 2.4) * k;
      el(g, 'path', { d: `M${x + 20},${y} L${ex},${ey}`, class: 'ink' });
    }
    if (u > 0.55) el(g, 'text', { x: x + 560, y: y + 8, 'font-size': 20, 'text-anchor': 'middle' }).textContent = 'look it up in a 360° photo';
  },
  network({ svg, u, t }) {
    const x0 = S.x + 300, y0 = S.y + 50, d = 95;
    const g = el(svg, 'g', { filter: 'url(#wob)' });
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const x = x0 + c * d, y = y0 + r * d;
      if (c < 4) el(g, 'line', { x1: x, y1: y, x2: x + d, y2: y, stroke: '#555', 'stroke-width': 2 });
      if (r < 4) el(g, 'line', { x1: x, y1: y, x2: x, y2: y + d, stroke: '#555', 'stroke-width': 2 });
    }
    const blue = Math.floor(u * 9), red = Math.floor(u * 7);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const x = x0 + c * d, y = y0 + r * d;
      const db = (4 - r) + c, dr = r + (4 - c);
      const fill = db < blue * 0.7 ? '#2f8cff' : dr < red * 0.7 ? '#ff4b4b' : '#000';
      el(g, 'circle', { cx: x, cy: y, r: 17, fill, stroke: '#fff', 'stroke-width': 2.5 });
    }
    // the sonar ping, and the Warden's sweep
    const p = (t * 0.6) % 1;
    el(g, 'circle', { cx: x0, cy: y0 + 4 * d, r: p * 420, fill: 'none', stroke: 'rgba(56,214,255,' + (1 - p) + ')', 'stroke-width': 3 });
    const sx = x0 - 40 + ((t / 6) % 1) * (4 * d + 80);
    el(g, 'line', { x1: sx, y1: y0 - 30, x2: sx, y2: y0 + 4 * d + 30, stroke: '#ffcf3a', 'stroke-width': 4, opacity: 0.8 });
    el(g, 'text', { x: sx, y: y0 - 40, 'font-size': 16, 'text-anchor': 'middle' }).textContent = 'the Warden';
    el(g, 'text', { x: x0 - 70, y: y0 + 4 * d + 6, 'font-size': 16, 'text-anchor': 'end' }).textContent = 'you';
    el(g, 'text', { x: x0 + 4 * d + 40, y: y0 + 6, 'font-size': 16 }).textContent = 'ARIA';
  }
};

// ---------------------------------------------------------------- whole-frame scenes
function huddle(n = 6, spacing = 120) {
  return ORDER.map((id, j) => ({ id, x: W / 2 + (j - (n - 1) / 2) * spacing, y: 670 }));
}
const SCENES = {
  team(ctx) {
    const { svg, b, t, lt } = ctx;
    titleText(svg, 'Edge Case Runners', W / 2, 150, 46, 1);
    const g = el(svg, 'g', { filter: 'url(#wob)' });
    huddle().forEach(({ id, x, y }) => {
      const me = b.who === id || b.who === 'everyone';
      const p = b.pop === id ? 1 + 0.18 * Math.sin(seg(lt, 0, 0.5) * Math.PI) : 1;
      doodle(g, id, { x, y, s: 0.8 * p, talk: me && talking(ctx), t, wave: b.line?.startsWith('Go play') && id !== 'sivu', label: b.pop === id });
    });
  },
  notepad(ctx) {
    const { svg, u, t } = ctx;
    const g = el(svg, 'g', { filter: 'url(#wob)' });
    const x = 430, y = 70, w = 470, h = 520;
    const tear = seg(u, 0.55, 0.68);
    const p1 = el(g, 'g', { transform: `translate(${tear * 700},${tear * 160}) rotate(${tear * 35},${x + w / 2},${y + h / 2})`, opacity: 1 - tear * 0.8 });
    el(p1, 'rect', { x, y, width: w, height: h, rx: 6, class: 'cloth' });
    for (let k = 0; k < 9; k++) el(p1, 'line', { x1: x + 20, x2: x + w - 20, y1: y + 110 + k * 46, y2: y + 110 + k * 46, stroke: '#333', 'stroke-width': 2 });
    el(p1, 'text', { x: x + 40, y: y + 70, 'font-size': 34 }).textContent = 'VERSION 1';
    const items = ['ARIA = the good guy', 'Voss = innocent', 'twist: ARIA did it!'];
    items.forEach((s, k) => { if (u > 0.06 + k * 0.08) el(p1, 'text', { x: x + 50, y: y + 150 + k * 46, 'font-size': 24 }).textContent = '• ' + s; });
    if (u > 0.36) {
      const k = pop(u * 10, 3.6, 0.4);
      el(p1, 'text', { x: x + w - 90, y: y + 430, 'font-size': 150 * k, 'text-anchor': 'middle', fill: '#ff5b5b' }).textContent = '?';
    }
    if (u > 0.62) {
      const g2 = el(g, 'g', { opacity: seg(u, 0.62, 0.7) });
      el(g2, 'rect', { x, y, width: w, height: h, rx: 6, class: 'cloth' });
      el(g2, 'text', { x: x + 40, y: y + 70, 'font-size': 34 }).textContent = 'VERSION 2';
      const k = pop(u * 10, 7.0, 0.5), cx = x + w / 2, cy = y + 290;
      el(g2, 'path', { d: `M${cx},${cy + 80 * k} C${cx - 140 * k},${cy - 20 * k} ${cx - 80 * k},${cy - 130 * k} ${cx},${cy - 60 * k} C${cx + 80 * k},${cy - 130 * k} ${cx + 140 * k},${cy - 20 * k} ${cx},${cy + 80 * k} Z`, fill: 'none', stroke: '#ff6b8a', 'stroke-width': 5 });
      if (u > 0.78) el(g2, 'text', { x: cx, y: cy + 10, 'font-size': 60, 'text-anchor': 'middle' }).textContent = '?';
      if (u > 0.82) el(g2, 'text', { x: cx, y: y + h - 50, 'font-size': 22, 'text-anchor': 'middle' }).textContent = 'someone worth it';
    }
  },
  locked({ svg, u }) {
    const g = el(svg, 'g', { filter: 'url(#wob)' });
    const cx = W / 2 + 60, cy = 300, k = pop(u * 4, 0.2, 0.5);
    el(g, 'path', { d: `M${cx - 50 * k},${cy - 10} L${cx - 50 * k},${cy - 70 * k} Q${cx - 50 * k},${cy - 130 * k} ${cx},${cy - 130 * k} Q${cx + 50 * k},${cy - 130 * k} ${cx + 50 * k},${cy - 70 * k} L${cx + 50 * k},${cy - 10}`, class: 'ink', 'stroke-width': 8 });
    el(g, 'rect', { x: cx - 85 * k, y: cy - 10, width: 170 * k, height: 130 * k, rx: 14, class: 'cloth' });
    el(g, 'circle', { cx, cy: cy + 45 * k, r: 12 * k, class: 'fill' });
    if (u > 0.3) el(g, 'text', { x: cx, y: cy + 190, 'font-size': 30, 'text-anchor': 'middle' }).textContent = 'no spoilers :)';
  }
};

function titleText(svg, text, x, y, size, k) {
  const id = 'tt' + Math.round(x + y);
  const cp = el(svg.querySelector('defs'), 'clipPath', { id });
  el(cp, 'rect', { x: x - 600, y: y - size * 1.4, width: 1200 * k, height: size * 2 });
  const t = el(svg, 'text', { x, y, 'font-size': size, 'text-anchor': 'middle', 'clip-path': `url(#${id})` });
  t.textContent = text;
  return t;
}

// ---------------------------------------------------------------- the handoff gags
// the last speaker leaving (walking out to the left, or flung), and helpers
function prevHost(ctx) { return ctx.prev && !ctx.prev.handoff && ctx.prev.who && ctx.prev.who !== 'everyone' ? ctx.prev.who : null; }
function walkOff(ctx, from = 0, to = 0.9, dir = -1) {
  const id = prevHost(ctx);
  if (!id) return;
  if (ctx.prev.host === 'vlog') return vlog(ctx.g, HOST.x + dir * 260 * ease(seg(ctx.lt, from, to)), HOST.y - 70, ctx.t, false);
  const k = seg(ctx.lt, from, to);
  if (k >= 1) return;
  doodle(ctx.g, id, { x: HOST.x + dir * 230 * ease(k), y: HOST.y, s: HOST.s, walk: ctx.t * 14 * (k > 0 && k < 1), flip: dir < 0 ? -1 : 1 });
}
function fling(ctx, from, dir = -1) {
  const id = prevHost(ctx);
  if (!id) return;
  const k = seg(ctx.lt, from, from + 0.7);
  if (k >= 1) return;
  if (ctx.prev.host === 'vlog') return vlog(ctx.g, HOST.x + dir * 400 * k, HOST.y - 70 - 200 * k * (1 - k) * 2, ctx.t, false);
  if (ctx.lt < from) return doodle(ctx.g, id, { x: HOST.x, y: HOST.y, s: HOST.s });
  doodle(ctx.g, id, { x: HOST.x + dir * 420 * k, y: HOST.y - 260 * k * (1 - k) * 2, s: HOST.s, rot: dir * 540 * k, shout: true });
}
function enter(ctx, id, from, to, dir = -1, pose = {}) {
  const k = ease(seg(ctx.lt, from, to));
  if (ctx.lt < from) return;
  doodle(ctx.g, id, { x: HOST.x + dir * 260 * (1 - k), y: HOST.y, s: HOST.s, walk: k < 1 ? ctx.t * 14 : 0, flip: dir < 0 ? 1 : -1, ...pose });
}
function bubble(g, x, y, text, k = 1) {
  if (k <= 0) return;
  const w = text.length * 14 + 30;
  el(g, 'path', { d: `M${x},${y} l${w},0 q10,0 10,10 l0,30 q0,10 -10,10 l${-w + 30},0 l-14,16 l2,-16 l-18,0 q-10,0 -10,-10 l0,-30 q0,-10 10,-10 Z`, class: 'cloth' });
  el(g, 'text', { x: x + w / 2 + 5, y: y + 32, 'font-size': 22, 'text-anchor': 'middle' }).textContent = text;
}
function sparks(g, x, y, k, n = 8, r = 30, color = '#fff') {
  for (let a = 0; a < n; a++) {
    const ang = a / n * Math.PI * 2;
    el(g, 'path', { d: `M${x + Math.cos(ang) * r * k * 0.5},${y + Math.sin(ang) * r * k * 0.5} L${x + Math.cos(ang) * r * k},${y + Math.sin(ang) * r * k}`, stroke: color, 'stroke-width': 3, fill: 'none', opacity: 1 - k });
  }
}

const GAGS = {
  intro(ctx) {
    const { svg, g, lt, t } = ctx;
    titleText(svg, 'devlog', W / 2, 120, 40, ease(seg(lt, 0.2, 1.2)));
    titleText(svg, 'Halcyon-9', W / 2, 215, 76, ease(seg(lt, 1.0, 2.4)));
    const spread = 1 - ease(seg(lt, 7.0, 8.0));
    // Sivu is too tall: the picture tilts up for him (everything slides down a little, then back)
    const tilt = Math.sin(seg(lt, 4.7, 5.9) * Math.PI) * 70;
    const gg = el(g, 'g', { transform: `translate(0,${tilt})` });
    ORDER.forEach((id, j) => {
      const k = pop(lt, 2.6 + j * 0.7);
      if (k <= 0) return;
      const x = W / 2 + (j - 2.5) * lerp(92, 180, spread);
      doodle(gg, id, { x, y: 660, s: 0.62 * k, label: spread > 0.5, t });
    });
    if (lt > 7.4) titleText(svg, 'Edge Case Runners', W / 2, 330, 46, ease(seg(lt, 7.4, 8.6)));
  },
  shove(ctx) {
    const { svg, g, lt, t } = ctx;
    titleText(svg, 'Edge Case Runners', W / 2, 150, 46, 1 - seg(lt, 0, 0.6));
    const pos = huddle();
    // Naomi pushes along the line; each one she reaches flies off to the right (Sivu takes two)
    const nx = lerp(pos[0].x, pos[5].x + 40, ease(seg(lt, 0.3, 3.4)));
    pos.slice(1).forEach(({ id, x, y }) => {
      let hit = (nx + 36 - x) / 40;
      if (id === 'sivu') hit = lt < 2.4 ? Math.min(hit, 0.15) : (nx + 36 - x - 20) / 40;
      if (hit <= 0) return doodle(g, id, { x, y, s: 0.62 });
      const k = clamp((lt - (hit > 0 ? 0 : 1)) * 0 + hit * 0.25);
      const fly = clamp(hit / 3);
      doodle(g, id, { x: x + fly * 900, y: y - Math.sin(fly * Math.PI) * 140, s: 0.62, rot: fly * 400, shout: fly > 0.05 });
      void k;
    });
    if (lt > 2.0 && lt < 2.9) bubble(g, pos[3].x - 20, pos[3].y - 270, '?', 1);
    if (lt > 3.7 && lt < 4.8) bubble(g, W - 190, 470, 'hey!', ease(seg(lt, 3.7, 3.9)));
    // then she walks back to the left edge and pulls the screen in
    let x = nx, flip = 1;
    if (lt > 3.4) { x = lerp(pos[5].x + 40, 30, ease(seg(lt, 3.6, 4.6))); flip = -1; }
    const pull = ease(seg(lt, 4.8, 6.3));
    if (lt > 4.7) {
      el(svg, 'rect', { x: S.x - 4 - (1 - pull) * 1150, y: S.y - 4, width: S.w + 8, height: S.h + 8, rx: 6, fill: '#000', stroke: '#fff', 'stroke-width': 3, filter: 'url(#wob)' });
      x = lerp(30, HOST.x, pull);
      flip = 1;
    }
    doodle(g, 'naomi', { x, y: lt > 4.7 ? lerp(640, HOST.y, pull) : 640, s: lerp(0.62, HOST.s, pull), push: lt < 3.4 || (lt > 4.7 && lt < 6.3), walk: (lt > 3.6 && lt < 4.6) || (lt > 4.8 && lt < 6.3) ? t * 14 : 0, flip });
  },
  'jonaphan-climb'(ctx) {
    walkOff(ctx, 0, 0.9);
    const k = ease(seg(ctx.lt, 1.0, 2.6));
    el(ctx.g, 'line', { x1: 20, y1: H - 4, x2: 180, y2: H - 4, class: 'ink' });
    doodle(ctx.g, 'jonaphan', { x: HOST.x, y: HOST.y + 190 * (1 - k), s: HOST.s, armUp: k < 1 ? 'R' : null, shout: k > 0 && k < 1, t: ctx.t });
    if (ctx.lt > 2.6) el(ctx.g, 'text', { x: HOST.x + 64, y: HOST.y - 150, 'font-size': 20 }).textContent = 'phew';
  },
  'simphiwe-hatch'(ctx) {
    const { g, lt, svg } = ctx;
    fling(ctx, 1.4, -1);
    const open = ease(seg(lt, 0.2, 0.8)) * (1 - seg(lt, 3.2, 3.8));
    el(g, 'ellipse', { cx: HOST.x + 10, cy: HOST.y + 4, rx: 60 * open, ry: 14 * open, class: 'cloth' });
    const k = ease(seg(lt, 0.7, 1.6));
    if (lt > 0.7) {
      const sg = el(g, 'g', {});
      doodle(sg, 'simphiwe', { x: HOST.x + 10, y: HOST.y + 160 * (1 - k), s: HOST.s, armUp: 'R' });
      // the paint roller, up in his hand, then rolled across the screen
      const roll = ease(seg(lt, 1.8, 3.6));
      const rx = lerp(HOST.x + 40, S.x + S.w - 20, roll), ry = lerp(HOST.y + 160 * (1 - k) - 205, S.y + 60, Math.sin(roll * Math.PI) * 0.4 + roll * 0.6);
      el(g, 'rect', { x: rx - 30, y: ry - 12, width: 60, height: 22, rx: 6, fill: '#ffcf3a', stroke: '#fff', 'stroke-width': 3 });
      el(g, 'path', { d: `M${rx},${ry + 10} l0,22`, class: 'ink' });
      // the screen stays dim ahead of the roller: lit where it has rolled
      const dim = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const from = Math.max(S.x, rx);
      for (const [k, v] of Object.entries({ x: from, y: S.y, width: Math.max(0, S.x + S.w - from), height: S.h, fill: 'rgba(0,0,0,.58)' })) dim.setAttribute(k, v);
      svg.insertBefore(dim, g);
    }
  },
  'thabiso-reach'(ctx) {
    const { g, lt, t } = ctx;
    const reach = ease(seg(lt, 0.2, 1.2)), pull = ease(seg(lt, 1.6, 2.4));
    // the arm: shoulder off-screen left, elbow bending, hand on Simphiwe's roller
    const sx = -30, sy = 560, hx = lerp(-20, HOST.x + 30, reach) - pull * 300, hy = lerp(560, HOST.y - 190, reach);
    const ex = (sx + hx) / 2 + 10, ey = Math.max(sy, hy) + 50;
    el(g, 'path', { d: `M${sx},${sy} L${ex},${ey} L${hx},${hy}`, class: 'ink', 'stroke-width': 5 });
    el(g, 'circle', { cx: hx, cy: hy, r: 7, class: 'fill' });
    if (lt < 1.6) doodle(g, 'simphiwe', { x: HOST.x, y: HOST.y, s: HOST.s, armUp: 'R', shout: lt > 1.0 });
    else if (pull < 1) doodle(g, 'simphiwe', { x: HOST.x - pull * 300, y: HOST.y, s: HOST.s, rot: -30 * pull, shout: true });
    if (lt > 2.4) enter(ctx, 'thabiso', 2.4, 3.4, -1, { t });
  },
  'naomi-torch'(ctx) {
    const { g, lt, t, svg } = ctx;
    if (lt < 1.4) doodle(g, 'thabiso', { x: HOST.x - 200 * ease(seg(lt, 0.9, 1.4)), y: HOST.y, s: HOST.s, squint: lt > 0.4 });
    enter(ctx, 'naomi', 1.1, 2.3, -1, { push: true, t });
    // the torch beam, from her hand into the screen, sweeping
    if (lt > 1.1) {
      const a = -0.3 + Math.sin(t * 1.8) * 0.25;
      const hx = HOST.x + 30, hy = HOST.y - 150;
      const L = 900, wdt = 0.18;
      el(svg, 'path', { d: `M${hx},${hy} L${hx + Math.cos(a - wdt) * L},${hy + Math.sin(a - wdt) * L} L${hx + Math.cos(a + wdt) * L},${hy + Math.sin(a + wdt) * L} Z`, fill: 'rgba(255,240,180,.22)' });
    }
  },
  'tariro-rings'(ctx) {
    const { g, lt, t } = ctx;
    fling(ctx, 0.5, -1);
    const cx = HOST.x + 10, cy = HOST.y - 110;
    [70, 52, 34].forEach((r, j) => {
      const stopAt = 1.6 + j * 0.4;
      const ang = lt < stopAt ? t * (220 + j * 90) : stopAt * (220 + j * 90);
      const fade = 1 - seg(lt, 3.0, 3.5);
      const rg = el(g, 'g', { transform: `rotate(${ang % 360},${cx},${cy})`, opacity: fade });
      el(rg, 'circle', { cx, cy, r, class: 'ink' });
      el(rg, 'rect', { x: cx + r - 6, y: cy - 4, width: 12, height: 8, class: 'fill' });
      if (lt > stopAt && lt < stopAt + 0.3) sparks(g, cx + r, cy, seg(lt, stopAt, stopAt + 0.3), 6, 26, '#38d6ff');
    });
    if (lt > 2.5) doodle(g, 'tariro', { x: HOST.x, y: HOST.y, s: HOST.s * pop(lt, 2.5) });
    if (lt > 2.6 && lt < 3.6) el(g, 'text', { x: cx + 70, y: cy - 90, 'font-size': 18 }).textContent = 'in the zone';
  },
  'sivu-legs'(ctx) {
    const { g, lt, t } = ctx;
    walkOff(ctx, 0, 0.8, -1);
    // huge at first (only his legs fit), then the picture "tilts up" (zooms out) to find his head
    const zoom = ease(seg(lt, 1.6, 3.0));
    const s = lerp(2.3, HOST.s, zoom);
    const x = lerp(-60, HOST.x + 10, ease(seg(lt, 0.4, 1.6)));
    doodle(g, 'sivu', { x, y: HOST.y + 10 * (1 - zoom), s, walk: lt < 1.6 ? t * 12 : 0, t });
    if (lt > 3.0) {
      const kx = HOST.x + 78, ky = HOST.y - 210, k = pop(lt, 3.0);
      el(g, 'rect', { x: kx, y: ky, width: 64 * k, height: 84 * k, rx: 6, class: 'cloth' });
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) el(g, 'rect', { x: kx + 8 + c * 18, y: ky + 26 + r * 18, width: 12 * k, height: 12 * k, class: 'ink', 'stroke-width': 1.5 });
      if (lt > 3.5) el(g, 'text', { x: kx + 32, y: ky - 10, 'font-size': 18, 'text-anchor': 'middle', fill: '#4dff8a' }).textContent = 'ACCESS GRANTED';
    }
  },
  'naomi-freeze-sivu'(ctx) {
    const { g, lt, t } = ctx;
    const tip = ease(seg(lt, 1.9, 2.6)), slide = ease(seg(lt, 2.6, 3.6));
    const sx = HOST.x + slide * 600;
    if (slide < 1) {
      const sg = el(g, 'g', { transform: `rotate(${tip * 90},${sx},${HOST.y})` });
      doodle(sg, 'sivu', { x: sx, y: HOST.y, s: HOST.s, talk: lt < 1.2, t });
      if (lt > 1.4) el(sg, 'rect', { x: sx - 60, y: HOST.y - 210, width: 120, height: 214, rx: 10, fill: 'rgba(180,230,255,.35)', stroke: '#bfefff', 'stroke-width': 3 });
    }
    // Naomi, in from the left with the hose
    const k = ease(seg(lt, 0.2, 1.0));
    const nx = lerp(-80, 30, k);
    doodle(g, 'naomi', { x: nx, y: HOST.y, s: HOST.s, push: true, walk: k < 1 ? t * 14 : 0 });
    if (lt > 1.0 && lt < 2.0) for (let j = 0; j < 14; j++) {
      const p = ((t * 2 + j / 14) % 1);
      el(g, 'circle', { cx: nx + 50 + p * (HOST.x - nx), cy: HOST.y - 150 + Math.sin(j * 3) * 20 * p, r: 3, fill: '#bfefff' });
    }
    if (lt > 3.4) doodle(g, 'naomi', { x: lerp(30, HOST.x, ease(seg(lt, 3.4, 4.0))), y: HOST.y, s: 0.001 });
  },
  'simphiwe-drone'(ctx) {
    const { g, lt, t } = ctx;
    walkOff(ctx, 0, 0.8);
    const k = ease(seg(lt, 0.4, 2.0));
    const x = lerp(W + 100, HOST.x + 10, k), y = lerp(80, HOST.y - 30, k) + Math.sin(t * 6) * 4;
    drone(g, x, y, t);
    doodle(g, 'simphiwe', { x, y: y - 14, s: HOST.s, wave: lt > 2.0, t });
  },
  'naomi-swat'(ctx) {
    const { g, lt, t } = ctx;
    const hit = 1.2, fall = ease(seg(lt, hit + 0.2, hit + 1.0));
    const y = HOST.y - 30 + Math.sin(t * 6) * 4;
    if (lt < hit + 1.0) drone(g, HOST.x + 10 + fall * 30, y + fall * 260, t, lt > hit ? '#bfefff' : null);
    if (lt > hit + 1.0 && lt < hit + 1.6) sparks(g, HOST.x + 30, HOST.y - 10, seg(lt, hit + 1.0, hit + 1.6), 10, 60, '#bfefff');
    const hang = lt < hit + 0.7 ? 0 : ease(seg(lt, hit + 0.7, hit + 1.3));
    if (hang < 1) doodle(g, 'simphiwe', { x: HOST.x + 10, y: y - 14 + hang * 400, s: HOST.s, shout: lt > hit });
    if (lt > hit + 0.2 && lt < hit + 0.7) bubble(g, HOST.x + 40, HOST.y - 330, '...', 1);
    enter(ctx, 'naomi', 0.2, 1.1, -1, { push: lt > 0.9 && lt < 1.5, t });
  },
  'jonaphan-vlog'(ctx) {
    const { g, lt, t } = ctx;
    walkOff(ctx, 0, 0.8);
    const k = ease(seg(lt, 0.6, 1.6));
    vlog(g, HOST.x, HOST.y - 70 + (1 - k) * 260, t, lt > 1.8);
  },
  'tariro-arm'(ctx) {
    const { g, lt, t } = ctx;
    // the robot arm swinging down through the corner, knocking the screen away
    const frozen = lt > 2.7;
    const ang = frozen ? 40 : -60 + ((lt * 140) % 160);
    const px = HOST.x + 120, py = HOST.y - 380;
    const a = ang * Math.PI / 180;
    const ex = px + Math.cos(a + 1.2) * 150, ey = py + Math.sin(a + 1.2) * 150;
    const hx = ex + Math.cos(a + 1.9) * 120, hy = ey + Math.sin(a + 1.9) * 120;
    const col = frozen ? '#777' : '#fff';
    el(g, 'path', { d: `M${px},${py - 60} L${px},${py} L${ex},${ey} L${hx},${hy}`, fill: 'none', stroke: col, 'stroke-width': 9, 'stroke-linecap': 'round' });
    el(g, 'path', { d: `M${hx},${hy} l-14,18 M${hx},${hy} l14,18`, fill: 'none', stroke: col, 'stroke-width': 5 });
    if (prevHost(ctx) === 'jonaphan') {
      const k = seg(lt, 0.5, 1.2);
      if (k < 1) vlog(g, HOST.x - 400 * k, HOST.y - 70 - 220 * k * (1 - k) * 2, t, false);
    }
    if (lt > 1.2) {
      const duck = lt > 1.6 && lt < 2.4 ? 0.82 : 1;
      const tg = el(g, 'g', { transform: `translate(0,${HOST.y}) scale(1,${duck}) translate(0,${-HOST.y})` });
      enter({ ...ctx, g: tg }, 'tariro', 1.2, 1.8, -1, { t });
      // the fusebox, flipped
      const fx = HOST.x + 70, fy = HOST.y - 150;
      el(g, 'rect', { x: fx, y: fy, width: 40, height: 56, rx: 4, class: 'cloth' });
      el(g, 'path', { d: lt > 2.6 ? `M${fx + 20},${fy + 28} l12,-16` : `M${fx + 20},${fy + 28} l12,16`, class: 'ink', 'stroke-width': 5 });
      if (lt > 2.6 && lt < 3.0) sparks(g, fx + 20, fy + 28, seg(lt, 2.6, 3.0), 8, 30, '#ffcf3a');
    }
  },
  'naomi-hatch'(ctx) {
    const { g, lt } = ctx;
    const open = ease(seg(lt, 0.2, 0.7));
    el(g, 'ellipse', { cx: HOST.x + 10, cy: HOST.y + 4, rx: 64 * open, ry: 16 * open, class: 'cloth' });
    const drop = ease(seg(lt, 0.7, 1.1));
    if (drop < 1) doodle(g, 'tariro', { x: HOST.x + 10, y: HOST.y + drop * 300, s: HOST.s, shout: lt > 0.5, armUp: 'R' });
    const up = ease(seg(lt, 1.6, 2.6));
    if (lt > 1.6) doodle(g, 'naomi', { x: HOST.x + 10, y: HOST.y + 200 * (1 - up), s: HOST.s, armUp: up < 1 ? 'R' : null });
  },
  'simphiwe-ping'(ctx) {
    const { g, lt, svg } = ctx;
    walkOff(ctx, 0, 0.8);
    const p = seg(lt, 0.5, 2.2);
    el(svg, 'circle', { cx: S.x + S.w / 2, cy: S.y + S.h / 2, r: p * 1100, fill: 'none', stroke: `rgba(56,214,255,${1 - p})`, 'stroke-width': 5 });
    if (lt > 1.4) {
      const k = pop(lt, 1.4, 0.4);
      el(g, 'circle', { cx: HOST.x + 10, cy: HOST.y - 100, r: 112 * k, fill: 'rgba(47,140,255,.35)', stroke: '#2f8cff', 'stroke-width': 4 });
      doodle(g, 'simphiwe', { x: HOST.x + 10, y: HOST.y, s: HOST.s * k });
    }
  },
  'sivu-valves'(ctx) {
    const { g, lt, t } = ctx;
    walkOff(ctx, 0, 0.8);
    [0, 1, 2].forEach((j) => {
      const cx = 30 + j * 56, cy = HOST.y - 250, rot = lt < 1.0 + j * 0.3 ? 0 : (lt - 1.0 - j * 0.3) * 300;
      const vg = el(g, 'g', { transform: `rotate(${Math.min(rot, 360)},${cx},${cy})`, opacity: 1 - seg(lt, 2.6, 3.2) });
      el(vg, 'circle', { cx, cy, r: 20, class: 'ink' });
      el(vg, 'path', { d: `M${cx - 20},${cy} L${cx + 20},${cy} M${cx},${cy - 20} L${cx},${cy + 20}`, class: 'ink' });
    });
    // the door slides up; he's behind it, ducking a little
    const open = ease(seg(lt, 1.9, 2.8));
    doodle(g, 'sivu', { x: HOST.x + 8, y: HOST.y, s: HOST.s, rot: -6 });
    el(g, 'rect', { x: HOST.x - 80, y: HOST.y - 230 - open * 260, width: 170, height: 234, class: 'cloth' });
    el(g, 'path', { d: `M${HOST.x - 80},${HOST.y - 230} L${HOST.x + 90},${HOST.y - 230}`, class: 'ink' });
  },
  'naomi-fps'(ctx) {
    const { g, lt, svg } = ctx;
    const fps = lt < 1.2 ? 60 : lt < 2.4 ? Math.round(lerp(60, 41, seg(lt, 1.2, 2.0))) : Math.round(lerp(41, 60, seg(lt, 2.6, 3.4)));
    const grow = fps / 60;
    titleText(svg, `${fps} fps`, 420, 300, 120 * (0.6 + 0.4 * grow), 1).setAttribute('fill', fps < 50 ? '#ff5b5b' : '#4dff8a');
    el(svg, 'text', { x: 420, y: 360, 'font-size': 22, 'text-anchor': 'middle' }).textContent = fps < 50 ? 'too slow: one quality step down' : 'room to spare: step back up';
    doodle(g, 'naomi', { x: 420, y: 640, s: 0.6 * pop(lt, 0.2) * (0.75 + 0.25 * grow) });
    if (lt > 3.6) doodle(g, 'naomi', { x: HOST.x, y: HOST.y, s: 0.0001 });
  },
  'jonaphan-walk'(ctx) {
    const { g, lt, t } = ctx;
    walkOff(ctx, 0, 0.8);
    const k = seg(lt, 0.6, 2.8);
    const x = lerp(-80, HOST.x, k);
    const bob = k < 1 ? Math.abs(Math.sin(t * 5)) * 8 : 0;
    const bow = lt > 3.0 ? Math.sin(seg(lt, 3.0, 3.8) * Math.PI) * 25 : 0;
    const jg = el(g, 'g', { transform: `rotate(${bow},${x},${HOST.y})` });
    doodle(jg, 'jonaphan', { x, y: HOST.y + bob, s: HOST.s, walk: k < 1 ? t * 7 : 0, rot: k < 1 ? 4 : 0 });
  },
  'naomi-blind'(ctx) {
    const { g, lt, svg } = ctx;
    const down = ease(seg(lt, 0.1, 0.9));
    el(svg, 'rect', { x: CODE.x, y: CODE.y, width: CODE.w, height: CODE.h * down, rx: 10, fill: '#0d1117', stroke: '#fff', 'stroke-width': 2 });
    const hitK = seg(lt, 0.7, 1.4);
    if (hitK < 1) doodle(g, 'jonaphan', { x: HOST.x - hitK * 300, y: HOST.y + hitK * 120, s: HOST.s, rot: -90 * hitK, shout: hitK > 0 });
    if (lt > 1.4) doodle(g, 'naomi', { x: HOST.x, y: HOST.y, s: HOST.s * pop(lt, 1.4) });
  },
  'pile-in'(ctx) {
    const { g, lt } = ctx;
    const pos = huddle();
    pos.forEach(({ id, x, y }, j) => {
      const from = id === 'sivu' ? 2.4 : 0.2 + j * 0.25;
      const k = ease(seg(lt, from, from + 0.7));
      if (lt < from) return;
      const sx = [-200, W + 200, x, -200, W + 200, x][j], sy = [y, y, -300, y - 300, y - 300, H + 300][j];
      doodle(g, id, { x: lerp(sx, x, k), y: lerp(sy, y, k), s: 0.62, rot: (1 - k) * 200 * (j % 2 ? 1 : -1), shout: k < 1 });
    });
    if (lt > 3.0) titleText(ctx.svg, 'Edge Case Runners', W / 2, 150, 46, ease(seg(lt, 3.0, 3.9)));
  },
  'end-card'(ctx) {
    const { g, lt, svg, t } = ctx;
    const fade = 1 - seg(lt, 4.0, 5.0);
    const gg = el(svg, 'g', { opacity: fade });
    titleText(gg, 'Halcyon-9', W / 2, 250, 84, ease(seg(lt, 0.1, 1.2)));
    titleText(gg, 'by Edge Case Runners', W / 2, 330, 34, ease(seg(lt, 0.9, 2.0)));
    const dg = el(g, 'g', { opacity: fade });
    ORDER.forEach((id, j) => doodle(dg, id, { x: W / 2 + (j - 2.5) * 80, y: 600, s: 0.42 * pop(lt, 1.6 + j * 0.15), wave: true, t: t + j }));
  }
};

function drone(g, x, y, t, color) {
  const c = color || '#fff';
  el(g, 'ellipse', { cx: x, cy: y, rx: 46, ry: 14, fill: '#000', stroke: c, 'stroke-width': 3 });
  for (const s of [-1, 1]) {
    el(g, 'path', { d: `M${x + s * 30},${y - 8} l0,-12`, stroke: c, 'stroke-width': 3, fill: 'none' });
    const w = 26 * Math.abs(Math.cos(t * 30 + s));
    el(g, 'path', { d: `M${x + s * 30 - w},${y - 21} L${x + s * 30 + w},${y - 21}`, stroke: c, 'stroke-width': 3, fill: 'none' });
  }
  el(g, 'circle', { cx: x, cy: y + 2, r: 5, fill: color ? '#bfefff' : '#ff4b4b' });
}
