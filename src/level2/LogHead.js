import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FaceRig } from '../entities/FaceRig.js';
import { FaceWear, CONDITION } from '../entities/FaceWear.js';
import { showWound } from '../entities/Player.js';

// A live, talking head on a video log's handheld screen (Readables): head and shoulders, filmed
// at arm's length, lit like the room it was recorded in, with handheld shake and tape noise that
// get worse with every cycle. Voss's logs use it until real recordings exist (a recording wins).
//
// The character is a copy of one already loaded (SkeletonUtils.clone: the meshes and textures are
// shared, nothing is downloaded again), playing its Idle clip, with a FaceRig on its head. Voss's
// copy also gets his condition for the log (FaceWear: a worn copy of his face texture on cloned
// head materials; the gameplay Voss is never touched) and his wound shown or not.
//
// Drawing: the reader is a DOM panel, and the game has one WebGL context. A few times a second
// the head is drawn into a corner of the game's own canvas and copied straight into the reader's
// small 2D canvas (drawImage of the WebGL canvas, in the same frame, before the game draws its
// frame over the whole canvas). That costs one small extra render, no readPixels stall, and keeps
// the game's tone mapping and colours. Call render(renderer) just before the game's frame.

const FPS = 15;                  // a lo-fi handheld recording; also keeps the cost down
const W = 320, H = 180;          // the recording's resolution (the canvas it is shown in)

// lighting per condition level: the living Voss in a lit office, the cycles by a cold torch
const LIGHTS = [
  { bg: 0x2c2620, key: [0xfff0e2, 2.2], keyAt: [-0.7, 0.6, 1], fill: [0xfff0dd, 0x403428, 1.3], rim: [0xffe8d0, 0.35] },
  { bg: 0x26221e, key: [0xffeee2, 2.0], keyAt: [-0.6, 0.5, 1], fill: [0xf0e6dc, 0x3a3028, 1.0], rim: [0xffe8d0, 0.3] },
  { bg: 0x090c10, key: [0xd8e8ff, 2.4], keyAt: [0.25, -0.55, 1], fill: [0x90a0b4, 0x101418, 0.5], rim: [0x9fd8ff, 0.25] },
  { bg: 0x07090c, key: [0xd0e2ff, 2.5], keyAt: [0.35, -0.7, 1], fill: [0x8090a4, 0x0c1014, 0.42], rim: [0x9fd8ff, 0.22] },
  { bg: 0x050608, key: [0xc8dcff, 2.6], keyAt: [0.2, -0.8, 1], fill: [0x708098, 0x08090c, 0.36], rim: [0x9fd8ff, 0.2] }
];

export class LogHead {
  // source: { root (the loaded character, already in its toon materials), idle (AnimationClip),
  //           headTexture (the face's albedo, for the worn looks; optional) }
  constructor(source) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 20);
    this.root = cloneSkinned(source.root);
    this.root.position.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    this.scene.add(this.root);

    this.key = new THREE.DirectionalLight(0xffffff, 2);
    this.rim = new THREE.DirectionalLight(0xffffff, 0.5);
    this.fill = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
    this.scene.add(this.key, this.key.target, this.rim, this.rim.target, this.fill);
    this.scene.background = new THREE.Color();

    this.mixer = new THREE.AnimationMixer(this.root);
    if (source.idle) this.mixer.clipAction(source.idle).play();
    this.neck = this._bone(/Neck1/);
    this.headBone = this._bone(/Head1/);
    this._neckBase = new THREE.Quaternion();
    this._headBase = new THREE.Quaternion();

    // the head's own materials, so its face can wear the condition without touching anyone else
    this.wear = source.headTexture ? new FaceWear(source.headTexture) : null;
    this.headMats = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = false;
      if (o.material?.name === 'M_Head' || o.material?.name === 'M_LipSeal') {
        const m = o.material.clone();
        m.onBeforeCompile = o.material.onBeforeCompile;     // (the rim light; clone() leaves it out)
        o.material = m;
        this.headMats.push(m);
      }
    });
    this.rig = new FaceRig(this.root);

    this.canvas = null;
    this.ctx = null;
    this.active = false;
    this.level = 0;
    this._t = 0;
    this._due = false;
    this._shake = 0;
    this._aim = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._q = new THREE.Quaternion();
    this._qp = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
    this._vp = new THREE.Vector4();
    this._sc = new THREE.Vector4();
    this._framed = false;
  }

  // Voss, copied from the gameplay Player once it has loaded
  static fromPlayer(player) {
    if (!player?.ready) return null;
    // (the clean face: the player's own is worn, see Player._wearFace)
    let headTexture = player.headTexture || null;
    if (!headTexture) {
      player.bodyRoot.traverse((o) => {
        if (o.isMesh && o.material?.name === 'M_Head') headTexture = o.material.map;
      });
    }
    return new LogHead({ root: player.bodyRoot, idle: player.clips?.find((c) => c.name === 'Idle'), headTexture });
  }

  // A log begins: who he is in it (condition 0..4), how he talks (a FaceRig preset), and the
  // 2D canvas to show it in
  start(canvas, { condition = 0, face = 'neutral' } = {}) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.level = Math.max(0, Math.min(4, condition));
    const c = CONDITION[this.level];
    if (this.wear) {
      const map = this.wear.texture(this.level);
      for (const m of this.headMats) {
        m.map = map;
        m.needsUpdate = true;
      }
    }
    showWound(this.root, c.wound);
    const L = LIGHTS[this.level];
    this.scene.background.set(L.bg);
    this.key.color.set(L.key[0]);
    this.key.intensity = L.key[1];
    this.rim.color.set(L.rim[0]);
    this.rim.intensity = L.rim[1];
    this.fill.color.set(L.fill[0]);
    this.fill.groundColor.set(L.fill[1]);
    this.fill.intensity = L.fill[2];
    this._keyAt = L.keyAt;
    this._shake = [0.15, 0.3, 0.6, 0.85, 1][this.level];
    this.rig.setPreset(face, true);
    this.rig.stopSpeaking();
    this.rig.drift(this.level >= 4 ? 0.12 : this.level >= 3 ? 0.05 : 0);
    this.active = true;
    this._due = true;
  }

  stop() {
    this.active = false;
    this.rig.stopSpeaking();
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.active) return;
    // the clip only ever sees its own pose: last frame's head turn is undone first
    if (this._turned && this.neck && this.headBone) {
      this.neck.quaternion.copy(this._neckBase);
      this.headBone.quaternion.copy(this._headBase);
    }
    this.mixer.update(dt);
    this.rig.update(dt);
    this.root.updateMatrixWorld(true);
    if (!this._framed) this._frame();
    if (this.neck && this.headBone) {
      this._neckBase.copy(this.neck.quaternion);
      this._headBase.copy(this.headBone.quaternion);
      const h = this.rig.head;
      // (FaceRig's pitch is a bow: positive tips the head down)
      this._turn(this.neck, h.yaw * 0.4, -h.pitch * 0.4, h.roll * 0.4);
      this._turn(this.headBone, h.yaw * 0.6, -h.pitch * 0.6, h.roll * 0.6);
      this._turned = true;
    }
    // the handheld: a slow wander and a faster tremble, both worse in the later cycles
    this._t += dt;
    const t = this._t, s = this._shake;
    const cam = this.camera;
    if (!this._camAt) return;
    cam.position.copy(this._camAt);
    cam.position.x += (Math.sin(t * 0.7) * 0.012 + Math.sin(t * 5.3) * 0.002) * s;
    cam.position.y += (Math.sin(t * 0.9 + 1) * 0.01 + Math.sin(t * 6.1) * 0.0018) * s;
    cam.lookAt(this._aim);
    cam.rotateZ(Math.sin(t * 0.5) * 0.02 * s);
    // a new frame of the recording is due (drawn in render())
    this._acc = (this._acc || 0) + dt;
    if (this._acc >= 1 / FPS) {
      this._acc %= 1 / FPS;
      this._due = true;
    }
  }

  // Draw the due frame into the reader's canvas (just before the game draws its own frame)
  render(renderer) {
    if (!this.active || !this._due || !this.ctx) return;
    this._due = false;
    const pr = renderer.getPixelRatio();
    const prevTarget = renderer.getRenderTarget();
    renderer.getViewport(this._vp);
    renderer.getScissor(this._sc);
    const scissor = renderer.getScissorTest();
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, W / pr, H / pr);
    renderer.setScissor(0, 0, W / pr, H / pr);
    renderer.setScissorTest(true);
    renderer.render(this.scene, this.camera);
    const gl = renderer.domElement;
    this.ctx.drawImage(gl, 0, gl.height - H, W, H, 0, 0, W, H);
    renderer.setScissorTest(scissor);
    renderer.setScissor(this._sc);
    renderer.setViewport(this._vp);
    renderer.setRenderTarget(prevTarget);
    this._tape();
  }

  // tape noise over the picture: speckle, a few bright bars, and (later cycles) tracking tears
  _tape() {
    const g = this.ctx, s = this._shake;
    for (let i = 0; i < 70 * s + 20; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.25)';
      g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1);
    }
    if (Math.random() < 0.35 * s) {
      const y = Math.random() * H, h = 1 + Math.random() * 3;
      g.fillStyle = `rgba(220,230,240,${0.08 + Math.random() * 0.12})`;
      g.fillRect(0, y, W, h);
    }
    if (Math.random() < 0.12 * s) {
      const y = Math.random() * H, h = 4 + Math.random() * 12;
      g.drawImage(this.canvas, 0, y, W, h, (Math.random() - 0.5) * 18 * s, y, W, h);
    }
  }

  // Aim the camera at the face, from about arm's length, a little below the eyes (held in hand)
  _frame() {
    if (!this.headBone) return;
    this._framed = true;
    this.headBone.getWorldPosition(this._aim);
    this.root.getWorldQuaternion(this._q);
    // the character faces +z in its own model space
    this._forward.set(0, 0, 1).applyQuaternion(this._q).setY(0).normalize();
    const scale = this.root.scale.y;
    this._aim.y += 0.055 * scale;                        // the eyes, above the head bone
    this._camAt = this._aim.clone().addScaledVector(this._forward, 0.52 * scale);
    this._camAt.y -= 0.02 * scale;
    this._aim.y -= 0.004 * scale;
    // the key light comes from the side, above (an office) or below (a torch held low)
    const right = this._axis.crossVectors(this._forward, this._up).normalize();
    const k = this._keyAt;
    this.key.position.copy(this._aim).addScaledVector(right, k[0]).addScaledVector(this._up, k[1]).addScaledVector(this._forward, k[2]);
    this.key.target.position.copy(this._aim);
    this.rim.position.copy(this._aim).addScaledVector(right, -0.8).addScaledVector(this._up, 0.6).addScaledVector(this._forward, -1);
    this.rim.target.position.copy(this._aim);
  }

  // Turn a bone about its own pivot by a yaw (world up), a pitch (the face's right: positive tips
  // it up) and a roll (the face's forward), applied in world space
  _turn(bone, yaw, pitch, roll) {
    bone.parent.getWorldQuaternion(this._qp);
    const right = this._axis.crossVectors(this._forward, this._up).normalize();
    this._q.setFromAxisAngle(this._up, yaw);
    const qPitch = LogHead._tmpQ1.setFromAxisAngle(right, pitch);
    const qRoll = LogHead._tmpQ2.setFromAxisAngle(this._forward, roll);
    this._q.multiply(qPitch).multiply(qRoll);
    const inv = LogHead._tmpQ3.copy(this._qp).invert();
    bone.quaternion.premultiply(this._qp).premultiply(this._q).premultiply(inv);
    bone.updateWorldMatrix(false, true);
  }

  _bone(pattern) {
    let found = null;
    this.root.traverse((o) => {
      if (!found && o.isBone && pattern.test(o.name)) found = o;
    });
    return found;
  }

  dispose() {
    this.active = false;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    for (const m of this.headMats) m.dispose();
    this.wear?.dispose();
    // (the geometry and the other materials are shared with the character it was copied from)
    this.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
    this.scene.clear();
  }
}
LogHead._tmpQ1 = new THREE.Quaternion();
LogHead._tmpQ2 = new THREE.Quaternion();
LogHead._tmpQ3 = new THREE.Quaternion();
