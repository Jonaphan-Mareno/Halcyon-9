import * as THREE from 'three';
import { withHubLighting } from '../graphics/HubMaterials.js';
import { audioSrc, preloadAudio } from '../audio/AudioCache.js';

// What holds Voss back in Level 2 (scenes 2.2 to 2.9), and what lets him through:
//
//   the stair bulkheads   an emergency bulkhead with a big window across the foot of each
//                         staircase: he can see up to the gallery (and the one lit door) but not
//                         climb. When the garden's pumps restart they sink into the floor.
//   the door signs        CREW QUARTERS (lit, with warm light round its door: the only light
//                         upstairs), DR. E. KESSLER, LAB, and ESCAPE PODS over the pod door below
//   the hatch             a round pressure hatch in a deck plate in the garden floor: a steel
//                         coaming, a navy lid with an orange hand wheel and four dogs, a hinge on
//                         the far side. Opened with Kessler's code the wheel spins, the dogs pull
//                         in, the seal hisses and the lid swings up and bangs open, onto a round
//                         shaft with a ladder and rings of blue light, drawn by a small shader (the
//                         shaft is not modelled: the shader works out what you would see down it
//                         from where you stand)
//   the hatch keypad      on the hatch's deck plate, at the near side; its screen says NO POWER
//                         until the pumps restart
//
// Positions are polar, as in the atrium's build script: metres from the centre, degrees with
// north = 90 (the lift is at 270).

const STAIR_FEET = [289.4, 250.6];         // just before the first step of the east and west stairs
const BULKHEAD = { r: 15.3, width: 2.95, height: 3.3, depth: 0.14 };
const SINK_SECONDS = 2.4;
const HATCH = { r: 0.78, lid: 0.86, plate: 2.5 };   // the hole's radius, the lid's, the deck plate's side (m)
const DOG = { shut: 0.84, open: 0.72 };              // how far out the dogs sit, shut and drawn in
// the lid's swing (radians, and seconds from the code going in): it cracks open, is pushed up to
// nearly upright, tips over and falls onto its stop past upright, then bounces there
const LID = { crack: 0.07, lift: 1.7, upright: 1.45, tip: 2.6, bang: 2.85, open: 1.885 };
const RING = { off: new THREE.Color(1.4, 0.12, 0.08), on: new THREE.Color(1.6, 0.75, 0.2), open: new THREE.Color(0.3, 1.7, 0.6) };
const SFX = './assets/audio/sfx/l3/';
// The hatch opening: [seconds after the right code, sound, volume, rate]
const HATCH_CUES = [
  [0.15, 'ratchet-1', 0.9, 0.8], [0.55, 'ratchet-2', 0.9, 0.85], [0.95, 'ratchet-1', 0.9, 0.75],
  [1.3, 'hatch-unlock', 1, 1], [1.5, 'air-hiss', 0.9, 0.8], [1.52, 'hatch-unlock', 0.7, 0.75],
  [1.8, 'door-creak-1', 0.7, 0.75], [LID.bang, 'hatch-thud', 1, 1], [LID.bang + 0.02, 'metal-bang-2', 0.45, 0.8]
];

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

// The shaft under the hatch, seen through the round hole in the floor (interior mapping): for each
// pixel of the hole, follow the line of sight down until it meets the round wall, then colour the
// wall by how deep the meeting point is and how far round it is: dark steel with seams, a ladder
// on the near side, a ring of blue light every 1.4 m, fading to black far down.
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
  uniform float uR;           // the shaft's radius (m)
  uniform float uTime;
  uniform float uOpen;        // 0..1: the shaft lights come on as the lid swings up
  varying vec3 vPos;
  varying vec3 vRay;
  void main() {
    vec3 d = normalize(vRay);
    if (d.z > -0.0001) d.z = -0.0001;                 // looking along the floor: treat as just inside
    // where the line of sight meets the wall, |p + q t| = R across the shaft: the far root (the
    // point is inside the circle, so it is always ahead)
    vec2 p = vPos.xy, q = d.xy;
    float a = max(dot(q, q), 1e-6);
    float b = dot(p, q);
    float c = dot(p, p) - uR * uR;
    float t = (-b + sqrt(max(b * b - a * c, 0.0))) / a;
    vec3 hit = vPos + d * t;
    float depth = clamp(-hit.z, 0.0, 60.0);            // metres below the floor
    float ang = atan(hit.y, hit.x);                    // 0 = the near side, the keypad's
    float round_ = ang * uR;                           // metres round the wall from the ladder
    // steel, lit a little by which way it faces (so the curve reads), with eight upright seams
    float facing = 0.75 + 0.25 * cos(ang - 2.4);
    vec3 col = vec3(0.05, 0.06, 0.075) * facing;
    float seam = 1.0 - smoothstep(0.0, 0.025, 0.5 - abs(fract(ang * 1.2732) - 0.5));
    col *= 1.0 - 0.45 * seam;
    // the ladder: two rails and a rung every 0.3 m
    float rail = 1.0 - smoothstep(0.012, 0.022, abs(abs(round_) - 0.17));
    float rung = (1.0 - smoothstep(0.01, 0.018, abs(fract(depth / 0.3) - 0.5) * 0.3)) * step(abs(round_), 0.17);
    col = mix(col, vec3(0.3, 0.33, 0.36) * facing, max(rail, rung) * step(0.12, depth));
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
    this._hatchT = -1;           // seconds since the right code went in (-1 = not yet)
    this._cues = [];
    preloadAudio([...new Set(HATCH_CUES.map(([, name]) => SFX + name + '.ogg'))]);   // (so they play on cue)

    this._buildBulkheads();
    this._buildSigns(atrium);
    this._buildHatch(atrium);
    this._buildKeypad();
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
    const place = (marker, tex, lit, w = 1.7, h = 0.42, dy = 0) => {
      const o = atrium.getObjectByName(marker);
      if (!o) return;
      const p = o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0));
      // a lit sign glows (brighter than white, so the bloom catches it)
      const mat = lit ? new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color().setScalar(1.7) })
        : withHubLighting(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.2 }));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.name = 'Gate_Sign';
      m.position.copy(p).add(new THREE.Vector3(-p.x, 0, -p.z).normalize().multiplyScalar(0.02));
      m.lookAt(0, p.y, 0);
      this.scene.add(m);
    };
    place('PT_Plate_VOSS', sign('CREW QUARTERS', { lit: true, color: '#ffe2b0' }), true, 2.6, 0.65);
    place('PT_PodDoor', sign('ESCAPE PODS', { lit: true, color: '#ff7a4a' }), true, 2.2, 0.55, 1.75);
    // warm light leaking round the crew quarters' door: two upright strips and one across the top
    const door = atrium.getObjectByName('DOOR_VOSS');
    if (door) {
      const b = new THREE.Box3().setFromObject(door);
      const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.42).multiplyScalar(1.8) });
      const x = b.min.x - 0.06;
      const strip = (h, w, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, w), glow);
        m.position.set(x, y, z);
        this.scene.add(m);
      };
      strip(b.max.y - b.min.y, 0.06, (b.min.y + b.max.y) / 2, b.min.z - 0.05);
      strip(b.max.y - b.min.y, 0.06, (b.min.y + b.max.y) / 2, b.max.z + 0.05);
      strip(0.06, b.max.z - b.min.z + 0.16, b.max.y + 0.05, (b.min.z + b.max.z) / 2);
    }
    place('PT_Plate_KESSLER', sign('DR. E. KESSLER', { color: '#8fa3b3' }), false);
    place('PT_Plate_LAB', sign('LAB', { color: '#8fa3b3' }), false, 1.1, 0.42);
  }

  // ------------------------------------------------------------------ the hatch
  // A round pressure hatch set in a deck plate in the garden floor, built here (the atrium's own
  // flat slab is hidden). Its local x runs round the atrium: the keypad is on the +x side, where he
  // stands to use it, and the hinge on the far side, so the lid swings up away from him.
  _buildHatch(atrium) {
    const old = atrium.getObjectByName('Atrium_Hatch');
    const marker = atrium.getObjectByName('PT_Hatch');
    if (!marker) return;
    if (old) old.visible = false;
    const centre = marker.getWorldPosition(new THREE.Vector3());
    this.hatchCentre = centre.clone();
    const angle = Math.atan2(-centre.z, centre.x);
    const g = this.hatch = new THREE.Group();
    g.name = 'Gate_Hatch';
    g.position.set(centre.x, 0, centre.z);
    g.rotation.y = angle - Math.PI / 2;
    this.scene.add(g);

    const navy = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x1f2c3e, roughness: 0.42, metalness: 0.55, side: THREE.DoubleSide }));
    const steel = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x5b6875, roughness: 0.32, metalness: 0.75, side: THREE.DoubleSide }));
    const orange = withHubLighting(new THREE.MeshStandardMaterial({ color: 0xd9722a, roughness: 0.5, metalness: 0.25 }));
    const black = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.6, metalness: 0.35 }));
    const rubber = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.9, metalness: 0 }));
    const lathe = (pts, mat) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 48), mat);
    const box = (w, h, d, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    // the deck plate, with a round hole under the coaming and its markings painted on
    const half = HATCH.plate / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half, -half).lineTo(half, -half).lineTo(half, half).lineTo(-half, half).lineTo(-half, -half);
    const hole = new THREE.Path();
    hole.absarc(0, 0, HATCH.r + 0.06, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const deckTex = canvasTexture(1024, 1024, deckMarkings);
    deckTex.repeat.set(1 / HATCH.plate, 1 / HATCH.plate);
    deckTex.offset.set(0.5, 0.5);
    const deck = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false, curveSegments: 40 }),
      [withHubLighting(new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.55, metalness: 0.4 })), black]);
    deck.rotation.x = -Math.PI / 2;
    g.add(deck);

    // the coaming: a raised steel ring round the hole, the lid sits on it
    g.add(lathe([[HATCH.r, 0.02], [HATCH.r, 0.11], [HATCH.r + 0.015, 0.125], [HATCH.r + 0.105, 0.125],
      [HATCH.r + 0.12, 0.11], [HATCH.r + 0.15, 0.04], [HATCH.r + 0.18, 0.035]], steel));
    // its light: a thin ring on the coaming's outer edge (red with no power, amber when it wants
    // the code, green when it unlocks)
    this._ringMat = new THREE.MeshBasicMaterial({ color: RING.off });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(HATCH.r + 0.125, 0.007, 6, 72), this._ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.105;
    g.add(ring);

    // the hinge on the far side: a barrel on two brackets, and the lid on a pivot along it
    const hingeX = -(HATCH.lid + 0.04), hingeY = 0.165;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.56, 16), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(hingeX, hingeY, 0);
    g.add(barrel);
    for (const z of [-0.2, 0.2]) box(0.1, hingeY, 0.08, black, hingeX - 0.02, hingeY / 2, z, g);
    const pivot = this._lidPivot = new THREE.Group();
    pivot.position.set(hingeX, hingeY, 0);
    g.add(pivot);
    const lid = this._lid = new THREE.Group();
    lid.position.set(-hingeX, 0.125 - hingeY, 0);      // its middle over the hole, seated on the coaming
    pivot.add(lid);
    lid.add(lathe([[0.001, 0], [HATCH.lid, 0], [HATCH.lid + 0.015, 0.015], [HATCH.lid + 0.015, 0.055],
      [HATCH.lid - 0.02, 0.08], [0.6, 0.092], [0.58, 0.1], [0.001, 0.1]], navy));
    // the top's markings
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.575, 48),
      withHubLighting(new THREE.MeshStandardMaterial({ map: canvasTexture(512, 512, lidMarkings), roughness: 0.45, metalness: 0.45 })));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.1006;
    lid.add(top);
    // the hinge's leaves, from the barrel onto the lid
    for (const z of [-0.2, 0.2]) box(0.34, 0.02, 0.1, steel, -HATCH.lid - 0.04 + 0.17, 0.1, z, lid);
    // the dogs: four orange bolts out over the coaming that the wheel pulls in
    this._dogs = [];
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = Math.PI / 4 + i * Math.PI / 2;
      lid.add(arm);
      this._dogs.push(box(0.16, 0.035, 0.07, orange, DOG.shut, 0.05, 0, arm));
    }
    // the hand wheel on top
    const wheel = this._wheel = new THREE.Group();
    wheel.position.y = 0.1;
    lid.add(wheel);
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 12), steel);
    spindle.position.y = 0.04;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.035, 16), orange);
    hub.position.y = 0.08;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 10, 40), orange);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.085;
    wheel.add(spindle, hub, rim);
    for (let i = 0; i < 4; i++) {
      const spoke = box(0.2, 0.022, 0.03, orange, 0, 0.085, 0, new THREE.Group());
      spoke.position.x = 0.145;
      spoke.parent.rotation.y = i * Math.PI / 2;
      wheel.add(spoke.parent);
    }
    // the underside, seen once it is open: the rubber seal, two braces and the inside wheel
    const seal = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.018, 8, 48), rubber);
    seal.rotation.x = Math.PI / 2;
    lid.add(seal);
    box(1.3, 0.035, 0.07, steel, 0, -0.018, 0, lid);
    box(0.07, 0.035, 1.3, steel, 0, -0.018, 0, lid);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 8, 28), steel);
    inner.rotation.x = Math.PI / 2;
    inner.position.y = -0.09;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 10), steel);
    post.position.y = -0.045;
    lid.add(inner, post);

    // the shaft under it (drawn by the shader: it is not modelled)
    this.shaftUniforms = {
      uCamLocal: { value: new THREE.Vector3() },
      uR: { value: HATCH.r },
      uTime: { value: 0 },
      uOpen: { value: 0 }
    };
    const shaft = new THREE.Mesh(new THREE.CircleGeometry(HATCH.r, 48),
      new THREE.ShaderMaterial({ uniforms: this.shaftUniforms, vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    shaft.name = 'Gate_Shaft';
    shaft.rotation.x = -Math.PI / 2;           // its local x is the hatch's (the ladder's side), z is up
    shaft.position.y = 0.03;
    shaft.visible = false;
    const local = new THREE.Matrix4(), eye = new THREE.Vector3();
    shaft.onBeforeRender = (renderer, scene, camera) => {
      local.copy(shaft.matrixWorld).invert();
      this.shaftUniforms.uCamLocal.value.copy(eye.setFromMatrixPosition(camera.matrixWorld)).applyMatrix4(local);
    };
    g.add(shaft);
    this.hole = shaft;

    // solid while shut (he can step up onto it)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(HATCH.lid + 0.06, HATCH.lid + 0.06, 0.23, 20));
    cap.position.set(centre.x, 0.115, centre.z);
    cap.updateMatrixWorld(true);
    this._capCollider = this.physics.addStaticObject(cap);
    g.updateMatrixWorld(true);
  }

  // The keypad, on the hatch's deck plate at the near side: a sloping box with a screen and keys
  _buildKeypad() {
    if (!this.hatch) return;
    const body = new THREE.Shape();
    const [x0, x1, yBack, yFront] = [1.0, 1.22, 0.22, 0.09];
    body.moveTo(x0, 0).lineTo(x1, 0).lineTo(x1, yFront).lineTo(x0, yBack).lineTo(x0, 0);
    const geo = new THREE.ExtrudeGeometry(body, { depth: 0.36, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
    geo.translate(0, 0, -0.18);
    const box = new THREE.Mesh(geo, withHubLighting(new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.5, metalness: 0.4 })));
    this.hatch.add(box);
    // the face, on the slope: up the slope is the screen's top, so he reads it from the near side
    const up = new THREE.Vector3(x0 - x1, yBack - yFront, 0).normalize();
    const n = new THREE.Vector3(up.y, -up.x, 0);
    const right = new THREE.Vector3().crossVectors(up, n);
    this._screens = { off: keypadFace('NO POWER', '#ff4a3a'), on: keypadFace('ENTER CODE', '#ffb347'), open: keypadFace('UNLOCKED', '#5dff9a') };
    this._screenMat = new THREE.MeshBasicMaterial({ map: this._screens.off, color: new THREE.Color().setScalar(1.25) });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.25), this._screenMat);
    face.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
    face.position.set((x0 + x1) / 2, (yBack + yFront) / 2, 0).addScaledVector(n, 0.012);
    this.hatch.add(face);
    this.hatch.updateMatrixWorld(true);
    this.keypadSpot = face.getWorldPosition(new THREE.Vector3());
  }

  setKeypadPowered(on) {
    if (this._hatchT >= 0) return;
    if (this._screenMat) this._screenMat.map = on ? this._screens.on : this._screens.off;
    this._ringMat?.color.copy(on ? RING.on : RING.off);
  }

  get hatchIsOpen() {
    return this._hatchT >= LID.bang;
  }

  // The right code: the wheel spins and pulls the dogs in, the seal hisses, and the lid swings up
  // and bangs down open against its stop
  openHatch() {
    if (!this.hatch || this._hatchT >= 0) return;
    this._hatchT = 0;
    this._screenMat.map = this._screens.open;
    this._ringMat.color.copy(RING.open);
    this.hole.visible = true;
    if (this._capCollider) this.physics.world.removeCollider(this._capCollider, true);
    this._capCollider = null;
    this._cues = HATCH_CUES.slice();
  }

  _updateHatch(dt) {
    const t = this._hatchT += dt;
    while (this._cues.length && t >= this._cues[0][0]) {
      const [, name, vol, rate] = this._cues.shift();
      playSfx(name, vol, rate);
    }
    const smooth = (x) => {
      const u = THREE.MathUtils.clamp(x, 0, 1);
      return u * u * (3 - 2 * u);
    };
    this._wheel.rotation.y = smooth((t - 0.15) / 1.2) * Math.PI * 2.5;   // a turn and a quarter, anticlockwise
    const dogs = smooth((t - 0.45) / 0.85);
    for (const d of this._dogs) d.position.x = THREE.MathUtils.lerp(DOG.shut, DOG.open, dogs);
    // the lid: cracks open as the seal goes, is pushed up past upright, and falls onto its stop
    let a = 0;
    if (t >= LID.bang) {
      const s = t - LID.bang;
      a = LID.open - 0.16 * Math.exp(-5 * s) * Math.abs(Math.sin(11 * s));
    } else if (t >= LID.tip) {
      const u = (t - LID.tip) / (LID.bang - LID.tip);
      a = LID.upright + (LID.open - LID.upright) * u * u;
    } else if (t >= LID.lift) {
      a = LID.crack + (LID.upright - LID.crack) * smooth((t - LID.lift) / (LID.tip - LID.lift));
    } else if (t >= 1.5) {
      a = LID.crack * smooth((t - 1.5) / 0.2);
    }
    this._lidPivot.rotation.z = a;
    this.shaftUniforms.uOpen.value = smooth((t - 1.6) / 1.2);
    // open: the lid is solid where it stands
    if (t >= LID.bang && !this._lidCollider) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(HATCH.lid * 2, 0.1, HATCH.lid * 2));
      this._lidPivot.rotation.z = LID.open;
      this._lid.updateWorldMatrix(true, false);
      slab.applyMatrix4(this._lid.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.05, 0)));
      slab.updateMatrixWorld(true);
      this._lidCollider = this.physics.addStaticObject(slab);
      this._lidPivot.rotation.z = a;
    }
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
    if (this._hatchT >= 0 && this._hatchT < LID.bang + 1.5) this._updateHatch(dt);
    if (this.hole?.visible) this.shaftUniforms.uTime.value = this.time;
  }
}

// The deck plate's paint (1024 px across its 2.5 m): dark plate, a hazard ring round the coaming,
// a thin orange line outside it, and HATCH 4 along the far edge (reading from the keypad's side)
function deckMarkings(g, w) {
  const px = w / HATCH.plate, c = w / 2;
  g.fillStyle = '#141a22';
  g.fillRect(0, 0, w, w);
  g.strokeStyle = '#222c38';
  g.lineWidth = 10;
  g.strokeRect(14, 14, w - 28, w - 28);
  const r0 = 0.97 * px, r1 = 1.07 * px, n = 36;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2;
    g.fillStyle = '#d9722a';
    g.beginPath();
    g.arc(c, c, r1, a0, a1);
    g.arc(c, c, r0, a1 + 0.05, a0 + 0.05, true);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = '#d9722a';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(c, c, 1.12 * px, 0, Math.PI * 2);
  g.stroke();
  g.save();
  g.translate(0.07 * px, c);
  g.rotate(-Math.PI / 2);
  g.fillStyle = 'rgba(217, 114, 42, 0.85)';
  g.font = 'bold 40px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('HATCH 4   •   SHAFT ACCESS', 0, 0);
  g.restore();
}

// The lid's top (512 px across 1.15 m): an orange ring, arrows showing which way the wheel turns,
// and the hatch's name
function lidMarkings(g, w) {
  const c = w / 2, px = w / 1.15;
  g.fillStyle = '#1f2c3e';
  g.fillRect(0, 0, w, w);
  g.strokeStyle = '#d9722a';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(c, c, 0.52 * px, 0, Math.PI * 2);
  g.stroke();
  // two curved arrows, anticlockwise (as seen from above): turn to open
  g.strokeStyle = '#cfe0ee';
  g.fillStyle = '#cfe0ee';
  g.lineWidth = 7;
  for (const start of [0.35, Math.PI + 0.35]) {
    const r = 0.37 * px, end = start + 1.6;
    g.beginPath();
    g.arc(c, c, r, -start, -end, true);
    g.stroke();
    const hx = c + r * Math.cos(-end), hy = c + r * Math.sin(-end);
    const tx = Math.sin(-end), ty = -Math.cos(-end);       // the way round, at the head
    g.beginPath();
    g.moveTo(hx - tx * 22, hy - ty * 22);
    g.lineTo(hx + ty * 14, hy - tx * 14);
    g.lineTo(hx - ty * 14, hy + tx * 14);
    g.closePath();
    g.fill();
  }
  g.save();
  g.translate(c, c);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#cfe0ee';
  g.font = 'bold 30px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('HATCH 4', 0, -0.44 * px);
  g.font = 'bold 22px "Segoe UI", Arial, sans-serif';
  g.fillText('TURN TO OPEN', 0, 0.44 * px);
  g.restore();
}

// The keypad's face: its screen (HATCH 4 and a status) over twelve backlit keys
function keypadFace(text, color) {
  return canvasTexture(320, 250, (g, w, h) => {
    g.fillStyle = '#101317';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#05080b';
    g.fillRect(14, 12, w - 28, 74);
    g.fillStyle = color;
    g.font = 'bold 22px Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('HATCH 4', w / 2, 34);
    g.font = 'bold 26px Consolas, monospace';
    g.fillText(text, w / 2, 64);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    g.font = 'bold 18px Consolas, monospace';
    keys.forEach((k, i) => {
      const x = 40 + (i % 3) * 82, y = 100 + Math.floor(i / 3) * 36;
      g.fillStyle = '#2a3038';
      g.fillRect(x, y, 70, 28);
      g.fillStyle = '#b8c4d0';
      g.fillText(k, x + 35, y + 15);
    });
  });
}

// One of Level 3's recorded sounds (public/assets/audio/sfx/l3), played once
function playSfx(name, vol = 1, rate = 1) {
  const a = new Audio(audioSrc(SFX + name + '.ogg'));
  a.volume = vol;
  a.preservesPitch = false;
  a.playbackRate = rate;
  a.play().catch(() => {});
}
