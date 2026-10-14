import * as THREE from 'three';
import { withHubLighting } from '../graphics/HubMaterials.js';

// What holds Voss back in Level 2 (scenes 2.2 to 2.9), and what lets him through:
//
//   the stair bulkheads   an emergency bulkhead with a big window across the foot of each
//                         staircase: he can see up to the gallery (and the one lit door) but not
//                         climb. When the garden's pumps restart they sink into the floor.
//   the door signs        CREW QUARTERS (lit, the only light upstairs), DR. E. KESSLER, LAB
//   the hatch             a slab in the garden floor. Opened with Kessler's code it slides aside
//                         onto a shaft ringed with blue lights, drawn by a small shader (the
//                         shaft is not modelled: the shader works out what you would see down a
//                         square shaft from where you stand)
//
// Positions are polar, as in the atrium's build script: metres from the centre, degrees with
// north = 90 (the lift is at 270).

const STAIR_FEET = [289.4, 250.6];         // just before the first step of the east and west stairs
const BULKHEAD = { r: 15.3, width: 2.95, height: 3.3, depth: 0.14 };
const SINK_SECONDS = 2.4;
const HATCH_SIZE = 1.8;
const HATCH_SLIDE = 1.95;

const polar = (r, deg, y = 0) => {
  const a = THREE.MathUtils.degToRad(deg);
  return new THREE.Vector3(r * Math.cos(a), y, -r * Math.sin(a));
};

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// black and orange hazard stripes
function hazard(g, w, h) {
  g.fillStyle = '#16181b';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#f07a14';
  for (let x = -h; x < w + h; x += 64) {
    g.beginPath();
    g.moveTo(x, h);
    g.lineTo(x + 32, h);
    g.lineTo(x + 32 + h, 0);
    g.lineTo(x + h, 0);
    g.closePath();
    g.fill();
  }
}

function sign(text, { lit = false, color = '#cfe8ff', w = 1024, h = 256 } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = lit ? '#1a1610' : '#14181c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = lit ? '#ffcf8a' : '#3a4650';
    g.lineWidth = 8;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = color;
    g.font = 'bold 120px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 6);
  });
}

// The shaft under the hatch, seen through a square hole in the floor (interior mapping): for each
// pixel of the hole, follow the line of sight down until it meets one of the four walls, then
// colour that wall by how deep the meeting point is: dark steel, a ring of blue light every 1.4 m,
// fading to black far down.
const SHAFT_VERT = /* glsl */`
  uniform vec3 uCamLocal;     // the camera in the hole's own space (worked out on the CPU each frame)
  varying vec3 vPos;
  varying vec3 vRay;
  void main() {
    vPos = position;
    vRay = position - uCamLocal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SHAFT_FRAG = /* glsl */`
  uniform float uHalf;        // half the hole's width (m)
  uniform float uTime;
  uniform float uOpen;        // 0..1: how far the slab has slid (the shaft lights come on as it opens)
  varying vec3 vPos;
  varying vec3 vRay;
  void main() {
    vec3 d = normalize(vRay);
    if (d.z > -0.0001) d.z = -0.0001;                 // looking along the floor: treat as just inside
    // distance along the ray to the side walls (x = +-half, y = +-half): the wall the ray is
    // heading for, so it is never negative (a negative one makes an infinite colour, which the
    // glow pass then smears over the whole screen)
    float tx = (uHalf - sign(d.x) * vPos.x) / max(abs(d.x), 1e-5);
    float ty = (uHalf - sign(d.y) * vPos.y) / max(abs(d.y), 1e-5);
    float t = min(tx, ty);
    vec3 hit = vPos + d * t;
    float depth = clamp(-hit.z, 0.0, 60.0);            // metres below the floor
    // walls facing different ways are lit a little differently, so the corners read
    float side = tx < ty ? 0.75 : 1.0;
    vec3 col = vec3(0.05, 0.06, 0.07) * side;
    // the lip of the hole: brushed steel catching the room's light
    col += vec3(0.25, 0.27, 0.3) * (1.0 - smoothstep(0.0, 0.12, depth));
    // a ring of blue light every 1.4 m, the first just under the lip; they pulse very slowly
    float ring = 1.0 - smoothstep(0.0, 0.06, abs(fract(depth / 1.4 + 0.35) - 0.5) * 1.4);
    col += vec3(0.15, 0.75, 1.0) * ring * (0.75 + 0.25 * sin(uTime * 1.3 - depth * 0.8)) * uOpen;
    // far down it is black
    col *= exp(-depth * 0.22);
    gl_FragColor = vec4(min(col, vec3(4.0)), 1.0);
    #include <colorspace_fragment>
  }
`;

export class Gates {
  constructor({ scene, atrium, physics }) {
    this.scene = scene;
    this.physics = physics;
    this.time = 0;
    this.bulkheads = [];
    this._sinking = 0;           // seconds since the bulkheads started to sink (0 = not yet)
    this._hatchOpen = 0;         // 0..1
    this._hatchOpening = false;

    this._buildBulkheads();
    this._buildSigns(atrium);
    this._buildHatch(atrium);
  }

  // ------------------------------------------------------------------ the stair bulkheads
  _buildBulkheads() {
    const { width, height, depth } = BULKHEAD;
    const frameMat = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.45, metalness: 0.5 }));
    const stripeMat = withHubLighting(new THREE.MeshStandardMaterial({ map: canvasTexture(512, 128, hazard), roughness: 0.6 }));
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x8fb9c8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false
    });
    const signTex = sign('EMERGENCY BULKHEAD: SEALED', { color: '#ff6a4a', w: 1024, h: 128 });
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const box = (w, h, d, mat, x, y, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };
    for (const angle of STAIR_FEET) {
      const g = new THREE.Group();
      g.name = 'Gate_Bulkhead';
      const kick = 1.05;                       // the solid lower panel
      const win = height - kick - 0.32;        // the window above it
      g.add(box(width, kick, depth, stripeMat, 0, kick / 2));
      g.add(box(width, 0.16, depth * 1.2, frameMat, 0, kick));
      g.add(box(width, 0.32, depth * 1.2, frameMat, 0, height - 0.16));
      g.add(box(0.14, height, depth * 1.3, frameMat, -width / 2 + 0.07, height / 2));
      g.add(box(0.14, height, depth * 1.3, frameMat, width / 2 - 0.07, height / 2));
      g.add(box(0.06, win, depth * 0.8, frameMat, 0, kick + win / 2));            // a centre mullion
      const glass = box(width - 0.28, win, 0.03, glassMat, 0, kick + win / 2);
      glass.renderOrder = 2;
      g.add(glass);
      for (const s of [1, -1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.2), signMat);
        plate.position.set(0, height - 0.16, s * (depth * 0.6 + 0.005));
        if (s < 0) plate.rotation.y = Math.PI;
        g.add(plate);
      }
      // local x runs out from the atrium's centre, so the panel spans the stair's width
      g.position.copy(polar(BULKHEAD.r, angle));
      g.rotation.y = THREE.MathUtils.degToRad(angle);
      this.scene.add(g);
      // solid while closed: an invisible box with the panel's outline
      const block = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth * 1.4));
      block.position.copy(g.position).setY(height / 2);
      block.rotation.copy(g.rotation);
      block.updateMatrixWorld(true);
      const collider = this.physics.addStaticObject(block);
      this.bulkheads.push({ group: g, collider, centre: polar(BULKHEAD.r - 0.3, angle, 1.8) });
    }
  }

  // Where Voss looks through each bulkhead (for the interaction spots)
  get bulkheadSpots() {
    return this.bulkheads.map((b) => b.centre);
  }

  get bulkheadsSealed() {
    return this._sinking === 0;
  }

  // The pumps are back: the bulkheads sink into the floor and stop being solid
  openBulkheads() {
    if (this._sinking > 0) return;
    this._sinking = 0.0001;
    for (const b of this.bulkheads) {
      if (b.collider) this.physics.world.removeCollider(b.collider, true);
      b.collider = null;
    }
  }

  // ------------------------------------------------------------------ the door signs
  _buildSigns(atrium) {
    const place = (marker, tex, lit, w = 1.7, h = 0.42) => {
      const o = atrium.getObjectByName(marker);
      if (!o) return;
      const p = o.getWorldPosition(new THREE.Vector3());
      const mat = lit ? new THREE.MeshBasicMaterial({ map: tex })
        : withHubLighting(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.2 }));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.name = 'Gate_Sign';
      m.position.copy(p).add(new THREE.Vector3(-p.x, 0, -p.z).normalize().multiplyScalar(0.02));
      m.lookAt(0, p.y, 0);
      this.scene.add(m);
    };
    place('PT_Plate_VOSS', sign('CREW QUARTERS', { lit: true, color: '#ffe2b0' }), true);
    place('PT_Plate_KESSLER', sign('DR. E. KESSLER', { color: '#8fa3b3' }), false);
    place('PT_Plate_LAB', sign('LAB', { color: '#8fa3b3' }), false, 1.1, 0.42);
  }

  // ------------------------------------------------------------------ the hatch
  _buildHatch(atrium) {
    this.slab = atrium.getObjectByName('Atrium_Hatch');
    const marker = atrium.getObjectByName('PT_Hatch');
    if (!this.slab || !marker) return;
    const centre = marker.getWorldPosition(new THREE.Vector3());
    this.hatchCentre = centre.clone();
    // the hatch faces round the atrium: its edges run along and across the radius
    const angle = Math.atan2(-centre.z, centre.x);
    this.slabClosed = this.slab.position.clone();
    this.slabOpen = this.slabClosed.clone().add(new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle)).multiplyScalar(HATCH_SLIDE));

    this.shaftUniforms = {
      uCamLocal: { value: new THREE.Vector3() },
      uHalf: { value: HATCH_SIZE / 2 - 0.02 },
      uTime: { value: 0 },
      uOpen: { value: 0 }
    };
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(HATCH_SIZE - 0.04, HATCH_SIZE - 0.04),
      new THREE.ShaderMaterial({ uniforms: this.shaftUniforms, vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    hole.name = 'Gate_Shaft';
    hole.rotation.order = 'YXZ';
    hole.rotation.set(-Math.PI / 2, angle, 0);
    // just above the slab and the gold floor strips that cross it
    hole.position.set(centre.x, 0.05, centre.z);
    hole.visible = false;
    const local = new THREE.Matrix4();
    hole.onBeforeRender = (renderer, scene, camera) => {
      local.copy(hole.matrixWorld).invert();
      this.shaftUniforms.uCamLocal.value.copy(camera.position).applyMatrix4(local);
    };
    this.scene.add(hole);
    this.hole = hole;
  }

  get hatchIsOpen() {
    return this._hatchOpen >= 1;
  }

  openHatch() {
    if (!this.slab || this._hatchOpening) return;
    this._hatchOpening = true;
    this.hole.visible = true;
  }

  update(dt) {
    this.time += dt;
    if (this._sinking > 0 && this._sinking < SINK_SECONDS + 0.1) {
      this._sinking += dt;
      const t = Math.min(1, this._sinking / SINK_SECONDS);
      const e = t * t * (3 - 2 * t);
      for (const b of this.bulkheads) {
        b.group.position.y = -e * (BULKHEAD.height + 0.1);
        if (t >= 1) b.group.visible = false;
      }
    }
    if (this._hatchOpening && this._hatchOpen < 1) {
      this._hatchOpen = Math.min(1, this._hatchOpen + dt / 1.8);
      const e = this._hatchOpen * this._hatchOpen * (3 - 2 * this._hatchOpen);
      this.slab.position.lerpVectors(this.slabClosed, this.slabOpen, e);
      this.shaftUniforms.uOpen.value = e;
    }
    if (this.hole?.visible) this.shaftUniforms.uTime.value = this.time;
  }
}
