import * as THREE from 'three';
import { createGLTFLoader } from '../core/loaders.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { deckUniforms, MURK_GLSL } from './DeckMaterials.js';

// Four of Voss's crewmates, drowned, floating in the flooded engine room behind the door's window
// (Dr. Kessler, Lindqvist, Navarro and Park, from the lab's subject list). The one nearest the glass
// is Dr. Kessler: long maroon hair (Voss's own hair strands, grown down her back) and a staff ID
// badge clipped flat to her coat, reading DR. E. KESSLER. Built from the same rigged
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
  { name: 'Kessler', coat: 0xc9c6b8, clip: 'Idle', at: 0.2, rot: [0.35, 0.15, 0.08], glasses: false,
    hair: 0x74202e, longHair: true, badge: true },
  { name: 'Lindqvist', coat: 0x3b4a5e, clip: 'Fall', at: 0.4, rot: [Math.PI / 2 - 0.15, 2.4, 0.3], glasses: true },
  { name: 'Navarro', coat: 0x5a4a32, clip: 'Jump_Up', at: 0.25, rot: [-1.05, -0.8, -0.2], glasses: false },
  { name: 'Park', coat: 0x46523f, clip: 'Land', at: 0.1, rot: [0.4, 1.2, 1.35], glasses: false }
];

function drowned(source, kind, coat, hair = 0x1a1b1c) {
  const m = source.clone();
  if (kind !== 'hair') m.map = null;
  if (kind === 'skin') m.color.set(0xb4c0ae);
  else if (kind === 'coat') m.color.set(coat);
  else if (kind === 'hair') m.color.set(hair);
  else m.color.multiplyScalar(0.45);
  m.roughness = kind === 'skin' ? 0.55 : kind === 'hair' ? 0.7 : 0.9;
  m.metalness = 0;
  if (m.emissive) m.emissive.set(0x000000);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, deckUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDeckPos;\nvarying vec3 vDeckNrm;' +
        (kind === 'hair' ? '\nuniform float uTime;\nattribute float aDrift;' : ''))
      // hair: the long strands drift slowly in the water, the ends most, each lock a little out of step
      .replace('#include <begin_vertex>', kind === 'hair' ? `#include <begin_vertex>
        transformed += vec3(sin(uTime * 0.7 + position.x * 30.0 + position.y * 9.0) * 0.06,
                            sin(uTime * 0.5 + position.z * 20.0) * 0.02,
                            cos(uTime * 0.6 + position.x * 25.0) * 0.05) * aDrift;` : '#include <begin_vertex>')
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
      // hair: the strand texture is nearly black, so it only cuts the strands out (alpha) and
      // shades along them; the colour itself comes from the hair colour
      .replace('#include <map_fragment>', (kind === 'hair' ? `{
          vec4 strand = texture2D(map, vMapUv);
          diffuseColor.a *= strand.a;
          diffuseColor.rgb *= mix(0.55, 1.2, clamp(dot(strand.rgb, vec3(0.33)) * 25.0, 0.0, 1.0));
        }` : '#include <map_fragment>') + `
        {
          // blotches: water damage and staining, mottled over the skin and the cloth
          vec3 q = vDeckPos * vec3(6.3, 7.1, 5.7);
          float n = sin(q.x) * sin(q.y + 1.7) * sin(q.z + 0.4) + 0.5 * sin(q.x * 2.3 + q.z * 1.9);
          diffuseColor.rgb *= 1.0 - 0.35 * smoothstep(0.1, 0.9, n);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))), ${kind === 'hair' ? '0.15' : '0.4'});
        }`)
      .replace('#include <opaque_fragment>', `
        outgoingLight = deckMurk(outgoingLight, vDeckPos, normalize(vDeckNrm));
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'drowned-' + kind;
  return m;
}

const KIND = { M_Head: 'skin', M_Hands: 'skin', M_Coat: 'coat', M_HairCards: 'hair' };

// Long hair from Voss's own hair cards: the strands below the crown are stretched downwards, most
// at the back (to between the shoulder blades), less at the sides (to the jaw), and eased back
// off the coat as they fall. Same strands, same texture, same weights on the head, just longer.
function growHair(geometry) {
  const g = geometry.clone();
  const p = g.attributes.position;
  const CROWN = 1.335;
  const drift = new Float32Array(p.count);          // how far down the strand: the ends drift most
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y >= CROWN) continue;
    const below = CROWN - y;
    const back = THREE.MathUtils.clamp((0.02 - z) / 0.1, 0, 1);       // 0 at the face, 1 at the back
    const side = THREE.MathUtils.clamp((Math.abs(x) - 0.055) / 0.025, 0, 1);  // the sides, past the temples
    const stretch = 1 + Math.max(2.0 * back, 0.7 * side);                    // (the fringe stays as it is)
    const ny = CROWN - below * stretch;
    const fall = CROWN - ny;
    p.setXYZ(i, x * (1 + 0.25 * fall), ny, z - fall * 0.22 * back);
    drift[i] = fall;
  }
  p.needsUpdate = true;
  g.setAttribute('aDrift', new THREE.BufferAttribute(drift, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export class DrownedCrew {
  // spots: Vector3[] (where each floats); scene: where they go
  constructor(scene, spots) {
    this.scene = scene;
    this.bodies = [];
    this.time = 0;
    this.closeness = 0;            // 0..1: the body nearest the glass coming up against it
    this.ready = createGLTFLoader().loadAsync(MODEL).then((gltf) => {
      this.gltf = gltf;            // (the dive suit on the rack is built from the same model)
      CREW.forEach((c, i) => {
        if (!spots[i]) return;
        const model = cloneSkinned(gltf.scene);
        model.scale.setScalar(SCALE);
        model.position.y = -0.95;                    // the body's middle at the pivot
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.frustumCulled = false;
          if (/Glasses/.test(o.name) && !c.glasses) o.visible = false;
          if (c.longHair && o.name === 'Hair') o.geometry = growHair(o.geometry);
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const out = mats.map((m) => drowned(m, KIND[m.name] || 'cloth', c.coat, c.hair));
          o.material = Array.isArray(o.material) ? out : out[0];
        });
        // (before the pose, while the bones are in their rest positions) long hair and a badge
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
