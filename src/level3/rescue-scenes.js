import * as THREE from 'three';
import { SEA } from './SeaScene.js';
import { dressInSuit } from './DiveSuit.js';
import { createGLTFLoader } from '../core/loaders.js';
import { CrewMember } from '../entities/CrewMember.js';
import { VossActor } from '../entities/vossActing.js';
import { Organism } from '../level2/Organism.js';
import { LabScreens } from '../level2/LabScreens.js';

// The "Stay" ending's narration, lines 9 and 10 (narration-c.js plays them, times them and draws
// them through the confrontation's look):
//
//   9   "Months went by without a word from Halcyon-9. So the mainland came looking."
//       SubsShot: outside, in the deep. Three rescue submarines glide through the murk toward the
//       station's atrium, their headlamps cutting the water. The sea is Level 3's own (SeaScene:
//       the station, the canyon, the marine snow, the atrium through the saucer's windows), lit
//       as it is when Voss is out in it; the submarines are built here from primitives.
//   10  "And there, waiting for them, was everything Voss had worked for."
//       LabShot: Voss's lab (Level 2's, l2-lab.glb, with its organism in the tubes and the
//       workstation's live readings), its lights still on. Two of the rescue team, in dive suits
//       with their helmets off, come in out of the dark with torches; one has found Voss's research
//       notes on the desk (a close on the open folder in his gloved hands), and they look up at
//       each other: they have found it. The divers are two of the crew models (CrewMember: Park's
//       and Navarro's, on Voss's skeleton) in the suit from DiveSuit.js, acted by VossActor.
//
// And before them, the end of line 8:
//   8   "...So she gave every last bit of power to keep the lab running so his research would never
//       be lost."
//       PowerShot: her power leaving every screen of hers: in the atrium (Level 2's) the energy
//       streams from each of her screens across the hall to the lab's doors as the screen goes dark;
//       then Level 1's control room, where Voss first met her; the lift; the lab's own screen; and
//       the lab itself, its lights still on. Each place is its own level's model.
//
// Each shot: preload(renderer) (loads, builds, compiles its shaders), draw(renderer, target, t, dt)
// (t: seconds since the shot began; draws into target, the confrontation's picture), dispose().

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ease = (x) => x * x * (3 - 2 * x);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------------------------- line 9
// The submarines' paint: the dive suit's safety orange over pale grey, navy below
const SUB = {
  hull: 0xc9d0d4, stripe: 0xd9661f, under: 0x1f2c45, trim: 0x2a2e33,
  canopy: 0x0a1a22, canopyGlow: 0x2a9fc4, lamp: 0xfff1d6, thruster: 0x58d6ff
};
// Where they go (the atrium's windows, on the saucer's south-east side) and where each starts:
// [start, scale, speed (m/s), phase]. The lead is bigger; the other two flank it, a little behind.
const ATRIUM_AT = new THREE.Vector3(26, 21, 12);
const SUBS = [
  [new THREE.Vector3(53, 8.5, 49), 1.15, 2.8, 0.0],
  [new THREE.Vector3(58, 11, 47.5), 0.8, 3.05, 1.7],
  [new THREE.Vector3(50.5, 6.2, 55), 0.82, 2.65, 3.1]
];
// The camera: gliding after them (behind the lead and off to its right, a little below), looking
// past them to the atrium's lit windows in the murk; it falls back a little, so they draw ahead
// toward it. [side, back, up] from the lead (m, along its way), at the start and the end; how far the
// look leans from just ahead of the lead to the atrium
const SUBS_CAM = {
  from: [6.5, 13, -1.2], to: [5.5, 17, -0.5], lean: [0.12, 0.38], ahead: 8,
  fov: 46, length: 9.5
};
const BEAM = { length: 15, radius: 2.4, strength: 0.55 };
// specks in the water round their path, seen only where a beam lights them
const SPECKS = { count: 3200, size: 2.6, box: [new THREE.Vector3(18, 2, 6), new THREE.Vector3(66, 24, 60)] };

export class SubsShot {
  // session: the DeckSession (its sea, its lights, the game's scene)
  constructor(session) {
    this.s = session;
    this.ready = false;
    this.camera = new THREE.PerspectiveCamera(SUBS_CAM.fov, 16 / 9, 0.2, 400);
    this.t = 0;
  }

  async preload(renderer) {
    const sea = this.s.sea;
    await sea?.ready;
    if (!sea?.group) throw new Error('the sea is not loaded');
    this._mats = subMaterials();
    this.subs = SUBS.map(([start, scale, speed, phase]) => {
      const sub = buildSub(this._mats, scale);
      return { ...sub, start, speed, phase, dir: ATRIUM_AT.clone().sub(start).normalize() };
    });
    this.group = new THREE.Group();
    this.group.name = 'RescueSubs';
    for (const s of this.subs) this.group.add(s.root);
    this.specks = beamSpecks(this.subs.length * 2);
    this.group.add(this.specks);
    this._place(0);
    // (in the sea's group: drawn only when the sea is)
    sea.group.add(this.group);
    this._frame(0);
    if (renderer) await renderer.compileAsync(this.group, this.camera, this.s.game.scene).catch(() => {});
    this.ready = true;
  }

  // The submarines along their paths, gliding: a slow bob and roll, the thrusters pulsing, the
  // running lights blinking; each one's lights dimmed by the water between it and the camera
  _place(t) {
    for (const s of this.subs) {
      const k = t + s.phase;
      s.root.position.copy(s.start).addScaledVector(s.dir, s.speed * t);
      s.root.position.y += Math.sin(k * 0.7) * 0.12;
      s.root.lookAt(_v.copy(s.root.position).add(s.dir));
      s.root.rotateZ(Math.sin(k * 0.5) * 0.03);
    }
  }

  _lights(t) {
    const fog = this.s.game.scene.fog;
    const density = fog?.density ?? SEA.FOG_DENSITY;
    // the beams, for the specks: where each starts and points
    const u = this.specks.material.uniforms;
    u.uTime.value = t;
    let i = 0;
    for (const s of this.subs) {
      s.root.updateMatrixWorld(true);
      for (const beam of s.beams) {
        beam.getWorldPosition(u.uBeamPos.value[i]);
        u.uBeamDir.value[i].set(0, 0, 1).transformDirection(beam.matrixWorld);
        i++;
      }
    }
    for (const s of this.subs) {
      const d = s.root.position.distanceTo(this.camera.position);
      // (as the sea's fog would: exp2)
      const seen = Math.exp(-((d * density * 0.8) ** 2));
      const k = t + s.phase;
      s.beamMat.uniforms.uOpacity.value = BEAM.strength * (0.35 + 0.65 * seen);
      s.glowMat.opacity = 0.9 * (0.4 + 0.6 * seen);
      s.thrusterMat.opacity = (0.55 + 0.25 * Math.sin(k * 9)) * (0.3 + 0.7 * seen);
      s.navMat[0].opacity = (Math.sin(k * 3.1) > 0.2 ? 1 : 0.15) * (0.3 + 0.7 * seen);
      s.navMat[1].opacity = (Math.sin(k * 3.1 + 1.6) > 0.2 ? 1 : 0.15) * (0.3 + 0.7 * seen);
      s.strobeMat.opacity = ((k * 0.9) % 1 < 0.06 ? 1 : 0) * (0.4 + 0.6 * seen);
      s.stripMat.opacity = 0.7 * (0.3 + 0.7 * seen);
    }
  }

  _frame(t) {
    const k = ease(clamp(t / SUBS_CAM.length));
    const lead = this.subs[0], dir = lead.dir;
    const right = _v.crossVectors(dir, _w.set(0, 1, 0)).normalize();
    const [side, back, up] = SUBS_CAM.from.map((a, i) => THREE.MathUtils.lerp(a, SUBS_CAM.to[i], k));
    // (where the lead would be without its bob: the camera glides, it does not bob with it)
    const along = _w.copy(lead.start).addScaledVector(dir, lead.speed * t);
    this.camera.position.copy(along).addScaledVector(right, side).addScaledVector(dir, -back);
    this.camera.position.y += up + Math.sin(t * 0.6) * 0.05;
    const look = along.addScaledVector(dir, SUBS_CAM.ahead).lerp(ATRIUM_AT, THREE.MathUtils.lerp(SUBS_CAM.lean[0], SUBS_CAM.lean[1], k));
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();
  }

  // t: seconds since the shot began
  draw(renderer, target, t, dt) {
    const s = this.s, sea = s.sea, scene = s.game.scene;
    this.t = t;
    if (this.camera.aspect !== target.width / target.height) {
      this.camera.aspect = target.width / target.height;
      this.camera.updateProjectionMatrix();
    }
    this._place(t);
    this._frame(t);
    this._lights(t);
    // the sea as it is when Voss is out in it, for this picture only (the level's own frame puts its
    // lights and fog back each frame, so everything is put back after the draw)
    const undo = outside(s);
    sea.update(dt, this.camera, null, 0, false);
    renderer.setRenderTarget(target);
    renderer.render(scene, this.camera);
    undo();
  }

  dispose() {
    this.group?.removeFromParent();
    this.group?.traverse((o) => { if (o.isMesh || o.isSprite) o.geometry?.dispose(); });
    for (const m of Object.values(this._mats || {})) m.dispose?.();
    for (const s of this.subs || []) for (const m of [s.beamMat, s.glowMat, s.thrusterMat, s.strobeMat, s.stripMat, ...s.navMat]) m.dispose();
    this.specks?.material.dispose();
    this.ready = false;
  }
}

// Specks of marine snow in a box round the submarines' path, drifting; each one lit only inside a
// beam (brightest near the lamp and down the beam's middle), so the beams show what they cut through
function beamSpecks(beams) {
  const [lo, hi] = SPECKS.box;
  const pos = new Float32Array(SPECKS.count * 3), seed = new Float32Array(SPECKS.count);
  for (let i = 0; i < SPECKS.count; i++) {
    pos[i * 3] = THREE.MathUtils.lerp(lo.x, hi.x, Math.random());
    pos[i * 3 + 1] = THREE.MathUtils.lerp(lo.y, hi.y, Math.random());
    pos[i * 3 + 2] = THREE.MathUtils.lerp(lo.z, hi.z, Math.random());
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSize: { value: SPECKS.size }, uLength: { value: BEAM.length }, uRadius: { value: BEAM.radius },
      uBeamPos: { value: Array.from({ length: beams }, () => new THREE.Vector3()) },
      uBeamDir: { value: Array.from({ length: beams }, () => new THREE.Vector3(0, 0, 1)) },
      uColor: { value: new THREE.Color(SUB.lamp) }
    },
    defines: { BEAMS: beams },
    vertexShader: /* glsl */`
      uniform float uTime, uSize, uLength, uRadius;
      uniform vec3 uBeamPos[BEAMS];
      uniform vec3 uBeamDir[BEAMS];
      attribute float seed;
      varying float vLit;
      void main() {
        vec3 p = position;
        // (drifting: slowly down, and a little round)
        p += vec3(sin(uTime * 0.31 + seed * 40.0), -uTime * 0.12 + sin(uTime * 0.23 + seed * 17.0) * 0.4, cos(uTime * 0.27 + seed * 23.0)) * 0.35;
        float lit = 0.0;
        for (int i = 0; i < BEAMS; i++) {
          vec3 v = p - uBeamPos[i];
          float along = dot(v, uBeamDir[i]);
          if (along <= 0.0 || along >= uLength) continue;
          float r = length(v - uBeamDir[i] * along), edge = uRadius * along / uLength;
          lit += (1.0 - smoothstep(edge * 0.35, edge, r)) * pow(1.0 - along / uLength, 1.4);
        }
        vLit = min(lit, 1.0) * (0.5 + 0.5 * fract(seed * 7.13));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = vLit > 0.01 ? uSize * (14.0 / max(1.0, -mv.z)) * (0.6 + seed) : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vLit;
      void main() {
        if (vLit < 0.01) discard;
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(uColor * vLit * smoothstep(0.5, 0.1, d) * 0.9, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  }));
  points.frustumCulled = false;
  points.renderOrder = 7;
  return points;
}

// Level 3's sea as it is when Voss goes out by the platform (PrepRoom and SeaScene.setActive): shown,
// its sky, its fog (the platform's, not the trench's), the grey light from above, four of the deck's
// lights moved out to the platform and the vents. Set directly rather than through setActive, so
// the level's own state is left alone; returns what puts it all back
function outside(s) {
  const sea = s.sea, scene = s.game.scene, fog = scene.fog, hemi = s.hemi;
  const was = {
    visible: sea.group.visible, bg: scene.background, out: sea._outsideOn, env: scene.environmentIntensity,
    fog: fog && [fog.color.getHex(), fog.density], hemi: hemi && [hemi.color.getHex(), hemi.groundColor.getHex(), hemi.intensity]
  };
  const lights = (s.prep?.borrowed || []).map((b) => ({ b, p: b.light.position.clone(), c: b.light.color.getHex(), i: b.light.intensity, d: b.light.distance }));
  sea.group.visible = true;
  scene.background = sea.sky;
  sea.setOutsideShown(true);
  if (fog) {
    fog.color.setHex(SEA.FOG);
    fog.density = SEA.FOG_DENSITY;
  }
  scene.environmentIntensity = SEA.ENV;
  if (hemi) {
    hemi.color.setHex(SEA.HEMI[0]);
    hemi.groundColor.setHex(SEA.HEMI[1]);
    hemi.intensity = SEA.HEMI[2];
  }
  lights.forEach(({ b }, i) => {
    const to = sea.lights[i], spec = SEA.LIGHTS[i];
    if (!to || !spec) return;
    b.light.position.copy(to);
    b.light.color.setHex(spec[0]);
    b.light.intensity = spec[1];
    b.light.distance = spec[2];
  });
  return () => {
    for (const { b, p, c, i, d } of lights) {
      b.light.position.copy(p);
      b.light.color.setHex(c);
      b.light.intensity = i;
      b.light.distance = d;
    }
    if (fog) {
      fog.color.setHex(was.fog[0]);
      fog.density = was.fog[1];
    }
    scene.environmentIntensity = was.env;
    if (hemi) {
      hemi.color.setHex(was.hemi[0]);
      hemi.groundColor.setHex(was.hemi[1]);
      hemi.intensity = was.hemi[2];
    }
    if (was.out === false) sea.setOutsideShown(false);
    sea.group.visible = was.visible;
    scene.background = was.bg;
  };
}

function subMaterials() {
  // (barely metal: the sea's reflections are dim, so metal would read dark; the hull a little
  // self-lit, its pale paint showing in the murk)
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, ...extra });
  return {
    hull: std(SUB.hull, { emissive: 0x3a4a52, emissiveIntensity: 0.8 }),
    stripe: std(SUB.stripe, { roughness: 0.5, emissive: 0x3a1404, emissiveIntensity: 0.6 }),
    under: std(SUB.under, { roughness: 0.6 }),
    trim: std(SUB.trim, { roughness: 0.5, metalness: 0.5 }),
    canopy: std(SUB.canopy, { roughness: 0.08, metalness: 0.6, emissive: SUB.canopyGlow, emissiveIntensity: 0.35 }),
    lamp: new THREE.MeshBasicMaterial({ color: SUB.lamp, fog: false, toneMapped: false })
  };
}

// One submarine, nose toward +z, about 6.2 m long at scale 1: a pale, rounded hull with an orange
// band and a navy belly, a dark glass canopy lit from inside, two thruster pods on pylons with
// glowing rings at their backs, a tail fin and stabilisers, two headlamps in the nose with their
// beams, a strip of running lights down each side, red and green lights and a strobe on the fin
function buildSub(m, scale) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = body) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  // the hull: a lathe along z (tail to nose), a little flattened
  const profile = [[0, -3.1], [0.28, -3.0], [0.62, -2.6], [0.92, -1.8], [1.08, -0.6], [1.1, 0.4], [1.02, 1.5], [0.82, 2.3], [0.5, 2.85], [0.18, 3.08], [0, 3.12]];
  const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);
  const hull = add(lathe(profile), m.hull);
  hull.scale.y = 0.8;
  // the band: a slice of the same lathe, a hair larger
  const band = add(lathe([[1.1 * 1.012, -0.2], [1.1 * 1.012, 0.45]].map(([r, z]) => [r, z]), 32), m.stripe);
  band.scale.y = 0.8;
  // the belly: the bottom of a slightly larger lathe, navy
  const belly = add(new THREE.LatheGeometry(profile.slice(1, -1).map(([r, z]) => new THREE.Vector2(r * 1.015, z)), 32, Math.PI * 0.62, Math.PI * 0.76).rotateX(Math.PI / 2), m.under);
  belly.scale.y = 0.8;
  // the canopy: a dark glass blister on the nose
  const canopy = add(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.canopy, 0, 0.42, 1.45);
  canopy.scale.set(0.6, 0.42, 1.0);
  // the fin and the stabilisers (orange)
  const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.5, 0), new THREE.Vector2(0.55, 1.05), new THREE.Vector2(-0.2, 1.05)]);
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: false }).translate(0, 0, -0.04);
  const vfin = add(finGeo, m.stripe, 0, 0.55, -2.55);
  vfin.rotation.y = -Math.PI / 2;
  for (const side of [-1, 1]) {
    // (the fin's shape turned to run along the hull, then laid out sideways)
    const st = add(finGeo, m.stripe, side * 0.45, -0.05, -2.55);
    st.rotation.order = 'ZYX';
    st.rotation.set(0, -Math.PI / 2, -side * Math.PI / 2);
    st.scale.set(0.8, 0.75, 1);
  }
  // the thruster pods on their pylons, glowing rings at their backs
  const thrusterMat = new THREE.MeshBasicMaterial({ color: SUB.thruster, transparent: true, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const side of [-1, 1]) {
    const pod = add(new THREE.CapsuleGeometry(0.3, 1.7, 6, 16).rotateX(Math.PI / 2), m.under, side * 1.42, -0.18, -1.0);
    pod.scale.set(1, 1, 1);
    add(new THREE.BoxGeometry(0.5, 0.08, 0.9), m.trim, side * 1.1, -0.15, -0.95);
    add(new THREE.CylinderGeometry(0.31, 0.31, 0.25, 16, 1, true).rotateX(Math.PI / 2), m.stripe, side * 1.42, -0.18, -0.25);
    const ring = add(new THREE.TorusGeometry(0.24, 0.05, 8, 24), thrusterMat, side * 1.42, -0.18, -2.17);
    ring.renderOrder = 5;
    const disc = add(new THREE.CircleGeometry(0.22, 20), thrusterMat, side * 1.42, -0.18, -2.18);
    disc.rotation.y = Math.PI;
    disc.renderOrder = 5;
  }
  // the running lights: a thin strip down each side
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x7fe6ff, transparent: true, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.03, 3.4), stripMat, side * 1.09, 0.1, 0.1).renderOrder = 5;
  // red (port, his left: +x when facing +z) and green, and the strobe on the fin
  const navMat = [0xff3a2a, 0x3aff7a].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  add(new THREE.SphereGeometry(0.07, 8, 6), navMat[0], 1.42, -0.18, -0.05).renderOrder = 5;
  add(new THREE.SphereGeometry(0.07, 8, 6), navMat[1], -1.42, -0.18, -0.05).renderOrder = 5;
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  add(new THREE.SphereGeometry(0.06, 8, 6), strobeMat, 0, 1.58, -2.75).renderOrder = 5;
  // the headlamps: lenses in the nose, a glow round each and its beam out ahead
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: SUB.lamp, transparent: true, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const beamMat = beamMaterial();
  const beams = [];
  for (const side of [-1, 1]) {
    const lens = add(new THREE.CircleGeometry(0.11, 16), m.lamp, side * 0.42, -0.22, 2.83);
    lens.rotation.y = side * 0.25;
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(1.1);
    glow.position.set(side * 0.42, -0.22, 2.95);
    glow.renderOrder = 6;
    body.add(glow);
    const beam = add(beamGeometry(), beamMat, side * 0.42, -0.22, 2.9);
    beam.rotation.x = 0.06;
    beam.renderOrder = 6;
    beam.frustumCulled = false;
    beams.push(beam);
  }
  return { root, beams, beamMat, glowMat, thrusterMat, navMat, strobeMat, stripMat };
}

// A cone from its tip (at the lamp) out along +z
function beamGeometry() {
  return new THREE.ConeGeometry(BEAM.radius, BEAM.length, 24, 1, true).translate(0, -BEAM.length / 2, 0).rotateX(-Math.PI / 2);
}

// The beam: light in the water, brightest by the lamp and down its middle, fading along its length
// and out to its edges (additive, no depth write)
function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(SUB.lamp) }, uOpacity: { value: BEAM.strength }, uLength: { value: BEAM.length } },
    vertexShader: /* glsl */`
      uniform float uLength;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vAlong = clamp(position.z / uLength, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float edge = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.6);
        float along = pow(1.0 - vAlong, 1.7) * smoothstep(0.0, 0.06, vAlong);
        gl_FragColor = vec4(uColor * edge * along * uOpacity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
  });
}

let _glow = null;
function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

// ---------------------------------------------------------------------------------- line 10
const LAB_MODEL = './assets/models/l2-lab.glb';
// What they find: Voss's research notes, open (the left page typed, the right a scan and a chart),
// and his note stuck on it
export const RESEARCH = {
  head: 'HALCYON-9  /  J. VOSS',
  title: 'RESEARCH NOTES',
  lines: [
    'Interface trial 14: response within',
    'expected parameters.',
    'Organism-neural bond: STABLE',
    'Memory pathways: RESTORED',
    '',
    'Trials 1 - 14: see appendix',
    'Results confirmed by ARIA.'
  ],
  note: 'for Mom'
};
// The two of them: the crew model, the walk in up the aisle between the desks (from, to: x, z), where
// each stands once he has the folder (x, z: in the aisle, the tubes behind them) and the point each
// faces there (x, z). The floor is found by a ray at load.
const DIVERS = [
  { name: 'park', walk: [[-0.35, -16.9], [-0.4, -20.2]], at: [-0.45, -21.75], face: [-0.35, -18.0] },
  { name: 'navarro', walk: [[0.6, -16.3], [0.55, -19.6]], at: [0.42, -21.45], face: [-0.6, -19.6] }
];
// The shots (seconds since the picture began): the two of them coming in out of the dark (from by
// the tubes, looking back at the door), the folder in his hands (over his shoulder), their faces as
// they look up at each other (from up the aisle, the organism's tubes glowing behind them). Heights
// are above the floor.
const LAB = {
  cuts: [3.2, 5.0],
  walk: { eye: [[-1.2, 1.62, -24.4], [-1.15, 1.58, -24.0]], look: [[0.0, 1.1, -17.4], [0.0, 1.15, -18.6]], fov: 44 },
  faces: { eye: [[0.02, 1.6, -19.55], [0.0, 1.58, -19.9]], look: [[-0.02, 1.42, -21.6], [-0.02, 1.44, -21.6]], fov: 38 },
  insert: { fov: 40 },
  // his torch, laid on the desk beside him once he has the folder (and where it points)
  laid: [[-1.65, 1.105, -21.3], [-4.5, 0.9, -19.5]],
  // the discovery: they look up from the folder at each other, brows up, then smiling
  look: 5.5, smile: 6.2, rate: 0.85
};
const TORCH = { colour: 0xfff1d6, intensity: 12, distance: 12, angle: 0.42, beam: 3.2, radius: 0.55, haze: 0.35 };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _id = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _fwd = new THREE.Vector3(), _left = new THREE.Vector3(), _up = new THREE.Vector3();
const seg = (t, a, b) => clamp((t - a) / (b - a));

export class LabShot {
  // conf: the confrontation (its acting clips)
  constructor(conf) {
    this.conf = conf;
    this.ready = false;
    this.camera = new THREE.PerspectiveCamera(LAB.walk.fov, 16 / 9, 0.05, 60);
    this._shot = -1;
    this.cuts = LAB.cuts;            // (when the shots change: the narration times the pages' sound to the folder)
  }

  async preload(renderer) {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x000000);
    const [gltf, ...crew] = await Promise.all([
      createGLTFLoader().loadAsync(LAB_MODEL),
      ...DIVERS.map((d) => new CrewMember(d.name).load())
    ]);
    const lab = (this.lab = gltf.scene);
    lab.getObjectByName('COL_Lab')?.removeFromParent();
    scene.add(lab);
    lab.updateMatrixWorld(true);
    const at = (name) => lab.getObjectByName(name)?.getWorldPosition(new THREE.Vector3());
    // the floor, by a ray down between the doors and the desks
    const hit = new THREE.Raycaster(new THREE.Vector3(-0.6, 9, -19.2), new THREE.Vector3(0, -1, 0)).intersectObject(lab, true)[0];
    this.floor = hit ? hit.point.y : 5.5;
    // the organism in its tubes and the workstation's live readings (as Level 2 sets them up)
    const find = (prefix) => {
      const out = [];
      lab.traverse((o) => { if (o.name.startsWith(prefix)) out.push(o); });
      return out.sort((a, b) => a.name.localeCompare(b.name));
    };
    const tubes = find('ORG_').map((o) => ({
      base: o.getWorldPosition(new THREE.Vector3()), radius: o.name === 'ORG_2' ? 0.8 : 0.55, height: 3.0, broken: o.name.endsWith('_broken')
    }));
    this.organism = new Organism(scene, tubes, find('ORGFRAG_').map((o) => o.getWorldPosition(new THREE.Vector3())));
    this.screens = new LabScreens(scene, find('PT_LabScreen_'));
    lab.traverse((o) => { if (o.name === 'Lab_Glass') o.renderOrder = 3; });
    // its lights still on (a little low: months on its own), and the torches
    // (the lab's light a little forward of where Level 2 has it, over the middle of the room, so it
    // lights their faces as well as the tubes)
    scene.add(new THREE.HemisphereLight(0xcfdcff, 0x2a2a30, 0.6));
    const light = new THREE.PointLight(0xffe6cc, 20, 16, 1.3);
    light.position.copy(at('PT_LabLight') || new THREE.Vector3(0, 8.7, -24.25)).setZ(-20.8);
    scene.add(light);
    // the divers: the crew models in the dive suit, helmets off, each with a torch
    this.divers = DIVERS.map((d, i) => {
      const src = crew[i];
      const actor = new VossActor(src.model, this.conf.clips, { preset: 'calm', wound: false });
      // (their own walk and idle, which Voss's acting clips do not have)
      for (const c of src.clips) {
        c.userData.loop = true;
        actor.clips[c.name] = c;
        actor.anim.add(c);
      }
      const suit = dressInSuit(actor.model);
      suit.helmet.visible = false;
      actor.headDrift = false;
      scene.add(actor.root);
      const torch = buildTorch();
      scene.add(torch.group, torch.light, torch.light.target);
      const diver = { ...d, crew: src, actor, suit, torch, grip: { R: blank(), L: blank() }, look: new THREE.Vector3(), lookW: 0, aim: new THREE.Vector3() };
      diver.unhook = actor.onPose((a) => this._pose(diver, a));
      return diver;
    });
    this.folder = buildFolder();
    scene.add(this.folder.group);
    // her screen over the door, dark by the time they come (line 8 shows it going off: PowerShot)
    this.light = light;
    this._lightBase = light.intensity;
    this.ariaScreen = ariaScreen(this.conf.aria?.head?.texture, 1.4, 0.8);
    const mark = at('ARIA_Lab');
    if (mark) {
      this.ariaScreen.group.position.copy(mark);
      this.ariaScreen.group.lookAt(mark.x, mark.y, mark.z - 1);
    }
    scene.add(this.ariaScreen.group);
    this.draw(null, null, 0, 0);
    if (renderer) await renderer.compileAsync(scene, this.camera).catch(() => {});
    this.ready = true;
  }

  // ------------------------------------------------------------------ the action
  _place(t, dt) {
    const [A, B] = this.divers;
    const walking = t < LAB.cuts[0];
    for (const d of this.divers) {
      const a = d.actor;
      if (walking) {
        const k = clamp(t / LAB.cuts[0]);
        const [from, to] = d.walk;
        a.root.position.set(THREE.MathUtils.lerp(from[0], to[0], k), this.floor, THREE.MathUtils.lerp(from[1], to[1], k));
        a.root.rotation.y = Math.atan2(to[0] - from[0], to[1] - from[1]);
        if (a.currentName !== 'Walk') a.crossTo('Walk', { fade: 0, rate: LAB.rate, at: d === A ? 0 : 0.45 });
      } else {
        a.root.position.set(d.at[0], this.floor, d.at[1]);
        a.root.rotation.y = Math.atan2(d.face[0] - d.at[0], d.face[1] - d.at[1]);
        if (a.currentName !== 'Idle') a.crossTo('Idle', { fade: 0, at: d === A ? 0.3 : 1.1 });
      }
      a.root.updateMatrixWorld(true);
    }
    // the folder in his hands (from the cut to the desk)
    this.folder.group.visible = !walking;
    if (!walking) this._folderPose(A, t);
    // where each looks and points the torch: round the lab as they come in; then at the folder, and up
    // at each other
    if (walking) {
      A.look.set(-2.4 + 1.6 * Math.sin(t * 0.8), this.floor + 1.5, -25);
      B.look.set(2.2 + 1.2 * Math.sin(t * 0.6 + 1), this.floor + 1.3, -24.5);
      A.aim.set(-1.5 + 2.2 * Math.sin(t * 0.7), this.floor + 0.7, -24);
      B.aim.set(2.6 + 1.4 * Math.sin(t * 0.5 + 1), this.floor + 0.5, -23);
      A.lookW = B.lookW = 0.5;
    } else {
      const f = this.folder.centre;
      const headOf = (d) => d.actor.bone('head').getWorldPosition(new THREE.Vector3());
      A.look.copy(f).lerp(headOf(B), ease(seg(t, LAB.look, LAB.look + 0.6)));
      B.look.copy(f).lerp(headOf(A), ease(seg(t, LAB.look - 0.25, LAB.look + 0.35)));
      A.lookW = B.lookW = 0.85;
      B.aim.copy(f);
    }
    // faces: wonder as they come in; then, found it: brows up, mouths a little open, smiling
    for (const d of this.divers) {
      const f = d.actor.face;
      const found = walking ? 0 : ease(seg(t, LAB.look - 0.1, LAB.look + 0.5));
      const smile = walking ? 0 : ease(seg(t, LAB.smile - 0.4, LAB.smile + 0.6));
      f.pose({ brow: 0.25 + 0.5 * found, smile: 0.08 + 0.3 * found + 0.45 * smile, worry: 0, frown: 0, tired: 0 }, 0.3);
      f.gape = walking ? 0.08 : 0.06 + 0.3 * found * (1 - 0.5 * smile);
      d.actor.update(dt);
    }
    // the torches: in their right hands, or his laid on the desk once he has the folder
    for (const d of this.divers) {
      const tr = d.torch;
      if (d === A && !walking) {
        const [p, to] = LAB.laid;
        tr.group.position.set(p[0], this.floor + p[1], p[2]);
        tr.group.lookAt(to[0], this.floor + to[1], to[2]);
      } else {
        const hand = d.actor.bone('rightHand').getWorldPosition(_a);
        tr.group.position.copy(hand).addScaledVector(_b.copy(d.aim).sub(hand).normalize(), 0.09);
        tr.group.lookAt(d.aim);
      }
      // (its haze in the air only while they come in: close on the folder it would wash it out)
      tr.beam.material.uniforms.uOpacity.value = walking ? TORCH.haze : 0.06;
      tr.group.updateMatrixWorld(true);
      tr.lens.getWorldPosition(tr.light.position);
      tr.light.target.position.copy(tr.light.position).add(_b.set(0, 0, 1).transformDirection(tr.group.matrixWorld));
      tr.light.target.updateMatrixWorld();
    }
  }

  // The open folder held up in front of his chest, tipped toward his face; lowered a little as he
  // looks up
  _folderPose(A, t) {
    const a = A.actor;
    a._axis(2, _fwd);
    const chest = a.bone('spine4').getWorldPosition(new THREE.Vector3());
    const lower = ease(seg(t, LAB.look, LAB.look + 0.8));
    const g = this.folder.group;
    g.position.copy(chest).addScaledVector(_fwd, 0.46 + 0.02 * lower).add(_up.set(0, -0.08 - 0.1 * lower, 0));
    // (the pages toward him and up: its +z toward a point above and behind it)
    _a.copy(g.position).addScaledVector(_fwd, -1).add(_up.set(0, 1.25, 0));
    g.lookAt(_a);
    g.updateMatrixWorld(true);
    this.folder.centre.copy(g.position);
  }

  // After the clips: the head turned toward what each looks at
  _pose(d, a) {
    const head = a.bone('head');
    const from = head.getWorldPosition(_a);
    const to = _b.copy(d.look).sub(from).normalize();
    a._axis(2, _fwd);
    _q.setFromUnitVectors(_fwd.normalize(), to);
    a.turnBone(a.bone('neck'), _q2.copy(_id).slerp(_q, 0.45 * d.lookW));
    a.turnBone(head, _q2.copy(_id).slerp(_q, 0.4 * d.lookW));
  }

  // The arms: a torch held out in front, or (him, at the desk) the folder in both hands
  _grips(t) {
    const A = this.divers[0];
    const walking = t < LAB.cuts[0];
    for (const d of this.divers) {
      const a = d.actor;
      const holding = d === A && !walking;
      if (d._holding === holding && d._gripped) continue;
      d._holding = holding;
      d._gripped = true;
      a.reach('R', holding ? (x) => this._folderHand(x, 1) : (x) => this._torchHand(d, x), { fade: 0.001 });
      a.reach('L', holding ? (x) => this._folderHand(x, -1) : null, { fade: 0.001 });
    }
  }

  _torchHand(d, a) {
    const g = d.grip.R;
    a._axis(0, _left);
    a._axis(2, _fwd);
    const chest = a.bone('spine4').getWorldPosition(_a);
    g.wrist.copy(chest).addScaledVector(_fwd, 0.3).addScaledVector(_left, -0.2).add(_up.set(0, -0.12, 0));
    g.fingers.copy(d.aim).sub(g.wrist).normalize();
    g.palm.copy(_left);
    g.pole.copy(_left).negate().add(_up.set(0, -1, 0)).normalize();
    g.curl[0] = 1.1; g.curl[1] = 1.2; g.curl[2] = 0.9;
    g.thumb[0] = 0.5; g.thumb[1] = 0.4;
    return g;
  }

  // His hands at the folder's sides, under it, thumbs over the pages
  _folderHand(a, side) {
    const g = this.divers[0].grip[side > 0 ? 'R' : 'L'];
    const f = this.folder.group;
    const across = _a.set(1, 0, 0).transformDirection(f.matrixWorld);          // (the folder's right)
    const along = _b.set(0, 1, 0).transformDirection(f.matrixWorld);           // (up the page: away from him)
    const normal = _up.set(0, 0, 1).transformDirection(f.matrixWorld);         // (the pages' face)
    g.wrist.copy(f.position).addScaledVector(across, side * 0.26).addScaledVector(along, -0.06).addScaledVector(normal, -0.035);
    g.fingers.copy(across).multiplyScalar(-side * 0.55).addScaledVector(along, 0.8).normalize();
    g.palm.copy(normal);
    g.pole.copy(across).multiplyScalar(side).add(_left.set(0, -1, 0)).normalize();
    g.curl[0] = 0.35; g.curl[1] = 0.45; g.curl[2] = 0.3;
    g.thumb[0] = 0.2; g.thumb[1] = 0.1;
    return g;
  }

  // ------------------------------------------------------------------ the camera
  _frame(t) {
    const cam = this.camera, f = this.floor;
    const shot = t < LAB.cuts[0] ? 0 : t < LAB.cuts[1] ? 1 : 2;
    if (shot !== this._shot) {
      this._shot = shot;
      cam.fov = [LAB.walk.fov, LAB.insert.fov, LAB.faces.fov][shot];
      cam.updateProjectionMatrix();
    }
    const lerp = (pair, k, out) => out.set(
      THREE.MathUtils.lerp(pair[0][0], pair[1][0], k), f + THREE.MathUtils.lerp(pair[0][1], pair[1][1], k), THREE.MathUtils.lerp(pair[0][2], pair[1][2], k));
    if (shot === 0) {
      const k = ease(clamp(t / LAB.cuts[0]));
      lerp(LAB.walk.eye, k, cam.position);
      cam.lookAt(lerp(LAB.walk.look, k, _a));
    } else if (shot === 1) {
      // his view of the pages, from beside his temple (drifting in a little)
      const k = ease(clamp((t - LAB.cuts[0]) / (LAB.cuts[1] - LAB.cuts[0])));
      const A = this.divers[0].actor;
      A._axis(0, _left);
      A._axis(2, _fwd);
      const head = A.bone('head').getWorldPosition(_b);
      cam.position.copy(head).addScaledVector(_left, 0.15).addScaledVector(_fwd, 0.07 + 0.04 * k).add(_up.set(0, 0.04 - 0.02 * k, 0));
      cam.lookAt(this.folder.centre);
    } else {
      const k = ease(clamp((t - LAB.cuts[1]) / 3.6));
      lerp(LAB.faces.eye, k, cam.position);
      cam.lookAt(lerp(LAB.faces.look, k, _a));
    }
    // hand-held
    cam.position.x += Math.sin(t * 0.8) * 0.006;
    cam.position.y += Math.sin(t * 1.1 + 1) * 0.005;
    cam.updateMatrixWorld();
  }

  // t: seconds since the picture began (renderer null: only the pose, for the preload)
  draw(renderer, target, t, dt) {
    if (target && this.camera.aspect !== target.width / target.height) {
      this.camera.aspect = target.width / target.height;
      this.camera.updateProjectionMatrix();
    }
    const step = Math.min(dt, 0.05);
    this.setEmpty(false);
    this.ariaScreen.off(1);
    this.light.intensity = this._lightBase;
    this._grips(t);
    this._place(t, step);
    this._frame(t);
    this.organism.update(step);
    this.screens.update(step);
    if (!renderer) return;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  // The lab without them (line 8 looks in before they come): the divers, their torches and the
  // folder hidden (the torches' lights only turned to nothing, so no shader changes)
  setEmpty(empty) {
    for (const d of this.divers) {
      d.actor.root.visible = !empty;
      d.torch.group.visible = !empty;
      d.torch.light.intensity = empty ? 0 : TORCH.intensity;
    }
    if (empty) this.folder.group.visible = false;
  }

  // (for line 8: the lab's own things running with no one in it)
  idle(dt) {
    this.organism.update(dt);
    this.screens.update(dt);
  }

  dispose() {
    for (const d of this.divers || []) {
      d.unhook?.();
      d.actor.dispose();
      d.crew.dispose();
      for (const m of Object.values(d.suit.mats)) m.dispose();
    }
    this.scene?.traverse((o) => {
      if (o.isSkinnedMesh || !(o.isMesh || o.isPoints || o.isLine)) return;
      o.geometry?.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m?.map?.dispose();
        m?.dispose();
      }
    });
    this.scene?.clear();
    this.ready = false;
  }
}

function blank() {
  return { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(), pole: new THREE.Vector3(), curl: [0, 0, 0], thumb: [0, 0, 0] };
}

// A diver's torch, pointing along +z: a dark body, a steel head, a bright lens, its beam in the air
// and its light
function buildTorch() {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8e979e, roughness: 0.3, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.17, 12).rotateX(Math.PI / 2), dark);
  body.position.z = -0.06;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.06, 14).rotateX(Math.PI / 2), steel);
  head.position.z = 0.05;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.027, 14), new THREE.MeshBasicMaterial({ color: TORCH.colour, toneMapped: false }));
  lens.position.z = 0.081;
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(TORCH.radius, TORCH.beam, 20, 1, true).translate(0, -TORCH.beam / 2, 0).rotateX(-Math.PI / 2),
    beamMaterial()
  );
  beam.material.uniforms.uLength.value = TORCH.beam;
  beam.material.uniforms.uOpacity.value = TORCH.haze;
  beam.position.z = 0.08;
  beam.renderOrder = 6;
  group.add(body, head, lens, beam);
  const light = new THREE.SpotLight(TORCH.colour, TORCH.intensity, TORCH.distance, TORCH.angle, 0.6, 1.4);
  return { group, lens, beam, light };
}

// The research notes: a manila folder, open, its two pages printed (a canvas) with Voss's sticky note
// on the right one. In its own space: across is +x, up the page +y, the pages face +z
function buildFolder() {
  const group = new THREE.Group();
  const W = 0.44, H = 0.3;
  const cover = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, H + 0.015, 0.004), new THREE.MeshStandardMaterial({ color: 0xc9a45c, roughness: 0.8 }));
  cover.position.z = -0.004;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 700;
  drawPages(c.getContext('2d'), c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const pages = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  pages.position.z = 0.0005;
  group.add(cover, pages);
  return { group, centre: new THREE.Vector3() };
}

function drawPages(g, w, h) {
  const half = w / 2;
  g.fillStyle = '#efece3';
  g.fillRect(0, 0, w, h);
  // the spine's shadow
  const sp = g.createLinearGradient(half - 40, 0, half + 40, 0);
  sp.addColorStop(0, 'rgba(0,0,0,0)');
  sp.addColorStop(0.5, 'rgba(0,0,0,0.28)');
  sp.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sp;
  g.fillRect(half - 40, 0, 80, h);
  // the left page: typed
  g.fillStyle = '#5a5f66';
  g.font = '22px monospace';
  g.fillText(RESEARCH.head, 46, 70);
  g.fillStyle = '#1d2733';
  g.font = 'bold 46px monospace';
  g.fillText(RESEARCH.title, 46, 136);
  g.fillStyle = '#d9661f';
  g.fillRect(46, 156, 300, 6);
  g.fillStyle = '#2b333d';
  g.font = '23px monospace';
  RESEARCH.lines.forEach((line, i) => g.fillText(line, 46, 214 + i * 40));
  g.fillStyle = 'rgba(40,50,60,0.25)';
  for (let i = 0; i < 4; i++) g.fillRect(46, 520 + i * 30, 330 - (i % 2) * 90, 10);
  // the right page: a scan of the organism (rings and tendrils) and a rising chart
  const cx = half + 150, cy = 210;
  g.strokeStyle = '#3a8f7a';
  g.lineWidth = 3;
  for (let r = 30; r <= 120; r += 30) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = '#7a52c8';
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.quadraticCurveTo(cx + Math.cos(a + 0.6) * 70, cy + Math.sin(a + 0.6) * 70, cx + Math.cos(a) * 125, cy + Math.sin(a) * 125);
    g.stroke();
  }
  g.strokeStyle = '#1d2733';
  g.lineWidth = 2;
  g.strokeRect(half + 40, 380, 340, 200);
  g.strokeStyle = '#d9661f';
  g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i <= 14; i++) {
    const x = half + 50 + i * 23, y = 565 - Math.pow(i / 14, 1.6) * 160 - Math.sin(i * 1.7) * 8;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
  // his note, stuck on at an angle, handwritten
  g.save();
  g.translate(half + 330, 470);
  g.rotate(-0.12);
  g.fillStyle = '#ffd84a';
  g.shadowColor = 'rgba(0,0,0,0.3)';
  g.shadowBlur = 8;
  g.fillRect(-90, -70, 180, 140);
  g.shadowBlur = 0;
  g.fillStyle = '#20304a';
  g.font = 'italic 44px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  g.textAlign = 'center';
  g.fillText(RESEARCH.note, 0, 14);
  g.restore();
}

// ---------------------------------------------------------------------------------- line 8
// Where her power goes out (seconds since the shot began): the atrium (each of her screens going dark
// as its energy streams off to the lab), Level 1's control room, the lift, the lab's own screen, and
// the lab, lit. off: when that place's screen goes (it takes OFF seconds).
export const POWER = {
  places: [
    { name: 'atrium', from: 0 },
    { name: 'control', from: 1.9, off: 2.3 },
    { name: 'lift', from: 3.0, off: 3.4 },
    { name: 'labScreen', from: 4.0, off: 4.4 },
    { name: 'lab', from: 5.1 }
  ],
  // the atrium: from the lounge (by the lift) looking up past the big screen to the lab's doors on
  // the floor above. Her screens there: [marker, width, height, when it goes off]
  atrium: {
    eye: [[0.6, 1.75, 11.5], [0.5, 1.95, 10.6]], look: [[0, 7.2, -4], [0, 7.6, -6]], fov: 55,
    door: [0, 6.6, -17.0],
    screens: [['ARIA_M2', 1.5, 0.84, 0.1], ['ARIA_M3', 1.5, 0.84, 0.15], ['ARIA_M4', 1.5, 0.84, 0.2], ['ARIA_M10', 0.8, 0.45, 0.4],
      ['ARIA_M5', 1.5, 0.84, 0.6], ['ARIA_M6', 1.5, 0.84, 0.7], ['ARIA_M1', 4.2, 2.3, 1.1]],
    travel: 0.85
  },
  // the lab: her screen over the door (from by the tubes), then the room, lit (from the door end,
  // the tubes ahead); its light rising a little as the power comes in. Heights above the floor.
  lab: {
    screen: { eye: [0.6, 1.65, -21.0], look: [3.6, 2.2, -17.8], fov: 40 },
    lit: { eye: [[0.3, 1.7, -18.4], [0.2, 1.66, -19.5]], look: [0, 1.35, -25.5], fov: 50 },
    surge: 1.3
  },
  // Level 1's control room: a point on the floor in front of her wall monitor (where Level1 lays the
  // torch, TORCH_XZ), so the camera stands on the room's side of it
  controlFront: [1.2, -7.3],
  colour: 0xffd23a                 // her colour as she gives it (determined, gold)
};
const OFF = 0.5;

export class PowerShot {
  // conf: the confrontation (her face, rendered live, is what her screens show); lab: the LabShot (its
  // lab, loaded already)
  constructor(conf, lab) {
    this.conf = conf;
    this.labShot = lab;
    this.ready = false;
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 120);
    this.places = {};
  }

  async preload(renderer) {
    const face = this.conf.aria?.head?.texture;
    // (each level's model without its colliders, the COL_ meshes painted magenta, and without any
    // lights exported with it: each place is lit here)
    const load = (file) => createGLTFLoader().loadAsync('./assets/models/' + file).then((gltf) => {
      const cols = [];
      gltf.scene.traverse((o) => {
        const m = o.isMesh && (Array.isArray(o.material) ? o.material[0] : o.material);
        if (o.isLight || o.name.startsWith('COL_') || m?.name === 'col') cols.push(o);
      });
      for (const o of cols) o.removeFromParent();
      return gltf;
    });
    const [atrium, control, lift] = await Promise.all([load('l2-atrium.glb'), load('controlroom.glb'), load('lift.glb')]);
    // ---- the atrium: her screens at their markers, the energy's paths from each to the lab's doors
    {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const model = atrium.scene;
      scene.add(model);
      model.updateMatrixWorld(true);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8c949c, 0.8));
      const sun = new THREE.DirectionalLight(0xfaf6ee, 1.4);
      sun.position.set(4, 20, 6);
      sun.target.position.set(0, 0, -5);
      scene.add(sun, sun.target);
      const A = POWER.atrium, door = new THREE.Vector3(...A.door);
      const screens = [], streams = [];
      for (const [name, w, h, at] of A.screens) {
        const p = model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3());
        if (!p) continue;
        const s = ariaScreen(face, w, h);
        s.group.position.copy(p);
        if (name === 'ARIA_M1') s.group.lookAt(p.x, p.y, p.z + 1);
        else s.group.lookAt(0, p.y, 0);
        scene.add(s.group);
        screens.push({ ...s, at });
        const stream = energyStream(p, door, streams.length);
        scene.add(stream.group);
        streams.push({ ...stream, at: at + OFF * 0.6 });
      }
      this.places.atrium = { scene, screens, streams };
    }
    // ---- Level 1's control room: her wall monitor (the screen inside its bezel: the smaller of the
    // two names it has shipped under, as Level1 resolves it)
    {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const model = control.scene;
      scene.add(model);
      model.updateMatrixWorld(true);
      const found = [];
      model.traverse((o) => { if (o.isMesh && ['Monitor_wall_01', 'Sphere008'].includes(o.name.replace(/\./g, ''))) found.push(o); });
      const size = (o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length();
      const mesh = found.sort((a, b) => size(a) - size(b))[0];
      const place = { scene, screens: [] };
      if (mesh) {
        // which way it faces: toward the floor in front of it
        const box = new THREE.Box3().setFromObject(mesh);
        const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
        const n = new THREE.Vector3(POWER.controlFront[0] - c.x, 0, POWER.controlFront[1] - c.z).normalize();
        // (the screen has no UVs: her picture laid across it flat, as seen from in front)
        if (!mesh.geometry.attributes.uv) {
          const right = new THREE.Vector3().crossVectors(_up.set(0, 1, 0), n);
          const width = Math.abs(size.x * right.x) + Math.abs(size.z * right.z);
          const pos = mesh.geometry.attributes.position, uv = new Float32Array(pos.count * 2);
          for (let i = 0; i < pos.count; i++) {
            _a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).sub(c);
            uv[i * 2] = _a.dot(right) / width + 0.5;
            uv[i * 2 + 1] = _a.y / size.y + 0.5;
          }
          mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }
        const s = ariaScreen(face, 0, 0, mesh, false);
        place.screens.push({ ...s, at: POWER.places[1].off - POWER.places[1].from });
        place.eye = c.clone().addScaledVector(n, 3.0).add(_up.set(0, -0.2, 0));
        place.look = c.clone();
        // (the screen's own glow on the room, going with it)
        const glow = new THREE.PointLight(0x9fc4ff, 1.2, 7, 1.5);
        glow.position.copy(c).addScaledVector(n, 1.4);
        scene.add(glow);
        place.glow = glow;
        place.glowBase = 1.2;
      }
      scene.add(new THREE.HemisphereLight(0x9fb4d0, 0x202428, 0.3));
      this.places.control = place;
    }
    // ---- the lift: its screen on the cabin's wall (made as both levels make it)
    {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const model = lift.scene;
      scene.add(model);
      model.updateMatrixWorld(true);
      const { makeLiftScreen } = await import('../levels/liftCabin.js');
      const parts = makeLiftScreen(model, new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.6 }));
      const place = { scene, screens: [] };
      if (parts) {
        scene.add(parts.bezel);
        const s = ariaScreen(face, 0, 0, parts.screen);
        scene.add(parts.screen);
        place.screens.push({ ...s, at: POWER.places[2].off - POWER.places[2].from });
        const p = parts.screen.getWorldPosition(new THREE.Vector3());
        const n = new THREE.Vector3(0, 0, 1).transformDirection(parts.screen.matrixWorld).setY(0).normalize();
        place.eye = p.clone().addScaledVector(n, 1.35).add(_up.set(0, -0.25, 0)).addScaledVector(_left.crossVectors(n, _up.set(0, 1, 0)), 0.3);
        place.look = p.clone();
        const cabin = model.getObjectByName('ElevatorCabin');
        const light = new THREE.PointLight(0xfff2e0, 14, 7, 1.4);
        light.position.copy(cabin ? new THREE.Box3().setFromObject(cabin).getCenter(new THREE.Vector3()) : p).add(_up.set(0, 0.8, 0));
        scene.add(light);
      }
      scene.add(new THREE.HemisphereLight(0xdfe6ef, 0x303236, 0.9));
      this.places.lift = place;
    }
    // shaders now, and the textures onto the card a few at a time (so line 6 does not stutter)
    for (const p of Object.values(this.places)) {
      this._frame(p === this.places.atrium ? 'atrium' : p === this.places.control ? 'control' : 'lift', 0);
      if (renderer) {
        await renderer.compileAsync(p.scene, this.camera).catch(() => {});
        const textures = new Set();
        p.scene.traverse((o) => {
          for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
            for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
          }
        });
        for (const tex of textures) {
          renderer.initTexture(tex);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }
    this.ready = true;
  }

  _place(t) {
    let at = POWER.places[0];
    for (const p of POWER.places) if (t >= p.from) at = p;
    return at;
  }

  // The camera for a place (u: seconds into it)
  _frame(name, u) {
    const cam = this.camera;
    let fov = 50;
    if (name === 'atrium') {
      const A = POWER.atrium, k = ease(clamp(u / 1.9));
      const v = (pair) => _a.set(...pair[0]).lerp(_b.set(...pair[1]), k);
      cam.position.copy(v(A.eye));
      cam.lookAt(v(A.look));
      fov = A.fov;
    } else if (name === 'control' || name === 'lift') {
      const p = this.places[name];
      if (p.eye) {
        cam.position.copy(p.eye).lerp(p.look, 0.06 * clamp(u / 1.1));
        cam.lookAt(p.look);
      }
      fov = 42;
    } else {
      const L = POWER.lab, f = this.labShot.floor;
      if (name === 'labScreen') {
        cam.position.set(L.screen.eye[0], f + L.screen.eye[1], L.screen.eye[2]);
        cam.lookAt(L.screen.look[0], f + L.screen.look[1], L.screen.look[2]);
        fov = L.screen.fov;
      } else {
        const k = ease(clamp(u / 3));
        const [e0, e1] = L.lit.eye;
        cam.position.set(THREE.MathUtils.lerp(e0[0], e1[0], k), f + THREE.MathUtils.lerp(e0[1], e1[1], k), THREE.MathUtils.lerp(e0[2], e1[2], k));
        cam.lookAt(L.lit.look[0], f + L.lit.look[1], L.lit.look[2]);
        fov = L.lit.fov;
      }
    }
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  // t: seconds since the shot began
  draw(renderer, target, t, dt) {
    if (this.camera.aspect !== target.width / target.height) {
      this.camera.aspect = target.width / target.height;
      this.camera.updateProjectionMatrix();
    }
    const place = this._place(t), u = t - place.from;
    const offK = (at) => clamp((u - at) / OFF);
    // (her face on her screens, live)
    this.conf.aria?.head?.render(renderer);
    let scene;
    if (place.name === 'atrium') {
      const p = this.places.atrium;
      for (const s of p.screens) s.off(offK(s.at), t);
      for (const s of p.streams) s.update((u - s.at) / POWER.atrium.travel, t);
      scene = p.scene;
    } else if (place.name === 'control' || place.name === 'lift') {
      const p = this.places[place.name];
      for (const s of p.screens) s.off(offK(s.at), t);
      if (p.glow) p.glow.intensity = p.glowBase * (1 - offK(p.screens[0]?.at ?? 0));
      scene = p.scene;
    } else {
      const lab = this.labShot;
      lab.setEmpty(true);
      lab.idle(Math.min(dt, 0.05));
      lab.ariaScreen.off(place.name === 'labScreen' ? offK(place.off - place.from) : 1, t);
      // (the power coming in: its light lifting a little, and staying)
      lab.light.intensity = lab._lightBase * (place.name === 'lab' ? THREE.MathUtils.lerp(1, POWER.lab.surge, ease(clamp(u / 0.8))) : 1);
      scene = lab.scene;
    }
    this._frame(place.name, u);
    renderer.setRenderTarget(target);
    renderer.render(scene, this.camera);
  }

  dispose() {
    for (const p of Object.values(this.places)) {
      p.scene.traverse((o) => {
        if (!(o.isMesh || o.isPoints || o.isLine)) return;
        o.geometry?.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m) continue;
          for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
          m.dispose();
        }
      });
      p.scene.clear();
    }
    this.places = {};
    this.ready = false;
  }
}

// One of her screens: her face (rendered live) in dots, as AriaManager draws her (dot matrix,
// scanlines, a rolling band), over a black backing; off(k, time) switches it off as an old screen
// does (k 0..1: the picture squeezed to a bright line, the line to a dot, the dot gone). Either a
// plane (w x h) or, given a mesh, on that mesh in place (flip: its UVs run top-down, as glTF's do).
function ariaScreen(texture, w, h, mesh = null, flip = !!mesh) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uFace: { value: texture || null }, uOff: { value: 0 }, uTime: { value: 0 }, uFlip: { value: flip ? 1 : 0 },
      uColor: { value: new THREE.Color(POWER.colour) }, uGrid: { value: new THREE.Vector2(96, 54) }
    },
    vertexShader: /* glsl */`
      uniform float uFlip;
      varying vec2 vUv;
      void main() {
        vUv = vec2(uv.x, mix(uv.y, 1.0 - uv.y, uFlip));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uFace;
      uniform float uOff, uTime;
      uniform vec3 uColor;
      uniform vec2 uGrid;
      varying vec2 vUv;
      void main() {
        float sy = mix(1.0, 0.003, smoothstep(0.0, 0.45, uOff));
        float sx = mix(1.0, 0.003, smoothstep(0.4, 0.8, uOff));
        float fade = 1.0 - smoothstep(0.8, 1.0, uOff);
        vec2 c = (vUv - 0.5) / vec2(sx, sy) + 0.5;
        vec3 col = vec3(0.0);
        if (c.x >= 0.0 && c.x <= 1.0 && c.y >= 0.0 && c.y <= 1.0) {
          vec2 cell = floor(c * uGrid);
          float lum = dot(texture2D(uFace, (cell + 0.5) / uGrid).rgb, vec3(0.299, 0.587, 0.114));
          if (lum > 0.05) {
            lum = pow(lum, 0.7);
            vec2 local = fract(c * uGrid) - 0.5;
            float r = mix(0.22, 0.5, lum);
            float dotMask = smoothstep(r, r - 0.12, length(local));
            float scan = 1.0 - 0.5 * step(0.6, fract(c.y * 54.0 + uTime * 1.5));
            col = mix(uColor, vec3(1.0, 0.97, 0.85), smoothstep(0.5, 1.0, lum)) * dotMask * lum * scan * 1.9;
          }
          col *= 1.0 + 2.5 * smoothstep(0.1, 0.6, uOff);
        }
        // the bright line, then the dot, as it goes
        float line = (1.0 - smoothstep(0.0, sy * 0.5 + 0.004, abs(vUv.y - 0.5))) * (1.0 - smoothstep(sx * 0.5, sx * 0.5 + 0.01, abs(vUv.x - 0.5)));
        col += vec3(0.9, 0.95, 1.0) * line * smoothstep(0.2, 0.45, uOff) * 2.0;
        gl_FragColor = vec4(col * fade, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  });
  const backing = new THREE.MeshBasicMaterial({ color: 0x020304 });
  let group;
  if (mesh) {
    mesh.material = backing;
    const over = new THREE.Mesh(mesh.geometry, mat);
    over.renderOrder = 3;
    mesh.add(over);
    group = mesh;
  } else {
    group = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), backing);
    back.position.z = -0.01;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    face.renderOrder = 3;
    group.add(back, face);
  }
  return {
    group,
    off(k, time = 0) {
      mat.uniforms.uOff.value = k;
      mat.uniforms.uTime.value = time;
    }
  };
}

// Her energy leaving a screen for the lab's doors: a jagged line of light (a bright core in a soft
// glow) along an arc across the hall, a pulse running down it with a fading trail behind
function energyStream(from, to, seed) {
  const rand = (k) => {
    const x = Math.sin(seed * 91.7 + k * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 2.2 + rand(1) * 1.5, 0));
  const arc = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
  const pts = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const p = arc.getPoint(i / N);
    if (i > 0 && i < N) p.add(new THREE.Vector3(rand(i * 3) - 0.5, rand(i * 3 + 1) - 0.5, rand(i * 3 + 2) - 0.5).multiplyScalar(0.35));
    pts.push(p);
  }
  const path = new THREE.CatmullRomCurve3(pts);
  const make = (radius, strength) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uHead: { value: -1 }, uTime: { value: 0 }, uStrength: { value: strength }, uColor: { value: new THREE.Color(POWER.colour) }, uSeed: { value: seed } },
      vertexShader: /* glsl */`
        varying float vAlong;
        void main() {
          vAlong = uv.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uHead, uTime, uStrength, uSeed;
        uniform vec3 uColor;
        varying float vAlong;
        void main() {
          float d = uHead - vAlong;
          if (d < 0.0) discard;
          float k = exp(-d * 5.0) + 0.12 * exp(-d * 0.8);
          float flick = 0.65 + 0.35 * sin(uTime * 47.0 + vAlong * 70.0 + uSeed * 9.0);
          vec3 hot = mix(uColor, vec3(1.0), exp(-d * 18.0));
          gl_FragColor = vec4(hot * k * flick * uStrength, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, 80, radius, 6, false), m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return mesh;
  };
  const core = make(0.035, 2.4), glow = make(0.22, 0.35);
  const group = new THREE.Group();
  group.add(glow, core);
  return {
    group,
    // k: how far the pulse has run (0 at the screen, 1 at the doors; below 0, not yet)
    update(k, time) {
      for (const m of [core.material, glow.material]) {
        m.uniforms.uHead.value = k;
        m.uniforms.uTime.value = time;
      }
      group.visible = k > 0;
    }
  };
}
