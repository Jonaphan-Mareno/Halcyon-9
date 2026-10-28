import * as THREE from 'three';

// The lab's curved, see-through holo screens (from the team's reference). Each one is a bent
// plane showing a glowing blue display drawn into a canvas: rings and gauges, graphs, a wireframe
// of the specimen, scrolling data, on a tinted see-through glass body (so they show up even in
// front of the white walls). Three designs are shared by all the screens and redrawn ten times a second.
//
// Markers come from the lab model: PT_Holo_<id>_<width cm>_<height cm>_<facing degrees>

const W = 640, H = 360;
const BLUE = '#4fb8ff', CYAN = '#7fe8ff', PALE = '#cfefff', ORANGE = '#ffab4a', MINT = '#6dffc8';

function curvedPlane(w, h, bow) {
  const g = new THREE.PlaneGeometry(w, h, 24, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2);
    p.setZ(i, bow * x * x);            // the edges curve toward the viewer
  }
  g.computeVertexNormals();
  return g;
}

export class HoloScreens {
  constructor(scene, markers) {
    this.designs = [0, 1, 2].map(() => {
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
      });
      return { ctx: canvas.getContext('2d'), tex, material, bars: Array.from({ length: 14 }, () => Math.random()) };
    });
    markers.forEach((marker, i) => {
      const parts = marker.name.split('_');            // PT, Holo, id, w, h, deg
      const w = Number(parts[3]) / 100, h = Number(parts[4]) / 100, deg = Number(parts[5]);
      const design = this.designs[w > 2 ? (i % 2 === 0 ? 0 : 1) : i % 3];
      const mesh = new THREE.Mesh(curvedPlane(w, h, w * 0.08), design.material);
      const p = marker.getWorldPosition(new THREE.Vector3());
      mesh.position.copy(p);
      // Blender's facing angle (from +x, counter-clockwise) in three.js's axes (x, -z)
      const a = THREE.MathUtils.degToRad(deg);
      mesh.lookAt(p.x + Math.cos(a), p.y, p.z - Math.sin(a));
      mesh.renderOrder = 4;
      scene.add(mesh);
    });
    this.time = 0;
    this.redraw = 0;
    this.surge = 0;
    this._draw();
  }

  _frame(g) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(6, 34, 66, 0.62)';              // the tinted blue glass
    g.fillRect(0, 0, W, H);
    g.strokeStyle = BLUE;
    g.lineWidth = 4;
    g.strokeRect(4, 4, W - 8, H - 8);
    g.lineWidth = 2;
    g.strokeStyle = CYAN;
    for (const [x, y, dx, dy] of [[4, 4, 1, 1], [W - 4, 4, -1, 1], [4, H - 4, 1, -1], [W - 4, H - 4, -1, -1]]) {
      g.beginPath(); g.moveTo(x, y + dy * 40); g.lineTo(x, y); g.lineTo(x + dx * 40, y); g.stroke();
    }
  }

  _ring(g, cx, cy, r, frac, col) {
    g.strokeStyle = 'rgba(79,184,255,0.35)';
    g.lineWidth = 6;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = col;
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); g.stroke();
  }

  _draw() {
    const t = this.time, s = this.surge;
    const [d0, d1, d2] = this.designs;

    // design 0: specimen overview - a turning wireframe of the organism, rings, readouts
    let g = d0.ctx;
    this._frame(g);
    g.fillStyle = PALE; g.font = 'bold 22px monospace';
    g.fillText('SPECIMEN 07  //  STRUCTURE', 22, 38);
    const cx = 200, cy = 200;
    g.strokeStyle = s > 0.2 ? MINT : CYAN; g.lineWidth = 2;
    g.beginPath(); g.ellipse(cx, cy, 30, 34, 0, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 10; k++) {
      const a = t * 0.5 + (k / 10) * Math.PI * 2;
      const r = 110 + 14 * Math.sin(t * 1.7 + k * 2);
      const ex = cx + Math.cos(a) * r, ey = cy + Math.sin(a) * r * 0.55;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 20);
      g.quadraticCurveTo(cx + Math.cos(a + 0.3) * r * 0.6, cy + Math.sin(a + 0.3) * r * 0.4, ex, ey); g.stroke();
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + Math.cos(a + 0.7) * 26, ey + Math.sin(a + 0.7) * 14); g.stroke();
    }
    this._ring(g, 480, 140, 52, 0.55 + 0.2 * Math.sin(t * 0.8) + s * 0.3, ORANGE);
    this._ring(g, 480, 140, 36, 0.3 + 0.25 * Math.sin(t * 1.3), CYAN);
    g.fillStyle = PALE; g.font = '16px monospace';
    g.fillText('ACTIVITY', 446, 220);
    g.fillText('MASS 41.2 KG', 400, 270);
    g.fillText('TUBES 1-5', 400, 296);
    g.fillStyle = ORANGE;
    g.fillText(s > 0.2 ? 'SURGE DETECTED' : 'STABLE', 400, 322);
    d0.tex.needsUpdate = true;

    // design 1: bioelectric graphs - a scrolling waveform and bars
    g = d1.ctx;
    this._frame(g);
    g.fillStyle = PALE; g.font = 'bold 22px monospace';
    g.fillText('BIOELECTRIC FIELD', 22, 38);
    g.strokeStyle = CYAN; g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= 600; x += 6) {
      const y = 130 + Math.sin(x * 0.04 + t * 3) * 26 * (1 + s * 2) + Math.sin(x * 0.13 - t * 5) * 8;
      x ? g.lineTo(20 + x, y) : g.moveTo(20, y);
    }
    g.stroke();
    g.strokeStyle = MINT; g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= 600; x += 6) {
      const y = 140 + Math.sin(x * 0.07 - t * 2) * 14;
      x ? g.lineTo(20 + x, y) : g.moveTo(20, y);
    }
    g.stroke();
    d1.bars = d1.bars.map((b, k) => Math.max(0.05, Math.min(1, b + (Math.random() - 0.5) * 0.15 + s * 0.2)));
    d1.bars.forEach((b, k) => {
      g.fillStyle = k % 4 === 0 ? ORANGE : BLUE;
      g.fillRect(24 + k * 42, 330 - b * 120, 28, b * 120);
    });
    d1.tex.needsUpdate = true;

    // design 2: data panel - rows of readouts, a radial scan and a pie
    g = d2.ctx;
    this._frame(g);
    g.fillStyle = PALE; g.font = 'bold 22px monospace';
    g.fillText('SAMPLE ANALYSIS', 22, 38);
    g.font = '17px monospace';
    for (let k = 0; k < 7; k++) {
      const v = (Math.sin(t * 0.6 + k * 1.3) * 0.5 + 0.5);
      g.fillStyle = BLUE;
      g.fillText(['CELL V', 'PH', 'TEMP', 'O2', 'CONDUCT', 'GROWTH', 'SIGNAL'][k], 24, 80 + k * 38);
      g.fillStyle = 'rgba(79,184,255,0.3)';
      g.fillRect(140, 66 + k * 38, 200, 16);
      g.fillStyle = k === 6 && s > 0.2 ? MINT : CYAN;
      g.fillRect(140, 66 + k * 38, 200 * v, 16);
    }
    this._ring(g, 500, 130, 70, 1, CYAN);
    g.strokeStyle = MINT; g.lineWidth = 3;
    g.beginPath(); g.moveTo(500, 130); g.lineTo(500 + Math.cos(t * 1.5) * 70, 130 + Math.sin(t * 1.5) * 70); g.stroke();
    g.fillStyle = ORANGE;
    g.beginPath(); g.moveTo(500, 280); g.arc(500, 280, 46, 0, Math.PI * (1.1 + 0.2 * Math.sin(t))); g.fill();
    g.fillStyle = BLUE;
    g.beginPath(); g.moveTo(500, 280); g.arc(500, 280, 46, Math.PI * (1.1 + 0.2 * Math.sin(t)), Math.PI * 2); g.fill();
    d2.tex.needsUpdate = true;
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
