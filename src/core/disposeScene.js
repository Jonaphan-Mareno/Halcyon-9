// Empty a scene and free what it held on the GPU: every geometry, material and texture (including
// the textures in shader uniforms), the environment map, and the background. Used when one level
// is torn down for the next, so memory does not climb across a playthrough.
export function disposeScene(scene) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  scene.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(m);
      for (const v of Object.values(m)) if (v && v.isTexture) textures.add(v);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) textures.add(u.value);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
  if (scene.environment && scene.environment.dispose) scene.environment.dispose();
  scene.environment = null;
  scene.background = null;
  scene.fog = null;
  scene.clear();
}
