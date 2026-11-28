import { BackSide, BufferGeometry, Color, DataTexture, LinearFilter, RedFormat, ShaderMaterial, Vector2, Vector3 } from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The town's four custom shaders, and the only GLSL in Funtown's own code: the sea, the sky, the ink outline on characters and
 * the tilt-shift blur. Each is approved by the user; nothing else draws with a shader of its own.
 */

/**
 * The sea: deep blue far out, shallow teal near the land, rings of foam rolling in and a white edge at the shore, all read
 * from `heights`, the island's ground height over a `size`-wide square centred on the origin, stored as (height + 4) / 8.
 * It fogs itself into the horizon colour between `fog` near and far; set `time` and `camera` each frame.
 */
export function seaMaterial(heights: DataTexture, size: number, fog: [near: number, far: number]): ShaderMaterial {
  heights.magFilter = heights.minFilter = LinearFilter;
  return new ShaderMaterial({
    uniforms: {
      uH: { value: heights }, uSize: { value: size }, uTime: { value: 0 }, uCam: { value: new Vector3() }, uLight: { value: 1 },
      uDeep: { value: new Color() }, uShallow: { value: new Color() }, uFoam: { value: new Color() },
      uFogColor: { value: new Color() }, uFogNear: { value: fog[0] }, uFogFar: { value: fog[1] },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uH;
      uniform float uTime, uSize, uLight, uFogNear, uFogFar;
      uniform vec3 uDeep, uShallow, uFoam, uFogColor, uCam;
      varying vec3 vW;
      void main() {
        vec2 uv = vW.xz / uSize + 0.5;
        float h = -4.0;
        if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) h = texture2D(uH, uv).r * 8.0 - 4.0;
        float depth = max(0.0, -h);
        vec3 col = mix(uDeep, uShallow, smoothstep(2.8, 0.2, depth));
        float wave = sin(depth * 7.0 - uTime * 1.1 + sin(vW.x * 0.35 + uTime * 0.3) * 0.7);
        float foam = step(0.62, wave) * smoothstep(1.1, 0.25, depth) * 0.75;
        foam = max(foam, smoothstep(0.16, 0.04, depth));
        col = mix(col, uFoam, clamp(foam, 0.0, 1.0)) * uLight;
        gl_FragColor = vec4(mix(col, uFogColor, smoothstep(uFogNear, uFogFar, distance(uCam, vW))), 1.0);
      }`,
  });
}

/** The island's ground heights as the sea reads them: `cells` by `cells` samples of `height` over a `size`-wide square. */
export function heightTexture(height: (x: number, z: number) => number, size: number, cells: number): DataTexture {
  const data = new Uint8Array(cells * cells);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const h = height((i / (cells - 1) - 0.5) * size, (j / (cells - 1) - 0.5) * size);
      data[j * cells + i] = Math.round(Math.min(1, Math.max(0, (h + 4) / 8)) * 255);
    }
  }
  const texture = new DataTexture(data, cells, cells, RedFormat);
  texture.needsUpdate = true;
  return texture;
}

/**
 * The sky, for the inside of a sphere round the camera: the horizon colour rising into the top colour, a soft glow round the
 * sun, and the moon's disc by night.
 */
export function skyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new Color() }, uHor: { value: new Color() }, uGlow: { value: new Color() },
      uSun: { value: new Vector3(0, 1, 0) }, uMoon: { value: new Vector3(0, -1, 0) }, uNight: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHor, uGlow, uSun, uMoon;
      uniform float uNight;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHor, uTop, pow(smoothstep(-0.02, 0.55, d.y), 0.75));
        col += uGlow * pow(max(dot(d, uSun), 0.0), 6.0) * 0.55 * smoothstep(-0.1, 0.1, d.y + 0.05);
        col = mix(col, vec3(0.95, 0.93, 0.84), smoothstep(0.9988, 0.9991, dot(d, uMoon)) * uNight);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

const hulls = new WeakMap<BufferGeometry, BufferGeometry>();
/**
 * The outline's copy of `geometry`: positions only, welded so each corner has one smooth normal, so pushing the hull out
 * along its normals never splits it at a hard edge. Made once per geometry.
 */
export function hullOf(geometry: BufferGeometry): BufferGeometry {
  let hull = hulls.get(geometry);
  if (!hull) {
    hull = geometry.clone();
    for (const name of Object.keys(hull.attributes)) if (name !== "position") hull.deleteAttribute(name);
    hull = mergeVertices(hull, 1e-3);
    hull.computeVertexNormals();
    hulls.set(geometry, hull);
  }
  return hull;
}

const inks = new Map<string, ShaderMaterial>();
/**
 * The ink outline: the back faces of a hull (`hullOf`) pushed `width` world units out along their normals, in `colour`. One
 * material serves plain meshes and instanced ones (an InstancedMesh sharing its parts' instance matrices).
 */
export function inkMaterial(colour: string, width: number): ShaderMaterial {
  const key = `${colour}/${width}`;
  let ink = inks.get(key);
  if (!ink) {
    ink = new ShaderMaterial({
      side: BackSide,
      uniforms: { uColor: { value: new Color(colour) }, uWidth: { value: width } },
      vertexShader: /* glsl */ `
        uniform float uWidth;
        void main() {
          vec3 p = position;
          vec3 n = normal;
          #ifdef USE_INSTANCING
            p = (instanceMatrix * vec4(p, 1.0)).xyz;
            n = mat3(instanceMatrix) * n;
          #endif
          vec4 world = modelMatrix * vec4(p, 1.0);
          world.xyz += normalize(mat3(modelMatrix) * n) * uWidth;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() { gl_FragColor = vec4(uColor, 1.0); }`,
    });
    inks.set(key, ink);
  }
  return ink;
}

/**
 * One pass of the tilt-shift blur, for three's ShaderPass: a 9-tap Gaussian along `uDir`, none inside a band `uBand` either
 * side of the screen height `uFocus` (0 bottom, 1 top), growing to `uAmount` pixels beyond it. Run horizontal and vertical
 * twice. `uRes` is the target's size in pixels.
 */
export const TILT_SHIFT = {
  uniforms: {
    tDiffuse: { value: null }, uDir: { value: new Vector2(1, 0) }, uRes: { value: new Vector2(1, 1) },
    uAmount: { value: 1 }, uFocus: { value: 0.5 }, uBand: { value: 0.2 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir, uRes;
    uniform float uAmount, uFocus, uBand;
    varying vec2 vUv;
    void main() {
      vec2 st = uDir / uRes * smoothstep(uBand, uBand + 0.32, abs(vUv.y - uFocus)) * uAmount;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      c += (texture2D(tDiffuse, vUv + st * 1.3846153846) + texture2D(tDiffuse, vUv - st * 1.3846153846)) * 0.3162162162;
      c += (texture2D(tDiffuse, vUv + st * 3.2307692308) + texture2D(tDiffuse, vUv - st * 3.2307692308)) * 0.0702702703;
      gl_FragColor = c;
    }`,
};
