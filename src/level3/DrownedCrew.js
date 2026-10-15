import * as THREE from 'three';
import { createGLTFLoader } from '../core/loaders.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { deckUniforms, MURK_GLSL } from './DeckMaterials.js';

// Four of Voss's crewmates, drowned, floating in the flooded engine room behind the door's window
// (Okafor, Lindqvist, Navarro and Park, from the lab's subject list). Built from the same rigged
// model as Voss: each is posed by holding one of his animation clips at a moment (arms adrift,
// limbs hanging) and turned to float face down, on its back or on its side, then drifts slowly.
// Their skin is pale and grey-green, their uniforms dark and stained, and they sit in the same
// murky water as the room (the further from the window, the more they fade into it).
//
// One drifts close behind the glass and, once Voss is standing at the window, slowly comes up
// against it (approach()).

const MODEL = './assets/models/human_scientist.glb';
const SCALE = 1.8 / 1.394;            // the model is authored at 1.39 m; the crew are life size

// who, their uniform's colour, the clip and moment held, and how they lie in the water
const CREW = [
  { name: 'Okafor', coat: 0xc9c6b8, clip: 'Idle', at: 0.2, rot: [0.35, 0.15, 0.08], glasses: false },
  { name: 'Lindqvist', coat: 0x3b4a5e, clip: 'Fall', at: 0.4, rot: [Math.PI / 2 - 0.15, 2.4, 0.3], glasses: true },
  { name: 'Navarro', coat: 0x5a4a32, clip: 'Jump_Up', at: 0.25, rot: [-1.05, -0.8, -0.2], glasses: false },
  { name: 'Park', coat: 0x46523f, clip: 'Land', at: 0.1, rot: [0.4, 1.2, 1.35], glasses: false }
];

function drowned(source, kind, coat) {
  const m = source.clone();
  m.map = null;
  if (kind === 'skin') m.color.set(0xb4c0ae);
  else if (kind === 'coat') m.color.set(coat);
  else if (kind === 'hair') m.color.set(0x1a1b1c);
  else m.color.multiplyScalar(0.45);
  m.roughness = kind === 'skin' ? 0.55 : 0.9;
  m.metalness = 0;
  if (m.emissive) m.emissive.set(0x000000);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, deckUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDeckPos;\nvarying vec3 vDeckNrm;')
      // after skinning: the posed position, in the world
      .replace('#include <project_vertex>', `vDeckPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vDeckNrm = normalize(mat3(modelMatrix) * objectNormal);
        #include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDeckPos;
        varying vec3 vDeckNrm;
        uniform float uTime;
        uniform vec3 uWindow;
        uniform vec3 uMurkColor;
        uniform float uMurkDensity;
        ${MURK_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // blotches: water damage and staining, mottled over the skin and the cloth
          vec3 q = vDeckPos * vec3(6.3, 7.1, 5.7);
          float n = sin(q.x) * sin(q.y + 1.7) * sin(q.z + 0.4) + 0.5 * sin(q.x * 2.3 + q.z * 1.9);
          diffuseColor.rgb *= 1.0 - 0.35 * smoothstep(0.1, 0.9, n);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))), 0.4);
        }`)
      .replace('#include <opaque_fragment>', `
        outgoingLight = deckMurk(outgoingLight, vDeckPos, normalize(vDeckNrm));
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'drowned-' + kind;
  return m;
}

const KIND = { M_Head: 'skin', M_Hands: 'skin', M_Coat: 'coat', M_HairCards: 'hair' };

export class DrownedCrew {
  // spots: Vector3[] (where each floats); scene: where they go
  constructor(scene, spots) {
    this.scene = scene;
    this.bodies = [];
    this.time = 0;
    this.closeness = 0;            // 0..1: the body nearest the glass coming up against it
    this.ready = createGLTFLoader().loadAsync(MODEL).then((gltf) => {
      CREW.forEach((c, i) => {
        if (!spots[i]) return;
        const model = cloneSkinned(gltf.scene);
        model.scale.setScalar(SCALE);
        model.position.y = -0.95;                    // the body's middle at the pivot
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.frustumCulled = false;
          if (/Glasses/.test(o.name) && !c.glasses) o.visible = false;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const out = mats.map((m) => drowned(m, KIND[m.name] || 'cloth', c.coat));
          o.material = Array.isArray(o.material) ? out : out[0];
        });
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
