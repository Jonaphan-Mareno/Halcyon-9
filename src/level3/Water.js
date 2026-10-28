import * as THREE from 'three';
import { deckUniforms } from './DeckMaterials.js';

// The flood water standing in the drowned deck: one flat sheet at the water line, its surface
// worked out per pixel in a shader. A few slow swells and a fine chop move all the time, and rings
// spread out wherever Voss wades or something splashes in (up to eight at once, uniforms driven by
// the game). It is a lit material, so the deck's own lamps glint off the ripples, and it is murky:
// dark green-brown, more opaque where you look across it than straight down into it.
//
// The water line is shared with the deck's materials (deckUniforms.uWaterLevel), so walls darken
// below it and a wet tide mark sits above it; raising it later (the rising water) moves both. The
// water lock has its own water ({ shared: false }), seen from below as well, that rises on its own.

const RINGS = 8;

export class Water {
  // bounds: { minX, maxX, minZ, maxZ } in world metres; shared: moves the deck's water line too
  constructor(scene, bounds, { shared = true, level = deckUniforms.uWaterLevel.value } = {}) {
    this.shared = shared;
    this._level = level;
    const w = bounds.maxX - bounds.minX, d = bounds.maxZ - bounds.minZ;
    const geo = new THREE.PlaneGeometry(w, d, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.rings = Array.from({ length: RINGS }, () => new THREE.Vector4(0, 0, -100, 0));
    this.next = 0;
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x1f3026, roughness: 0.22, metalness: 0.0, transparent: true, opacity: 0.86, depthWrite: false, envMapIntensity: 0.3,
      side: shared ? THREE.FrontSide : THREE.DoubleSide
    });
    this.mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = deckUniforms.uTime;
      shader.uniforms.uRings = { value: this.rings };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos;
          uniform float uTime;
          uniform vec4 uRings[${RINGS}];     // x, z, start time, strength
          // the surface's height at a point: swells, chop, and the rings
          float waterHeight(vec2 p) {
            float h = 0.012 * sin(p.x * 1.3 + uTime * 0.9) * sin(p.y * 1.1 - uTime * 0.7);
            h += 0.006 * sin(p.x * 4.1 - p.y * 3.3 + uTime * 2.3);
            h += 0.004 * sin(p.x * 7.3 + p.y * 6.1 - uTime * 3.1);
            for (int i = 0; i < ${RINGS}; i++) {
              float age = uTime - uRings[i].z;
              if (age < 0.0 || age > 3.0) continue;
              float r = distance(p, uRings[i].xy);
              float front = age * 1.3;
              float env = exp(-age * 1.4) * smoothstep(0.7, 0.0, abs(r - front)) * uRings[i].w;
              h += 0.03 * env * sin((r - front) * 16.0);
            }
            return h;
          }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            float e = 0.03;
            vec2 p = vWPos.xz;
            float h0 = waterHeight(p);
            vec3 wn = normalize(vec3(-(waterHeight(p + vec2(e, 0.0)) - h0) / e, 1.0, -(waterHeight(p + vec2(0.0, e)) - h0) / e));
            normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
          }`)
        .replace('#include <opaque_fragment>', `
          // more opaque looking across the water than straight down into it
          float facing = abs(dot(normalize(vViewPosition), normal));
          diffuseColor.a = mix(0.97, 0.78, facing);
          #include <opaque_fragment>`);
    };
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.set((bounds.minX + bounds.maxX) / 2, level, (bounds.minZ + bounds.maxZ) / 2);
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  get level() {
    return this._level;
  }

  set level(y) {
    this._level = y;
    if (this.shared) deckUniforms.uWaterLevel.value = y;
    this.mesh.position.y = y;
  }

  // a ring spreading from a point (strength about 1 for a step, 3 for a body landing)
  ring(x, z, strength = 1) {
    this.rings[this.next].set(x, z, deckUniforms.uTime.value, strength);
    this.next = (this.next + 1) % RINGS;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
