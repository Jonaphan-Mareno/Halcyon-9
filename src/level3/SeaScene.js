import * as THREE from 'three';
import { createGLTFLoader } from '../core/loaders.js';
import { deckMaterial } from './DeckMaterials.js';
import { SeaLife } from './SeaLife.js';

// Outside the station (Blender/scripts/build_l3_outside.py): the platform beyond the water lock's
// outer hatch, the station's hull above and below it, and the canyon from the opening cinematic:
// cliffs, the seabed some 30 m down, rock pillars far off, hydrothermal vents smoking and
// glowing on the floor.
//
// What makes it read as an endless sea, all drawn here:
//   - a skybox: a cube map painted in code, deep blue-green with a faint glow overhead (the
//     surface, far above) and near-black below
//   - fog the colour of the skybox's horizon, so everything fades into the same water and the
//     canyon has no visible end
//   - marine snow: specks drifting round the camera wherever it goes (the points wrap round a box
//     that follows the camera, in the vertex shader, so there are always some and they cost no
//     work on the page). Some of it is living plankton: swim through it and it flares blue
//   - the tube worms by the vents sway in the current (their feet stay put: the shader knows
//     where the seabed is, from the same shape the Blender script gives it)
//   - smoke rising from each vent and a glow at its foot (billboards, one draw call each), and a
//     few faint shafts of light from above
//
// The lights out here are four of the deck's own, moved when Voss goes out (PrepRoom does that),
// so the number of lights, and so the shaders, never change.

export const SEA = {
  FOG: 0x0a2530,              // the water's colour in the distance (the skybox's horizon)
  FOG_DENSITY: 0.019,         // how far you can see: the canyon floor (30 m down), the station's whole height
  SKY_TOP: 0x2a6476,          // straight up: the faint glow of the surface, far above
  SKY_DEEP: 0x010407,         // straight down: the abyss
  HEMI: [0x3a7284, 0x030608, 0.75],   // soft light from above, none from below
  ENV: 0.12,                  // reflections on the metal: dimmer than on the deck
  SNOW: 2200,                 // specks of marine snow round the camera
  SNOW_BOX: 34,               // ... in a box this many metres across
  SMOKE_PER_VENT: 34,
  // the lights moved out here: colour, candela, range (0 the platform's floodlight, 1-3 over vents)
  LIGHTS: [[0xd8ecff, 9, 26], [0xff7426, 80, 34], [0xff7426, 80, 34], [0xff7426, 80, 34]]
};

const MODEL = './assets/models/l3-outside.glb';
const GLOW_SCALE = {
  l3_lamp: 0.22, l3_alarm: 0.6, l3_window: 0.45, l3_porthole: 1.0, l3_lava: 1.0, l3_plume: 0.6,
  // the atrium's lounge: lit from inside, so it glows a little through the murk
  l3_atrium_floor: 1.0, l3_atrium_wall: 1.0, l3_planter: 1.0, l3_trunk: 1.0, l3_leaves: 1.0, l3_sofa: 1.0,
  l3_ceiling_light: 0.45, l3_sill_light: 0.4, l3_bridge_window: 0.55
};

export class SeaScene {
  // session: the DeckSession (game, physics, hemi)
  constructor(session) {
    this.s = session;
    this.game = session.game;
    this.scene = session.game.scene;
    this.group = new THREE.Group();
    this.group.name = 'Sea';
    this.time = 0;
    this.active = false;
    this.points = {};
    this.lights = [];
    this.ready = this._load().catch((e) => console.error('The outside of Level 3 failed to load.', e));
  }

  async _load() {
    const gltf = await createGLTFLoader().loadAsync(MODEL);
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    for (const node of [...model.children]) {
      if (node.name.startsWith('COL_')) {
        this.s.physics.addStaticObject(node);
        model.remove(node);
      }
    }
    // the textured surfaces (sea versions: no water line out here), and the glowing ones toned down
    const cache = new Map();
    model.traverse((o) => {
      if (!o.isMesh) return;
      const swap = (m) => {
        if (!cache.has(m.name)) {
          let out = deckMaterial(m.name, { sea: true });
          if (!out && m.name === 'l3_atrium_glass') {
            // the atrium's windows: barely tinted glass, brighter at a glancing angle
            out = new THREE.MeshStandardMaterial({ color: 0x6f9a96, roughness: 0.05, metalness: 0, transparent: true,
              opacity: 0.12, depthWrite: false, envMapIntensity: 0.6 });
          }
          if (!out) {
            out = m;
            if (m.emissive && GLOW_SCALE[m.name] !== undefined) m.emissiveIntensity *= GLOW_SCALE[m.name];
          }
          cache.set(m.name, out);
        }
        return cache.get(m.name);
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      if (o.name.startsWith('L3_AtriumGlass')) o.renderOrder = 3;
    });
    this.group.add(model);
    this.model = model;

    const at = (name) => model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()) || null;
    this.points = {
      platform: at('PT_Platform'), outside: at('PT_Outside'), beacon: at('PT_SeaBeacon'),
      gate: at('PT_DiveGate'), cableAnchor: at('PT_CableAnchor')
    };
    this._sway(model);
    for (let i = 0; i < 4; i++) this.lights.push(at('SEA_LIGHT_' + i));
    this.vents = [];
    for (let i = 0; i < 8; i++) {
      const top = at('PT_Vent_' + i), base = at('PT_VentBase_' + i);
      if (top && base) this.vents.push({ top, base });
    }

    this.sky = makeSky();
    this._snow();
    this._smoke();
    this._glow();
    this._shafts();
    // fish, jellyfish, vent bubbles, and something big far out (SeaLife.js)
    this.life = new SeaLife(this.group, this.vents);
    await this.life.ready;
    this.scene.add(this.group);
  }

  // Seen at all: the outer hatch is opening or open, or he is out here. (Hidden otherwise: no cost.)
  setShown(on) {
    this.group.visible = on;
    this.scene.background = on ? this.sky : new THREE.Color(0x000000);
  }

  // Out in it: the sea's fog, light from above, dimmer reflections
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    const sc = this.scene, hemi = this.s.hemi;
    if (on) {
      this._saved = {
        fog: sc.fog.color.clone(), density: sc.fog.density, env: sc.environmentIntensity,
        hemi: hemi && [hemi.color.clone(), hemi.groundColor.clone(), hemi.intensity]
      };
      sc.fog.color.setHex(SEA.FOG);
      sc.fog.density = SEA.FOG_DENSITY;
      sc.environmentIntensity = SEA.ENV;
      if (hemi) {
        hemi.color.setHex(SEA.HEMI[0]);
        hemi.groundColor.setHex(SEA.HEMI[1]);
        hemi.intensity = SEA.HEMI[2];
      }
    } else if (this._saved) {
      sc.fog.color.copy(this._saved.fog);
      sc.fog.density = this._saved.density;
      sc.environmentIntensity = this._saved.env;
      if (hemi && this._saved.hemi) {
        hemi.color.copy(this._saved.hemi[0]);
        hemi.groundColor.copy(this._saved.hemi[1]);
        hemi.intensity = this._saved.hemi[2];
      }
    }
  }

  // player: where the swimmer is (or null), stir: how hard he is moving (0..1)
  update(dt, camera, player = null, stir = 0) {
    if (!this.group.visible) return;
    this.time += dt;
    const su = this.snowMat?.userData.uniforms;
    if (su) {
      if (player) su.uPlayer.value.set(player.x, player.y + 1.0, player.z);
      su.uStir.value += ((player ? stir : 0) - su.uStir.value) * (1 - Math.exp(-3 * dt));
    }
    if (this.swayUniforms) this.swayUniforms.uTime.value = this.time;
    this.life?.update(dt, player, this.scene.fog);
    const fog = this.scene.fog;
    for (const m of [this.snowMat, this.smokeMat, this.glowMat, this.shaftMat]) {
      const u = m?.userData.uniforms;
      if (!u) continue;
      u.uTime.value = this.time;
      if (u.uCam) u.uCam.value.copy(camera.position);
      if (u.uFogColor) u.uFogColor.value.copy(fog.color);
      if (u.uFogDensity) u.uFogDensity.value = fog.density;
    }
  }

  // The tube worms and their plumes lean and sway with the current, more the further up they are
  _sway(model) {
    const uniforms = { uTime: { value: 0 } };
    this.swayUniforms = uniforms;
    const done = new Set();
    model.traverse((o) => {
      if (!o.isMesh || !o.name.startsWith('SEA_Life')) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (done.has(m)) continue;
        done.add(m);
        m.onBeforeCompile = (shader) => {
          shader.uniforms.uTime = uniforms.uTime;
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              {
                // the seabed under this point (the Blender script's floor_z, in its own axes)
                float bx = transformed.x, by = -transformed.z;
                float trench = 16.0 * exp(-((bx + 2.0) * (bx + 2.0) + (by - 22.5) * (by - 22.5)) / 968.0);
                float floorY = -30.0 - 0.07 * max(0.0, -40.0 - bx) + 2.2 * sin(bx * 0.05) * cos(by * 0.07) - trench - 0.3;
                float h = clamp((transformed.y - floorY) / 2.4, 0.0, 1.4);
                float w = uTime * 1.1 + bx * 1.3 + transformed.z * 0.7;
                transformed.x += h * h * 0.22 * sin(w);
                transformed.z += h * h * 0.16 * cos(w * 0.8 + 1.3);
              }`);
        };
        m.customProgramCacheKey = () => 'sea-sway-' + m.name;
      }
    });
  }

  // ---------------------------------------------------------------- marine snow
  _snow() {
    const n = SEA.SNOW, box = SEA.SNOW_BOX;
    const pos = new Float32Array(n * 3), scale = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * box;
      pos[i * 3 + 1] = Math.random() * box;
      pos[i * 3 + 2] = Math.random() * box;
      scale[i] = 0.5 + Math.random() * Math.random() * 2.0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    const mat = new THREE.PointsMaterial({
      color: 0xb9cfc9, size: 0.05, map: dotTexture(), transparent: true, opacity: 0.7, depthWrite: false, sizeAttenuation: true
    });
    const uniforms = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: box },
      uPlayer: { value: new THREE.Vector3(0, -999, 0) }, uStir: { value: 0 }
    };
    mat.userData.uniforms = uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aScale;
          uniform float uTime;
          uniform vec3 uCam;
          uniform float uBox;
          uniform vec3 uPlayer;
          uniform float uStir;
          varying float vGlow;`)
        // each speck drifts and sinks slowly; the box of them wraps round the camera
        .replace('#include <begin_vertex>', `
          vec3 transformed = position + vec3(sin(uTime * 0.11 + position.y * 0.7) * 0.4, -uTime * 0.09,
                                             cos(uTime * 0.08 + position.x * 0.6) * 0.4);
          transformed = mod(transformed - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;`)
        .replace('gl_PointSize = size;', `
          // plankton round the swimmer flares blue while he moves through it (a third of it lives)
          float alive = step(0.66, fract(aScale * 7.31));
          vGlow = alive * uStir * smoothstep(2.8, 0.7, distance(transformed, uPlayer))
                * (0.6 + 0.4 * sin(uTime * 7.0 + position.x * 31.0));
          gl_PointSize = size * aScale * (1.0 + vGlow * 1.5);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.85, 1.0) * 2.4, vGlow);
          diffuseColor.a = min(1.0, diffuseColor.a + vGlow);`);
    };
    mat.customProgramCacheKey = () => 'sea-snow';
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    this.snowMat = mat;
    this.group.add(pts);
  }

  // ---------------------------------------------------------------- the vents: smoke and glow
  // Billboards: a quad per puff, all in one mesh; where each one is comes from its vent, its seed
  // and the time, in the vertex shader
  _billboards(count, perInstance) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const at = new Float32Array(count * 3), seed = new Float32Array(count), size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const [p, sd, sz] = perInstance(i);
      at[i * 3] = p.x;
      at[i * 3 + 1] = p.y;
      at[i * 3 + 2] = p.z;
      seed[i] = sd;
      size[i] = sz;
    }
    geo.setAttribute('aAt', new THREE.InstancedBufferAttribute(at, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
    geo.instanceCount = count;
    return geo;
  }

  _smoke() {
    if (!this.vents.length) return;
    const per = SEA.SMOKE_PER_VENT;
    const geo = this._billboards(this.vents.length * per, (i) => [this.vents[Math.floor(i / per)].top, (i % per) / per + Math.random() * 0.02, 1]);
    const uniforms = {
      uTime: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.02 },
      uLife: { value: 16 }, uRise: { value: 26 }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec3 aAt;
        attribute float aSeed;
        uniform float uTime;
        uniform float uLife;
        uniform float uRise;
        varying vec2 vUv;
        varying float vAge;
        varying float vSeed;
        varying float vDepth;
        void main() {
          // each puff rises, spreading and slowing, swirls, and leans with a slow current
          float age = fract(uTime / uLife + aSeed);
          float h = uRise * (1.0 - pow(1.0 - age, 1.6));
          float s = aSeed * 43.0;
          vec3 c = aAt + vec3(sin(s + uTime * 0.31 + h * 0.17) * (0.4 + h * 0.16), h,
                              cos(s * 1.3 + uTime * 0.27 + h * 0.13) * (0.4 + h * 0.16));
          c.x -= h * h * 0.012;
          float size = mix(1.4, 7.5, age) * (0.75 + 0.5 * fract(aSeed * 7.13));
          vec4 mv = viewMatrix * vec4(c, 1.0);
          float a = s + uTime * 0.05;
          mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
          mv.xy += rot * position.xy * size;
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vAge = age;
          vSeed = aSeed;
          vDepth = -mv.z;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec2 vUv;
        varying float vAge;
        varying float vSeed;
        varying float vDepth;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          vec2 p = vUv - 0.5;
          float n = noise(vUv * 3.5 + vSeed * 17.0) * 0.6 + noise(vUv * 7.0 - vSeed * 9.0) * 0.4;
          float r = length(p) * 2.0 + (n - 0.5) * 0.6;
          float a = smoothstep(1.0, 0.25, r);
          a *= smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(0.5, 1.0, vAge)) * 0.6;
          // dark mineral smoke, lit warm by the vent where it leaves it
          vec3 col = mix(vec3(0.32, 0.13, 0.05), vec3(0.05, 0.06, 0.065), smoothstep(0.0, 0.25, vAge));
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
          gl_FragColor = vec4(mix(col, uFogColor, fog), a);
        }`
    });
    mat.userData.uniforms = uniforms;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    this.smokeMat = mat;
    this.group.add(mesh);
  }

  _glow() {
    if (!this.vents.length) return;
    // at each vent's foot: a big soft halo and a small bright core
    const geo = this._billboards(this.vents.length * 2, (i) => {
      const v = this.vents[i >> 1];
      return [v.base, Math.random(), i % 2 ? 4.5 : 16];
    });
    const uniforms = { uTime: { value: 0 }, uFogDensity: { value: 0.02 } };
    const mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aAt;
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime;
        varying vec2 vUv;
        varying float vFlicker;
        varying float vDepth;
        void main() {
          vec4 mv = viewMatrix * vec4(aAt, 1.0);
          mv.xy += position.xy * aSize;
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vFlicker = 0.82 + 0.1 * sin(uTime * 2.3 + aSeed * 20.0) + 0.08 * sin(uTime * 5.7 + aSeed * 7.0);
          vDepth = -mv.z;
        }`,
      fragmentShader: /* glsl */`
        uniform float uFogDensity;
        varying vec2 vUv;
        varying float vFlicker;
        varying float vDepth;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float g = pow(max(0.0, 1.0 - r), 2.2);
          // light carries further through the water than the rocks can be seen
          float through = exp(-vDepth * uFogDensity * 0.9);
          gl_FragColor = vec4(vec3(1.0, 0.36, 0.08) * g * vFlicker * through * 0.55, 1.0);
        }`
    });
    mat.userData.uniforms = uniforms;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.glowMat = mat;
    this.group.add(mesh);
  }

  // faint shafts of light coming down from far above, swaying a little
  _shafts() {
    const spots = [[-48, 6], [-66, -28], [-40, -46], [-82, -4], [-58, -58], [-30, -40]];
    const geo = this._billboards(spots.length, (i) => [new THREE.Vector3(spots[i][0], -26, spots[i][1]), Math.random(), 3 + Math.random() * 4]);
    const uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } };
    const mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aAt;
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime;
        uniform vec3 uCam;
        varying vec2 vUv;
        varying float vSeed;
        varying float vDepth;
        void main() {
          // turns about its own upright axis to face the camera
          vec3 toCam = uCam - aAt;
          toCam.y = 0.0;
          toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
          vec3 right = vec3(toCam.z, 0.0, -toCam.x);
          float height = 70.0;
          float sway = sin(uTime * 0.13 + aSeed * 6.0) * 3.0 * (position.y + 0.5);
          vec3 p = aAt + right * (position.x * aSize * (1.0 + (position.y + 0.5) * 1.5) + sway) + vec3(0.0, (position.y + 0.5) * height, 0.0);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vSeed = aSeed;
          vDepth = -mv.z;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec2 vUv;
        varying float vSeed;
        varying float vDepth;
        void main() {
          float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
          float a = pow(across, 2.0) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
          a *= 0.75 + 0.25 * sin(uTime * 0.4 + vSeed * 9.0 + vUv.y * 3.0);
          a *= exp(-vDepth * 0.012);
          gl_FragColor = vec4(vec3(0.25, 0.55, 0.62) * a * 0.07, 1.0);
        }`
    });
    mat.userData.uniforms = uniforms;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.shaftMat = mat;
    this.group.add(mesh);
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        m.map?.dispose();
        m.dispose();
      }
    });
    this.sky?.dispose();
  }
}

// The skybox: six faces painted from a colour that depends only on how far up or down a direction
// looks (horizon: the fog's colour, so the far rocks melt into it)
function makeSky(size = 128) {
  // (painted in screen colours, 0-255, like the hex values: the texture is marked sRGB)
  const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const horizon = rgb(SEA.FOG), top = rgb(SEA.SKY_TOP), deep = rgb(SEA.SKY_DEEP);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const dirs = [
    (u, v) => [1, -v, -u], (u, v) => [-1, -v, u], (u, v) => [u, 1, v],
    (u, v) => [u, -1, -v], (u, v) => [u, -v, 1], (u, v) => [-u, -v, -1]
  ];
  const faces = dirs.map((dir) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const img = g.createImageData(size, size);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const u = (i + 0.5) / size * 2 - 1, v = (j + 0.5) / size * 2 - 1;
        const [x, y, z] = dir(u, v);
        const up = y / Math.hypot(x, y, z);
        let c;
        if (up > 0) {
          c = mix(horizon, top, Math.pow(THREE.MathUtils.smoothstep(up, 0.05, 1.0), 1.4));
          const glow = Math.pow(Math.max(0, up - 0.85) / 0.15, 2) * 18;   // the bright patch straight up
          c = [c[0] + glow * 0.6, c[1] + glow, c[2] + glow];
        } else {
          c = mix(horizon, deep, THREE.MathUtils.smoothstep(-up, 0.0, 0.85));
        }
        const k = (j * size + i) * 4, d = (Math.random() - 0.5) * 2;   // (a little dither: no banding)
        img.data[k] = Math.max(0, Math.min(255, c[0] + d));
        img.data[k + 1] = Math.max(0, Math.min(255, c[1] + d));
        img.data[k + 2] = Math.max(0, Math.min(255, c[2] + d));
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return cv;
  });
  const tex = new THREE.CubeTexture(faces);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// a soft round speck (the marine snow; the bubbles in the water lock)
export function dotTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
