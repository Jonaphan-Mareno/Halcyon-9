// The flashback in Dr. Kessler's room (scene 2.8, step 3): a wordless memory, the first time the
// player sees faces. Kessler stands at the shutdown console. Voss argues with her, protective of
// the work, while ARIA pleads from a speaker (her words indistinct: only her pulsing light). Kessler
// reaches for the shutdown lever. Voss turns away from her, walks to the door controls instead,
// and locks the room. Cut to black.
//
// It is drawn in 2D on a canvas (flat shapes in the station's colours, a cold teal grade, film
// grain, letterbox bars), so it costs nothing in 3D. An optional recording can go in
// public/assets/audio/logs/flashback.mp3 (the muffled argument); until then it is silent.
//
// play() resolves when it ends. Enter skips it (after the first couple of seconds).

const W = 640;
const H = 360;
const DURATION = 14.6;
const FLOOR = 300;
const AUDIO = './assets/audio/logs/flashback.mp3';

const C = {
  wall: '#10222e', wall2: '#0a1620', floor: '#0b1218', console: '#172a3a', trim: '#f07a14',
  cyan: '#4fe3ff', coat: '#dfe8ee', coatShade: '#aebcc6', skin: '#d9ae92', skinShade: '#b98c72',
  kessHair: '#2a2523', vossHair: '#3a2a20', vossCoat: '#cfdbe3', pants: '#1c2733', red: '#ff3b30'
};

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v) => v * v * (3 - 2 * v);
const lerp = (a, b, k) => a + (b - a) * k;
// 0 before a, 1 after b, smooth between
const seg = (t, a, b) => ease(clamp((t - a) / (b - a)));

export class Flashback {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'flashback';
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.hint = document.createElement('div');
    this.hint.className = 'fb-hint';
    this.hint.textContent = 'Enter: skip';
    this.el.append(this.canvas, this.hint);
    root.appendChild(this.el);
    this.g = this.canvas.getContext('2d');
    this.running = false;
    window.addEventListener('keydown', (e) => {
      if (this.running && e.code === 'Enter' && this.t > 2) this.t = DURATION;
    });
  }

  play() {
    this.running = true;
    this.t = 0;
    this.el.classList.add('on');
    this.hint.style.opacity = 0;
    this.audio = new Audio(AUDIO);
    this.audio.addEventListener('error', () => { this.audio = null; });
    this.audio.play().catch(() => { this.audio = null; });
    return new Promise((resolve) => {
      let last = performance.now();
      const frame = (now) => {
        if (!this.running) return;
        this.t += Math.min(0.1, (now - last) / 1000);
        last = now;
        this.hint.style.opacity = this.t > 2 && this.t < DURATION - 1 ? 0.55 : 0;
        if (this.t >= DURATION) {
          this.running = false;
          this.audio?.pause();
          this.el.classList.remove('on');
          resolve();
          return;
        }
        this._draw(this.t);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  // ------------------------------------------------------------------ the scene
  _draw(t) {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    // a small camera drift, slowly pushing in
    const push = 1 + t * 0.004;
    g.translate(W / 2, H / 2);
    g.scale(push, push);
    g.translate(-W / 2 + Math.sin(t * 0.7) * 2, -H / 2);

    this._room(g, t);

    // the beats
    const argue = seg(t, 0.6, 1.4) * (1 - seg(t, 8.3, 9));
    const toKess = seg(t, 5, 7.5);                 // Voss steps up to Kessler
    const leave = seg(t, 9.3, 12);                 // Voss walks away to the door
    const lever = seg(t, 6.2, 8.2) * (1 - 0.0);     // she pulls the lever
    const vx = lerp(lerp(350, 275, toKess), 535, leave);
    const faceLeft = t < 9.3;
    const reach = seg(t, 5.2, 7);                  // her arm goes to the lever
    const door = seg(t, 12, 12.6);                 // the door locks

    // ARIA's speaker: pleading, then frantic
    const aria = 0.5 + 0.5 * Math.sin(t * (4 + toKess * 6)) * (0.6 + 0.4 * Math.sin(t * 1.7));
    this._aria(g, t, aria, 1 + toKess * 0.6 + (t > 12 ? 1 : 0));

    this._person(g, 175, FLOOR, 1.05, {
      dir: 1, coat: C.coat, shade: C.coatShade, hair: C.kessHair, bun: true,
      armF: lerp(-0.2, -1.5, reach), armB: -0.15,
      talk: t > 6 && t < 12 ? Math.abs(Math.sin(t * 7)) * 0.7 : 0.1,
      brow: lerp(0.1, 0.5, toKess) - (t > 12 ? 0.8 : 0), look: t > 11.5 ? 1 : 0, t,
      lean: lerp(0, 0.04, reach), watch: leave > 0.1
    });
    this._person(g, vx, FLOOR, 1.05, {
      dir: faceLeft ? -1 : 1, coat: C.vossCoat, shade: '#a9b9c4', hair: C.vossHair, bun: false,
      armF: faceLeft ? Math.sin(t * 5) * 0.5 * argue - 1.0 * argue - 0.9 * toKess : lerp(0.1, -1.6, door),
      armB: faceLeft ? Math.sin(t * 4 + 1) * 0.5 * argue - 0.7 * argue : 0.2,
      talk: argue * Math.abs(Math.sin(t * 8)) * 0.8, brow: 0.6 * argue, look: 0, t,
      walk: leave > 0 && leave < 1 ? leave : 0
    });

    // the lever at the console: down once she has pulled it
    this._lever(g, lever, t);
    // the door panel, locking
    this._doorPanel(g, door, t);

    this._grade(g, t);
  }

  _room(g, t) {
    const wall = g.createLinearGradient(0, 0, 0, FLOOR);
    wall.addColorStop(0, C.wall2);
    wall.addColorStop(1, C.wall);
    g.fillStyle = wall;
    g.fillRect(-20, -20, W + 40, FLOOR + 20);
    // panel seams
    g.strokeStyle = 'rgba(120,200,230,0.07)';
    g.lineWidth = 1;
    for (let x = 0; x < W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, FLOOR); g.stroke(); }
    // the floor and a band of orange along the wall, as in the station
    g.fillStyle = C.floor;
    g.fillRect(-20, FLOOR, W + 40, H - FLOOR + 20);
    g.fillStyle = C.trim;
    g.fillRect(-20, FLOOR - 56, W + 40, 4);
    // the door at the right
    g.fillStyle = '#0c1822';
    g.fillRect(562, 118, 78, FLOOR - 118);
    g.strokeStyle = 'rgba(79,227,255,0.25)';
    g.strokeRect(562.5, 118.5, 78, FLOOR - 118);
    // the console
    g.fillStyle = C.console;
    g.fillRect(70, 226, 200, FLOOR - 226);
    g.fillStyle = '#0a1822';
    g.fillRect(70, 220, 200, 8);
    g.fillStyle = 'rgba(79,227,255,0.18)';
    g.fillRect(84, 150, 92, 62);                         // a screen over it
    g.fillStyle = C.cyan;
    for (let i = 0; i < 5; i++) g.fillRect(92, 160 + i * 10, 30 + ((i * 37 + Math.floor(t * 3)) % 46), 3);
  }

  _lever(g, k, t) {
    // a red plate with the shutdown lever on the console
    g.fillStyle = '#3a0f0d';
    g.fillRect(212, 232, 44, 36);
    g.fillStyle = C.red;
    g.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 6));
    g.fillRect(216, 236, 36, 4);
    g.globalAlpha = 1;
    g.strokeStyle = '#c9d3da';
    g.lineWidth = 5;
    g.lineCap = 'round';
    const a = lerp(-1.1, 0.5, k);
    g.beginPath();
    g.moveTo(234, 258);
    g.lineTo(234 + Math.sin(a) * 26, 258 - Math.cos(a) * 26);
    g.stroke();
    g.fillStyle = C.red;
    g.beginPath();
    g.arc(234 + Math.sin(a) * 26, 258 - Math.cos(a) * 26, 5, 0, Math.PI * 2);
    g.fill();
  }

  _aria(g, t, pulse, rate) {
    // a speaker panel high on the wall with rings spreading from its light
    const cx = 470, cy = 92;
    g.fillStyle = '#0a1520';
    g.fillRect(cx - 38, cy - 26, 76, 52);
    g.strokeStyle = 'rgba(79,227,255,0.4)';
    g.strokeRect(cx - 37.5, cy - 25.5, 76, 52);
    for (let i = 0; i < 4; i++) {
      const k = ((t * 0.6 * rate + i / 4) % 1);
      g.strokeStyle = `rgba(79,227,255,${(1 - k) * 0.5 * (0.4 + pulse)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, 8 + k * 46, 0, Math.PI * 2);
      g.stroke();
    }
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, 26);
    glow.addColorStop(0, `rgba(190,245,255,${0.5 + 0.5 * pulse})`);
    glow.addColorStop(1, 'rgba(79,227,255,0)');
    g.fillStyle = glow;
    g.fillRect(cx - 30, cy - 30, 60, 60);
    g.fillStyle = '#e8fdff';
    g.beginPath();
    g.arc(cx, cy, 4 + pulse * 2, 0, Math.PI * 2);
    g.fill();
  }

  _doorPanel(g, k, t) {
    const x = 543, y = 214;
    g.fillStyle = '#16202a';
    g.fillRect(x - 12, y - 18, 24, 40);
    g.fillStyle = k > 0.5 ? C.red : '#43ff8f';
    g.globalAlpha = k > 0.5 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 9)) : 1;
    g.beginPath();
    g.arc(x, y - 6, 4, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    if (k > 0.5) {
      // bolts slide across the door
      g.fillStyle = C.red;
      g.globalAlpha = 0.7;
      g.fillRect(562, 200, 78, 6);
      g.fillRect(562, 250, 78, 6);
      g.globalAlpha = 1;
    }
  }

  // A person, standing on floorY. pose: dir (+1 faces right), armF/armB (the near/far arm's raise
  // in radians, 0 hanging down), talk (mouth open 0..1), brow (0 calm .. 1 hard angry), look,
  // walk (0..1 mid-stride), lean
  _person(g, x, floorY, s, p) {
    g.save();
    g.translate(x, floorY);
    g.scale(s * p.dir, s);
    g.rotate(p.lean || 0);
    const swing = p.walk ? Math.sin(p.t * 9) * 0.5 : 0;
    // legs
    g.fillStyle = C.pants;
    this._limb(g, -6, -62, -6 + swing * 14, 0, 11);
    this._limb(g, 6, -62, 6 - swing * 14, 0, 11);
    g.fillStyle = '#0a0e12';
    g.fillRect(-14 + swing * 14, -4, 17, 5);
    g.fillRect(-1 - swing * 14, -4, 17, 5);
    // the far arm (behind the body)
    this._arm(g, -9, -118, p.armB, p.coat === C.coat ? C.coatShade : '#a9b9c4');
    // the coat: a long shape to the knee
    g.fillStyle = p.coat;
    g.beginPath();
    g.moveTo(-17, -122);
    g.lineTo(17, -122);
    g.lineTo(21, -44);
    g.lineTo(-21, -44);
    g.closePath();
    g.fill();
    g.fillStyle = p.shade;
    g.fillRect(-1, -122, 2, 78);                         // the front seam
    if (p.bun) {
      g.fillStyle = C.cyan;                               // Kessler: a badge on a lanyard
      g.fillRect(6, -118, 2, 20);
      g.fillRect(3, -99, 8, 10);
    } else {
      g.fillStyle = C.trim;                               // Voss: the station's orange at his collar
      g.fillRect(-9, -122, 18, 5);
    }
    // neck and head
    g.fillStyle = C.skinShade;
    g.fillRect(-4, -131, 8, 10);
    this._head(g, 0, -145, p);
    // the near arm
    this._arm(g, 12, -118, p.armF, p.coat);
    g.restore();
  }

  _limb(g, x0, y0, x1, y1, w) {
    g.beginPath();
    g.moveTo(x0 - w / 2, y0);
    g.lineTo(x0 + w / 2, y0);
    g.lineTo(x1 + w / 2 - 1, y1);
    g.lineTo(x1 - w / 2 + 1, y1);
    g.closePath();
    g.fill();
  }

  // an arm hanging from the shoulder, raised forward by `a` radians (negative = up and out)
  _arm(g, sx, sy, a, colour) {
    g.save();
    g.translate(sx, sy);
    g.rotate(-a);
    g.fillStyle = colour;
    g.fillRect(-5, 0, 10, 40);
    g.fillStyle = C.skin;
    g.beginPath();
    g.arc(0, 43, 6, 0, Math.PI * 2);                      // the hand
    g.fill();
    g.restore();
  }

  _head(g, x, y, p) {
    g.save();
    g.translate(x, y);
    // hair behind
    g.fillStyle = p.hair;
    g.beginPath();
    g.arc(-1, -2, 16, 0, Math.PI * 2);
    g.fill();
    if (p.bun) {
      g.beginPath();
      g.arc(-15, -6, 9, 0, Math.PI * 2);
      g.fill();
    }
    // face
    g.fillStyle = C.skin;
    g.beginPath();
    g.ellipse(3, 2, 13, 15, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.hair;
    g.beginPath();
    g.ellipse(0, -9, 16, 8, 0, Math.PI, Math.PI * 2);   // the hairline
    g.fill();
    // eyes (looking ahead, or round at the door)
    const gaze = p.look ? 3 : 1;
    for (const ex of [5, 15]) {
      g.fillStyle = '#f4f7f8';
      g.beginPath();
      g.ellipse(ex - 1, 0, 3.6, 3, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#16212b';
      g.beginPath();
      g.arc(ex - 1 + gaze * 0.6, 0.4, 1.7, 0, Math.PI * 2);
      g.fill();
    }
    // brows: level when calm, slanting down to the nose when angry
    g.strokeStyle = p.hair;
    g.lineWidth = 2;
    const b = p.brow;
    g.beginPath();
    g.moveTo(1, -9 + b * 3.5);
    g.lineTo(9, -9 - b * 2.5 + 0.5);
    g.moveTo(11, -9 - b * 2.5 + 0.5);
    g.lineTo(19, -9 + b * 3.5);
    g.stroke();
    // mouth
    g.fillStyle = '#5b2a2a';
    g.beginPath();
    g.ellipse(10, 9, 3.6, 1 + p.talk * 3.6, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // a cold grade, grain, a flicker, the bars, the flash at the start and the cut to black
  _grade(g, t) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgb(170,215,225)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.07})`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 1);
    }
    const vig = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, 34);
    g.fillRect(0, H - 34, W, 34);
    // a flicker and a few glitch bars as the door locks
    if (t > 12 && t < 13.6 && Math.random() < 0.5) {
      g.fillStyle = 'rgba(255,60,50,0.18)';
      g.fillRect(0, Math.random() * H, W, 6 + Math.random() * 18);
    }
    if (t < 1.2) {
      g.fillStyle = `rgba(235,252,255,${1 - t / 1.2})`;
      g.fillRect(0, 0, W, H);
    }
    // the cut to black
    const out = seg(t, 13.5, 14.2);
    if (out > 0) {
      g.fillStyle = `rgba(0,0,0,${out})`;
      g.fillRect(0, 0, W, H);
    }
  }
}
