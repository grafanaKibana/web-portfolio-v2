import { heroFadeStops } from "./hero-background.config";

const fadeBranches = heroFadeStops.slice(1).map((endStop, index) => {
  const startStop = heroFadeStops[index];
  if (!startStop) throw new Error("Hero fade stops must be contiguous.");
  const start: number = startStop[0];
  const startAlpha: number = startStop[1];
  const end: number = endStop[0];
  const endAlpha: number = endStop[1];
  return `if (position <= ${end.toFixed(2)}) return mix(${startAlpha.toFixed(2)}, ${endAlpha.toFixed(2)}, clamp((position - ${start.toFixed(2)}) / ${(end - start).toFixed(2)}, 0.0, 1.0));`;
}).join("\n  ");

/** Vertex shader for a single full-frame hero quad. */
export const heroVertexShader = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/** Fragment shader matching the approved static field, veil, fade, grain, and final dithering. */
export const heroFragmentShader = `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_crop;
uniform float u_pixelRatio;
uniform sampler2D u_field;
uniform sampler2D u_grain;
uniform sampler2D u_dither;
uniform vec3 u_pageColor;
uniform vec3 u_veilColor;
uniform float u_veil;
uniform float u_grainOpacity;

float fadeOpacity(float position) {
  ${fadeBranches}
  return 1.0;
}

vec3 overlay(vec3 base, float blend) {
  vec3 lower = 2.0 * base * blend;
  vec3 upper = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
  return mix(lower, upper, step(vec3(0.5), base));
}

void main() {
  vec2 topUv = vec2(gl_FragCoord.x / u_resolution.x, 1.0 - gl_FragCoord.y / u_resolution.y);
  vec2 fieldUv = (topUv - 0.5) * u_crop + 0.5;
  vec3 color = texture2D(u_field, clamp(fieldUv, 0.0, 1.0)).rgb;
  color = mix(color, u_veilColor, u_veil);
  color = mix(color, u_pageColor, fadeOpacity(topUv.y));

  vec2 cssPixel = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y) / u_pixelRatio;
  float grain = texture2D(u_grain, cssPixel / 256.0).r;
  color = mix(color, overlay(color, grain), u_grainOpacity);

  float ditherSample = texture2D(u_dither, gl_FragCoord.xy / 256.0).r;
  float dither = (ditherSample * 255.0 + 0.5) / 256.0 - 0.5;
  color = floor(clamp(color, 0.0, 1.0) * 255.0 + 0.5 + dither) / 255.0;
  gl_FragColor = vec4(color, 1.0);
}
`;
