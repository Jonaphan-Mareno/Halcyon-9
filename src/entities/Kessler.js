import * as THREE from 'three';
import { createGLTFLoader } from '../core/loaders.js';
import { makeToonRamp, toonFrom } from './Player.js';

// Dr. Elena Kessler (kessler.glb, built by Blender/scripts/build_kessler_from_voss.py): made from
// Voss's model so they share the game's painted look. Shorter, blond hair swept back into a low bun,
// a long white coat over white clothes and boots, a small white earpiece over her right ear.
//
// Her skeleton and clips are Voss's (Idle and Walk are in her file). Her face has the same morph
// targets as his (jaw_open, mouth_wide, blink, ...) for FaceRig. Only the inside of her mouth has
// vertex colours (its shade toward the throat).
//
// Body parts are separate meshes (Head, Hands, Coat, Shirt, Pants, Hair, Bun, EarPiece).

const MODEL = './assets/models/kessler.glb';
// Her model is in the same units as Voss's (his 1.394 is 1.8 m in the game); she is about 1.69 m
const SCALE = 1.8 / 1.394;

let cached = null;           // the loaded file, kept: the flashback can play more than once

export class Kessler {
  constructor() {
    this.ready = false;
    this.root = null;          // add this to a scene; faces -z like the Player's body
    this.clips = [];
    this.parts = {};
  }

  async load() {
    cached ||= createGLTFLoader().loadAsync(MODEL);
    const gltf = await cached;
    const ramp = makeToonRamp();
    const materials = new Map();
    this.root = new THREE.Group();
    const model = gltf.scene;
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
      while (p.parent && p.parent !== model && !['Head', 'Hands', 'Coat', 'Shirt', 'Pants', 'Hair', 'Bun', 'EarPiece'].includes(p.name)) p = p.parent;
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
