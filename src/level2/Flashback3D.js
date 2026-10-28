import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FaceRig } from '../entities/FaceRig.js';
import { Kessler } from '../entities/Kessler.js';
import { makeToonRamp, showWound } from '../entities/Player.js';
import { audioSrc } from '../audio/AudioCache.js';

// The flashback in Dr. Kessler's room (scene 2.8, step 3), in 3D: the first time the player sees
// faces. Kessler stands at the shutdown console. Voss (the living Voss: no wound, no wear) argues
// with her, protective of the work, while ARIA pleads from a speaker on the wall (her words
// indistinct: only her pulsing light). Kessler reaches for the shutdown lever. Voss turns away from
// her and walks to the door controls instead, and the light goes red. Cut to black.
//
// The same contract as the 2D Flashback (which stays as the fallback, see HabitatSession):
// play() resolves when it ends; Enter skips it after the first couple of seconds; an optional
// recording can go in public/assets/audio/logs/flashback.mp3 (the muffled argument).
//
// Drawing: the game's renderer draws this scene instead of the level while it plays (no second
// WebGL context): the scene into one render target, then a single full-screen pass for the look
// (the 2D version's cold teal grade, film grain, vignette, letterbox bars, the white flash at the
// start, red glitch bars as the door locks, the cut to black). Nothing is allocated per frame.

const DURATION = 14.6;
const AUDIO = './assets/audio/logs/flashback.mp3';
const C = { wall: 0x10222e, wall2: 0x0a1620, floor: 0x0b1218, console: 0x172a3a, trim: 0xf07a14, cyan: 0x4fe3ff, red: 0xff3b30, green: 0x43ff8f };

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v) => v * v * (3 - 2 * v);
// 0 before a, 1 after b, smooth between
const seg = (t, a, b) => ease(clamp((t - a) / (b - a)));

// The shots: camera position and target, in the room (metres; the console is at the back left,
// the door on the right wall). Each holds from its start time to the next one's.
const SHOTS = [
  { at: 0.0, from: [1.7, 1.6, 2.7], to: [-0.7, 1.15, -1.5], push: 0.5 },       // wide: Kessler at the console, ARIA's speaker
  { at: 3.0, face: 'kessler', side: 1 },                                          // close on Kessler, calm, resolved
  { at: 5.5, face: 'voss', side: -1 },                                            // close on Voss, arguing
  { at: 6.6, face: 'kessler', side: 1 },
  { at: 7.3, face: 'voss', side: -1 },
  { at: 8.0, from: [0.55, 1.55, -0.95], to: [-0.75, 1.1, -2.0], push: 0.25 },     // her hand goes to the lever
  { at: 10.0, from: [2.3, 1.55, 1.7], to: [-0.8, 1.2, -1.3], push: 0.1 },          // he turns from her and walks this way, to the door; she watches him go
  { at: 12.5, from: [1.95, 1.6, 1.45], to: [2.85, 1.35, 0.3], push: 0.15 }        // his hand on the door controls
];

const GRADE = {
  uniforms: { tScene: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uBlack: { value: 0 }, uGlitch: { value: 0 }, uBars: { value: 0.094 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tScene; uniform float uTime, uFlash, uBlack, uGlitch, uBars;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      // a red glitch band now and then as the door locks
      float band = step(0.5, uGlitch) * step(abs(uv.y - fract(uTime * 3.7)), 0.03);
      uv.x += band * 0.012;
      vec3 c = texture2D(tScene, uv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, vec3(l), 0.3) * vec3(0.67, 0.84, 0.88);              // cold, a little washed out
      c += band * vec3(0.18, 0.02, 0.0);
      c += (hash(uv * 900.0 + uTime) - 0.5) * 0.05;                    // film grain
      float v = smoothstep(0.85, 0.3, length(uv - 0.5));               // vignette
      c *= mix(0.3, 1.0, v);
      c = mix(c, vec3(0.92, 0.99, 1.0), uFlash);                       // the flash of memory
      c *= 1.0 - uBlack;                                                // the cut to black
      c *= step(uBars, uv.y) * step(uv.y, 1.0 - uBars);                // letterbox
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};

export class Flashback3D {
  // root: the UI layer (for the skip hint); player: the gameplay Player (Voss is copied from it)
  constructor(root, player) {
    this.player = player;
    this.running = false;
    this.ready = false;
    this.hint = document.createElement('div');
    this.hint.className = 'fb-hint fb3d-hint';
    this.hint.textContent = 'Enter: skip';
    root.appendChild(this.hint);
    window.addEventListener('keydown', (e) => {
      if (this.running && e.code === 'Enter' && this.t > 2) this.t = DURATION;
    });
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._qp = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
    this._size = new THREE.Vector2();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  // Load Kessler and build the room (call ahead of time; play() falls back if this has not worked)
  preload() {
    this._loading ||= this._build().then(() => { this.ready = true; }).catch((e) => {
      console.warn('Flashback3D: could not set up, the 2D flashback will play instead.', e);
    });
    return this._loading;
  }

  async _build() {
    if (!this.player?.ready) throw new Error('Voss is not loaded');
    this.kessler = await new Kessler().load();
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(C.wall2);
    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 30);
    this.ramp = makeToonRamp();
    this._room();

    // Voss as he was: a copy of the player's body, without the wound
    this.voss = cloneSkinned(this.player.bodyRoot);
    this.voss.position.set(0, 0, 0);
    showWound(this.voss, false);
    // ...and with his face as it was (the player's is worn; Player.headTexture is the clean one)
    this._vossMats = [];
    const copies = new Map();
    this.voss.traverse((o) => {
      const name = o.material?.name;
      if (!o.isMesh || !this.player.headTexture || (name !== 'M_Head' && name !== 'M_LipSeal')) return;
      if (!copies.has(o.material)) {
        const m = o.material.clone();
        m.onBeforeCompile = o.material.onBeforeCompile;
        m.map = this.player.headTexture;
        copies.set(o.material, m);
        this._vossMats.push(m);
      }
      o.material = copies.get(o.material);
    });
    this.vossGroup = new THREE.Group();
    this.vossGroup.add(this.voss);
    scene.add(this.vossGroup, this.kessler.root);
    this.vossMixer = new THREE.AnimationMixer(this.voss);
    const clip = (list, name) => list.find((c) => c.name === name);
    this.vossIdle = this.vossMixer.clipAction(clip(this.player.clips, 'Idle'));
    this.vossWalk = this.vossMixer.clipAction(clip(this.player.clips, 'Walk'));
    this.kMixer = new THREE.AnimationMixer(this.kessler.model);
    this.kIdle = this.kMixer.clipAction(clip(this.kessler.clips, 'Idle'));
    this.vossFace = new FaceRig(this.voss, 'arguing');
    this.kFace = new FaceRig(this.kessler.model, 'composed');
    const bone = (root, re) => {
      let f = null;
      root.traverse((o) => { if (!f && o.isBone && re.test(o.name)) f = o; });
      return f;
    };
    this.b = {
      vNeck: bone(this.voss, /Neck1/), vHead: bone(this.voss, /Head1/), vArm: bone(this.voss, /R_UpperArm/), vFore: bone(this.voss, /R_Forearm/),
      kNeck: bone(this.kessler.model, /Neck1/), kHead: bone(this.kessler.model, /Head1/), kArm: bone(this.kessler.model, /R_UpperArm/), kFore: bone(this.kessler.model, /R_Forearm/)
    };
    this._saved = new Map(Object.values(this.b).map((b) => [b, new THREE.Quaternion()]));

    this.target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
    this.post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ ...GRADE, uniforms: THREE.UniformsUtils.clone(GRADE.uniforms), depthTest: false, depthWrite: false }));
    this.post.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.post);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // The room: walls, the console with its lever and screen, the speaker, the door and its panel
  _room() {
    const toon = (color, emissive = 0x000000) => new THREE.MeshToonMaterial({ color, gradientMap: this.ramp, emissive });
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      this.scene.add(m);
      return m;
    };
    const wall = toon(C.wall), trim = toon(C.trim, 0x301000), dark = toon(C.console, 0x0a1a24);
    box(7, 0.1, 6, toon(C.floor), 0, -0.05, 0.2);
    box(7, 2.9, 0.1, wall, 0, 1.45, -2.6);                     // back wall
    box(0.1, 2.9, 6, wall, -3.1, 1.45, 0.2);                   // left wall
    box(0.1, 2.9, 6, wall, 3.05, 1.45, 0.2);                   // right wall (the door is in it)
    box(7, 0.1, 6, toon(0x0a141c), 0, 2.95, 0.2);               // ceiling
    box(7, 0.05, 0.02, trim, 0, 0.95, -2.54);                  // the station's orange band
    box(0.02, 0.05, 6, trim, 3.0, 0.95, 0.2);
    for (const x of [-1.8, 0, 1.8]) box(0.9, 0.04, 0.12, toon(0xdfefff, 0xa8c8d8), x, 2.9, -0.4);   // ceiling lights
    // the shutdown console, its screen, and the red lever plate
    box(1.6, 0.95, 0.6, dark, -1.2, 0.475, -2.2);
    box(1.6, 0.06, 0.66, toon(0x0a1822), -1.2, 0.98, -2.18);
    this.screen = box(0.9, 0.5, 0.04, toon(0x0c2a36, 0x1f6f85), -1.35, 1.45, -2.48);
    box(0.24, 0.04, 0.2, toon(0x3a0f0d, 0x401010), -0.6, 1.02, -2.05);
    this.lever = new THREE.Group();
    this.lever.position.set(-0.6, 1.04, -2.05);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), toon(0xc9d3da));
    stick.position.y = 0.1;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), toon(C.red, 0x601010));
    knob.position.y = 0.2;
    this.lever.add(stick, knob);
    this.scene.add(this.lever);
    // ARIA's speaker high on the back wall, its light pulsing
    box(0.55, 0.4, 0.06, toon(0x0a1520), 1.0, 2.15, -2.53);
    this.ariaLight = box(0.12, 0.12, 0.02, new THREE.MeshBasicMaterial({ color: C.cyan }), 1.0, 2.15, -2.49);
    // the door in the right wall and its control panel
    box(0.06, 2.1, 1.2, toon(0x0c1822), 3.0, 1.05, -0.6);
    box(0.05, 0.36, 0.22, toon(0x16202a), 2.98, 1.35, 0.35);
    this.doorLight = box(0.02, 0.07, 0.07, new THREE.MeshBasicMaterial({ color: C.green }), 2.95, 1.43, 0.35);
    this.bolts = [box(0.04, 0.06, 1.2, new THREE.MeshBasicMaterial({ color: C.red }), 2.97, 1.6, -0.6), box(0.04, 0.06, 1.2, new THREE.MeshBasicMaterial({ color: C.red }), 2.97, 0.6, -0.6)];
    // the light: cold from above, ARIA's cyan from the speaker, red from the door once it locks
    const key = new THREE.DirectionalLight(0xcfe6ff, 3.0);
    key.position.set(1.5, 3.5, 2.5);
    const back = new THREE.DirectionalLight(0x9fd8ff, 1.0);
    back.position.set(-2, 2.5, -3);
    this.scene.add(key, back, new THREE.HemisphereLight(0xa8c8da, 0x16242e, 1.7));
    this.ariaGlow = new THREE.PointLight(C.cyan, 0, 5, 1.5);
    this.ariaGlow.position.set(1.0, 2.0, -2.2);
    this.doorGlow = new THREE.PointLight(C.red, 0, 4, 1.5);
    this.doorGlow.position.set(2.6, 1.4, 0.4);
    this.scene.add(this.ariaGlow, this.doorGlow);
  }

  play() {
    this.running = true;
    this.t = 0;
    this._last = performance.now();
    this.hint.style.opacity = 0;
    this.hint.classList.add('on');
    this.audio = new Audio(audioSrc(AUDIO));
    this.audio.addEventListener('error', () => { this.audio = null; });
    this.audio.play().catch(() => { this.audio = null; });
    // everyone to their marks
    this.kessler.root.position.set(-1.2, 0, -1.45);
    this.kessler.root.rotation.y = 0;                        // facing the console (-z)
    this.vossGroup.position.set(-0.05, 0, -0.75);
    this.vossGroup.rotation.y = Math.PI + Math.atan2(-1.15, -0.7);        // toward her (see _animate)
    this.vossIdle.reset().play();
    this.vossWalk.stop();
    this.kIdle.reset().play();
    this.vossFace.setPreset('arguing', true);
    this.kFace.setPreset('composed', true);
    this.vossFace.startBabble(1.15);
    this.kFace.stopSpeaking();
    this.lever.rotation.x = -0.9;
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  // per frame, instead of the level's own frame (HabitatSession's render)
  render(renderer) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    this.t += dt;
    const t = this.t;
    this.hint.style.opacity = t > 2 && t < DURATION - 1 ? 0.55 : 0;
    if (t >= DURATION) return this._end();
    this._animate(t, dt);
    this._shoot(t);

    renderer.getDrawingBufferSize(this._size);
    if (this.target.width !== this._size.x || this.target.height !== this._size.y) {
      this.target.setSize(this._size.x, this._size.y);
      this.camera.aspect = this._size.x / this._size.y;
      this.camera.updateProjectionMatrix();
    }
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
    const u = this.post.material.uniforms;
    u.tScene.value = this.target.texture;
    u.uTime.value = t;
    u.uFlash.value = 1 - seg(t, 0, 1.2);
    u.uBlack.value = seg(t, 13.6, 13.9);
    u.uGlitch.value = t > 12.6 && t < 13.6 && Math.random() < 0.5 ? 1 : 0;
    renderer.render(this.postScene, this.postCam);
  }

  _end() {
    this.running = false;
    this.hint.classList.remove('on');
    this.audio?.pause();
    this.vossFace.stopSpeaking();
    this.kFace.stopSpeaking();
    this._resolve?.();
  }

  // ------------------------------------------------------------------ the action
  _animate(t, dt) {
    const k = this.kessler.root, v = this.vossGroup;
    // undo last frame's bone turns before the clips play (they only ever see their own pose)
    for (const [b, q] of this._saved) if (this._turned) b.quaternion.copy(q);

    // 0-8: they argue at the console; she turns to him for the close-ups, then back to the lever
    // (a character facing -z turned by y faces (-sin y, -cos y): toward Voss, behind her on her right)
    const toHim = seg(t, 2.4, 3.0) * (1 - seg(t, 7.8, 8.3));
    k.rotation.y = toHim * Math.atan2(-(-0.05 + 1.2), -(-0.75 + 1.45));
    // 8-10: her hand goes to the lever and pulls it; ARIA's pulse speeds up
    const reach = seg(t, 8.2, 9.3);
    const pull = seg(t, 9.4, 9.9);
    this.lever.rotation.x = -0.9 + 1.5 * pull;
    // 10-12.5: he turns from her and walks to the door; 12.5-: his hand on the panel
    const turn = seg(t, 10.0, 10.6);
    const walk = seg(t, 10.5, 12.3);
    const vossAway = Math.atan2(2.6 - (-0.05), 0.35 - (-0.75));
    const vossToHer = Math.atan2(-1.2 - (-0.05), -1.45 - (-0.75));
    v.rotation.y = Math.PI + (vossToHer + (vossAway - vossToHer) * turn);
    v.position.set(-0.05 + (2.45 + 0.05) * walk, 0, -0.75 + (0.35 + 0.75) * walk);
    if (t > 10.5 && t < 12.3) {
      if (!this.vossWalk.isRunning()) {
        this.vossWalk.reset().fadeIn(0.25).play();
        this.vossIdle.fadeOut(0.25);
      }
    } else if (t >= 12.3 && this.vossWalk.isRunning() && this.vossWalk.getEffectiveWeight() > 0.99) {
      this.vossIdle.reset().fadeIn(0.3).play();
      this.vossWalk.fadeOut(0.3);
    }
    const press = seg(t, 12.5, 13.0);
    const locked = t > 12.95;
    this.vossMixer.update(dt);
    this.kMixer.update(dt);

    // faces: he argues, insistent; she answers calmly, then, as he walks off, realises
    if (t > 3.2 && t < 7.9 && this.kFace.mode === 'idle') this.kFace.startBabble(0.8);
    if (t > 7.9 && this.kFace.mode !== 'idle') this.kFace.stopSpeaking();
    if (t > 9.6 && this.vossFace.mode !== 'idle') this.vossFace.stopSpeaking();
    if (t > 11.0) this.kFace.setPreset('neutral');
    this.vossFace.update(dt);
    this.kFace.update(dt);
    if (t > 11.2) this.kFace.expr.brow = Math.min(0.6, this.kFace.expr.brow + dt);

    // bones on top of the clips: heads toward each other, her reach, his hand to the panel
    for (const [b, q] of this._saved) q.copy(b.quaternion);
    this._turned = true;
    const lookV = 1 - seg(t, 10.0, 10.4);
    // (FaceRig's pitch is a bow; here positive pitch tips a bone up and lifts an arm forward)
    this._turn(this.b.vHead, this.vossGroup, this.vossFace.head.yaw * 0.6, -this.vossFace.head.pitch * 0.6 + 0.05 * lookV, this.vossFace.head.roll);
    // (she watches him go: he is on her right, and a positive yaw would turn her to her left)
    const watch = seg(t, 10.6, 11.6);
    this._turn(this.b.kNeck, k, -watch * 0.55, 0, 0);
    this._turn(this.b.kHead, k, -watch * 0.45 + this.kFace.head.yaw * 0.6, -this.kFace.head.pitch * 0.6, this.kFace.head.roll);
    this._turn(this.b.kArm, k, -reach * 0.3, reach * 0.8 - pull * 0.3, 0);
    this._turn(this.b.kFore, k, 0, reach * 0.25, 0);
    this._turn(this.b.vArm, v, 0, press * 0.95, press * 0.15);
    this._turn(this.b.vFore, v, 0, press * 0.3, 0);

    // ARIA pleading: her light pulses faster as Kessler goes for the lever, and frantic at the end
    const rate = 4 + seg(t, 5, 9) * 6 + (locked ? 6 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * rate) * (0.6 + 0.4 * Math.sin(t * 1.7));
    this.ariaGlow.intensity = 1.5 + 4 * pulse;
    this.ariaLight.material.color.setHex(C.cyan).multiplyScalar(0.5 + pulse);
    this.screen.material.emissiveIntensity = 0.8 + 0.4 * Math.sin(t * 9);
    // the door locks
    this.doorLight.material.color.setHex(locked ? C.red : C.green);
    this.doorGlow.intensity = locked ? 2.5 + 1.5 * Math.abs(Math.sin(t * 9)) : 0;
    for (const b of this.bolts) b.visible = locked;
  }

  _shoot(t) {
    let i = 0;
    while (i + 1 < SHOTS.length && t >= SHOTS[i + 1].at) i++;
    const s = SHOTS[i];
    const end = i + 1 < SHOTS.length ? SHOTS[i + 1].at : DURATION;
    const k = clamp((t - s.at) / (end - s.at));
    const cam = this.camera;
    if (s.face) {
      // a close-up over the other one's shoulder: the face's bone, from a little to the side
      const who = s.face === 'kessler' ? this.b.kHead : this.b.vHead;
      const other = s.face === 'kessler' ? this.b.vHead : this.b.kHead;
      who.getWorldPosition(this._v);
      this._v.y += 0.09;
      other.getWorldPosition(this._v2);
      this._v2.y += 0.06;
      this._axis.subVectors(this._v2, this._v).setY(0).normalize();
      cam.position.copy(this._v).addScaledVector(this._axis, 0.75 - 0.08 * k);
      cam.position.x += this._axis.z * 0.22 * s.side;
      cam.position.z -= this._axis.x * 0.22 * s.side;
      cam.position.y += 0.02;
      cam.lookAt(this._v);
    } else {
      cam.position.set(...s.from);
      this._v.set(...s.to);
      cam.position.lerp(this._v, s.push * 0.3 * k);
      cam.lookAt(this._v);
    }
    // a slight handheld drift
    cam.rotation.z += Math.sin(t * 0.7) * 0.004;
    cam.position.y += Math.sin(t * 1.1) * 0.006;
  }

  // Turn a bone about its own pivot by a yaw (world up), a pitch (about the character's right:
  // positive tips a head up and lifts a hanging arm forward) and a roll (about its forward), in
  // world space
  _turn(bone, holder, yaw, pitch, roll) {
    if (!bone) return;
    holder.updateMatrixWorld(true);
    bone.parent.getWorldQuaternion(this._qp);
    holder.getWorldQuaternion(this._q);
    const right = this._v2.set(1, 0, 0).applyQuaternion(this._q);
    const fwd = this._axis.set(0, 0, -1).applyQuaternion(this._q);
    const r = Flashback3D._r.setFromAxisAngle(this._up, yaw);
    r.multiply(Flashback3D._r2.setFromAxisAngle(right, pitch));
    r.multiply(Flashback3D._r2.setFromAxisAngle(fwd, roll));
    const inv = Flashback3D._r3.copy(this._qp).invert();
    bone.quaternion.premultiply(this._qp).premultiply(r).premultiply(inv);
    bone.updateWorldMatrix(false, true);
  }

  dispose() {
    if (!this.scene) return;
    this.scene.traverse((o) => {
      if (o.isMesh && !o.isSkinnedMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    this.vossMixer.uncacheRoot(this.voss);
    this.kMixer.uncacheRoot(this.kessler.model);
    this.voss.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
    for (const m of this._vossMats) m.dispose();
    this.kessler.dispose();
    this.target.dispose();
    this.post.geometry.dispose();
    this.post.material.dispose();
    this.ramp.dispose();
    this.hint.remove();
    this.scene = null;
    this.ready = false;
  }
}
Flashback3D._r = new THREE.Quaternion();
Flashback3D._r2 = new THREE.Quaternion();
Flashback3D._r3 = new THREE.Quaternion();
