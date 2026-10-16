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
// He records in his quarter: the room (Bedroom1 of the atrium model, its own meshes and
// materials, nothing loaded again) stands behind him, its back wall marked up more each cycle.
// He acts, too: a log's beats (Level2Lines.js) arrive through cue() as their words come up, and
// his body (breathing, a hunch, drawn-up shoulders) and his nerves get worse with his condition.
//
// Drawing: the reader is a DOM panel, and the game has one WebGL context. A few times a second
// the head is drawn into a corner of the game's own canvas and copied straight into the reader's
// small 2D canvas (drawImage of the WebGL canvas, in the same frame, before the game draws its
// frame over the whole canvas). That costs one small extra render, no readPixels stall, and keeps
// the game's tone mapping and colours. Call render(renderer) just before the game's frame.

const FPS = 15;                  // a lo-fi handheld recording; also keeps the cost down
const W = 320, H = 180;          // the recording's resolution (the canvas it is shown in)

// lighting per condition level: the living Voss with his quarter's light on (room: its strength),
// the cycles by a cold torch in the dark; fog [near, far] (m) is the room falling away into the dark
const LIGHTS = [
  { bg: 0x2c2620, key: [0xfff0e2, 2.2], keyAt: [-0.7, 0.6, 1], fill: [0xfff0dd, 0x403428, 1.3], rim: [0xffe8d0, 0.35], room: 1, fog: [4, 14] },
  { bg: 0x26221e, key: [0xffeee2, 2.0], keyAt: [-0.6, 0.5, 1], fill: [0xf0e6dc, 0x3a3028, 1.0], rim: [0xffe8d0, 0.3], room: 0.7, fog: [3, 11] },
  { bg: 0x090c10, key: [0xd8e8ff, 2.4], keyAt: [0.25, -0.55, 1], fill: [0x90a0b4, 0x101418, 0.5], rim: [0x9fd8ff, 0.25], room: 0, fog: [1.2, 6.5] },
  { bg: 0x07090c, key: [0xd0e2ff, 2.5], keyAt: [0.35, -0.7, 1], fill: [0x8090a4, 0x0c1014, 0.42], rim: [0x9fd8ff, 0.22], room: 0, fog: [1.1, 6] },
  { bg: 0x050608, key: [0xc8dcff, 2.6], keyAt: [0.2, -0.8, 1], fill: [0x708098, 0x08090c, 0.36], rim: [0x9fd8ff, 0.2], room: 0, fog: [1, 5.5] }
];

// how he holds himself per condition level: nerves (FaceRig.nerves), breath [per second, depth],
// the chest folding forward and the shoulders drawn up (radians)
const BODY = [
  { nerves: 0,    breath: [0.24, 1],   hunch: 0,    shrug: 0 },
  { nerves: 0.1,  breath: [0.27, 1],   hunch: 0.03, shrug: 0.03 },
  { nerves: 0.45, breath: [0.32, 0.8], hunch: 0.07, shrug: 0.06 },
  { nerves: 1,    breath: [0.45, 1.5], hunch: 0.08, shrug: 0.1 },
  { nerves: 0.2,  breath: [0.17, 1.3], hunch: 0.12, shrug: 0.02 }
];

// His quarter in the atrium model's world space: the room's bounds, where he stands (his feet) and
// the way he faces (north, his back to the bunk), so his shelf (the photo, the plant) is over one
// shoulder and the bunk's white end panel over the other
const ROOM = { min: [17.2, 5.3, -5.6], max: [26, 9.2, 3.2], stand: [21.5, 5.5, -0.5], facing: [0, 0, 1] };
// what he has put up, on sheets laid on surfaces that face him (+z), centre and size in metres:
// the tally on the bunk's end panel, the notes on the wall above the shelf
const TALLY = { at: [22.13, 7.3, -2.54], w: 0.5, h: 0.9 };
const NOTES = { at: [20.2, 8.4, -5.4], w: 2.2, h: 0.5 };
// per condition level: the cycles scratched into the wall as a tally, and the notes pinned up
const MARKS = [
  { tally: 0, notes: 0 },
  { tally: 0, notes: 1 },
  { tally: 2, notes: 2 },
  { tally: 5, notes: 4 },
  { tally: 8, notes: 7 }
];

export class LogHead {
  // source: { root (the loaded character, already in its toon materials), idle (AnimationClip),
  //           headTexture (the face's albedo, for the worn looks; optional),
  //           room (the meshes of his quarter, world-placed; optional) }
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
    this.scene.fog = new THREE.Fog(0x000000, 1, 10);

    this.mixer = new THREE.AnimationMixer(this.root);
    if (source.idle) this.mixer.clipAction(source.idle).play();
    this.neck = this._bone(/Neck1/);
    this.headBone = this._bone(/Head1/);
    this.chest = this._bone(/Spine4/);
    this.clavL = this._bone(/L_Clavicle/);
    this.clavR = this._bone(/R_Clavicle/);
    // the bones this moves on top of the clip, and their pose from the clip (undone every frame)
    this._posed = [this.neck, this.headBone, this.chest, this.clavL, this.clavR].filter(Boolean);
    this._bases = this._posed.map(() => new THREE.Quaternion());

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
    this.rig.gain = 1.6;           // (the faces read small on a 320x180 screen; checked clean to 1.6)

    this.canvas = null;
    this.ctx = null;
    this.active = false;
    this.level = 0;
    this._t = 0;
    this._due = false;
    this._shake = 0;
    this._body = BODY[0];
    this._lean = 0;
    this._leanNow = 0;
    this._leanUntil = 0;
    this._aim = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._q = new THREE.Quaternion();
    this._qp = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
    this._vp = new THREE.Vector4();
    this._sc = new THREE.Vector4();
    this._framed = false;

    this.root.getWorldQuaternion(this._q);
    // the character faces +z in its own model space
    this._forward.set(0, 0, 1).applyQuaternion(this._q).setY(0).normalize();
    this._room(source.room);
  }

  // Voss, copied from the gameplay Player once it has loaded; `atrium` (the level's model) gives
  // him his quarter to record in
  static fromPlayer(player, atrium = null) {
    if (!player?.ready) return null;
    // (the clean face: the player's own is worn, see Player._wearFace)
    let headTexture = player.headTexture || null;
    if (!headTexture) {
      player.bodyRoot.traverse((o) => {
        if (o.isMesh && o.material?.name === 'M_Head') headTexture = o.material.map;
      });
    }
    return new LogHead({ root: player.bodyRoot, idle: player.clips?.find((c) => c.name === 'Idle'), headTexture, room: atrium && LogHead.quarterOf(atrium) });
  }

  // The meshes of Voss's quarter in the atrium model: everything whose middle is inside the room
  // (its collision boxes aside)
  static quarterOf(atrium) {
    const box = new THREE.Box3(new THREE.Vector3(...ROOM.min), new THREE.Vector3(...ROOM.max));
    const b = new THREE.Box3(), c = new THREE.Vector3();
    const meshes = [];
    atrium.updateMatrixWorld(true);
    atrium.traverse((o) => {
      if (!o.isMesh || !o.visible || o.name.startsWith('COL_')) return;
      if (box.containsPoint(b.setFromObject(o).getCenter(c))) meshes.push(o);
    });
    return meshes;
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
    this.scene.fog.color.set(L.bg);
    [this.scene.fog.near, this.scene.fog.far] = L.fog;
    this.key.color.set(L.key[0]);
    this.key.intensity = L.key[1];
    this.rim.color.set(L.rim[0]);
    this.rim.intensity = L.rim[1];
    this.fill.color.set(L.fill[0]);
    this.fill.groundColor.set(L.fill[1]);
    this.fill.intensity = L.fill[2];
    if (this.roomLight) this.roomLight.intensity = L.room * 14;
    this._keyAt = L.keyAt;
    this._shake = [0.15, 0.3, 0.6, 0.85, 1][this.level];
    this._body = BODY[this.level];
    this._lean = this._leanNow = 0;
    this._leanUntil = 0;
    this._markWall(MARKS[this.level]);
    this.rig.calm();
    this.rig.setPreset(face, true);
    this.rig.stopSpeaking();
    this.rig.drift(this.level >= 4 ? 0.12 : this.level >= 3 ? 0.05 : 0);
    this.rig.nerves(this._body.nerves);
    this._framed = false;
    this.active = true;
    this._due = true;
  }

  stop() {
    this.active = false;
    this.rig.stopSpeaking();
  }

  // A beat of the log (Level2Lines.js), as its words come up: any of
  //   face {smile, frown, brow, tired, bow}   a passing expression
  //   look [yaw, pitch, speed]                 a look away (yaw + to his left, pitch + down)
  //   lean (0..~0.3)                           the camera pulled in toward his face
  //   gesture 'nod' | 'shake', tic, laugh (s), stare (s), still (0..1), mood (a FaceRig preset)
  // each held for `hold` seconds (Infinity: to the end)
  cue(b) {
    const r = this.rig;
    const hold = b.hold ?? 1.5;
    if (b.face) r.pose(b.face, hold);
    if (b.look) r.look(b.look[0], b.look[1] ?? 0, hold, b.look[2] ?? 6);
    if (b.lean !== undefined) {
      this._lean = b.lean;
      this._leanUntil = this._t + hold;
    }
    if (b.gesture) r.gesture(b.gesture, b.amp ?? 1);
    if (b.tic) r.tic();
    if (b.laugh) r.laugh(b.laugh);
    if (b.stare) r.stare(b.stare);
    if (b.still !== undefined) r.stillness = b.still;
    if (b.mood) r.setPreset(b.mood);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.active) return;
    // the clip only ever sees its own pose: last frame's turns are undone first
    if (this._turned) this._posed.forEach((b, i) => b.quaternion.copy(this._bases[i]));
    this.mixer.update(dt);
    this.rig.update(dt);
    this._posed.forEach((b, i) => this._bases[i].copy(b.quaternion));
    this._t += dt;
    const t = this._t, s = this._shake;
    // the body: breathing, the chest folded forward, the shoulders drawn up (and shaking with a laugh)
    const B = this._body;
    const breath = (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * B.breath[0])) * B.breath[1] * (1 - 0.6 * this.rig._still);
    const laugh = this.rig.laughing * Math.abs(Math.sin(t * Math.PI * 5.5));
    if (this.chest) this._turn(this.chest, 0, -B.hunch + breath * 0.02 + laugh * 0.03, 0);
    const lift = B.shrug + breath * 0.025 + laugh * 0.03;
    if (this.clavL) this._turn(this.clavL, 0, 0, lift);
    if (this.clavR) this._turn(this.clavR, 0, 0, -lift);
    this.root.updateMatrixWorld(true);
    if (!this._framed) this._frame();
    if (this.neck && this.headBone) {
      const h = this.rig.head;
      // (FaceRig's pitch is a bow: positive tips the head down)
      this._turn(this.neck, h.yaw * 0.4, -h.pitch * 0.4, h.roll * 0.4);
      this._turn(this.headBone, h.yaw * 0.6, -h.pitch * 0.6, h.roll * 0.6);
    }
    this._turned = true;
    if (!this._camAt) return;
    // the handheld: a slow wander and a faster tremble, both worse in the later cycles, pulled in
    // close when he leans to the lens
    if (this._t >= this._leanUntil) this._lean = 0;
    this._leanNow += (this._lean - this._leanNow) * (1 - Math.exp(-2.5 * dt));
    const cam = this.camera;
    cam.position.copy(this._camAt).lerp(this._aim, this._leanNow);
    cam.position.x += (Math.sin(t * 0.7) * 0.012 + Math.sin(t * 5.3) * 0.002) * s;
    cam.position.y += (Math.sin(t * 0.9 + 1) * 0.01 + Math.sin(t * 6.1) * 0.0018) * s;
    // (close in, it tips down a little so his mouth stays in the picture)
    cam.lookAt(this._aim.x, this._aim.y - 0.2 * this._leanNow * this.root.scale.y, this._aim.z);
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
    if (!this.active || !this._due || !this.ctx || !this._camAt) return;
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

  // His quarter behind him: copies of the room's meshes (the same geometry and materials), moved
  // so the spot he stands on is under his feet and the room faces the way he does; its ceiling
  // light; and a sheet over the back wall for what he has scratched and pinned there
  _room(meshes) {
    if (!meshes?.length) return;
    const set = new THREE.Group();
    for (const o of meshes) {
      const m = new THREE.Mesh(o.geometry, o.material);
      m.matrixAutoUpdate = false;
      m.matrix.copy(o.matrixWorld);
      set.add(m);
    }
    const stand = new THREE.Vector3(...ROOM.stand);
    const turn = Math.atan2(this._forward.x, this._forward.z) - Math.atan2(ROOM.facing[0], ROOM.facing[2]);
    set.matrixAutoUpdate = false;
    set.matrix.makeRotationY(turn).multiply(new THREE.Matrix4().makeTranslation(stand.negate()));
    set.updateMatrixWorld(true);

    this.roomLight = new THREE.PointLight(0xffe2c0, 0, 9, 2);
    this.roomLight.position.set((ROOM.min[0] + ROOM.max[0]) / 2, ROOM.max[1] - 0.6, ROOM.stand[2]);
    this.roomLight.matrixAutoUpdate = false;
    this.roomLight.updateMatrix();
    set.add(this.roomLight);

    this.sheets = [TALLY, NOTES].map(({ at, w, h }) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(512 * Math.min(1, w / h));
      canvas.height = Math.round(canvas.width * h / w);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(...at);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      set.add(mesh);
      return { canvas, tex, mesh };
    });
    this.set = set;
    this.scene.add(set);
  }

  // What is up in his quarter at this condition: the tally of cycles in marker on the bunk's end
  // panel, notes pinned over the shelf (the last of them: DON'T TRUST HER)
  _markWall({ tally, notes }) {
    if (!this.sheets) return;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const [t, n] = this.sheets;

    let g = t.canvas.getContext('2d');
    g.clearRect(0, 0, t.canvas.width, t.canvas.height);
    g.strokeStyle = 'rgba(30,22,22,0.9)';
    g.lineCap = 'round';
    g.lineWidth = 9;
    for (let i = 0; i < tally; i++) {
      const row = Math.floor(i / 5), j = i % 5;
      const x0 = 40 + rnd() * 10, y0 = 70 + row * 230 + rnd() * 10;
      g.beginPath();
      if (j < 4) {
        const x = x0 + j * 42 + (rnd() - 0.5) * 8;
        g.moveTo(x, y0);
        g.lineTo(x + (rnd() - 0.5) * 14, y0 + 150 + rnd() * 20);
      } else {
        g.moveTo(x0 - 20, y0 + 130);
        g.lineTo(x0 + 160, y0 + 20);
      }
      g.stroke();
    }
    t.tex.needsUpdate = true;

    g = n.canvas.getContext('2d');
    const cw = n.canvas.width, ch = n.canvas.height;
    g.clearRect(0, 0, cw, ch);
    for (let i = 0; i < notes; i++) {
      const x = 20 + i * (cw - 60) / 7 + rnd() * 12, y = 14 + rnd() * 20;
      g.save();
      g.translate(x + 26, y + 34);
      g.rotate((rnd() - 0.5) * 0.4);
      const last = i === 6;
      g.fillStyle = last ? '#e8dcb5' : '#d8d2c2';
      g.fillRect(-26, -34, 52, 68);
      if (last) {
        g.fillStyle = 'rgba(140,20,20,0.95)';
        g.font = 'bold 14px sans-serif';
        g.textAlign = 'center';
        g.fillText("DON'T", 0, -10);
        g.fillText('TRUST', 0, 6);
        g.fillText('HER', 0, 22);
      } else {
        g.strokeStyle = 'rgba(40,40,60,0.75)';
        g.lineWidth = 2;
        for (let l = 0; l < 5; l++) {
          g.beginPath();
          g.moveTo(-20, -22 + l * 11);
          g.lineTo(-20 + 26 + rnd() * 14, -22 + l * 11 + (rnd() - 0.5) * 3);
          g.stroke();
        }
      }
      g.fillStyle = '#a02020';
      g.beginPath();
      g.arc(0, -30, 3, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    n.tex.needsUpdate = true;
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
    for (const s of this.sheets || []) {
      s.tex.dispose();
      s.mesh.material.dispose();
      s.mesh.geometry.dispose();
    }
    // (the geometry and the other materials are shared with the character and the room)
    this.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
    this.scene.clear();
  }
}
LogHead._tmpQ1 = new THREE.Quaternion();
LogHead._tmpQ2 = new THREE.Quaternion();
LogHead._tmpQ3 = new THREE.Quaternion();
