/** A seeded random in [0, 1), so every load draws the same world. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 at `a`, 1 at `b` (either way round), eased between: GLSL's smoothstep. */
export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Seeded fractal value noise in about [-1, 1]: `octaves` layers of smooth 2D value noise, each twice as fine. */
export function makeNoise(seed: number): (x: number, y: number, octaves?: number) => number {
  const r = rng(seed);
  const p = new Uint8Array(512);
  const v = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    p[i] = i;
    v[i] = r() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const at = (x: number, y: number) => v[p[p[x & 255] + (y & 255)]];
  const noise = (x: number, y: number) => {
    const [xi, yi] = [Math.floor(x), Math.floor(y)];
    const [xf, yf] = [x - xi, y - yi];
    const [a, b, c, d] = [at(xi, yi), at(xi + 1, yi), at(xi, yi + 1), at(xi + 1, yi + 1)];
    const [u, w] = [xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)];
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  return (x, y, octaves = 4) => {
    let [sum, amp, f, norm] = [0, 0.5, 1, 0];
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * f, y * f);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  };
}
