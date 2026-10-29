// The flashback in Dr. Kessler's room (Flashback 2, "The shutdown"), drawn: the fallback for slow
// machines (the full scene, Flashback3D.js, plays in first person when Kessler's model has loaded and
// the machine keeps up). The same story, silent and wordless: Kessler at her workbench, Voss arguing
// with her, ARIA only a light on the bench that pulses faster and faster. Then a silence, and
// Kessler walks past Voss and out of the door; he turns to watch her go. Cut to black. Nothing is
// locked.
//
// It is drawn in 2D on a canvas (flat shapes in the station's colours, a cold teal grade, film
// grain, letterbox bars), so it costs nothing in 3D.
//
// play() resolves when it ends. Enter skips it (after the first couple of seconds).

const W = 640;
const H = 360;
const DURATION = 16.4;
const FLOOR = 300;

const C = {
  wall: '#10222e', wall2: '#0a1620', floor: '#0b1218', console: '#172a3a', trim: '#f07a14',
  cyan: '#4fe3ff', coat: '#dfe8ee', coatShade: '#aebcc6', skin: '#d9ae92', skinShade: '#b98c72',
  kessHair: '#a3341a', shades: '#14181d', vossHair: '#3a2a20', vossCoat: '#cfdbe3', pants: '#1c2733', red: '#ff3b30'
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
    return new Promise((resolve) => {
      let last = performance.now();
      const frame = (now) => {
        if (!this.running) return;
        this.t += Math.min(0.1, (now - last) / 1000);
        last = now;
        this.hint.style.opacity = this.t > 2 && this.t < DURATION - 1 ? 0.55 : 0;
        if (this.t >= DURATION) {
          this.running = false;
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

    // the beats: they argue (he steps up to her), a silence, then she walks past him and out of the
    // door, and he turns to watch her go
    const argue = seg(t, 0.6, 1.4) * (1 - seg(t, 7.6, 8.2));
    const toKess = seg(t, 3, 4.5);                 // Voss steps up to her
    const leave = seg(t, 10.8, 14.2);              // she walks out (past him, through the door)
    const kx = lerp(175, 640, leave);
    const vx = lerp(350, 300, toKess);
    const watch = kx > vx + 10;                    // he has turned to watch her go
    const door = seg(t, 12.4, 12.9) * (1 - seg(t, 14.3, 14.8));

    // ARIA: a light on the bench, faster and faster through the talk and the silence
    const rate = 1 + seg(t, 1, 10.5) * 3;
    const aria = 0.5 + 0.5 * Math.sin(t * rate * Math.PI * 2 * 0.6);
    this._aria(g, t, aria, rate);

    this._doorway(g, door);
    this._person(g, kx, FLOOR, 1.05, {
      dir: leave > 0.02 ? 1 : (t > 1 ? 1 : -1), coat: C.coat, shade: C.coatShade, hair: C.kessHair, curls: true, shades: false,
      armF: leave > 0 ? 0.1 : -0.2, armB: -0.15,
      talk: t > 1.5 && t < 7.6 ? Math.abs(Math.sin(t * 6)) * 0.6 * (Math.sin(t * 0.9) > 0 ? 1 : 0.2) : 0.1,
      brow: lerp(0.1, 0.4, toKess), look: 0, t,
      walk: leave > 0 && leave < 1 ? leave : 0
    });
    this._person(g, vx, FLOOR, 1.05, {
      dir: watch ? 1 : -1, coat: C.vossCoat, shade: '#a9b9c4', hair: C.vossHair, curls: false, shades: false,
      armF: Math.sin(t * 5) * 0.5 * argue - 1.0 * argue - 0.9 * toKess * argue,
      armB: Math.sin(t * 4 + 1) * 0.5 * argue - 0.7 * argue,
      talk: argue * Math.abs(Math.sin(t * 8)) * 0.8 * (Math.sin(t * 0.9) > 0 ? 0.2 : 1), brow: 0.6 * argue, look: 0, t
    });

    this._doorPanel(g, t);

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


  _aria(g, t, pulse, rate) {
    // ARIA: a round light set in the console, with rings spreading from it
    const cx = 110, cy = 236;
    g.fillStyle = '#0a1520';
    g.fillRect(cx - 14, cy - 8, 28, 14);
    for (let i = 0; i < 4; i++) {
      const k = ((t * 0.3 * rate + i / 4) % 1);
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

  // the door's panel, green: nothing is locked
  _doorPanel(g) {
    const x = 543, y = 214;
    g.fillStyle = '#16202a';
    g.fillRect(x - 12, y - 18, 24, 40);
    g.fillStyle = '#43ff8f';
    g.beginPath();
    g.arc(x, y - 6, 4, 0, Math.PI * 2);
    g.fill();
  }

  // the door slides up as she reaches it (k 0 shut, 1 open), the dim corridor behind
  _doorway(g, k) {
    if (k <= 0) return;
    g.fillStyle = '#1b2c38';
    g.fillRect(562, 118, 78, (FLOOR - 118) * k);
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
    if (p.curls) {
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
    if (p.curls) {
      // Kessler: red curls to her shoulders
      for (const [cx, cy, r] of [[-12, 4, 8], [-13, 14, 7], [-8, 22, 6], [12, -4, 6], [-4, -14, 7], [6, -14, 6]]) {
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
      }
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
    // eyes (looking ahead, or round at the door); Kessler's behind her dark glasses
    const gaze = p.look ? 3 : 1;
    if (p.shades) {
      g.fillStyle = C.shades;
      g.fillRect(-1, -2.5, 20, 1.2);                     // the bridge and the arm back to her ear
      for (const ex of [5, 15]) {
        g.beginPath();
        g.ellipse(ex - 1, 0, 4.4, 3, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const ex of p.shades ? [] : [5, 15]) {
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
    if (t < 1.2) {
      g.fillStyle = `rgba(235,252,255,${1 - t / 1.2})`;
      g.fillRect(0, 0, W, H);
    }
    // the cut to black
    const out = seg(t, DURATION - 0.9, DURATION - 0.2);
    if (out > 0) {
      g.fillStyle = `rgba(0,0,0,${out})`;
      g.fillRect(0, 0, W, H);
    }
  }
}
