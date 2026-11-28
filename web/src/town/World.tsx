import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BufferGeometry, Float32BufferAttribute, Fog, Mesh, MeshToonMaterial, NoToneMapping, PlaneGeometry, Points, PointsMaterial, SphereGeometry, Vector2,
  Vector3, WebGLRenderTarget, HalfFloatType, type ShaderMaterial,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { groundColour, landHeight, REACH } from "./island.ts";
import type { Light } from "./light.ts";
import { rng } from "./noise.ts";
import { GLASS, STEPS } from "./parts.tsx";
import { TILT_SHIFT, heightTexture, seaMaterial, skyMaterial } from "./shaders.ts";

/** Fog from this far out to that, in the horizon's colour, so the sea fades into haze. */
const FOG: [number, number] = [70, 240];
const SIZE = 2 * REACH;
/** The terrain's cells along each side, about three to a unit. */
const CELLS = 256;
/** How far the key light (the sun or the moon) sits from the island's middle, and the half-width its shadow covers. */
const SUN_DISTANCE = 70;
const SHADOW_REACH = 34;
/** The tilt-shift's sharp band: its middle and half-height as shares of the screen's height from the bottom. */
const FOCUS = { middle: 0.56, band: 0.2 };

let terrain: PlaneGeometry | null = null;
/** The island's one terrain mesh: heights from `landHeight`, coloured by height and slope. Made once. */
function terrainGeometry(): PlaneGeometry {
  if (terrain) return terrain;
  const geometry = new PlaneGeometry(SIZE, SIZE, CELLS, CELLS).rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) position.setY(i, landHeight(position.getX(i), position.getZ(i)));
  geometry.computeVertexNormals();
  const normal = geometry.attributes.normal;
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) colours.set(groundColour(position.getX(i), position.getZ(i), position.getY(i), normal.getY(i)), i * 3);
  geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
  return (terrain = geometry);
}

let sea: ShaderMaterial | null = null;
/** The sea's material, which reads the island's heights once. */
const seaOf = () => (sea ??= seaMaterial(heightTexture(landHeight, SIZE, CELLS), SIZE, FOG));

const sky = skyMaterial();
/** Seven hundred stars on the sky's upper half, the same every load. */
const STARS = (() => {
  const random = rng(3);
  const at: number[] = [];
  while (at.length < 700 * 3) {
    const v = new Vector3(random() * 2 - 1, random(), random() * 2 - 1);
    if (v.length() > 1 || v.y < 0.04) continue;
    at.push(...v.normalize().multiplyScalar(480).toArray());
  }
  return new BufferGeometry().setAttribute("position", new Float32BufferAttribute(at, 3));
})();
const STAR_MATERIAL = new PointsMaterial({ color: "#fff6e0", size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false });
const SKY_BALL = new SphereGeometry(500, 32, 16);
const SEA_PLANE = new PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2);
const GROUND_MATERIAL = new MeshToonMaterial({ vertexColors: true, gradientMap: STEPS });

/**
 * The island's world in `light` (from `lightAt`): terrain, sea, sky with its stars and moon, one key light (the sun or the moon)
 * with its 4096 shadow map over the whole island, a sky-and-ground fill, fog in the horizon colour, the window glass lit as
 * `light.lamps` says, and the post passes (a multisampled target, the tilt-shift, the output pass). It takes over the canvas's
 * drawing while it is shown and gives it back, with the fog and tone mapping it changed, when it goes.
 */
export function World({ light }: { light: Light }) {
  const ground = useMemo(terrainGeometry, []);
  const water = useMemo(seaOf, []);
  const skyBall = useRef<Mesh>(null);
  const stars = useRef<Points>(null);
  const { gl, scene, camera, size } = useThree();

  useEffect(() => {
    const [toneMapping, fog] = [gl.toneMapping, scene.fog];
    gl.toneMapping = NoToneMapping;
    scene.fog = new Fog(light.sky.horizon, ...FOG);
    return () => {
      gl.toneMapping = toneMapping;
      scene.fog = fog;
    };
  }, [gl, scene]);

  // The colours follow the light, which changes once a minute.
  useEffect(() => {
    (scene.fog as Fog).color.set(light.sky.horizon);
    sky.uniforms.uTop.value.set(light.sky.top);
    sky.uniforms.uHor.value.set(light.sky.horizon);
    sky.uniforms.uGlow.value.set(light.sky.glow);
    sky.uniforms.uSun.value.set(...light.sky.sun);
    sky.uniforms.uMoon.value.set(...light.sky.moon);
    sky.uniforms.uNight.value = light.sky.night;
    STAR_MATERIAL.opacity = light.stars;
    GLASS.emissiveIntensity = light.lamps * 1.7;
    const u = water.uniforms;
    u.uDeep.value.set(light.sea.deep);
    u.uShallow.value.set(light.sea.shallow);
    u.uFoam.value.set(light.sea.foam);
    u.uLight.value = light.sea.light;
    u.uFogColor.value.set(light.sky.horizon);
  }, [light, scene, water]);

  const composer = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    const post = new EffectComposer(gl, target);
    post.addPass(new RenderPass(scene, camera));
    for (const [x, y] of [[1, 0], [0, 1], [1, 0], [0, 1]]) {
      const pass = new ShaderPass(TILT_SHIFT);
      pass.uniforms.uDir.value = new Vector2(x, y);
      pass.uniforms.uFocus.value = FOCUS.middle;
      pass.uniforms.uBand.value = FOCUS.band;
      post.addPass(pass);
    }
    post.addPass(new OutputPass());
    return post;
  }, [gl, scene, camera]);
  useEffect(() => () => composer.dispose(), [composer]);
  useEffect(() => {
    const ratio = gl.getPixelRatio();
    composer.setPixelRatio(ratio);
    composer.setSize(size.width, size.height);
    for (const pass of composer.passes) {
      if (!(pass instanceof ShaderPass) || !("uRes" in pass.uniforms)) continue;
      pass.uniforms.uRes.value.set(size.width * ratio, size.height * ratio);
      pass.uniforms.uAmount.value = 1.4 * ratio;
    }
  }, [composer, gl, size]);

  // Priority 1: the composer draws the frame in place of the canvas's own render.
  useFrame(({ clock }, delta) => {
    skyBall.current!.position.copy(camera.position);
    stars.current!.position.copy(camera.position);
    water.uniforms.uTime.value = clock.elapsedTime;
    water.uniforms.uCam.value.copy(camera.position);
    composer.render(delta);
  }, 1);

  return (
    <>
      <hemisphereLight color={light.fill.sky} groundColor={light.fill.ground} intensity={light.fill.intensity} />
      <directionalLight
        position={light.key.from.map((c) => c * SUN_DISTANCE) as [number, number, number]}
        color={light.key.colour}
        intensity={light.key.intensity}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-SHADOW_REACH}
        shadow-camera-right={SHADOW_REACH}
        shadow-camera-top={SHADOW_REACH}
        shadow-camera-bottom={-SHADOW_REACH}
        shadow-camera-near={1}
        shadow-camera-far={160}
      />
      <mesh ref={skyBall} geometry={SKY_BALL} material={sky} renderOrder={-1} />
      <points ref={stars} geometry={STARS} material={STAR_MATERIAL} renderOrder={-1} frustumCulled={false} visible={light.stars > 0} />
      <mesh geometry={SEA_PLANE} material={water} />
      <mesh geometry={ground} material={GROUND_MATERIAL} receiveShadow />
    </>
  );
}
