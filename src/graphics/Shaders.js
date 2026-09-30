const vertexShader =
`
#define MAX_LIGHTS 9

varying vec3 fNormal;
varying vec3 fPosition;
varying vec2 vUv;

uniform vec2 uvRepeat;

void main()
{
  vUv = uv * uvRepeat;
  fNormal = normalize(normalMatrix * normal);
  vec4 pos = modelViewMatrix * vec4(position, 1.0);
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

// Self-lit glow added on top of the lighting (pulsing cables, alert lights)
uniform vec3 glowColor;
uniform float glowAmount;

// Game state: 0 = station dead (a few strips flicker), 1 = fully powered
uniform float uPower;
uniform float uTime;

varying vec3 fPosition;
varying vec3 fNormal;
varying vec2 vUv;

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

void main()
{
  // Double-sided: flip the normal on back faces so they shade correctly
  vec3 N = normalize(fNormal);
  if (!gl_FrontFacing) N = -N;

  if (hasNormalMap > 0.5) {
    vec3 mapN = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
    mapN.xy *= normalScale;
    N = perturbNormal(fPosition, N, mapN);
  }

  vec3 V = normalize(-fPosition);
  vec3 rimColor = vec3(0.1, 0.9, 1.0);

  vec3 albedo = baseColor;
  if (hasMap > 0.5) albedo *= texture2D(map, vUv).rgb;

  vec3 color = albedo * ambientColor;

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
    float toon = floor(diff * 3.0) / 3.0;

    // Wide smoothstep window on the specular: a hard threshold pops on/off
    // per pixel while moving, which reads as flickering
    vec3 H = normalize(L + V);
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), 48.0);
    float specToon = smoothstep(0.25, 0.75, spec);

    color += albedo * toon * lightColors[i] * attenuation;
    color += lightColors[i] * specToon * attenuation * 0.3;
  }

  float rim = 1.0 - clamp(dot(N, V), 0.0, 1.0);
  rim = smoothstep(0.6, 1.0, rim);
  color += rimColor * rim * 0.15;

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

  color = clamp(color, 0.0, 1.0);
  gl_FragColor = vec4(color, 1.0);
}
`
;


export const Shaders = {
fragmentShader,
vertexShader,
};