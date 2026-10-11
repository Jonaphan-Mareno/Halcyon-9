// Parallax occlusion mapping for floors, shared by the level 1 shader and the habitat materials.
//
// Bump mapping (which every textured surface already has) only bends the lighting: the grooves
// between floor tiles shade like grooves, but the picture itself stays flat, as if printed on
// the floor. Parallax occlusion mapping uses the same height map to move the picture: for each
// pixel it marches along the view ray down into the height field until it hits the surface, and
// shows the texel found there. Low areas (tile joints, the round service hatches) then slide
// away as the viewpoint moves, the raised tile edges hide part of them, and they read as really
// sunk into the floor. No extra geometry.
//
// The floors are horizontal, so the texture runs along world x and z and the "tangent space"
// is simply the world axes: no tangents needed. The height map sits in the texture's alpha
// (packed with the colour); the tile tops are at 0.5, so the depth below them is
// (0.52 - height) scaled up. Fewer steps when looking straight down (the shift is small then),
// and none at all beyond a few metres, where it would not be seen; this keeps it cheap on
// integrated graphics.

export const PARALLAX_GLSL = `
float pomDepth(vec4 texel) { return clamp((0.52 - texel.a) * 2.2, 0.0, 1.0); }

// uv: texture coordinates (world x, z divided by the tile size); toEye: unit vector from the
// surface to the eye (world space); depth: the deepest groove, in the same units as uv
vec2 parallaxFloor(sampler2D tex, vec2 uv, vec3 toEye, float depth, float dist) {
  // explicit gradients (taken before any branch): an early-exit loop breaks the automatic mip
  // selection, which shows as sparkles
  vec2 gx = dFdx(uv), gy = dFdy(uv);
  float fade = 1.0 - smoothstep(6.0, 11.0, dist);
  if (fade <= 0.0 || depth <= 0.0) return uv;
  float up = max(toEye.y, 0.12);
  float steps = mix(16.0, 6.0, up);
  float layer = 1.0 / steps;
  vec2 dUV = (toEye.xz / up) * depth * fade * layer;
  float cur = 0.0;
  vec2 p = uv;
  float d = pomDepth(textureGrad(tex, p, gx, gy));
  for (int i = 0; i < 16; i++) {
    if (float(i) >= steps || cur >= d) break;
    p -= dUV;
    d = pomDepth(textureGrad(tex, p, gx, gy));
    cur += layer;
  }
  // refine between the last two steps
  vec2 prev = p + dUV;
  float after = d - cur;
  float before = pomDepth(textureGrad(tex, prev, gx, gy)) - cur + layer;
  float w = after / (after - before + 1e-5);
  return mix(p, prev, clamp(w, 0.0, 1.0));
}
`;
