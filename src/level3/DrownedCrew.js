import * as THREE from 'three';
import { createGLTFLoader } from '../core/loaders.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { deckUniforms, MURK_GLSL } from './DeckMaterials.js';
import { loadCrewFile } from '../entities/CrewMember.js';

// Four of Voss's crewmates, drowned, floating in the flooded engine room behind the door's window:
// Dr. Kessler, Lindqvist, Navarro and Park, each their own model (the same as in Flashback 3, so the
// player knows them), with their own clothes and hair. Each is posed by holding one of Voss's
// animation clips at a moment (they share his skeleton: arms adrift, limbs hanging) and turned to
// float face down, on its back or on its side, then drifts slowly. The one nearest the glass is Dr.
// Kessler, a staff ID badge clipped flat to her coat, reading DR. E. KESSLER.
//
// They have been in the water a long time. Their skin is rotten (rot(), below: grey-green and waxy,
// with dark blotches, a green marbling of veins and sunken, bruised eyes), their eyes milky, their
// mouths slack, their clothes dark and stained. They sit in the same murky water as the room (the
// further from the window, the more they fade into it).
//
// One drifts close behind the glass and, once Voss is standing at the window, slowly comes up
// against it (approach()).

const CLIPS = './assets/models/human_scientist.glb';     // Voss's clips, for their poses
const SCALE = 1.8 / 1.394;            // the models are authored at 1.39 m; the crew are life size

// who, the clip and moment held, and how they lie in the water
const CREW = [
  { name: 'kessler', clip: 'Idle', at: 0.2, rot: [0.35, 0.15, 0.08], badge: true, jaw: 0.3, lids: 0.35 },
  { name: 'lindqvist', clip: 'Fall', at: 0.4, rot: [Math.PI / 2 - 0.15, 2.4, 0.3], jaw: 0.5, lids: 0.15 },
  { name: 'navarro', clip: 'Jump_Up', at: 0.25, rot: [-1.05, -0.8, -0.2], jaw: 0.4, lids: 0.5 },
  { name: 'park', clip: 'Land', at: 0.1, rot: [0.4, 1.2, 1.35], jaw: 0.6, lids: 0.25 }
];

// What each kind of surface turns into, on top of its own texture (GLSL: t its colour, returns the
// new one). p: the point on the body, in the model's own units (it moves with the body; a head is
// about 0.2 tall), so the marks stay where they are as it drifts.
const NOISE = /* glsl */`
  float rotN(vec3 p) {
    return sin(p.x + 1.7 * sin(p.y * 0.8 + 0.5)) * sin(p.y * 1.1 + 1.4 * sin(p.z * 0.9 + 2.0)) * sin(p.z * 1.3 + 1.5 * sin(p.x * 0.7));
  }`;
const LOOKS = {
  skin: /* glsl */`
    float lum = dot(t, vec3(0.3, 0.6, 0.1));
    // waxy grey-green, whatever colour it was: a trace of their own skin stays
    vec3 c = mix(t, vec3(0.46, 0.5, 0.36) * (0.35 + 1.1 * lum), 0.72);
    // blotches: dark, purple-brown, where the blood settled; green and yellow where it is going
    float big = rotN(p * 42.0) + 0.5 * rotN(p * 95.0 + 3.0);
    c = mix(c, vec3(0.17, 0.1, 0.11), 0.72 * smoothstep(0.12, 0.62, big));
    float green = rotN(p * 58.0 + 9.0);
    c = mix(c, vec3(0.3, 0.36, 0.13), 0.55 * smoothstep(0.05, 0.5, green));
    // the marbling: a thin net of dark green veins
    float vein = abs(rotN(p * 120.0 + 5.0));
    c = mix(c, vec3(0.08, 0.14, 0.09), 0.6 * (1.0 - smoothstep(0.015, 0.07, vein)));
    // the flesh going: pale, sodden patches, and pits
    float pit = rotN(p * 210.0 + 1.0);
    c = mix(c, vec3(0.62, 0.62, 0.5), 0.35 * smoothstep(0.42, 0.62, pit));
    c *= 1.0 - 0.45 * smoothstep(0.5, 0.75, -pit);
    // sunken eyes: dark and bruised round each
    float eye = min(distance(p, uEyeL), distance(p, uEyeR));
    c = mix(c, vec3(0.09, 0.05, 0.07), 0.85 * smoothstep(0.05, 0.02, eye));
    return c;`,
  // milky, the colour gone out of them
  eye: /* glsl */`
    float lum = dot(t, vec3(0.3, 0.6, 0.1));
    return mix(vec3(0.55, 0.58, 0.5), vec3(0.72, 0.74, 0.66), lum) * (0.6 + 0.4 * lum);`,
  mouth: 'return t * vec3(0.3, 0.26, 0.24);',
  // wet, matted, darker
  hair: 'return mix(t, vec3(dot(t, vec3(0.33))), 0.25) * 0.55;',
  // their own clothes, soaked and stained
  cloth: /* glsl */`
    vec3 c = mix(t, vec3(dot(t, vec3(0.33))), 0.45) * 0.55;
    float stain = rotN(p * 16.0) + 0.5 * rotN(p * 37.0 + 4.0);
    c = mix(c, vec3(0.1, 0.1, 0.07), 0.6 * smoothstep(0.0, 0.7, stain));
    return c;`
};

function drowned(source, kind, eyes) {
  const m = source.clone();
  m.roughness = kind === 'skin' ? 0.42 : kind === 'cloth' ? 0.9 : 0.6;
  m.metalness = 0;
  if (m.emissive) m.emissive.set(0x000000);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, deckUniforms);
    shader.uniforms.uEyeL = { value: eyes[0] };
    shader.uniforms.uEyeR = { value: eyes[1] };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDeckPos;\nvarying vec3 vDeckNrm;\nvarying vec3 vRotPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRotPos = position;')
      // after skinning: the posed position, in the world
      .replace('#include <project_vertex>', `vDeckPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vDeckNrm = normalize(mat3(modelMatrix) * objectNormal);
        #include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDeckPos;
        varying vec3 vDeckNrm;
        varying vec3 vRotPos;
        uniform float uTime;
        uniform vec3 uWindow;
        uniform vec3 uMurkColor;
        uniform float uMurkDensity;
        uniform vec3 uEyeL;
        uniform vec3 uEyeR;
        ${MURK_GLSL}
        ${NOISE}
        vec3 rot(vec3 t, vec3 p) { ${LOOKS[kind]} }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = rot(diffuseColor.rgb, vRotPos);`)
      .replace('#include <opaque_fragment>', `
        outgoingLight = deckMurk(outgoingLight, vDeckPos, normalize(vDeckNrm));
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'drowned-' + kind;
  return m;
}

const KIND = { M_Head: 'skin', M_Hands: 'skin', M_Eye: 'eye', M_Teeth: 'mouth', M_MouthInner: 'mouth', M_HairCards: 'hair', M_Hair: 'hair' };
const kindOf = (m) => KIND[m.name.split('.')[0]] || 'cloth';

// Where the eyes are, in the model's own units (for the sunken skin round them)
function eyesOf(model) {
  const box = new THREE.Box3();
  model.traverse((o) => {
    if (!o.isMesh || !/^M_Eye/.test(o.material?.name || '')) return;
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox);
  });
  const c = box.getCenter(new THREE.Vector3());
  const half = (box.max.x - box.min.x) / 4;
  return [new THREE.Vector3(c.x - half, c.y, c.z), new THREE.Vector3(c.x + half, c.y, c.z)];
}

export class DrownedCrew {
  // spots: Vector3[] (where each floats); scene: where they go
  constructor(scene, spots) {
    this.scene = scene;
    this.bodies = [];
    this.time = 0;
    this.closeness = 0;            // 0..1: the body nearest the glass coming up against it
    this.ready = Promise.all([createGLTFLoader().loadAsync(CLIPS), ...CREW.map((c) => loadCrewFile(c.name))]).then(([gltf, ...files]) => {
      this.gltf = gltf;            // (the dive suit on the rack is built from the same model)
      CREW.forEach((c, i) => {
        if (!spots[i]) return;
        const model = cloneSkinned(files[i].scene);
        model.scale.setScalar(SCALE);
        model.position.y = -0.95;                    // the body's middle at the pivot
        const eyes = eyesOf(model);
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.frustumCulled = false;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const out = mats.map((m) => drowned(m, kindOf(m), eyes));
          o.material = Array.isArray(o.material) ? out : out[0];
          // the mouth slack, the lids half down
          const d = o.morphTargetDictionary;
          if (d) {
            if (d.jaw_open !== undefined) o.morphTargetInfluences[d.jaw_open] = c.jaw;
            if (d.blink !== undefined) o.morphTargetInfluences[d.blink] = c.lids;
          }
        });
        // (before the pose, while the bones are in their rest positions) a badge
        if (c.badge) {
          model.updateMatrixWorld(true);
          let chest = null;
          model.traverse((o) => { if (!chest && o.isBone && /Spine2/.test(o.name)) chest = o; });
          this._addBadge(model, chest);
        }
        // hold one moment of a clip: a pose, not an animation
        const clip = gltf.animations.find((a) => a.name === c.clip);
        if (clip) {
          const mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(clip).play();
          mixer.update(c.at);
        }
        // the head drops forward, limp
        model.traverse((o) => { if (/Head1/.test(o.name)) o.rotation.x += 0.45; });
        const pivot = new THREE.Group();
        pivot.name = 'Drowned_' + c.name;
        pivot.add(model);
        pivot.position.copy(spots[i]);
        pivot.rotation.set(c.rot[0], c.rot[1], c.rot[2], 'YXZ');
        scene.add(pivot);
        this.bodies.push({ pivot, base: spots[i].clone(), rot: pivot.rotation.clone(), phase: i * 1.9 + 0.3 });
      });
    }).catch((e) => console.warn('The drowned crew failed to load.', e));
  }

  // A staff ID clipped flat to the coat's chest: a white card with rounded corners, a red band,
  // a photo square, the name and the title, on a thin backing with a small clip at the top
  _addBadge(model, chest) {
    if (!chest) return;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 320;
    const g = c.getContext('2d');
    const round = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    round(4, 4, 504, 312, 34);
    g.fillStyle = '#eef1f0';
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = '#b3172a';
    g.fillRect(0, 0, 512, 70);
    g.restore();
    g.fillStyle = '#ffffff';
    g.font = 'bold 30px Arial, sans-serif';
    g.textAlign = 'left';
    g.fillText('HALCYON-9  STATION STAFF', 34, 47);
    // the photo square (faded)
    g.fillStyle = '#9aa3a6';
    g.fillRect(34, 98, 120, 150);
    g.fillStyle = '#7d878b';
    g.beginPath();
    g.arc(94, 150, 30, 0, Math.PI * 2);
    g.fill();
    g.fillRect(54, 190, 80, 58);
    g.fillStyle = '#16212b';
    g.font = 'bold 54px Arial, sans-serif';
    g.fillText('DR. E.', 180, 150);
    g.fillText('KESSLER', 180, 210);
    g.fillStyle = '#4a565c';
    g.font = '28px Arial, sans-serif';
    g.fillText('LEAD SCIENTIST', 180, 258);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const W = 0.1, H = 0.0625;                    // model units: about 13 x 8 cm on her
    const badge = new THREE.Group();
    const card = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({
      map: tex, alphaTest: 0.5, roughness: 0.45, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22
    }));
    card.position.z = 0.0022;
    const back = new THREE.Mesh(new THREE.BoxGeometry(W * 0.97, H * 0.95, 0.003), new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.6 }));
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.006), new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.3, metalness: 0.8 }));
    clip.position.set(0, H / 2 + 0.004, 0.001);
    badge.add(back, card, clip);
    // flat on the coat, just left of centre at chest height (the coat's front is at z 0.06 there)
    badge.position.copy(model.localToWorld(new THREE.Vector3(0.065, 1.03, 0.066)));
    badge.rotation.x = -0.08;                     // the chest leans back a little
    badge.scale.setScalar(SCALE);
    chest.attach(badge);
  }

  // Voss is at the window: the nearest body drifts up against the glass (0..1 over a few seconds)
  approach(dt, near) {
    this.closeness = THREE.MathUtils.clamp(this.closeness + (near ? dt / 6 : -dt / 12), 0, 1);
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const p = b.phase;
      b.pivot.position.set(
        b.base.x + Math.sin(t * 0.21 + p) * 0.08,
        b.base.y + Math.sin(t * 0.33 + p) * 0.1,
        b.base.z + Math.cos(t * 0.17 + p) * 0.08 + (i === 0 ? this.closeness * 0.55 : 0)
      );
      b.pivot.rotation.set(b.rot.x + Math.sin(t * 0.27 + p) * 0.06, b.rot.y + Math.sin(t * 0.11 + p) * 0.12,
        b.rot.z + Math.cos(t * 0.19 + p) * 0.05, 'YXZ');
    }
  }

  dispose() {
    for (const b of this.bodies) {
      b.pivot.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
      b.pivot.removeFromParent();
    }
    this.bodies.length = 0;
  }
}
