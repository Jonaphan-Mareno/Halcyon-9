import * as THREE from 'three';

// The lab workstation's two monitors: the organism's live readings, drawn into canvases.
// Screen 0: a heartbeat-like trace and cell voltage. Screen 1: electrical activity per tube and a
// slowly turning diagram of the specimen. Redrawn ten times a second (cheap).

const W = 512, H = 320;
const MINT = '#5dffc0', VIOLET = '#b07cff', BLUE = '#64c8ff', DIM = '#1d3a4a';

export class LabScreens {
  // markers: Object3D[] at the screen centres, facing east (+x)
  constructor(scene, markers) {
    this.screens = markers.map((marker, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.56),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      const p = marker.getWorldPosition(new THREE.Vector3());
      mesh.position.copy(p);
      mesh.lookAt(p.x + 1, p.y, p.z);
      scene.add(mesh);
      return { kind: i, ctx: canvas.getContext('2d'), tex, trace: new Array(120).fill(0.5) };
    });
    this.time = 0;
    this.redraw = 0;
    this.surge = 0;
    this._draw();
  }

  _frame(g, title) {
    g.fillStyle = '#04121b';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = DIM;
    g.lineWidth = 1;
    for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x, H); g.stroke(); }
    for (let y = 40; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.fillStyle = BLUE;
    g.font = 'bold 20px monospace';
    g.fillText(title, 16, 28);
    g.fillStyle = '#ff9a2e';
    g.fillRect(W - 90, 14, 74, 16);
    g.fillStyle = '#04121b';
    g.font = 'bold 12px monospace';
    g.fillText('LIVE', W - 70, 27);
  }

  _draw() {
    const t = this.time;
    for (const s of this.screens) {
      const g = s.ctx;
      if (s.kind === 0) {
        this._frame(g, 'SPECIMEN 07 - VITALS');
        // a spiky trace, like a heartbeat crossed with an electrical discharge
        const beat = (t * 1.3) % 1;
        const v = beat < 0.08 ? 0.5 - Math.sin(beat / 0.08 * Math.PI) * 0.4
          : 0.5 + (Math.random() - 0.5) * 0.06 - this.surge * (Math.random() * 0.4);
        s.trace.push(v);
        s.trace.shift();
        g.strokeStyle = MINT;
        g.lineWidth = 3;
        g.beginPath();
        s.trace.forEach((y, k) => {
          const x = 16 + (k / (s.trace.length - 1)) * (W - 32);
          const yy = 60 + y * 150;
          k ? g.lineTo(x, yy) : g.moveTo(x, yy);
        });
        g.stroke();
        g.fillStyle = MINT;
        g.font = 'bold 34px monospace';
        g.fillText((412 + Math.sin(t * 0.7) * 30 + this.surge * 180).toFixed(0) + ' mV', 16, 268);
        g.fillStyle = VIOLET;
        g.font = '16px monospace';
        g.fillText('CELL VOLTAGE', 16, 296);
        g.fillText('TEMP ' + (3.8 + Math.sin(t * 0.2) * 0.2).toFixed(1) + ' C', 300, 268);
        g.fillText('CONTAINMENT FIELD', 300, 296);
      } else {
        this._frame(g, 'BIOELECTRIC ACTIVITY');
        // a bar per tube
        for (let k = 0; k < 5; k++) {
          const lvl = 0.35 + 0.25 * Math.sin(t * (1.1 + k * 0.3) + k) + this.surge * 0.4 + Math.random() * 0.05;
          const h = Math.max(0.05, Math.min(1, lvl)) * 180;
          g.fillStyle = k === 2 ? VIOLET : MINT;
          g.fillRect(24 + k * 52, 250 - h, 34, h);
          g.fillStyle = BLUE;
          g.font = '14px monospace';
          g.fillText('T' + (k + 1), 32 + k * 52, 274);
        }
        // a turning diagram of the specimen: a core with branching spokes
        const cx = 400, cy = 160;
        g.strokeStyle = MINT;
        g.lineWidth = 2;
        g.beginPath(); g.arc(cx, cy, 18, 0, Math.PI * 2); g.stroke();
        for (let k = 0; k < 9; k++) {
          const a = t * 0.4 + (k / 9) * Math.PI * 2;
          const r1 = 70 + 12 * Math.sin(t * 2 + k);
          const ex = cx + Math.cos(a) * r1, ey = cy + Math.sin(a) * r1 * 0.6;
          g.beginPath(); g.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 11); g.lineTo(ex, ey); g.stroke();
          g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + Math.cos(a + 0.6) * 22, ey + Math.sin(a + 0.6) * 13); g.stroke();
        }
        g.fillStyle = VIOLET;
        g.font = '16px monospace';
        g.fillText('SAMPLES: 5 TUBES', 300, 296);
      }
      s.tex.needsUpdate = true;
    }
  }

  update(dt, surge = 0) {
    this.time += dt;
    this.surge = surge;
    this.redraw -= dt;
    if (this.redraw <= 0) {
      this.redraw = 0.1;
      this._draw();
    }
  }
}
