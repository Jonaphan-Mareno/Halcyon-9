import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Voss, the scientist (human_scientist.glb, built in Blender from cvg.blend).
//
// One file holds the rig, the body parts and every clip:
//   Idle, Walk, Jump, Jump_Up, Fall, Land  - the full body, all in place
//   FP_Idle, FP_Walk, FP_Jump             - the arms only, posed for the first-person view
// Body parts are separate meshes so a view can show just some of them:
//   Coat_Torso, Sleeves, Hands, Shirt, Pants, Head, Hair, Glasses
//
// Two copies of the rig are used. The body lives inside the player controller's
// body group and is seen in third person. The view model is a second copy that
// follows the camera with only the sleeves and hands showing, the usual
// first-person setup: the arms follow the view up and down and never sit inside
// the near plane.

const MODEL = './assets/models/human_scientist.glb';

// The model is authored at 1.39 m; the game's Voss is 1.8 m
const MODEL_HEIGHT = 1.394;

// Between the eyes, in model space (glTF axes, before the half turn below)
const EYE = new THREE.Vector3(0, 1.300, 0.051);

// Walk clip: a planted foot travels 1.356 m/s at model scale
const WALK_STRIDE_SPEED = 1.356;

const FIRST_PERSON_PARTS = ['Sleeves', 'Hands'];

// How far the head turns from the body before it stops (radians), and the share of it the neck takes
const LOOK_YAW_LIMIT = THREE.MathUtils.degToRad(70);
const LOOK_UP_LIMIT = THREE.MathUtils.degToRad(40);
const LOOK_DOWN_LIMIT = THREE.MathUtils.degToRad(45);
const NECK_SHARE = 0.4;
const LOOK_SMOOTHING = 10;

const FADE = 0.2;

// Same banding as the level shader (Shaders.js): three hard steps of light
function makeToonRamp() {
  const data = new Uint8Array([70, 70, 70, 110, 190, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Toon material with the level shader's faint cyan rim
function toonFrom(src, ramp) {
  const mat = new THREE.MeshToonMaterial({
    map: src.map || null,
    color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
    gradientMap: ramp,
    transparent: src.transparent,
    opacity: src.opacity,
    alphaTest: src.alphaTest,
    side: THREE.DoubleSide,
    depthWrite: !src.transparent
  });
  mat.name = src.name;
  // Hair cards are cut out (MASK in the glb); keep them out of the transparent pass
  if (src.name === 'M_HairCards') {
    mat.transparent = false;
    mat.alphaTest = 0.5;
    mat.depthWrite = true;
  }
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float rimF = smoothstep(0.6, 1.0, 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0));
      outgoingLight += vec3(0.1, 0.9, 1.0) * rimF * 0.15;
      #include <opaque_fragment>`
    );
  };
  return mat;
}

// Plays clips on one copy of the rig with crossfades
class Animator {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const clip of clips) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
  }

  has(name) {
    return !!this.actions[name];
  }

  // Loops unless `once`; a one-shot holds its last frame until something else plays
  play(name, { fade = FADE, once = false, restart = false } = {}) {
    const next = this.actions[name];
    if (!next) return null;
    if (next === this.current && !restart) return next;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (this.current && this.current !== next) {
      next.crossFadeFrom(this.current, fade, false);
    }
    next.play();
    this.current = next;
    return next;
  }

  is(name) {
    return this.current === this.actions[name];
  }

  finished(name) {
    const a = this.actions[name];
    return !!a && this.current === a && a.time >= a.getClip().duration - 1e-3;
  }

  update(dt) {
    this.mixer.update(dt);
  }
}

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.ready = false;
    this.scale = 1.8 / MODEL_HEIGHT;

    // 'first': only the hands, from the view model. 'third': the whole body.
    this.mode = 'first';

    this.body = new THREE.Group();      // goes inside the controller's body group
    this.viewModel = new THREE.Group(); // follows the camera
    this.viewModel.visible = false;
    scene.add(this.viewModel);

    // Body state (set each frame by the controller)
    this.state = 'idle';
    this._airTime = 0;
    this._wasGrounded = true;
    this._landTimer = 0;

    // Smoothed head look, relative to the body (radians)
    this.lookYaw = 0;
    this.lookPitch = 0;

    this._q = new THREE.Quaternion();
    this._qParent = new THREE.Quaternion();
    this._qYaw = new THREE.Quaternion();
    this._qPitch = new THREE.Quaternion();
    this._qBody = new THREE.Quaternion();
    this._axisY = new THREE.Vector3(0, 1, 0);
    this._right = new THREE.Vector3();
    this._eyeOffset = new THREE.Vector3();
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(MODEL);
    const ramp = makeToonRamp();
    const materials = new Map();
    const toon = (m) => {
      if (!materials.has(m)) materials.set(m, toonFrom(m, ramp));
      return materials.get(m);
    };

    // Clips by name; anything missing is reported once so a bad export is obvious
    const clips = gltf.animations;
    const wanted = ['Idle', 'Walk', 'Jump', 'Jump_Up', 'Fall', 'Land', 'FP_Idle', 'FP_Walk', 'FP_Jump'];
    const missing = wanted.filter((n) => !clips.some((c) => c.name === n));
    if (missing.length) console.warn('Player: clips missing from', MODEL, missing);

    // Third-person body
    const bodyRoot = gltf.scene;
    this._prepare(bodyRoot, toon, { castShadow: true });
    bodyRoot.scale.setScalar(this.scale);
    bodyRoot.rotation.set(0, Math.PI, 0); // the model faces +z; the controller's body faces -z
    this.body.add(bodyRoot);
    this.bodyRoot = bodyRoot;
    this.parts = this._partsOf(bodyRoot);
    this.neck = this._bone(bodyRoot, /Neck1/);
    this.head = this._bone(bodyRoot, /Head1/);
    if (!this.neck || !this.head) console.warn('Player: Neck1/Head1 bones not found; head look is off');

    // First-person view model: same rig, only the arms showing
    const fpRoot = cloneSkinned(gltf.scene);
    this._prepare(fpRoot, toon, { castShadow: false });
    fpRoot.scale.setScalar(this.scale);
    fpRoot.rotation.set(0, Math.PI, 0); // set all three: the clone carries this turn as (-pi, 0, -pi)
    // Put the model's eyes on the camera
    this._eyeOffset.copy(EYE).applyAxisAngle(this._axisY, Math.PI).multiplyScalar(this.scale);
    fpRoot.position.copy(this._eyeOffset).negate();
    const fpParts = this._partsOf(fpRoot);
    for (const [name, objs] of Object.entries(fpParts)) {
      for (const o of objs) o.visible = FIRST_PERSON_PARTS.includes(name);
    }
    this.viewModel.add(fpRoot);

    this.anim = new Animator(bodyRoot, clips.filter((c) => !c.name.startsWith('FP_')));
    this.fpAnim = new Animator(fpRoot, clips.filter((c) => c.name.startsWith('FP_')));
    this.anim.play('Idle', { fade: 0 });
    this.fpAnim.play('FP_Idle', { fade: 0 });

    this.ready = true;
    this.setMode(this.mode);
    return this;
  }

  _prepare(root, toon, { castShadow }) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map(toon) : toon(o.material);
      // Skinned bounds come from the bind pose, which the animated arms leave behind
      o.frustumCulled = false;
      o.castShadow = castShadow;
      o.receiveShadow = false;
    });
  }

  // Meshes grouped by body part. A part with two materials loads as a group of meshes.
  _partsOf(root) {
    const names = ['Coat_Torso', 'Sleeves', 'Hands', 'Shirt', 'Pants', 'Head', 'Hair', 'Glasses'];
    const parts = {};
    root.traverse((o) => {
      if (!o.isMesh) return;
      let p = o;
      while (p && !names.includes(p.name)) p = p.parent;
      const key = p ? p.name : o.name;
      (parts[key] = parts[key] || []).push(o);
    });
    const unknown = Object.keys(parts).filter((k) => !names.includes(k));
    if (unknown.length) console.warn('Player: unexpected meshes in', MODEL, unknown);
    return parts;
  }

  _bone(root, pattern) {
    let found = null;
    root.traverse((o) => {
      if (!found && o.isBone && pattern.test(o.name)) found = o;
    });
    return found;
  }

  // Show or hide body parts on the third-person body (e.g. hide the head for a close camera)
  setPartVisible(name, visible) {
    for (const o of this.parts?.[name] || []) o.visible = visible;
  }

  setMode(mode) {
    this.mode = mode;
    if (!this.ready) return;
    const third = mode !== 'first';
    this.body.visible = third;
    this.viewModel.visible = !third;
  }

  // A jump has just started (the controller pushed the body upward)
  jumped() {
    if (!this.ready) return;
    this._airTime = 0;
    this.state = 'jump';
    this.anim.play('Jump_Up', { once: true, fade: 0.08, restart: true });
    this.fpAnim.play('FP_Jump', { once: true, fade: 0.08, restart: true });
  }

  // Per frame, after the controller has moved the body and placed the camera.
  // speed: horizontal ground speed (m/s). camera: the game camera. bodyYaw: body facing.
  update(dt, { grounded, speed, verticalSpeed, camera, bodyYaw }) {
    if (!this.ready) return;
    const moving = speed > 0.4;

    // ---------- third-person body: idle / walk / jump / fall / land ----------
    if (!grounded) this._airTime += dt;
    if (grounded && !this._wasGrounded) {
      // Landed: absorb it unless it was only a tiny drop off a step
      if (this._airTime > 0.18) {
        this.state = 'land';
        this._landTimer = this.anim.has('Land') ? 0.3 : 0;
        this.anim.play('Land', { once: true, fade: 0.06, restart: true });
      } else {
        this.state = 'ground';
      }
      this._airTime = 0;
    }
    this._wasGrounded = grounded;

    if (!grounded) {
      const rising = this.state === 'jump' && verticalSpeed > 0 && !this.anim.finished('Jump_Up');
      // Walking off a ledge: fall once properly airborne
      if (!rising && (this.state === 'jump' || this._airTime > 0.15)) {
        if (!this.anim.is('Fall')) this.anim.play('Fall', { fade: 0.18 });
        this.state = this.state === 'jump' ? 'jump' : 'fall';
      }
    } else if (this.state === 'land' && this._landTimer > 0) {
      this._landTimer -= dt;
      if (moving && this._landTimer < 0.18) this._landTimer = 0; // moving off quickly: blend straight into the walk
    } else {
      this.state = 'ground';
      this.anim.play(moving ? 'Walk' : 'Idle', { fade: moving ? 0.15 : 0.25 });
    }

    // Walk speed follows the ground speed so the feet keep (roughly) planted
    const walk = this.anim.actions.Walk;
    const strideSpeed = WALK_STRIDE_SPEED * this.scale;
    if (walk) walk.timeScale = THREE.MathUtils.clamp(speed / strideSpeed, 0.6, 2.4);

    // ---------- first-person arms ----------
    if (grounded && !this.fpAnim.is('FP_Jump')) {
      this.fpAnim.play(moving ? 'FP_Walk' : 'FP_Idle', { fade: 0.25 });
    } else if (grounded && this.fpAnim.finished('FP_Jump')) {
      this.fpAnim.play(moving ? 'FP_Walk' : 'FP_Idle', { fade: 0.2 });
    }
    const fpWalk = this.fpAnim.actions.FP_Walk;
    if (fpWalk) fpWalk.timeScale = THREE.MathUtils.clamp(speed / strideSpeed, 0.6, 2.4);

    this.anim.update(dt);
    this.fpAnim.update(dt);

    // ---------- head look, applied on top of whatever the clip did ----------
    this._applyLook(dt, camera, bodyYaw);

    // ---------- view model follows the camera ----------
    camera.updateMatrixWorld();
    this.viewModel.position.copy(camera.position);
    this.viewModel.quaternion.copy(camera.quaternion);
  }

  _applyLook(dt, camera, bodyYaw) {
    if (!this.neck || !this.head) return;
    let yaw = camera.rotation.y - bodyYaw;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    // Looking back over the shoulder past the limit: return to centre instead of snapping across
    const targetYaw = Math.abs(yaw) > LOOK_YAW_LIMIT + 0.6 ? 0 : THREE.MathUtils.clamp(yaw, -LOOK_YAW_LIMIT, LOOK_YAW_LIMIT);
    const targetPitch = THREE.MathUtils.clamp(camera.rotation.x, -LOOK_DOWN_LIMIT, LOOK_UP_LIMIT);
    const k = 1 - Math.exp(-LOOK_SMOOTHING * dt);
    this.lookYaw += (targetYaw - this.lookYaw) * k;
    this.lookPitch += (targetPitch - this.lookPitch) * k;

    this.body.updateWorldMatrix(true, true);
    // The body's right side in world space: the axis to nod around
    this.body.getWorldQuaternion(this._qBody);
    this._right.set(1, 0, 0).applyQuaternion(this._qBody);
    this._turn(this.neck, this.lookYaw * NECK_SHARE, this.lookPitch * NECK_SHARE);
    this._turn(this.head, this.lookYaw * (1 - NECK_SHARE), this.lookPitch * (1 - NECK_SHARE));
  }

  // Rotate a bone about its own pivot by a world-space yaw and pitch, after its parent has moved
  _turn(bone, yaw, pitch) {
    bone.parent.getWorldQuaternion(this._qParent);
    this._qYaw.setFromAxisAngle(this._axisY, yaw);
    this._qPitch.setFromAxisAngle(this._right, pitch);
    // world rotation R = yaw * pitch; local q' = P^-1 * R * P * q
    this._q.copy(this._qYaw).multiply(this._qPitch);
    const pInv = this._qParent.clone().invert();
    bone.quaternion.premultiply(this._qParent).premultiply(this._q).premultiply(pInv);
    bone.updateWorldMatrix(false, true);
  }
}
