import * as THREE from 'three';
import { SURFACE } from './level1Look.js';

// The monitor room off the control room (the raised platform behind ARIA's wall), dressed as
// a sci-fi operations wall in the habitat colours: a glossy black media wall with light blue
// LED seams, glowing light columns at each end, a strip of status screens and buttons above
// the desk, an LED edge on the desk and a light frame in the ceiling. Every monitor shows a
// live readout drawn into a canvas.
//
// With the power out the screens are dark (the big one blinks POWER FAILURE) and the LEDs
// barely glow. When the power comes back the screens boot one after another.
//
// Positions are measured from controlroom.glb: the wall's face is at x = -0.42 (the room is on
// the -x side), the desk top at y = 1.91, the platform at y = 0.84, the ceiling at y = 6.53.

const WALL_X = -0.42;
const Z0 = -8.98, Z1 = -3.18;           // the wall's extent along z
const DESK_Y = 1.91;
const CEIL_Y = 6.53;

const BG = '#04121b', GRID = '#0f2a38', BLUE = '#64c8ff', WHITE = '#e6f4ff', ORANGE = '#ff9a2e', DIM = '#2a5a72', RED = '#ff4a3a';

// Which monitor shows what (by the screen mesh GLTFLoader names; *_2 is the glass)
const SCREENS = [
  { name: 'Plane007_2', kind: 'overview' },
  { name: 'Plane006_2', kind: 'sonar' },
  { name: 'Plane005_2', kind: 'power' },
  { name: 'Plane001_2', kind: 'crew' },
  { name: 'Plane003_2', kind: 'comms' },
  { name: 'Plane002_2', kind: 'depth' }
];

export class MonitorWall {
  constructor(level) {
    this.level = level;
    this.scene = level.scene;
    this.group = new THREE.Group();
    this.group.name = 'MonitorWall';
    this.disposables = [];
    this.leds = [];              // { mat, base: Color, flicker }
    this.screens = [];
    this.time = 0;
    this.power = 0;
    this._onAt = null;           // level time the power came back
    this._next = 0;              // round-robin redraw

    this._buildWall();
    this._buildScreens(level.room);
    this.scene.add(this.group);
  }

  _box(mat, lo, hi) {
    const geo = new THREE.BoxGeometry(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    this.disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    this.group.add(m);
    return m;
  }

  _led(hex, flicker = 0) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    this.disposables.push(mat);
    this.leds.push({ mat, base: new THREE.Color(hex), flicker });
    return mat;
  }

  _buildWall() {
    const L = this.level;
    const black = L._makeLevelMaterial({}, -1, SURFACE.glossBlack);
    const soft = L._makeLevelMaterial({}, -1, SURFACE.softBlack);
    const navy = L._makeLevelMaterial({}, -1, SURFACE.navy);
    const seam = this._led(0x64c8ff);
    const column = this._led(0xcfeeff, 1);
    const ceiling = this._led(0xeaf6ff);
    const x = WALL_X;

    // the media wall, from the desk to just under the top monitors' tops
    this._box(black, [x - 0.02, DESK_Y + 0.01, Z0], [x, 5.98, Z1]);
    // navy panels framing each column of monitors
    for (const [z0, z1] of [[-4.98, -3.28], [-7.08, -5.12], [-8.9, -7.22]]) {
      this._box(navy, [x - 0.03, 2.3, z0], [x - 0.02, 5.75, z1]);
    }
    // LED seams: the border, between the columns and between the rows
    const t = 0.022;
    this._box(seam, [x - 0.035, 5.98 - t, Z0], [x - 0.02, 5.98, Z1]);
    this._box(seam, [x - 0.035, DESK_Y + 0.4, Z0], [x - 0.02, DESK_Y + 0.4 + t, Z1]);
    this._box(seam, [x - 0.035, 3.28, Z0], [x - 0.02, 3.28 + t, Z1]);
    for (const z of [-5.05, -7.15]) this._box(seam, [x - 0.035, DESK_Y + 0.4, z - t / 2], [x - 0.02, 5.98, z + t / 2]);

    // light columns at both ends: a black housing with a glowing bar
    for (const z of [Z1 - 0.05, Z0 + 0.05]) {
      this._box(soft, [x - 0.07, 0.86, z - 0.07], [x, CEIL_Y - 0.02, z + 0.07]);
      this._box(column, [x - 0.075, 0.95, z - 0.025], [x - 0.07, CEIL_Y - 0.1, z + 0.025]);
    }

    // status strip above the desk: small screens with button clusters either side
    const buttons = [];
    for (const zc of [-4.05, -6.08, -8.06]) {
      this.smallSpots = this.smallSpots || [];
      this.smallSpots.push(zc);
      for (const side of [-1, 1]) {
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 4; c++) {
            buttons.push(new THREE.Vector3(x - 0.035, DESK_Y + 0.13 + r * 0.075, zc + side * (0.3 + c * 0.07)));
          }
        }
      }
    }
    const btnGeo = new THREE.BoxGeometry(0.02, 0.045, 0.045);
    const btnMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.disposables.push(btnGeo, btnMat);
    this.buttons = new THREE.InstancedMesh(btnGeo, btnMat, buttons.length);
    const palette = [0x64c8ff, 0x64c8ff, 0xff9a2e, 0xe6f4ff, 0x1d4a66];
    this.buttonBase = buttons.map((p, i) => {
      this.buttons.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
      return new THREE.Color(palette[(i * 7 + (i >> 2)) % palette.length]);
    });
    this.buttonPhase = buttons.map((_, i) => (i * 1.37) % 5);
    this.group.add(this.buttons);

    // the desk's front edge and the ceiling light frame
    this._box(this._led(0x64c8ff), [-2.285, 1.765, Z0 + 0.02], [-2.262, 1.79, Z1 - 0.02]);
    const cy = CEIL_Y - 0.03, w = 0.09;
    const fx0 = -2.4, fx1 = -0.75, fz0 = -8.7, fz1 = -3.5;
    this._box(soft, [fx0 - 0.06, cy - 0.005, fz0 - 0.06], [fx1 + 0.06, CEIL_Y, fz1 + 0.06]);
    this._box(ceiling, [fx0, cy - 0.02, fz0], [fx1, cy - 0.005, fz0 + w]);
    this._box(ceiling, [fx0, cy - 0.02, fz1 - w], [fx1, cy - 0.005, fz1]);
    this._box(ceiling, [fx0, cy - 0.02, fz0], [fx0 + w, cy - 0.005, fz1]);
    this._box(ceiling, [fx1 - w, cy - 0.02, fz0], [fx1, cy - 0.005, fz1]);
    this._box(ceiling, [(fx0 + fx1) / 2 - w / 2, cy - 0.02, fz0], [(fx0 + fx1) / 2 + w / 2, cy - 0.005, fz1]);
  }

  // A canvas screen laid over a monitor's glass (or free-standing, for the small ones)
  _addScreen(kind, centre, normal, width, height, px) {
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = Math.round(px * height / width);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    this.disposables.push(tex, geo, mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(centre).addScaledVector(normal, 0.004);
    mesh.lookAt(mesh.position.clone().add(normal));
    this.group.add(mesh);
    const s = { kind, ctx: canvas.getContext('2d'), w: canvas.width, h: canvas.height, tex, index: this.screens.length, data: [] };
    this.screens.push(s);
    this._draw(s);
  }

  _buildScreens(room) {
    const found = new Map();
    room.traverse((o) => { if (o.isMesh) found.set(o.name.replace(/\./g, ''), o); });
    for (const { name, kind } of SCREENS) {
      const glass = found.get(name);
      if (!glass) continue;
      glass.visible = false;   // the canvas takes its place
      const box = new THREE.Box3().setFromObject(glass);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      // the glass faces away from its bezel (mesh *_1)
      const bezel = found.get(name.replace(/_2$/, '_1'));
      const bc = bezel ? new THREE.Box3().setFromObject(bezel).getCenter(new THREE.Vector3()) : centre.clone().add(new THREE.Vector3(1, 0, 0));
      const thin = size.x < size.z ? 'x' : 'z';
      const normal = new THREE.Vector3();
      normal[thin] = Math.sign(centre[thin] - bc[thin]) || -1;
      const width = (thin === 'x' ? size.z : size.x) * 0.97;
      centre.addScaledVector(normal, size[thin] / 2);   // onto the front of the glass
      this._addScreen(kind, centre, normal, width, size.y * 0.95, kind === 'overview' ? 640 : 512);
    }
    // extra screens in the gaps, each in a slim black bezel, so the wall reads as one console
    const bezel = this.level._makeLevelMaterial({}, -1, SURFACE.softBlack);
    const extra = [
      ['banner', -6.06, 5.35, 1.7, 0.42, 640],
      ['generator', -6.06, 2.8, 1.5, 0.72, 448],
      ['hex', -4.12, 3.9, 1.15, 0.78, 384],
      ['environment', -8.03, 3.9, 1.15, 0.78, 384]
    ];
    for (const [kind, zc, yc, w, h, px] of extra) {
      this._box(bezel, [WALL_X - 0.06, yc - h / 2 - 0.035, zc - w / 2 - 0.035], [WALL_X - 0.03, yc + h / 2 + 0.035, zc + w / 2 + 0.035]);
      this._addScreen(kind, new THREE.Vector3(WALL_X - 0.06, yc, zc), new THREE.Vector3(-1, 0, 0), w, h, px);
    }
    for (const [i, zc] of (this.smallSpots || []).entries()) {
      this._addScreen(['status', 'ring', 'log'][i], new THREE.Vector3(WALL_X - 0.025, DESK_Y + 0.17, zc),
        new THREE.Vector3(-1, 0, 0), 0.4, 0.2, 256);
    }
  }

  // ---- drawing -----------------------------------------------------------------------------

  _frame(g, s, title) {
    g.fillStyle = BG;
    g.fillRect(0, 0, s.w, s.h);
    g.strokeStyle = GRID;
    g.lineWidth = 1;
    const step = Math.round(s.w / 16);
    for (let x = step; x < s.w; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s.h); g.stroke(); }
    for (let y = step; y < s.h; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(s.w, y); g.stroke(); }
    if (title) {
      g.fillStyle = BLUE;
      g.font = `bold ${Math.round(s.h * 0.065)}px monospace`;
      g.fillText(title, s.w * 0.03, s.h * 0.1);
      g.fillStyle = ORANGE;
      g.fillRect(s.w * 0.86, s.h * 0.045, s.w * 0.11, s.h * 0.06);
      g.fillStyle = BG;
      g.font = `bold ${Math.round(s.h * 0.04)}px monospace`;
      g.fillText('LIVE', s.w * 0.885, s.h * 0.092);
    }
    // corner brackets
    g.strokeStyle = BLUE;
    g.lineWidth = 2;
    const c = s.w * 0.04;
    for (const [x, y, dx, dy] of [[2, 2, 1, 1], [s.w - 2, 2, -1, 1], [2, s.h - 2, 1, -1], [s.w - 2, s.h - 2, -1, -1]]) {
      g.beginPath(); g.moveTo(x + dx * c, y); g.lineTo(x, y); g.lineTo(x, y + dy * c); g.stroke();
    }
  }

  _text(g, s, str, x, y, size, colour = WHITE, bold = false) {
    g.fillStyle = colour;
    g.font = `${bold ? 'bold ' : ''}${Math.round(s.h * size)}px monospace`;
    g.fillText(str, s.w * x, s.h * y);
  }

  _draw(s) {
    const g = s.ctx, t = this.time;
    const sinceOn = this._onAt === null ? -1 : this.level.time - this._onAt;
    const bootAt = s.index * 0.45;

    // no power: dark glass (the big screen blinks a warning)
    if (sinceOn < bootAt) {
      g.fillStyle = '#010203';
      g.fillRect(0, 0, s.w, s.h);
      if (s.kind === 'overview' && Math.floor(t * 1.5) % 2 === 0) {
        this._text(g, s, 'MAIN POWER FAILURE', 0.2, 0.5, 0.08, RED, true);
        this._text(g, s, 'RESTORE GENERATOR OUTPUT', 0.22, 0.6, 0.045, '#a03028');
      }
      s.tex.needsUpdate = true;
      return;
    }
    // booting
    if (sinceOn < bootAt + 1.2) {
      const k = (sinceOn - bootAt) / 1.2;
      this._frame(g, s, null);
      this._text(g, s, 'HALCYON-9 OS', 0.08, 0.4, 0.09, BLUE, true);
      this._text(g, s, 'INITIALISING' + '.'.repeat(1 + Math.floor(t * 4) % 3), 0.08, 0.55, 0.06, WHITE);
      g.strokeStyle = BLUE; g.strokeRect(s.w * 0.08, s.h * 0.66, s.w * 0.84, s.h * 0.06);
      g.fillStyle = BLUE; g.fillRect(s.w * 0.08, s.h * 0.66, s.w * 0.84 * k, s.h * 0.06);
      s.tex.needsUpdate = true;
      return;
    }

    switch (s.kind) {
      case 'overview': this._overview(g, s, t); break;
      case 'sonar': this._sonar(g, s, t); break;
      case 'power': this._powerGrid(g, s, t); break;
      case 'crew': this._crew(g, s, t); break;
      case 'comms': this._comms(g, s, t); break;
      case 'depth': this._depth(g, s, t); break;
      case 'banner': this._banner(g, s, t); break;
      case 'generator': this._generator(g, s, t); break;
      case 'hex': this._hex(g, s, t); break;
      case 'environment': this._environment(g, s, t); break;
      case 'status': this._status(g, s, t); break;
      case 'ring': this._ring(g, s, t); break;
      case 'log': this._log(g, s, t); break;
    }
    s.tex.needsUpdate = true;
  }

  // the station from above: rings of decks, one sector flooded
  _overview(g, s, t) {
    this._frame(g, s, 'HALCYON-9 // STATION OVERVIEW');
    const cx = s.w * 0.33, cy = s.h * 0.56, R = s.h * 0.36;
    for (let ring = 0; ring < 3; ring++) {
      const r = R * (0.45 + ring * 0.28);
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * Math.PI * 2 + 0.05, a1 = ((k + 1) / 6) * Math.PI * 2 - 0.05;
        const flooded = ring === 2 && k === 4;
        g.strokeStyle = flooded ? (Math.sin(t * 6) > 0 ? ORANGE : '#7a4410') : ring === 0 ? WHITE : BLUE;
        g.lineWidth = s.h * 0.035;
        g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
      }
    }
    g.fillStyle = BLUE;
    g.beginPath(); g.arc(cx, cy, R * 0.18, 0, Math.PI * 2); g.fill();
    // a sweeping scan line
    const a = t * 0.8;
    g.strokeStyle = 'rgba(100,200,255,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R * 1.05, cy + Math.sin(a) * R * 1.05); g.stroke();
    const p = this.power;
    const rows = [
      ['DEPTH', `${(1284 + t * 0.07).toFixed(1)} m`, WHITE],
      ['HULL INTEGRITY', '61 %', ORANGE],
      ['PRESSURE', `${(129.4 + Math.sin(t * 0.3) * 0.3).toFixed(1)} bar`, WHITE],
      ['MAIN POWER', `${Math.round(p * 100)} %`, p > 0.95 ? BLUE : ORANGE],
      ['LIFE SUPPORT', p > 0.95 ? 'ONLINE' : 'AUXILIARY', p > 0.95 ? BLUE : ORANGE],
      ['SECTOR C-4', 'FLOODED', ORANGE]
    ];
    rows.forEach(([k, v, c], i) => {
      this._text(g, s, k, 0.64, 0.25 + i * 0.12, 0.045, DIM, true);
      this._text(g, s, v, 0.64, 0.31 + i * 0.12, 0.06, c, true);
    });
  }

  _sonar(g, s, t) {
    this._frame(g, s, 'SONAR - PASSIVE');
    const cx = s.w * 0.36, cy = s.h * 0.58, R = s.h * 0.36;
    g.strokeStyle = DIM; g.lineWidth = 1;
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(cx, cy, R * k / 3, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    const a = t * 1.4;
    for (let k = 0; k < 18; k++) {
      g.strokeStyle = `rgba(100,200,255,${0.5 * (1 - k / 18)})`; g.lineWidth = 3;
      const b = a - k * 0.04;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(b) * R, cy + Math.sin(b) * R); g.stroke();
    }
    // contacts fade after the sweep passes them
    for (const [ang, dist, big] of [[0.8, 0.6, false], [2.6, 0.82, true], [4.4, 0.35, false], [5.5, 0.7, false]]) {
      const since = ((a - ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const alpha = Math.max(0, 1 - since / 3);
      g.fillStyle = big ? `rgba(255,154,46,${alpha})` : `rgba(230,244,255,${alpha})`;
      g.beginPath(); g.arc(cx + Math.cos(ang) * R * dist, cy + Math.sin(ang) * R * dist, big ? 7 : 4, 0, Math.PI * 2); g.fill();
    }
    this._text(g, s, 'CONTACTS 4', 0.7, 0.3, 0.06, WHITE, true);
    this._text(g, s, 'BRG 149  UNKNOWN', 0.7, 0.42, 0.045, ORANGE);
    this._text(g, s, 'RANGE 0.8 km', 0.7, 0.52, 0.045, BLUE);
  }

  _powerGrid(g, s, t) {
    this._frame(g, s, 'POWER DISTRIBUTION');
    const p = this.power;
    const systems = ['GEN', 'LIFE', 'LIFT', 'COMM', 'LAB', 'HULL'];
    systems.forEach((name, i) => {
      const lvl = Math.min(1, p * (0.7 + 0.3 * Math.sin(t * (0.8 + i * 0.3) + i) * 0.5 + 0.15));
      const x = s.w * (0.07 + i * 0.15), h = s.h * 0.55 * lvl;
      g.fillStyle = GRID; g.fillRect(x, s.h * 0.25, s.w * 0.09, s.h * 0.55);
      g.fillStyle = lvl > 0.6 ? BLUE : ORANGE; g.fillRect(x, s.h * 0.8 - h, s.w * 0.09, h);
      this._text(g, s, name, x / s.w, 0.88, 0.045, WHITE);
    });
    this._text(g, s, `OUTPUT ${Math.round(p * 412)} kW`, 0.6, 0.18, 0.05, p > 0.95 ? BLUE : ORANGE, true);
  }

  _crew(g, s, t) {
    this._frame(g, s, 'CREW BIOSIGNS');
    const crew = ['KESSLER, DR.', 'CREW 02', 'CREW 03', 'CREW 04', 'CREW 05', 'CREW 06', 'VOSS'];
    crew.forEach((name, i) => {
      const y = 0.2 + i * 0.11, alive = name === 'VOSS';
      this._text(g, s, name, 0.04, y + 0.04, 0.05, alive ? WHITE : DIM, alive);
      g.strokeStyle = alive ? BLUE : '#3a1a1a'; g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k <= 40; k++) {
        const x = s.w * (0.42 + k * 0.011);
        let v = 0;
        if (alive) { const ph = (k / 40 + t * 0.9) % 1; v = ph < 0.06 ? Math.sin(ph / 0.06 * Math.PI) * 0.04 : 0; }
        const yy = s.h * (y + 0.02 - v);
        k ? g.lineTo(x, yy) : g.moveTo(x, yy);
      }
      g.stroke();
      this._text(g, s, alive ? '72 BPM' : 'NO SIGNAL', 0.88 - (alive ? 0 : 0.05), y + 0.04, 0.04, alive ? BLUE : RED);
    });
  }

  _comms(g, s, t) {
    this._frame(g, s, 'COMMS - SURFACE LINK');
    g.strokeStyle = BLUE; g.lineWidth = 2;
    g.beginPath();
    for (let k = 0; k <= 120; k++) {
      const x = s.w * (0.04 + k * 0.0077);
      const v = Math.sin(k * 0.3 + t * 5) * 0.03 + (Math.random() - 0.5) * 0.08;
      const y = s.h * (0.45 + v);
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    this._text(g, s, 'NO CARRIER', 0.04, 0.72, 0.08, ORANGE, true);
    this._text(g, s, `RETRY ${String(Math.floor(t) % 60).padStart(2, '0')}s   FREQ 12.4 kHz`, 0.04, 0.84, 0.045, DIM);
  }

  _depth(g, s, t) {
    this._frame(g, s, 'DESCENT');
    g.strokeStyle = ORANGE; g.lineWidth = 3;
    g.beginPath();
    for (let k = 0; k <= 60; k++) {
      const x = s.w * (0.06 + k * 0.0145);
      const y = s.h * (0.25 + (k / 60) * 0.5 + Math.sin(k * 0.4) * 0.01);
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    this._text(g, s, `${(0.4 + Math.sin(t * 0.2) * 0.05).toFixed(2)} m/min`, 0.55, 0.3, 0.07, WHITE, true);
    this._text(g, s, 'HULL STRESS RISING', 0.55, 0.42, 0.045, ORANGE);
  }

  // a scrolling headline across the top of the wall
  _banner(g, s, t) {
    g.fillStyle = BG; g.fillRect(0, 0, s.w, s.h);
    g.fillStyle = BLUE; g.fillRect(0, 0, s.w, s.h * 0.08); g.fillRect(0, s.h * 0.92, s.w, s.h * 0.08);
    const msg = 'HALCYON-9  //  DEEP SEA RESEARCH STATION  //  DEPTH 1284 m  //  SECTOR C-4 FLOODED  //  ALL CREW REPORT TO MUSTER POINT  //  ';
    g.font = `bold ${Math.round(s.h * 0.42)}px monospace`;
    const width = g.measureText(msg).width;
    const x = -((t * 90) % width);
    g.fillStyle = WHITE;
    g.fillText(msg + msg, x, s.h * 0.66);
    g.fillStyle = ORANGE; g.fillRect(0, s.h * 0.08, s.w * 0.012, s.h * 0.84);
  }

  // the generator's rings, coming into line as the power returns
  _generator(g, s, t) {
    this._frame(g, s, 'GENERATOR CORE');
    const p = this.power;
    const cx = s.w * 0.25, cy = s.h * 0.58;
    for (let k = 0; k < 4; k++) {
      const r = s.h * (0.12 + k * 0.075);
      const a = t * (0.4 + k * 0.25) * (1 - p) + k;
      g.strokeStyle = p > 0.95 ? BLUE : (k % 2 ? ORANGE : DIM);
      g.lineWidth = s.h * 0.035;
      g.beginPath(); g.arc(cx, cy, r, a, a + Math.PI * 1.6); g.stroke();
    }
    this._text(g, s, p > 0.95 ? 'SYNCHRONISED' : 'OUT OF PHASE', 0.5, 0.42, 0.09, p > 0.95 ? BLUE : ORANGE, true);
    this._text(g, s, `CORE TEMP ${(310 + p * 140 + Math.sin(t) * 3).toFixed(0)} K`, 0.5, 0.6, 0.06, WHITE);
    this._text(g, s, `FIELD ${(p * 100).toFixed(0)} %`, 0.5, 0.74, 0.06, WHITE);
  }

  // scrolling diagnostic data
  _hex(g, s, t) {
    this._frame(g, s, 'DIAGNOSTICS');
    const rows = 9, off = Math.floor(t * 3);
    for (let k = 0; k < rows; k++) {
      let line = '';
      for (let c = 0; c < 5; c++) line += (((off + k) * 2654435761 + c * 40503) >>> 0).toString(16).slice(0, 4).toUpperCase().padStart(4, '0') + ' ';
      this._text(g, s, line, 0.05, 0.22 + k * 0.085, 0.055, (off + k) % 7 === 0 ? ORANGE : DIM);
    }
  }

  // temperature and humidity in the habitat
  _environment(g, s, t) {
    this._frame(g, s, 'HABITAT');
    const rows = [['TEMP', `${(14.2 + Math.sin(t * 0.3) * 0.2).toFixed(1)} C`], ['HUMIDITY', '87 %'], ['CO2', `${(1.9 + Math.sin(t * 0.2) * 0.05).toFixed(2)} %`], ['BILGE', 'RISING']];
    rows.forEach(([k, v], i) => {
      this._text(g, s, k, 0.06, 0.3 + i * 0.17, 0.065, DIM, true);
      this._text(g, s, v, 0.55, 0.3 + i * 0.17, 0.08, i === 3 ? ORANGE : WHITE, true);
    });
  }

  _status(g, s, t) {
    this._frame(g, s, null);
    const p = this.power;
    this._text(g, s, 'SYS', 0.08, 0.3, 0.16, DIM, true);
    this._text(g, s, p > 0.95 ? 'NOMINAL' : 'DEGRADED', 0.08, 0.62, 0.2, p > 0.95 ? BLUE : ORANGE, true);
    this._text(g, s, new Date(0, 0, 0, 3, 14, Math.floor(t) % 60).toTimeString().slice(0, 8), 0.08, 0.88, 0.16, WHITE);
  }

  _ring(g, s, t) {
    this._frame(g, s, null);
    const cx = s.w * 0.25, cy = s.h * 0.5, r = s.h * 0.32;
    g.strokeStyle = GRID; g.lineWidth = 8;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = BLUE;
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (0.62 + 0.05 * Math.sin(t))); g.stroke();
    this._text(g, s, 'O2', 0.52, 0.42, 0.18, DIM, true);
    this._text(g, s, `${(19.6 + Math.sin(t * 0.4) * 0.2).toFixed(1)}%`, 0.52, 0.75, 0.22, WHITE, true);
  }

  _log(g, s, t) {
    this._frame(g, s, null);
    const lines = ['> PUMP 3 FAULT', '> SEAL C-4 BREACH', '> AUX BUS OK', '> ARIA HEARTBEAT', '> LIFT LOCKED', '> HULL CREAK 2.1g', '> SONAR CONTACT'];
    const off = Math.floor(t * 1.2);
    for (let k = 0; k < 4; k++) {
      this._text(g, s, lines[(off + k) % lines.length], 0.06, 0.28 + k * 0.2, 0.15, k === 3 ? ORANGE : BLUE);
    }
  }

  // ---- per frame ---------------------------------------------------------------------------

  update(delta, power, levelTime) {
    this.time += delta;
    this.power = power;
    if (power > 0.3 && this._onAt === null) this._onAt = levelTime;

    // LEDs: a faint glow on emergency power, full when restored; the light columns stutter
    const lit = THREE.MathUtils.clamp((power - 0.3) / 0.7, 0, 1);
    for (const led of this.leds) {
      let k = 0.05 + 0.95 * lit;
      if (led.flicker && lit < 0.99 && Math.sin(this.time * 31) * Math.sin(this.time * 7.3) > 0.4) k *= 0.3;
      led.mat.color.copy(led.base).multiplyScalar(k);
    }
    // buttons: some blink, all follow the power
    const c = new THREE.Color();
    for (let i = 0; i < this.buttonBase.length; i++) {
      const blink = this.buttonPhase[i] < 1.2 ? (Math.sin(this.time * (2 + this.buttonPhase[i] * 3)) > 0 ? 1 : 0.2) : 1;
      c.copy(this.buttonBase[i]).multiplyScalar((0.04 + 0.96 * lit) * blink);
      this.buttons.setColorAt(i, c);
    }
    this.buttons.instanceColor.needsUpdate = true;

    // redraw one screen a frame (each about 6-10 times a second)
    if (this.screens.length) {
      this._draw(this.screens[this._next % this.screens.length]);
      this._next++;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
  }
}
