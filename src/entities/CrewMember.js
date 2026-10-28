import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createGLTFLoader } from '../core/loaders.js';
import { makeToonRamp, toonFrom } from './Player.js';

// Voss's crewmates, each in a file of their own on Voss's skeleton, with his clips (Idle and Walk
// are in each file) and his face's morph targets (jaw_open, mouth_wide, blink, ...) for FaceRig:
//
//   kessler    kessler.glb, Blender/scripts/build_kessler_from_female.py (her own body)
//   lindqvist  lindqvist.glb, Blender/scripts/build_crew_head.py: Kessler's body in a slate-blue
//              coat and a white shirt; silver hair to the collar, grey-green eyes, clear glasses
//   navarro    navarro.glb, the same script: Voss's body in a brown coat; short black hair, a full
//              black beard, blue eyes
//   park       park.glb, the same script: Voss's body in a green coat; close-cropped black hair,
//              dark brown skin and eyes
//
// The heads come from Sketchfab models (CC-BY-4.0, see CREDITS.md). Body parts are separate meshes
// (Head, Eyes, Hands, Body, and Glasses and Hair where the character has them). The inside of the
// mouth is coloured per vertex (COLOR_0); Navarro's hair and beard are cut-out cards (M_HairCards).

export const CREW_MODELS = {
  kessler: './assets/models/kessler.glb',
  lindqvist: './assets/models/lindqvist.glb',
  navarro: './assets/models/navarro.glb',
  park: './assets/models/park.glb'
};
const PARTS = ['Head', 'Eyes', 'Hands', 'Body', 'Glasses', 'Hair'];
// The models are in the same units as Voss's (his 1.394 is 1.8 m in the game)
const SCALE = 1.8 / 1.394;

const cache = new Map();     // file -> the loaded file, kept: a flashback can play more than once

export class CrewMember {
  constructor(name) {
    this.name = name;
    this.ready = false;
    this.root = null;          // add this to a scene; faces -z like the Player's body
    this.clips = [];
    this.parts = {};
  }

  async load() {
    const file = CREW_MODELS[this.name];
    if (!file) throw new Error(`CrewMember: no model for "${this.name}"`);
    if (!cache.has(file)) cache.set(file, createGLTFLoader().loadAsync(file));
    const gltf = await cache.get(file);
    const ramp = makeToonRamp();
    const materials = new Map();
    this.root = new THREE.Group();
    // (a clone: two of the same crewmate can be on screen, and the cached file stays untouched)
    const model = cloneSkinned(gltf.scene);
    model.scale.setScalar(SCALE);
    model.rotation.set(0, Math.PI, 0);            // the model faces +z; the game's characters face -z
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (!materials.has(o.material)) {
        materials.set(o.material, toonFrom(o.material, ramp, { vertexColors: !!o.geometry.attributes.color }));
      }
      o.material = materials.get(o.material);
      o.frustumCulled = false;                      // (skinned bounds come from the bind pose)
      o.castShadow = false;
      o.receiveShadow = false;
      let p = o;
      while (p.parent && p.parent !== model && !PARTS.includes(p.name)) p = p.parent;
      (this.parts[p.name] ||= []).push(o);
    });
    this.root.add(model);
    this.model = model;
    this.clips = gltf.animations;
    this._materials = [...materials.values()];
    this.ready = true;
    return this;
  }

  bone(pattern) {
    let found = null;
    this.model?.traverse((o) => {
      if (!found && o.isBone && pattern.test(o.name)) found = o;
    });
    return found;
  }

  setPartVisible(name, visible) {
    for (const o of this.parts[name] || []) o.visible = visible;
  }

  // (the file stays cached; the materials made from it go)
  dispose() {
    for (const m of this._materials || []) m.dispose();
    this.root?.removeFromParent();
    this.ready = false;
  }
}
