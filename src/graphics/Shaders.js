const vertexShader =
`
#define MAX_LIGHTS 8

varying vec3 fNormal;
varying vec3 fPosition;
varying vec3 fLightPos[MAX_LIGHTS];

uniform vec3 lightPositions[MAX_LIGHTS]; // world space
uniform int numLights;

void main()
{
  fNormal = normalize(normalMatrix * normal);
  vec4 pos = modelViewMatrix * vec4(position, 1.0);
  fPosition = pos.xyz;

  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= numLights) break;
    fLightPos[i] = (viewMatrix * vec4(lightPositions[i], 1.0)).xyz;
  }

  gl_Position = projectionMatrix * pos;
}
`
;

const fragmentShader = 
`
precision highp float;
#define MAX_LIGHTS 8

uniform vec3 baseColor;
uniform vec3 ambientColor;
uniform int numLights;

uniform vec3 lightColors[MAX_LIGHTS];
uniform float lightIntensities[MAX_LIGHTS];

varying vec3 fPosition;
varying vec3 fNormal;
varying vec3 fLightPos[MAX_LIGHTS];

void main()
{
  // Double-sided: flip the normal on back faces so they shade correctly
  vec3 N = normalize(fNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-fPosition);
  vec3 rimColor = vec3(0.1, 0.9, 1.0);

  vec3 color = baseColor * ambientColor;

  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= numLights) break;

    vec3 toLight = fLightPos[i] - fPosition;
    float dist = length(toLight);
    vec3 L = dist > 0.0001 ? normalize(toLight) : vec3(0.0, 1.0, 0.0);

    float attenuation = lightIntensities[i] / (1.0 + 1.0 * dist + 0.5 * dist * dist);
    float diff = clamp(dot(N, L), 0.0, 1.0);
    float toon = floor(diff * 3.0) / 3.0;

    // Wide smoothstep window on the specular: a hard threshold pops on/off
    // per pixel while moving, which reads as flickering
    vec3 H = normalize(L + V);
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), 48.0);
    float specToon = smoothstep(0.25, 0.75, spec);

    color += baseColor * toon * lightColors[i] * attenuation;
    color += lightColors[i] * specToon * attenuation * 0.3;
  }

  float rim = 1.0 - clamp(dot(N, V), 0.0, 1.0);
  rim = smoothstep(0.6, 1.0, rim);
  color += rimColor * rim * 0.15;

  color = clamp(color, 0.0, 1.0);
  gl_FragColor = vec4(color, 1.0);
}
`
;


export const Shaders = {
fragmentShader,
vertexShader,
};