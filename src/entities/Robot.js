import * as THREE from 'three';
import { Drone } from './Drone.js';
import { createGLTFLoader } from '../core/loaders.js';
import { withHubLighting } from '../graphics/HubMaterials.js';

// A hostile robot that extends the Drone class behaviour. Uses the Robot.glb model from
// public/assets/models. Robots spawn alongside the garden drones in the atrium.
//
// The GLB is loaded once and shared; each robot instance clones the scene graph so
// multiple robots can coexist without re-loading. The model's parts are named A1..A9:
// node A6 (mesh Circle.008) is the head lamp - it glows red from the moment the robot
// spawns until it freezes or shatters, which is the danger signal.

const MODEL_URL = './assets/models/Robot.glb';

let sharedTemplate = null;
let sharedLoadPromise = null;

async function loadRobotTemplate() {
  if (sharedTemplate) return sharedTemplate;
  if (sharedLoadPromise) return sharedLoadPromise;
  sharedLoadPromise = (async () => {
    const gltf = await createGLTFLoader().loadAsync(MODEL_URL);
    sharedTemplate = gltf.scene;
    sharedTemplate.updateMatrixWorld(true);
    // Collect animatable clips if the model has any
    sharedTemplate._clips = gltf.animations || [];
    return sharedTemplate;
  })();
  return sharedLoadPromise;
}

// Scale the robot down to roughly drone-size (the GLB model may be human-scale)
const ROBOT_SCALE = 0.5;
const TARGET_HEIGHT = 0.9;  // metres tall after scaling (about the size of a garden drone)

export class Robot extends Drone {
  constructor(scene, start) {
    super(scene, start);
    this.group.name = 'Robot';
    this._mixer = null;
    this._ready = false;
    this._onReadyCallbacks = [];
    this._loadModel(scene);
  }

  async _loadModel(scene) {
    try {
      const template = await loadRobotTemplate();
      if (this.state === 'dead') return; // removed before load finished

      // Clone the template for this instance
      const model = template.clone();
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.geometry = child.geometry.clone();
        }
      });

      // Scale to drone-size (the Robot.glb may be human-scale, so scale down)
      const box = new THREE.Box3().setFromObject(model);
      const modelHeight = box.max.y - box.min.y;
      if (modelHeight > 0) {
        const s = (TARGET_HEIGHT / modelHeight) * ROBOT_SCALE;
        model.scale.setScalar(s);
      }

      // Centre the model on the group origin, feet at the origin. box2 is already in scaled
      // units, so the half-height must NOT be divided by the model's scale again.
      const box2 = new THREE.Box3().setFromObject(model);
      const centre = box2.getCenter(new THREE.Vector3());
      model.position.sub(centre);
      model.position.y += (box2.max.y - box2.min.y) * 0.5;

      // The head lamp (node A6 / mesh Circle.008) is the danger light and the lock-on eye
      this._findAlarmLamp(model);

      // Collect any rotating parts as 'blades'
      this.blades = [];
      model.traverse((child) => {
        if (child.isMesh && /rotor|propeller|blade|spin|fan/i.test(child.name)) {
          this.blades.push(child);
        }
      });

      // Ice block for the frozen state: sized to fully enclose the scaled robot. The model has
      // no parent yet, so this box is already in group units, feet at the group origin.
      const finalBox = new THREE.Box3().setFromObject(model);
      const size = finalBox.getSize(new THREE.Vector3());
      const iceCentre = finalBox.getCenter(new THREE.Vector3());
      const pad = 0.35; // extra clearance on each side so the ice visibly wraps the robot
      const iceGeo = new THREE.BoxGeometry(size.x + pad * 2, size.y + pad * 2, size.z + pad * 2);
      const iceMat = new THREE.MeshStandardMaterial({
        color: 0xbfe8ff, roughness: 0.1, metalness: 0.1,
        transparent: true, opacity: 0.55, depthWrite: false
      });
      this.ice = new THREE.Mesh(iceGeo, iceMat);
      this.ice.position.copy(iceCentre);
      this.ice.visible = false;
      this.ice.renderOrder = 3;
      this.group.add(this.ice);

      // Animation mixer if the model has clips
      if (template._clips && template._clips.length > 0) {
        this._mixer = new THREE.AnimationMixer(model);
        this._action = this._mixer.clipAction(template._clips[0]);
        this._action.play();
      }

      this.group.add(model);
      this._model = model;
      this._ready = true;
      this._alarm(true);                 // it spawned: the lamp goes red
      for (const cb of this._onReadyCallbacks) cb();
      this._onReadyCallbacks.length = 0;
    } catch (err) {
      console.warn('Robot: failed to load Robot.glb, using fallback box.', err);
      this._buildFallback();
      this._ready = true;
      for (const cb of this._onReadyCallbacks) cb();
      this._onReadyCallbacks.length = 0;
    }
  }

  // The danger lamp: node A6, whose mesh is Circle.008 (the loader sanitises it to Circle008).
  // It is fixed to the head, so unlike the drone's stalk eye it does not twitch. If a re-export
  // ever renames it, fall back to whatever sounds like a light.
  _findAlarmLamp(model) {
    let lamp = model.getObjectByName('A6');
    if (!lamp || !lamp.isMesh) {
      lamp = null;
      model.traverse((c) => {
        if (lamp || !c.isMesh) return;
        if (/^(Circle\.?008)$/i.test(c.name) || /eye|sensor|visor|lamp|light|dome/i.test(c.name)) lamp = c;
      });
    }
    this.eyeMount = null;                    // no twitching: the lamp sits in the head
    this.eyeMat = lamp && lamp.isMesh ? lamp.material : null;
    this._lamp = lamp || null;
  }

  // The lamp: only strobes red during the telegraph (about to dive); otherwise it keeps its
  // authored colour so the robot looks normal until it attacks.
  _alarm(strobe) {
    const m = this.eyeMat;
    if (!m) return;
    if (strobe) {
      if (m.emissive) {
        m.emissive.setRGB(2.6, 0.08, 0.04);
        m.emissiveIntensity = 4 + Math.sin(this.time * 25) * 2;
      }
      m.color.setRGB(0.4, 0.03, 0.02);
    } else {
      // restore the authored material: clear emissive and let the original colour show
      if (m.emissive) {
        m.emissive.setRGB(0, 0, 0);
        m.emissiveIntensity = 1;
      }
    }
  }

  // Fallback visual if the GLB fails to load: a simple box robot with no lamp
  _buildFallback() {
    const body = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x667788, roughness: 0.4, metalness: 0.7 }));
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.4), body);
    box.position.y = 0.45;
    this.group.add(box);
    this.bodyMat = body;
    this.eyeMat = null;
    this.eyeMount = null;
  }

  // Wet look: darken the robot's body materials (the lamp keeps its own colour)
  _applyWetLook() {
    if (!this._model) return;
    this._model.traverse((child) => {
      if (child.isMesh && child.material && child !== this._lamp) {
        const m = child.material;
        if (m.color) {
          m.color.setScalar(1 - 0.4 * this.wet);
        }
        if (m.roughness !== undefined) {
          m.roughness = Math.max(0.05, m.roughness - 0.3 * this.wet);
        }
      }
    });
  }

  // The lamp only strobes during the telegraph; otherwise the authored material shows.
  update(ctx) {
    if (this._mixer) this._mixer.update(ctx.dt);
    super.update(ctx);
    if (this.eyeMat) this._alarm(this.state === 'telegraph');
  }

  freeze() {
    const froze = super.freeze();
    if (froze && this.eyeMat) {
      // dark out the lamp when frozen
      if (this.eyeMat.emissive) {
        this.eyeMat.emissive.setRGB(0, 0, 0);
        this.eyeMat.emissiveIntensity = 1;
      }
    }
    return froze;
  }

  // Remove from scene and clean up
  remove() {
    if (this.eyeMat && this.eyeMat.emissive) {
      this.eyeMat.emissive.setRGB(0, 0, 0);
      this.eyeMat.emissiveIntensity = 1;
    }
    super.remove();
    if (this._mixer) this._mixer.stopAllAction();
  }
}

// Preload the robot model so the first spawn is instant
Robot.preload = loadRobotTemplate;
