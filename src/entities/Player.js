import * as THREE from 'three';
import { createGLTFLoader, createFBXLoader } from '../core/loaders.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FaceWear } from './FaceWear.js';
import { ArmIK } from './ArmIK.js';

// Voss, the scientist (human_scientist.glb, built in Blender from cvg.blend; human_scientist_v2.glb
// adds his face's morph targets and the wound, see scripts/build-voss-v2.mjs).
//
// One file holds the rig, the body parts and every clip:
//   Idle, Walk, Run, Jump, Jump_Up, Fall, Land  - the full body, all in place
//   Crouch                                      - a pose, layered additively over Idle/Walk
//   FP_Idle, FP_Walk, FP_Run, FP_Jump           - the arms only, posed for the first-person view
// A Mixamo export of the same rig, Sprint.fbx, replaces the glb's Run (see _mixamoClip)
// Body parts are separate meshes so a view can show just some of them:
//   Coat_Torso, Sleeves, Hands, Shirt, Pants, Head, Hair, Glasses, Wound
// Wound is the gash on the back of his skull (the Cycle 9 Voss is a reconstruction): shown by
// default, setPartVisible('Wound', false) for the living Voss (the hair over it grows back: the
// cards there, material M_HairPatch, show exactly when the wound does not). The Head's morph targets (his
// face: jaw_open, blink, ...) rest at 0 in play; FaceRig drives them in the video logs.
//
// Two copies of the rig are used. The body lives inside the player controller's
// body group and is seen in third person. The view model is a second copy that
// follows the camera with only the sleeves and hands showing, the usual
// first-person setup: the arms follow the view up and down and never sit inside
// the near plane.

const MODEL = './assets/models/human_scientist_v2.glb';
const RUN_FBX = './assets/models/Sprint.fbx';

// The model is authored at 1.39 m; the game's Voss is 1.8 m
const MODEL_HEIGHT = 1.394;

// Between the eyes, in model space (glTF axes, before the half turn below)
const EYE = new THREE.Vector3(0, 1.300, 0.051);

// How fast a planted foot travels at model scale: game speed / (this * scale) = clip speed.
// Measured from each clip: the planted foot's backward speed while it is on the ground.
const WALK_STRIDE_SPEED = 1.356;
const RUN_STRIDE_SPEED = 4.2;          // Sprint.fbx
const GLB_RUN_STRIDE_SPEED = 2.463;    // the glb's Run (the fallback), and FP_Run, made to match it
// The run plays while the run key is held and the body is moving at least this fast (m/s)
const RUN_MIN_SPEED = 4.0;
// Where each gait's cycle starts relative to the other (left foot about to plant), so
// switching between walk and run keeps the feet in step
const GAIT_PHASE = { Walk: 0.32, Run: 0.3 };
const GLB_RUN_PHASE = 0.0;

const FIRST_PERSON_PARTS = ['Sleeves', 'Hands'];

// How far the head turns from the body before it stops (radians), and the share of it the neck takes
const LOOK_YAW_LIMIT = THREE.MathUtils.degToRad(70);
const LOOK_UP_LIMIT = THREE.MathUtils.degToRad(40);
const LOOK_DOWN_LIMIT = THREE.MathUtils.degToRad(45);
const NECK_SHARE = 0.4;
const LOOK_SMOOTHING = 10;

const FADE = 0.2;

// A click with nothing in hand: the right arm reaches out and back, Minecraft style
const REACH_TIME = 0.28;                          // seconds, out and back
const REACH_FORWARD = 0.24;                       // first person: the arm pushes forward this far (m)
const REACH_IN = 0.1;                             // first person: and turns a little toward the middle (radians)
const REACH_RAISE = 1.1;                          // third person: the arm lifts forward (radians)

// The first-person arms sit a little back and down from where the model's eyes put them, so less
// of the forearms covers the screen (view space, metres: +z is back, toward the player)
const FP_ARMS_OFFSET = new THREE.Vector3(0, -0.05, 0.05);

// The playable Voss (Cycle 9) looks as worn as the Cycle 8 Voss of the last video log: his face
// painted at FaceWear's condition level 4 (bags, pallor, cuts, bruise, dried blood) and his lids
// as heavy as that log's 'resigned' face
const WORN_LEVEL = 4;
const WORN_LIDS = 0.8;

// The team's toon banding (level 1's shader used it before the habitat restyle): three hard steps of light
export function makeToonRamp() {
  const data = new Uint8Array([70, 70, 70, 110, 190, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Inside a face's mouth (gums, lining, teeth): shaded by vertex colours toward the throat, and
// without the rim (at their grazing angles it speckled the teeth and gums cyan)
const MOUTH_PARTS = ['M_MouthInner', 'M_Teeth'];

// Toon material with the level shader's faint cyan rim. `overrides` lets other users of
// the look carry extra settings (the bedrooms add their vertex colours). Emissive is
// carried too, so glowing things (the bedroom light panels) keep their glow
export function toonFrom(src, ramp, overrides = {}) {
  const mouth = MOUTH_PARTS.includes(src.name);
  if (mouth) overrides = { vertexColors: true, ...overrides };
  const mat = new THREE.MeshToonMaterial({
    map: src.map || null,
    color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
    gradientMap: ramp,
    emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
    emissiveIntensity: src.emissiveIntensity || 1,
    emissiveMap: src.emissiveMap || null,
    transparent: src.transparent,
    opacity: src.opacity,
    alphaTest: src.alphaTest,
    side: THREE.DoubleSide,
    depthWrite: !src.transparent,
    ...overrides
  });
  mat.name = src.name;
  // Hair cards are cut out (MASK in the glb); keep them out of the transparent pass
  // (M_HairPatch: the cards over Voss's wound, see setPartVisible)
  if (src.name === 'M_HairCards' || src.name === 'M_HairPatch') {
    mat.transparent = false;
    mat.alphaTest = 0.5;
    mat.depthWrite = true;
  }
  if (mouth) return mat;
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

// The wound on the back of Voss's head, or the hair that covers its place (on any copy of him)
export function showWound(root, visible) {
  root?.traverse((o) => {
    if (o.name === 'Wound') o.visible = visible;
    if (o.isMesh && o.material?.name === 'M_HairPatch') o.visible = !visible;
  });
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

  // Loops unless `once`; a one-shot holds its last frame until something else plays.
  // `phaseFrom`: start at the same point in the cycle as the clip being replaced
  // (offsets per clip in GAIT_PHASE), so walk <-> run keeps the feet in step.
  play(name, { fade = FADE, once = false, restart = false, phaseFrom = null } = {}) {
    const next = this.actions[name];
    if (!next) return null;
    if (next === this.current && !restart) return next;
    const prev = this.current;
    // Still fading out from a moment ago: pick it back up instead of restarting it,
    // so quick back-and-forth switches never leave the weights short of 1
    const fadingOut = next.isRunning() && next.getEffectiveWeight() > 0;
    if (restart || !fadingOut) next.reset();
    else next.stopFading();
    if (phaseFrom && prev && !fadingOut) {
      const from = prev.getClip().name;
      if (from in phaseFrom && name in phaseFrom) {
        const phase = prev.time / prev.getClip().duration - phaseFrom[from] + phaseFrom[name];
        next.time = (((phase % 1) + 1) % 1) * next.getClip().duration;
      }
    }
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
    this.runStride = RUN_STRIDE_SPEED;
    this.gaitPhase = GAIT_PHASE;

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
    this._reachT = REACH_TIME;          // time into the current reach; finished when >= REACH_TIME
    this._reachUndo = [];               // the arm moves of the last frame, undone before the mixer runs
    this._qReach = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
    this._reachMove = new THREE.Vector3();
  }

  async load() {
    const [gltf, runFbx] = await Promise.all([createGLTFLoader().loadAsync(MODEL), this._loadFBX(RUN_FBX)]);
    const ramp = makeToonRamp();
    const materials = new Map();
    const toon = (m) => {
      if (!materials.has(m)) materials.set(m, toonFrom(m, ramp));
      return materials.get(m);
    };

    // Clips by name; anything missing is reported once so a bad export is obvious
    const clips = gltf.animations;
    this.clips = clips;
    const wanted = ['Idle', 'Walk', 'Run', 'Jump', 'Jump_Up', 'Fall', 'Land', 'Crouch', 'FP_Idle', 'FP_Walk', 'FP_Run', 'FP_Jump'];
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
    showWound(bodyRoot, true);           // Cycle 9: the wound shows (and the hair over it is gone)
    this._wearFace(bodyRoot);
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
    fpRoot.position.copy(this._eyeOffset).negate().add(FP_ARMS_OFFSET);
    const fpParts = this._partsOf(fpRoot);
    for (const [name, objs] of Object.entries(fpParts)) {
      for (const o of objs) o.visible = FIRST_PERSON_PARTS.includes(name);
    }
    this.viewModel.add(fpRoot);

    // The Mixamo run. Without Sprint.fbx the glb's own Run stays, with its own stride and phase.
    const run = this._mixamoClip(runFbx, 'Run', RUN_FBX);
    if (!run) {
      this.runStride = GLB_RUN_STRIDE_SPEED;
      this.gaitPhase = { ...GAIT_PHASE, Run: GLB_RUN_PHASE };
    }
    const bodyClips = clips.filter((c) => !c.name.startsWith('FP_') && c.name !== 'Crouch' && !(run && c.name === 'Run'));
    this.anim = new Animator(bodyRoot, [...bodyClips, run].filter(Boolean));
    // Crouch is a pose made additive against its first frame (the rest pose), held at its
    // last frame; its weight sinks Voss into a crouch on top of whatever else is playing
    const crouch = clips.find((c) => c.name === 'Crouch');
    if (crouch) {
      const additive = THREE.AnimationUtils.makeClipAdditive(crouch.clone(), 0);
      this.crouchAction = this.anim.mixer.clipAction(additive);
      this.crouchAction.setLoop(THREE.LoopOnce, 1);
      this.crouchAction.clampWhenFinished = true;
      this.crouchAction.play();
      this.crouchAction.time = additive.duration;
      this.crouchAction.paused = true;
      this.crouchAction.setEffectiveWeight(0);
    }
    this.fpAnim = new Animator(fpRoot, clips.filter((c) => c.name.startsWith('FP_')));
    this.anim.play('Idle', { fade: 0 });
    this.fpAnim.play('FP_Idle', { fade: 0 });
    this.rightArm = this._bone(bodyRoot, /R_UpperArm/);
    this.fpRightArm = this._bone(fpRoot, /R_UpperArm/);
    this.fpRightShoulder = this._bone(fpRoot, /R_Clavicle/);
    // the hands on something he holds (see hold)
    const turn = (bone, q) => this._turnWorld(bone, q);
    this._arms = {
      third: { root: bodyRoot, R: new ArmIK(bodyRoot, 'R', turn), L: new ArmIK(bodyRoot, 'L', turn) },
      first: { root: fpRoot, R: new ArmIK(fpRoot, 'R', turn), L: new ArmIK(fpRoot, 'L', turn) }
    };

    this.ready = true;
    this.setMode(this.mode);
    return this;
  }

  // The worn face on this body only (its own copies of the head materials). The clean face texture
  // stays on this.headTexture for the living Voss (the early logs, the flashback)
  _wearFace(root) {
    root.traverse((o) => {
      if (!this.headTexture && o.isMesh && o.material?.name === 'M_Head') this.headTexture = o.material.map;
    });
    if (!this.headTexture?.image) return;
    this.faceWear = new FaceWear(this.headTexture);
    const worn = this.faceWear.texture(WORN_LEVEL);
    const copies = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.material?.name;
      if (name === 'M_Head' || name === 'M_LipSeal') {
        if (!copies.has(o.material)) {
          const m = o.material.clone();
          m.onBeforeCompile = o.material.onBeforeCompile;     // (the rim light; clone() leaves it out)
          m.map = worn;
          copies.set(o.material, m);
        }
        o.material = copies.get(o.material);
      }
      const i = o.morphTargetDictionary?.eyes_tired;
      if (i !== undefined) o.morphTargetInfluences[i] = WORN_LIDS;
    });
  }

  // An animation-only FBX, or null (with a warning) if it is missing or broken
  async _loadFBX(url) {
    try {
      return await createFBXLoader().loadAsync(url);
    } catch (e) {
      console.warn('Player: could not load', url, e);
      return null;
    }
  }

  // The Mixamo exports animate Voss's own rig, so the bone tracks bind as they are. The hips'
  // motion sits on the FBX's top node instead, mixed with the FBX's axis turn; it is rebuilt here
  // as the rig's root joint track, in place: horizontal travel dropped, the pelvis centred over
  // the origin, the vertical bob kept. Any turn over the cycle and the average sideways lean come
  // out too, so the cycle loops on the spot facing straight ahead. The FBX's own scene and meshes
  // are thrown away, never added to the game.
  _mixamoClip(fbx, name, url) {
    if (!fbx) return null;
    try {
      const src = fbx.animations[0];
      const pelvis = this._bone(this.bodyRoot, /Pelvis/);
      const rootJoint = pelvis?.parent;
      const fbxRoot = rootJoint && fbx.getObjectByName(rootJoint.name);
      if (!src || !fbxRoot) throw new Error('not an animation of the scientist rig');

      // The root joint's pose in the FBX's world at every keyframe
      const times = src.tracks.reduce((a, t) => (t.times.length > a.length ? t.times : a), []);
      const mixer = new THREE.AnimationMixer(fbx);
      const action = mixer.clipAction(src).play();
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      const e = new THREE.Euler(0, 0, 0, 'YXZ');
      const angles = [], heights = [];
      for (const t of times) {
        action.time = t;
        mixer.update(0);
        fbx.updateMatrixWorld(true);
        fbxRoot.matrixWorld.decompose(p, q, s);
        e.setFromQuaternion(q, 'YXZ');
        const prev = angles[angles.length - 1];
        const yaw = prev ? prev[1] + Math.atan2(Math.sin(e.y - prev[1]), Math.cos(e.y - prev[1])) : e.y;
        angles.push([e.x, yaw, e.z]);
        heights.push(p.y / s.y); // the FBX world is in centimetres, the rig in metres
      }
      mixer.uncacheRoot(fbx);

      const n = times.length;
      const span = times[n - 1] - times[0] || 1;
      const turn = angles[n - 1][1] - angles[0][1];
      const yaws = angles.map((a, i) => a[1] - (turn * (times[i] - times[0])) / span);
      const meanYaw = yaws.reduce((a, b) => a + b, 0) / n;
      const meanLean = angles.reduce((a, b) => a + b[2], 0) / n;
      const quats = new Float32Array(n * 4);
      const centre = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        q.setFromEuler(e.set(angles[i][0], yaws[i] - meanYaw, angles[i][2] - meanLean, 'YXZ'));
        q.toArray(quats, i * 4);
        centre.add(p.copy(pelvis.position).applyQuaternion(q));
      }
      centre.divideScalar(n);
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        positions[i * 3] = pelvis.position.x - centre.x;
        positions[i * 3 + 1] = heights[i];
        positions[i * 3 + 2] = pelvis.position.z - centre.z;
      }

      const bones = new Set();
      this.bodyRoot.traverse((o) => { if (o.isBone) bones.add(o.name); });
      const tracks = src.tracks.filter((t) => {
        const [node, prop] = t.name.split('.');
        return prop === 'quaternion' && bones.has(node) && node !== rootJoint.name;
      });
      tracks.push(
        new THREE.QuaternionKeyframeTrack(rootJoint.name + '.quaternion', times, quats),
        new THREE.VectorKeyframeTrack(rootJoint.name + '.position', times, positions)
      );
      return new THREE.AnimationClip(name, src.duration, tracks);
    } catch (err) {
      console.warn('Player: could not use the animation in', url, err);
      return null;
    } finally {
      fbx.traverse((o) => {
        o.geometry?.dispose();
        o.skeleton?.dispose();
        for (const m of [].concat(o.material || [])) {
          for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
          m.dispose();
        }
      });
    }
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
    const names = ['Coat_Torso', 'Sleeves', 'Hands', 'Shirt', 'Pants', 'Head', 'Hair', 'Glasses', 'Wound'];
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
    if (name === 'Wound') showWound(this.bodyRoot, visible);
  }

  setMode(mode) {
    this.mode = mode;
    if (!this.ready) return;
    const third = mode !== 'first';
    this.body.visible = third;
    this.viewModel.visible = !third;
  }

  // A click with nothing in hand: reach out with the right hand (restarts if already reaching)
  reach() {
    if (this.ready) this._reachT = 0;
  }

  // Hands on something he holds, for this frame (call after update, every frame it is held):
  // right and left are grips for ArmIK (either may be null), on whichever body the camera shows.
  // Undone, like the reach, before the next update's clips
  hold(right, left) {
    if (!this.ready) return;
    const arms = this._arms[this.mode === 'first' ? 'first' : 'third'];
    arms.root.updateWorldMatrix(true, true);
    if (right) arms.R.hold(right);
    if (left) arms.L.hold(left);
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
  // crouch: 0 standing .. 1 fully crouched (eased by the controller).
  // running: the run key is held (and Voss is not crouched).
  update(dt, { grounded, speed, verticalSpeed, camera, bodyYaw, crouch = 0, running: runKey = false }) {
    if (!this.ready) return;
    // Undo last frame's head turn first: the mixer must only ever see the clips' own pose,
    // otherwise a crossfade blends the old turn back in and the next turn adds to it
    if (this._neckBase) {
      this.neck.quaternion.copy(this._neckBase);
      this.head.quaternion.copy(this._headBase);
    }
    for (let i = this._reachUndo.length - 1; i >= 0; i--) {     // (newest first: a bone may have moved twice)
      const [bone, q, pos] = this._reachUndo[i];
      bone.quaternion.copy(q);
      bone.position.copy(pos);
    }
    this._reachUndo.length = 0;
    const moving = speed > 0.4;
    const running = runKey && speed > RUN_MIN_SPEED && crouch < 0.5;
    const gait = !moving ? 'Idle' : running && this.anim.has('Run') ? 'Run' : 'Walk';

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
      this.anim.play(gait, { fade: moving ? 0.18 : 0.25, phaseFrom: this.gaitPhase });
    }
    this.crouchAction?.setEffectiveWeight(THREE.MathUtils.clamp(crouch, 0, 1));

    // Walk and run speeds follow the ground speed so the feet keep (roughly) planted
    const walkRate = THREE.MathUtils.clamp(speed / (WALK_STRIDE_SPEED * this.scale), 0.6, 2.4);
    const runRate = THREE.MathUtils.clamp(speed / (this.runStride * this.scale), 0.8, 1.8);
    const fpRunRate = THREE.MathUtils.clamp(speed / (GLB_RUN_STRIDE_SPEED * this.scale), 0.8, 1.8);
    if (this.anim.actions.Walk) this.anim.actions.Walk.timeScale = walkRate;
    if (this.anim.actions.Run) this.anim.actions.Run.timeScale = runRate;

    // ---------- first-person arms ----------
    const fast = gait === 'Run';
    const fpGait = fast && this.fpAnim.has('FP_Run') ? 'FP_Run' : moving ? 'FP_Walk' : 'FP_Idle';
    if (grounded && !this.fpAnim.is('FP_Jump')) {
      this.fpAnim.play(fpGait, { fade: 0.25 });
    } else if (grounded && this.fpAnim.finished('FP_Jump')) {
      this.fpAnim.play(fpGait, { fade: 0.2 });
    }
    if (this.fpAnim.actions.FP_Walk) this.fpAnim.actions.FP_Walk.timeScale = walkRate;
    if (this.fpAnim.actions.FP_Run) this.fpAnim.actions.FP_Run.timeScale = fpRunRate;

    this.anim.update(dt);
    this.fpAnim.update(dt);

    // ---------- head look, applied on top of whatever the clip did ----------
    this._applyLook(dt, camera, bodyYaw);

    // ---------- view model follows the camera ----------
    camera.updateMatrixWorld();
    this.viewModel.position.copy(camera.position);
    this.viewModel.quaternion.copy(camera.quaternion);
    this._applyReach(dt, camera);
  }

  // The reach, on top of whatever the clips did: the first-person arm pushes forward from the
  // shoulder (the shoulder itself is never on screen), the third-person arm lifts forward. Both
  // ease out and back over REACH_TIME.
  _applyReach(dt, camera) {
    if (this._reachT >= REACH_TIME) return;
    this._reachT += dt;
    const e = Math.sin(Math.PI * Math.min(this._reachT / REACH_TIME, 1));
    if (this.fpRightShoulder) {
      const shoulder = this.fpRightShoulder;
      this._reachUndo.push([shoulder, shoulder.quaternion.clone(), shoulder.position.clone()]);
      const target = shoulder.getWorldPosition(this._axis)
        .add(this._reachMove.set(0, 0, -e * REACH_FORWARD).applyQuaternion(camera.quaternion));
      shoulder.position.copy(shoulder.parent.worldToLocal(target));
      shoulder.updateWorldMatrix(false, true);
    }
    if (this.fpRightArm) {
      this._turnWorld(this.fpRightArm, this._qReach.setFromAxisAngle(this._axis.set(0, 1, 0).applyQuaternion(camera.quaternion), e * REACH_IN));
    }
    if (this.rightArm) {
      this.body.getWorldQuaternion(this._qBody);
      this._turnWorld(this.rightArm, this._qReach.setFromAxisAngle(this._axis.set(1, 0, 0).applyQuaternion(this._qBody), e * REACH_RAISE));
    }
  }

  // Rotate a bone about its own pivot by a world-space rotation; undone at the start of the next update
  _turnWorld(bone, rotation) {
    this._reachUndo.push([bone, bone.quaternion.clone(), bone.position.clone()]);
    bone.parent.getWorldQuaternion(this._qParent);
    const pInv = this._qParent.clone().invert();
    bone.quaternion.premultiply(this._qParent).premultiply(rotation).premultiply(pInv);
    bone.updateWorldMatrix(false, true);
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

    // Remember the clips' pose so the next frame can start from it (see update)
    this._neckBase = (this._neckBase || new THREE.Quaternion()).copy(this.neck.quaternion);
    this._headBase = (this._headBase || new THREE.Quaternion()).copy(this.head.quaternion);

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
