import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import { AdditiveBlending, CanvasTexture, PointsMaterial, SRGBColorSpace, type PerspectiveCamera } from "three";
import { glowSpots } from "./glow.ts";
import { lightAt, type Light } from "./light.ts";
import type { Part } from "./parts.tsx";

/** The town's light for the page's clock, read again every minute. */
export function useLight(): Light {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return useMemo(() => lightAt(new Date(now)), [now]);
}

let texture: CanvasTexture | null = null;
/** A soft round glow, white at its heart and clear at its edge, drawn once on a canvas. */
function glowTexture(): CanvasTexture {
  if (texture) return texture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const draw = canvas.getContext("2d")!;
  const gradient = draw.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  draw.fillStyle = gradient;
  draw.fillRect(0, 0, 64, 64);
  texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Warm glow round every window pane and lantern in `parts`, added on top of the picture: soft round sprites, one batch (one
 * draw call) per size. They show as `lamps` (0 to 1, from `lightAt`) rises and are hidden while it is 0. Hidden behind anything
 * nearer, as a lamp would be.
 */
export function Glows({ parts, lamps }: { parts: Part[]; lamps: number }) {
  const fov = useThree((s) => (s.camera as PerspectiveCamera).fov);
  const batches = useMemo(() => {
    const by = new Map<number, number[]>();
    for (const { x, y, z, size } of glowSpots(parts)) by.set(size, [...(by.get(size) ?? []), x, y, z]);
    return [...by].map(([size, at]) => [size, new Float32Array(at)] as const);
  }, [parts]);
  const materials = useMemo(
    () =>
      batches.map(([size]) =>
        // A point's size reads as that share of the screen's height over the distance, with the field of view left out: put it back.
        new PointsMaterial({ map: glowTexture(), color: "#ffc46a", size: size / Math.tan((fov * Math.PI) / 360), transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }),
      ),
    [batches, fov],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  useEffect(() => {
    for (const m of materials) m.opacity = lamps * 0.75;
  }, [materials, lamps]);
  return (
    <group visible={lamps > 0}>
      {batches.map(([size, positions], i) => (
        <points key={size} material={materials[i]} frustumCulled={false} raycast={() => null}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          </bufferGeometry>
        </points>
      ))}
    </group>
  );
}
