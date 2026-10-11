// The level shader: everything in level 1 is drawn with it, lit by the level's own lights
// (the room fixtures, the cell's emergency light and the flashlight), so the power puzzle can
// dim, stutter and restore them.
//
// It shares the habitat's look (level 2's atrium): smooth lighting, a soft sky/floor ambient
// that comes up with the power, gloss that depends on each surface's roughness, and the same
// procedural surface textures (painted walls, floor tiles, fabric, brushed steel) mapped by
// world position, so nothing needs UVs. The room's one-mesh shell is split by facing: floor
// tiles below, a navy lower wall with an orange stripe, white walls above, a dark ceiling.

const vertexShader =
`
#define MAX_LIGHTS 9

varying vec3 fNormal;
varying vec3 fPosition;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWorldNrm;

uniform vec2 uvRepeat;

void main()
{
  vUv = uv * uvRepeat;
  fNormal = normalize(normalMatrix * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vWorldNrm = normalize(mat3(modelMatrix) * normal);
  vec4 pos = viewMatrix * world;
  fPosition = pos.xyz;

  gl_Position = projectionMatrix * pos;
}
`
;

const fragmentShader =
`
precision highp float;
#define MAX_LIGHTS 9

uniform vec3 baseColor;
uniform vec3 ambientColor;
uniform int numLights;

uniform vec3 lightPositions[MAX_LIGHTS]; // world space
uniform vec3 lightDirs[MAX_LIGHTS];      // world space, used by spotlights
uniform vec2 lightCones[MAX_LIGHTS];     // (outer cos, inner cos); x < -1.5 means a plain point light
uniform vec3 lightColors[MAX_LIGHTS];
uniform float lightIntensities[MAX_LIGHTS];

// Textures (each has a has* flag because an unbound sampler reads as black)
uniform sampler2D map;
uniform float hasMap;
uniform sampler2D normalMap;
uniform float hasNormalMap;
uniform float normalScale;
uniform sampler2D emissiveMap;
uniform float hasEmissiveMap;
uniform vec3 emissiveColor;

// Surface: a world-mapped texture (colour in RGB, height in alpha), its tile size in metres and
// bump strength, plus how rough / metallic the surface is
uniform sampler2D triTex;
uniform float hasTri;
uniform float triTile;
uniform float triBump;
uniform float roughness;
uniform float metalness;

// A room shell (one mesh for floor, walls and ceiling): coloured by which way each face points.
// "bands" adds the navy lower wall and orange stripe. With "hasOuter" the faces seen from
// outside the shell (pointing away from shellCentre) take the outer look instead: the cell is
// bare concrete inside but has the control room's walls on the outside.
uniform float shellMode;
uniform float bands;
uniform sampler2D floorTex;
uniform float floorTile;
uniform float floorRough;
uniform vec3 floorColor;
uniform vec3 ceilColor;
uniform float hasOuter;
uniform vec3 shellCentre;
uniform sampler2D outerTex;
uniform vec3 outerColor;
// A zone of the shell drawn differently: the control room's wall that is also the cell's door
// wall is concrete where it faces into the cell
uniform float hasZone;
uniform vec3 zoneMin;
uniform vec3 zoneMax;
uniform sampler2D zoneTex;
uniform vec3 zoneColor;

// Ambient light from above and below (rises with the power) and its reflection in glossy things
uniform vec3 hemiSky;
uniform vec3 hemiGround;
uniform float envStrength;

// Self-lit glow added on top of the lighting (pulsing cables, alert lights)
uniform vec3 glowColor;
uniform float glowAmount;

// Game state: 0 = station dead (a few strips flicker), 1 = fully powered
uniform float uPower;
uniform float uTime;

varying vec3 fPosition;
varying vec3 fNormal;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWorldNrm;

float hash(vec2 p)
{
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Tangent-free normal mapping: builds the tangent frame from screen-space
// derivatives of position and UV, so the GLB needs no tangent attribute
vec3 perturbNormal(vec3 eyePos, vec3 surfNormal, vec3 mapN)
{
  vec3 q0 = dFdx(eyePos);
  vec3 q1 = dFdy(eyePos);
  vec2 st0 = dFdx(vUv);
  vec2 st1 = dFdy(vUv);

  vec3 q1perp = cross(q1, surfNormal);
  vec3 q0perp = cross(surfNormal, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;

  float det = max(dot(T, T), dot(B, B));
  float scale = det == 0.0 ? 0.0 : inversesqrt(det);
  return normalize(T * (mapN.x * scale) + B * (mapN.y * scale) + surfNormal * mapN.z);
}

// The texture sampled along the three world axes and blended by the facing (triplanar)
vec4 triSample(sampler2D t, vec3 p, vec3 w)
{
  vec4 c = vec4(0.0);
  if (w.x > 0.02) c += texture2D(t, p.zy) * w.x;
  if (w.y > 0.02) c += texture2D(t, p.xz) * w.y;
  if (w.z > 0.02) c += texture2D(t, p.xy) * w.z;
  return c;
}

// Bends the normal by the slope of the height map (as three.js's own bump mapping does)
vec3 bumpNormal(vec3 surfPos, vec3 surfNorm, vec2 dHdxy)
{
  vec3 sx = normalize(dFdx(surfPos));
  vec3 sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}

// Filmic curve (ACES fit) and the sRGB curve: the same final grading as level 2
vec3 filmic(vec3 x)
{
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 toSRGB(vec3 c)
{
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main()
{
  // Double-sided: flip the normal on back faces so they shade correctly
  vec3 N = normalize(fNormal);
  vec3 WN = normalize(vWorldNrm);
  if (!gl_FrontFacing) { N = -N; WN = -WN; }

  // Room shells are simple boxes, sometimes exported with corners shared and normals averaged
  // into diagonals: use the true flat facing of each face instead (turned towards the camera)
  if (shellMode > 0.5) {
    WN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    if (dot(WN, cameraPosition - vWorldPos) < 0.0) WN = -WN;
    N = normalize((viewMatrix * vec4(WN, 0.0)).xyz);
  }

  if (hasNormalMap > 0.5) {
    vec3 mapN = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
    mapN.xy *= normalScale;
    N = perturbNormal(fPosition, N, mapN);
  }

  vec3 albedo = baseColor;
  if (hasMap > 0.5) albedo *= texture2D(map, vUv).rgb;
  float rough = roughness;
  float metal = metalness;

  // World-mapped surface texture
  if (hasTri > 0.5) {
    vec3 w = pow(abs(WN), vec3(6.0));
    w = max(w - 0.02, 0.0);
    w /= (w.x + w.y + w.z);
    vec3 p = vWorldPos / triTile;
    vec4 t;
    if (shellMode > 0.5) {
      // Floor, lower wall, stripe, upper wall, ceiling
      float up = WN.y;
      float h = vWorldPos.y;
      bool outer = hasOuter > 0.5 && dot(WN, shellCentre - vWorldPos) < 0.0;
      if (!outer && up > 0.6) {
        t = triSample(floorTex, vWorldPos / floorTile, w);
        albedo = floorColor; rough = floorRough; metal = 0.05;
      } else if (!outer && up < -0.6) {
        t = triSample(triTex, p, w);
        albedo = ceilColor;
      } else {
        bool zone = hasZone > 0.5 && all(greaterThan(vWorldPos, zoneMin)) && all(lessThan(vWorldPos, zoneMax))
          && dot(WN, (zoneMin + zoneMax) * 0.5 - vWorldPos) > 0.0;
        if (outer) { t = triSample(outerTex, vWorldPos / 2.2, w); albedo = outerColor; rough = 0.5; metal = 0.0; }
        else if (zone) { t = triSample(zoneTex, vWorldPos / 2.4, w); albedo = zoneColor; rough = 0.85; metal = 0.0; }
        else t = triSample(triTex, p, w);
        if ((bands > 0.5 || outer) && !zone) {
          if (h < 0.12) { albedo = vec3(0.006, 0.007, 0.009); rough = 0.3; }   // skirting
          else if (h < 1.15) { albedo = vec3(0.008, 0.017, 0.042); rough = 0.45; }   // navy lower wall
          else if (h < 1.22) { albedo = vec3(0.87, 0.19, 0.007); rough = 0.35; }    // orange stripe
        }
      }
    } else {
      t = triSample(triTex, p, w);
    }
    albedo *= t.rgb * 1.45;
    rough = clamp(rough * (1.55 - t.a * 1.1), 0.12, 1.0);
    N = bumpNormal(fPosition, N, vec2(dFdx(t.a), dFdy(t.a)) * triBump);
  }

  vec3 V = normalize(-fPosition);
  float NdV = clamp(dot(N, V), 0.0, 1.0);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 diffuseAlbedo = albedo * (1.0 - metal);
  float shininess = clamp(2.0 / max(rough * rough * rough * rough, 0.0005) - 2.0, 2.0, 1024.0);
  float specNorm = (shininess + 8.0) / 25.0;

  // Ambient: light from the ceiling above and bounced off the floor below
  // (darker low down and up under the ceiling, a cheap stand-in for the shading in corners)
  vec3 hemi = mix(hemiGround, hemiSky, WN.y * 0.5 + 0.5);
  float occl = (0.55 + 0.45 * smoothstep(0.0, 1.8, vWorldPos.y)) * (1.0 - 0.35 * smoothstep(4.5, 6.6, vWorldPos.y));
  vec3 color = diffuseAlbedo * (ambientColor + hemi * occl);

  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= numLights) break;

    // Uniform arrays can be indexed dynamically; varying arrays cannot on D3D
    vec3 lightViewPos = (viewMatrix * vec4(lightPositions[i], 1.0)).xyz;
    vec3 toLight = lightViewPos - fPosition;
    float dist = length(toLight);
    vec3 L = dist > 0.0001 ? normalize(toLight) : vec3(0.0, 1.0, 0.0);

    float attenuation = lightIntensities[i] / (1.0 + 1.0 * dist + 0.5 * dist * dist);

    // Spotlight (the flashlight): fade out between the inner and outer cone
    if (lightCones[i].x > -1.5) {
      vec3 spotDir = normalize((viewMatrix * vec4(lightDirs[i], 0.0)).xyz);
      attenuation *= smoothstep(lightCones[i].x, lightCones[i].y, dot(-L, spotDir));
    }
    float diff = clamp(dot(N, L), 0.0, 1.0);

    vec3 H = normalize(L + V);
    float NdH = clamp(dot(N, H), 0.0, 1.0);
    vec3 fres = F0 + (1.0 - F0) * pow(1.0 - clamp(dot(L, H), 0.0, 1.0), 5.0);
    vec3 spec = fres * pow(NdH, shininess) * specNorm;

    color += (diffuseAlbedo + spec) * diff * lightColors[i] * attenuation;
  }

  // Glossy surfaces reflect the bright room around them (strongest at grazing angles)
  vec3 R = reflect(-V, N);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - NdV, 5.0);
  float gloss = (1.0 - rough) * (1.0 - rough);
  vec3 reflected = mix(hemiGround, hemiSky * 1.6, smoothstep(-0.3, 0.6, (vec4(R, 0.0) * viewMatrix).y));
  color += reflected * F * gloss * envStrength;

  // A faint cyan rim (the team's signature, kept subtle)
  float rim = smoothstep(0.6, 1.0, 1.0 - NdV);
  color += vec3(0.1, 0.9, 1.0) * rim * 0.035;

  // Emissive LED strips. Unpowered: only ~20% of cells are alive and they
  // stutter on/off. Powered: every cell is steady. uPower blends between.
  if (hasEmissiveMap > 0.5) {
    vec2 cell = floor(vUv * 6.0);
    float alive = step(0.8, hash(cell));
    float stutter = step(0.45, hash(vec2(cell.x + floor(uTime * 12.0), cell.y)));
    float strip = mix(alive * stutter, 1.0, uPower);
    color += emissiveColor * texture2D(emissiveMap, vUv).rgb * strip;
  }

  color += glowColor * glowAmount;

  gl_FragColor = vec4(toSRGB(filmic(color)), 1.0);
}
`
;


export const Shaders = {
fragmentShader,
vertexShader,
};
