// Compiles the shaders a scene (or part of one) will need, before it is seen, so nothing stalls the
// first time it comes into view.
//
// They are compiled for the way the levels really draw: into the post-processing's off-screen image
// (linear colour, no tone mapping), not straight to the screen. Compiling for the screen makes a
// different version of every shader, which the game never uses, and the real ones then compile one
// by one, mid-game, as each thing first appears (the wait before a room's walls show).
//
//   target    the render target the frame is drawn into (the composer's)
//   root      what to compile (default: the whole scene; hidden things are compiled too)
//   skip      things to leave for later: taken out of the scene while the compile is queued, then
//             put back (a later call compiles them, with root: the thing)
//
// The scene's lights are counted as they are now (lights change every shader), so a level must
// have all its lights in place first. With the browser's parallel compile
// (KHR_parallel_shader_compile) the work happens off the main thread and this only waits for it;
// without it, it compiles there and then.
export async function precompile(renderer, scene, camera, target, { root = scene, skip = [] } = {}) {
  const prev = renderer.getRenderTarget();
  const parked = skip.filter((o) => o?.parent).map((o) => [o, o.parent]);
  for (const [o, parent] of parked) parent.remove(o);
  renderer.setRenderTarget(target || null);
  let done = null;
  try {
    done = renderer.compileAsync(root, camera, scene);
  } catch (e) {
    renderer.compile(root, camera, scene);
  } finally {
    renderer.setRenderTarget(prev);
    for (const [o, parent] of parked) parent.add(o);
  }
  await done;
}
