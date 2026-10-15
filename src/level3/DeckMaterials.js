import * as THREE from 'three';

// The drowned deck's surfaces: rusted metal, heavy rust, cracked concrete and a rusty walkway,
// from ambientCG (CC0, credited in CREDITS.md), packed by the team into small WebP files
// (public/assets/textures/l3: colour, OpenGL normal, and occlusion/roughness/metalness in one).
//
// The model has no UVs to speak of, so every surface is textured by world position from three
// sides at once (triplanar), normal maps included: a wall, a floor and a pipe all get the texture
// at the right scale with no stretching. On top of that, in the same shader:
//   - below the water line everything darkens and goes green-brown with depth (murky water), and
//     a band just above the line stays wet and glossy (the tide mark)
//   - the flooded crew room (seen only through the door's window) is drawn as if through water:
//     the further a surface is from the window, the more it fades into green murk, with faint
//     moving caustic light on it (setMurk)
// Uniforms that change every frame (the water line, the time) are shared by every material.

const DIR = './assets/textures/l3/';

// per material: the texture set, metres per repeat, a tint, how strong the normal map is
const SURFACES = {
  l3_wall: { set: 'l3_wall', tile: 2.2, tint: 0xb4b8bc, normal: 1.0 },
  l3_rust: { set: 'l3_rust', tile: 1.6, tint: 0xffffff, normal: 1.2 },
  l3_concrete: { set: 'l3_concrete', tile: 2.4, tint: 0xd6d2cb, normal: 1.0 },
  l3_grate: { set: 'l3_grate', tile: 1.0, tint: 0xffffff, normal: 1.0, cutout: true },
  l3_dark: { set: 'l3_wall', tile: 1.8, tint: 0x2a2c30, normal: 0.6 },
  l3_hazard: { set: 'l3_rust', tile: 1.2, tint: 0xffc13b, normal: 0.8, paint: 0.65 },
  l3_cloth: { set: 'l3_concrete', tile: 0.9, tint: 0x3a3e44, normal: 0.4, rough: 1.0 }
};

// shared, per frame
export const deckUniforms = {
  uWaterLevel: { value: 0.55 },
  uTime: { value: 0 },
  uWindow: { value: new THREE.Vector3(0, 1.45, -24) },     // the crew room's window (murk is measured from it)
  uMurkColor: { value: new THREE.Color(0x0c2a22) },
  uMurkDensity: { value: 0.2 }
};

const VARYINGS = `
  varying vec3 vDeckPos;
  varying vec3 vDeckNrm;`;

// (used by the drowned crew too: they are in the same water)
export const MURK_GLSL = `
  // light through water: faint moving caustics on what faces up, then murk with distance from
  // the window the player is looking through
  vec3 deckMurk(vec3 col, vec3 pos, vec3 nrm) {
    float c1 = sin(pos.x * 3.1 + uTime * 1.3) + sin(pos.z * 2.7 - uTime * 1.1) + sin((pos.x + pos.z) * 2.2 + uTime * 0.7);
    float caustic = pow(clamp(c1 / 3.0 * 0.5 + 0.5, 0.0, 1.0), 6.0) * clamp(nrm.y * 0.7 + 0.3, 0.0, 1.0);
    col = col * vec3(0.55, 0.82, 0.72) + vec3(0.25, 0.55, 0.45) * caustic * 0.35;
    float d = distance(pos, uWindow);
    float murk = 1.0 - exp(-d * uMurkDensity);
    return mix(col, uMurkColor, clamp(murk, 0.0, 0.94));
  }`;

let cache = null;
function loadSets() {
  if (cache) return cache;
  const loader = new THREE.TextureLoader();
  const load = (file, srgb) => {
    const t = loader.load(DIR + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  cache = {};
  for (const set of ['l3_wall', 'l3_rust', 'l3_concrete', 'l3_grate']) {
    cache[set] = { color: load(set + '_color.webp', true), normal: load(set + '_normal.webp', false), orm: load(set + '_orm.webp', false) };
  }
  return cache;
}

// A triplanar, water-aware material for one of the model's material names (or null if the name
// is not a textured surface)
export function deckMaterial(name, { murk = false } = {}) {
  const spec = SURFACES[name];
  if (!spec) return null;
  const tex = loadSets()[spec.set];
  const mat = new THREE.MeshStandardMaterial({ name, color: spec.tint, roughness: spec.rough ?? 1, metalness: 1 });
  if (spec.cutout) {
    mat.alphaTest = 0.5;
    mat.side = THREE.DoubleSide;
  }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, deckUniforms, {
      uCol: { value: tex.color }, uNrm: { value: tex.normal }, uOrm: { value: tex.orm },
      uTile: { value: spec.tile }, uNormalStrength: { value: spec.normal }, uPaint: { value: spec.paint ?? 0 },
      uMurkOn: { value: murk ? 1 : 0 }
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + VARYINGS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDeckPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vDeckNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${VARYINGS}
        uniform sampler2D uCol;
        uniform sampler2D uNrm;
        uniform sampler2D uOrm;
        uniform float uTile;
        uniform float uNormalStrength;
        uniform float uPaint;
        uniform float uMurkOn;
        uniform float uWaterLevel;
        uniform float uTime;
        uniform vec3 uWindow;
        uniform vec3 uMurkColor;
        uniform float uMurkDensity;
        ${MURK_GLSL}
        vec3 triW;
        vec3 triP;
        vec4 tri(sampler2D t) {
          return texture2D(t, triP.zy) * triW.x + texture2D(t, triP.xz) * triW.y + texture2D(t, triP.xy) * triW.z;
        }`)
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vDeckNrm);
        triW = pow(abs(wn), vec3(5.0));
        triW /= (triW.x + triW.y + triW.z);
        triP = vDeckPos / uTile;
        vec4 texCol = tri(uCol);
        // painted metal (the hazard stripes): the paint covers the rust, which shows through worn spots
        vec3 albedo = mix(texCol.rgb, vec3(dot(texCol.rgb, vec3(0.3, 0.59, 0.11))) * 1.6, uPaint);
        diffuseColor.rgb *= albedo;
        diffuseColor.a *= texCol.a;
        vec3 orm = tri(uOrm).rgb;
        // under the water line: darker and green-brown with depth; just above it, a wet band
        float under = clamp((uWaterLevel - vDeckPos.y) * 1.8, 0.0, 1.0);
        float wet = smoothstep(uWaterLevel + 0.3, uWaterLevel, vDeckPos.y) * (1.0 - uMurkOn);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.22, 0.27, 0.2), under * (1.0 - uMurkOn));
        diffuseColor.rgb *= 1.0 - 0.35 * wet;
        diffuseColor.rgb *= mix(1.0, orm.r, 0.7);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor *= orm.g;
        roughnessFactor = mix(roughnessFactor, 0.15, wet);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor *= orm.b * (1.0 - uPaint);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // triplanar normal mapping, "whiteout" blend, in world space, then into view space
          vec3 tx = texture2D(uNrm, triP.zy).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(uNrm, triP.xz).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(uNrm, triP.xy).xyz * 2.0 - 1.0;
          tx.xy *= uNormalStrength; ty.xy *= uNormalStrength; tz.xy *= uNormalStrength;
          tx = vec3(tx.xy + wn.zy, abs(tx.z) * wn.x);
          ty = vec3(ty.xy + wn.xz, abs(ty.z) * wn.y);
          tz = vec3(tz.xy + wn.xy, abs(tz.z) * wn.z);
          vec3 worldN = normalize(tx.zyx * triW.x + ty.xzy * triW.y + tz.xyz * triW.z);
          normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);
        }`)
      .replace('#include <opaque_fragment>', `
        if (uMurkOn > 0.5) outgoingLight = deckMurk(outgoingLight, vDeckPos, wn);
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'deck-tri' + (spec.cutout ? '-cut' : '');
  return mat;
}

// The model's own (glowing, glass) materials for the flooded room get the murk too
export function withMurk(material) {
  const m = material.clone();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, deckUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + VARYINGS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDeckPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vDeckNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${VARYINGS}
        uniform float uTime;
        uniform vec3 uWindow;
        uniform vec3 uMurkColor;
        uniform float uMurkDensity;
        ${MURK_GLSL}`)
      .replace('#include <opaque_fragment>', `
        outgoingLight = deckMurk(outgoingLight, vDeckPos, normalize(vDeckNrm));
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'deck-murk-' + m.type;
  return m;
}
