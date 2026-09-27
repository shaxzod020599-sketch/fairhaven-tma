// Shared GLSL for the "ovum" — a cinematic, resolution-independent redraw of the
// egg-cell icon printed on the FH PRO label. The same function drives the macro
// opening (full-screen) and the decal on the 3D bottle, so the pull-back is a true
// match cut.

export const TAIL_N = 40;

export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

export const OVUM_GLSL = /* glsl */ `
#define TAIL_N ${TAIL_N}
uniform float uTime;
uniform float uPulse;      // heartbeat envelope
uniform float uGlow;       // outer glow amount
uniform float uSperm;      // sperm visibility
uniform vec2 uHead;        // sperm head position (ovum units)
uniform vec2 uHeadDir;     // unit vector the head points to
uniform vec2 uTail[TAIL_N];
uniform vec3 uWaveA;       // shock-wave ring 1: radius, alpha, width
uniform vec3 uWaveB;       // shock-wave ring 2
uniform float uFert;       // 0..1 warmth after contact
uniform float uGlowR;      // radius where additive light must have faded (decal)

float sdSeg(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// Premultiplied colour + coverage alpha of the cell layer at point p (ovum radius = 1).
vec4 ovumLayer(vec2 p, float px) {
  float swell = 1.0 + 0.05 * uPulse;
  vec2 q = p / swell;
  float r = length(q);
  float aa = px * 1.5 + 0.003;

  // ---------- cell body
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  float rr = clamp(r, 0.0, 1.0);
  vec3 core = mix(vec3(0.96, 0.58, 0.71), vec3(0.99, 0.72, 0.66), uFert * 0.6);
  vec3 edge = mix(vec3(0.72, 0.15, 0.41), vec3(0.80, 0.24, 0.40), uFert * 0.5);
  vec3 col = mix(core, edge, smoothstep(0.0, 1.0, pow(rr, 1.35)));
  vec3 n = vec3(q, sqrt(max(0.0, 1.0 - rr * rr)));
  vec3 L = normalize(vec3(-0.45, 0.55, 0.72));
  col *= 0.74 + 0.30 * max(dot(n, L), 0.0);
  // cytoplasm: slow granular drift
  float g1 = fbm(q * 4.2 + vec2(uTime * 0.05, -uTime * 0.035));
  float g2 = fbm(q * 13.0 - vec2(uTime * 0.03, uTime * 0.02));
  col *= 0.90 + 0.12 * g1 + 0.07 * g2;
  // nucleus
  vec2 nc = vec2(0.02, -0.30);
  float nd = length((q - nc) * vec2(1.0, 1.1));
  float nuc = 1.0 - smoothstep(0.06, 0.2, nd);
  col = mix(col, vec3(0.46, 0.08, 0.21), nuc * 0.8);
  col += vec3(1.0, 0.55, 0.70) * exp(-pow((nd - 0.2) / 0.05, 2.0)) * 0.06;
  // satin sheen + membrane falloff
  col += pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 16.0) * 0.20;
  col *= mix(1.0, 0.80, smoothstep(0.72, 1.0, rr));

  vec3 add = vec3(0.0);

  // ---------- zona pellucida — the luminous white rim of the icon
  float ang = atan(q.y, q.x);
  float rimVar = 0.80 + 0.20 * sin(ang * 2.0 + 2.4) + 0.18 * (fbm(vec2(ang * 2.5, uTime * 0.25)) - 0.5);
  float rim = exp(-pow((r - 1.035) / 0.038, 2.0)) * rimVar;
  float rimSoft = exp(-pow((r - 1.05) / 0.12, 2.0));
  add += vec3(1.0, 0.94, 0.97) * (rim * 1.15 + rimSoft * 0.22) * (1.0 + 0.55 * uPulse);

  // ---------- corona radiata: soft round granules slowly orbiting the membrane
  {
    float ca = uTime * 0.035;
    vec2 cp = mat2(cos(ca), -sin(ca), sin(ca), cos(ca)) * q;
    vec2 cq = cp / 0.085;
    vec2 cid = floor(cq);
    float grains = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 c = cid + vec2(float(i), float(j));
        vec2 o = vec2(hash21(c + 1.7), hash21(c + 9.1));
        vec2 cpos = (c + 0.2 + 0.6 * o) * 0.085;
        float cr = length(cpos);
        float keep = smoothstep(1.08, 1.14, cr) * (1.0 - smoothstep(1.2, 1.7, cr));
        if (hash21(c + 4.4) > 0.55 + 0.35 * keep) continue;
        float rad = 0.012 + 0.02 * hash21(c + 6.2);
        float dd = length(cp - cpos);
        grains += keep * smoothstep(rad, rad * 0.25, dd) * (0.45 + 0.55 * hash21(c + 2.2));
      }
    }
    add += vec3(1.0, 0.72, 0.84) * grains * 0.55 * uGlow;
  }

  // ---------- outer glow
  float gl = exp(-max(r - 1.0, 0.0) * 2.6) * smoothstep(0.9, 1.02, r);
  add += vec3(1.0, 0.40, 0.63) * gl * 0.50 * uGlow * (1.0 + 0.9 * uPulse);

  // ---------- heartbeat shock waves
  add += vec3(1.0, 0.72, 0.84) * uWaveA.y * exp(-pow((r - uWaveA.x) / uWaveA.z, 2.0));
  add += vec3(1.0, 0.72, 0.84) * uWaveB.y * exp(-pow((r - uWaveB.x) / uWaveB.z, 2.0));

  // ---------- sperm: glowing head + undulating tail
  if (uSperm > 0.001) {
    float best = 1e3;
    float bestS = 0.0;
    for (int i = 0; i < TAIL_N - 1; i++) {
      float h;
      float d = sdSeg(p, uTail[i], uTail[i + 1], h);
      float s = (float(i) + h) / float(TAIL_N - 1);
      float w = mix(0.024, 0.006, s);
      float e = d - w;
      if (e < best) { best = e; bestS = s; }
    }
    float tailCore = 1.0 - smoothstep(-aa * 0.5, aa, best);
    float tailGlow = exp(-max(best, 0.0) / 0.05) * (1.0 - bestS * 0.7);
    add += (vec3(1.0, 0.93, 0.96) * tailCore * (1.0 - bestS * 0.55) + vec3(1.0, 0.55, 0.75) * tailGlow * 0.35) * uSperm;

    vec2 hd = normalize(uHeadDir);
    vec2 lp = p - uHead;
    vec2 loc = vec2(dot(lp, hd), dot(lp, vec2(-hd.y, hd.x)));
    float e = length(loc / vec2(0.125, 0.085));
    float head = 1.0 - smoothstep(0.82, 1.0 + aa * 8.0, e);
    add += (vec3(1.0, 0.97, 0.99) * head * 1.2 + vec3(1.0, 0.62, 0.80) * exp(-max(e - 0.8, 0.0) * 1.6) * 0.55) * uSperm;
  }

  add *= 1.0 - smoothstep(uGlowR * 0.7, uGlowR, r);
  return vec4(col * inside + add, inside);
}
`;

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const MACRO_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform vec2 uCenter;      // ovum centre in px (y up)
uniform float uRadius;     // ovum radius in px
uniform float uRot;
uniform float uFlash;
uniform vec2 uFlashPos;    // ovum units
uniform float uWarm;       // background warm-up toward the label berry
${NOISE_GLSL}
${OVUM_GLSL}

vec3 bokeh(vec2 px, float cell, float rad, float speed, float seed, float density) {
  vec3 acc = vec3(0.0);
  vec2 q = px / cell + vec2(seed * 3.7, uTime * speed + seed * 1.3);
  vec2 id = floor(q);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = id + vec2(float(i), float(j));
      float h = hash21(c + seed * 17.0);
      if (h > density) continue;
      vec2 o = vec2(hash21(c + 3.1 + seed), hash21(c + 7.7 + seed)) - 0.5;
      vec2 f = q - c - 0.5 - o * 0.7;
      float size = rad * (0.55 + 0.9 * hash21(c + 11.3));
      float d = length(f) / size;
      float disc = smoothstep(1.0, 0.82, d) * (0.65 + 0.35 * smoothstep(0.55, 0.98, d));
      float tw = 0.6 + 0.4 * sin(uTime * (1.3 + h * 2.0) + h * 40.0);
      vec3 tint = mix(vec3(1.0, 0.55, 0.72), vec3(1.0, 0.86, 0.80), hash21(c + 5.5));
      acc += tint * disc * tw;
    }
  }
  return acc;
}

void main() {
  vec2 px = vUv * uRes;
  vec2 d = px - uCenter;
  float cs = cos(uRot);
  float sn = sin(uRot);
  d = mat2(cs, -sn, sn, cs) * d;
  vec2 p = d / uRadius;
  float pxu = 1.0 / uRadius;

  // ---- background: deep plum body-space with slow nebula
  float rc = length(p * vec2(1.0, 0.85) - vec2(0.15, 0.35));
  vec3 bg = mix(vec3(0.055, 0.016, 0.035), vec3(0.19, 0.045, 0.11), smoothstep(3.6, 0.0, rc));
  float nb = fbm(p * 0.42 + vec2(uTime * 0.035, uTime * 0.02));
  float nb2 = fbm(p * 0.95 + nb * 1.6 - vec2(uTime * 0.02, -uTime * 0.03));
  bg += vec3(0.34, 0.07, 0.18) * pow(nb2, 2.2) * 0.5;
  bg += vec3(0.55, 0.12, 0.30) * exp(-length(p) * 0.85) * 0.16 * (1.0 + 0.9 * uPulse);
  vec3 warm = vec3(0.47, 0.17, 0.27);
  bg = mix(bg, warm * (0.92 + 0.12 * nb), uWarm);

  // ---- depth particles (far → near)
  vec2 sp = vUv * uRes;
  bg += bokeh(sp, 70.0, 0.10, 0.10, 1.0, 0.55) * 0.20 * (1.0 - uWarm * 0.8);
  bg += bokeh(sp + d * 0.04, 170.0, 0.16, 0.06, 2.0, 0.35) * 0.10 * (1.0 - uWarm * 0.8);

  vec4 cell = ovumLayer(p, pxu);
  vec3 col = bg * (1.0 - cell.a) + cell.rgb;

  // near, out-of-focus motes in front of the cell
  col += bokeh(sp - d * 0.08, 420.0, 0.20, 0.05, 3.0, 0.22) * 0.07 * (1.0 - uWarm);

  // ---- contact flash
  float fd = length(p - uFlashPos);
  col += vec3(1.0, 0.86, 0.92) * uFlash * (0.55 + 1.4 * exp(-fd * 1.2));

  // ---- lens: vignette + gentle shoulder + dither
  vec2 vv = (vUv - 0.5) * vec2(1.0, 1.25);
  col *= mix(0.62, 1.0, smoothstep(0.95, 0.25, length(vv)));
  col = col / (1.0 + max(col - 0.85, 0.0) * 0.9);
  col += (hash21(px + fract(uTime) * 100.0) - 0.5) / 255.0 * 2.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const DECAL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Decal on the label: vUv spans the patch; uPatch maps it to ovum units.
export const DECAL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec4 uPatch;   // xMin, xMax, yMin, yMax in ovum units
uniform float uPx;     // approximate size of one screen pixel in ovum units
${NOISE_GLSL}
${OVUM_GLSL}
void main() {
  vec2 p = vec2(mix(uPatch.x, uPatch.y, vUv.x), mix(uPatch.z, uPatch.w, vUv.y));
  vec4 c = ovumLayer(p, uPx);
  // keep additive light inside the patch
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.93, vUv.y);
  gl_FragColor = vec4(c.rgb * edge, c.a * edge);
}
`;
