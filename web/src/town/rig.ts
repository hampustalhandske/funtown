import { Color, Euler, Quaternion, Vector3 } from "three";
import type { Animal, Clothing, Costume } from "./folk.ts";
import { hatParts, propParts, type Prop } from "./folk-dress.ts";
import { RigBuilder, seeded, type Joint, type Rig } from "./folk-parts.ts";

/** Each animal's build: body, head and leg sizes, its fur (a cat's is picked by its seed) and its belly. */
const ANIMALS: Record<Animal, { body: number; head: number; leg: number; fur: string | null; belly: string }> = {
  cat: { body: 0.25, head: 0.3, leg: 0.1, fur: null, belly: "#f4ece0" },
  beaver: { body: 0.3, head: 0.29, leg: 0.08, fur: "#9a6b4a", belly: "#c9a27a" },
  hare: { body: 0.22, head: 0.26, leg: 0.16, fur: "#c8b496", belly: "#f4ece0" },
  hedgehog: { body: 0.24, head: 0.26, leg: 0.06, fur: "#e8d6bc", belly: "#f4ece0" },
  owl: { body: 0.3, head: 0.28, leg: 0.06, fur: "#a08a74", belly: "#e8dcc8" },
};
const CAT_FUR = ["#e39a5a", "#9a9590", "#4a4446", "#efe2c8", "#b08a64", "#d9b48a"];
const PINK = "#f0b8b0";
const shade = (c: string, l: number) => `#${new Color(c).offsetHSL(0, 0, l).getHexString()}`;

/** Two eyes on a head of radius `h`: whites with dark pupils looking ahead, each with a shine. */
function eyes(b: RigBuilder, h: number, { spread, y, size, tall = 1.25, z }: { spread: number; y: number; size: number; tall?: number; z?: number }) {
  const front = z ?? Math.sqrt(Math.max(0, h * h - spread * spread - y * y));
  for (const sx of [-1, 1]) {
    b.put("sph", [sx * spread, y, front - 0.02], { s: [0.085 * size, 0.1 * size * tall, 0.06 * size], c: "#ffffff" });
    b.put("dot", [sx * spread, y, front + 0.03 * size], { s: [0.048 * size, 0.056 * size, 0.04 * size], c: "#1d1a22" });
    b.put("dot", [sx * spread + 0.02 * size, y + 0.02 * size, front + 0.065 * size], { s: 0.014 * size, c: "#ffffff" });
  }
}

/** The clothes in `wear` on a body of radius `body` centred at height `by`; the lead's carry the project's `colour`. */
function dress(b: RigBuilder, wear: Clothing[], body: number, by: number, colour: string) {
  b.at("root", [0, 0, 0]);
  if (wear.includes("scarf")) b.put("ring", [0, by + body * 0.82, 0], { s: [body * 0.62, 0.3, body * 0.62], c: colour });
  for (const [name, c, k] of [["apron", colour, 1.2], ["white-apron", "#fbf8f2", 1]] as const) {
    if (wear.includes(name)) b.put("shell", [0, by - body * 0.25, 0], { s: [body + 0.025, body * k, body + 0.025], c });
  }
  if (wear.includes("toolbelt")) {
    b.put("ring", [0, by - body * 0.3, 0], { s: [body * 0.98, 0.18, body * 0.98], c: "#6b4a36" });
    for (const sx of [-1, 1]) b.put("box", [sx * body * 0.75, by - body * 0.42, body * 0.55], { r: [0, sx * 0.6, 0], s: [0.1, 0.12, 0.07], c: "#8a6a50" });
  }
  if (wear.includes("pack")) b.put("box", [0, by + 0.04, -body - 0.06], { s: [0.28, 0.34, 0.16], c: "#9a6b4a" });
}

/** A hedgehog's spikes over the back of its head (centred at `head`, radius `h`) and body (centred at `body`, radius `r`). */
function spikes(b: RigBuilder, seed: number, head: Vector3, h: number, body: Vector3, r: number) {
  const random = seeded(seed);
  const up = new Vector3(0, 1, 0);
  const tilt = new Euler();
  for (let k = 0; k < 90; k++) {
    const onHead = k < 40;
    const th = 0.25 + random() * 2.3;
    const ph = Math.PI + (random() - 0.5) * 2.4;
    const dir = new Vector3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
    if (dir.z > (onHead ? 0.55 : 0.3) || (onHead && dir.y < -0.1)) continue;
    const at = dir.clone().multiplyScalar((onHead ? h : r) * 0.95).add(onHead ? head : body);
    tilt.setFromQuaternion(new Quaternion().setFromUnitVectors(up, dir));
    b.at(onHead ? "head" : "root", [0, 0, 0]).put("spike", [at.x, at.y, at.z], { r: [tilt.x, tilt.y, tilt.z], s: [0.05, 0.19, 0.05], c: "#6b4a36" });
  }
}

/**
 * A folk in `costume` holding or working at `props`: its animal, clothes (the lead's in the project's `colour`), hat and
 * props as parts, with its joints. `seed` picks a cat's fur and a hedgehog's spikes.
 */
export function rigOf({ animal, hat, clothes }: Costume, colour: string, seed: number, props: Prop[]): Rig {
  const a = ANIMALS[animal];
  const fur = a.fur ?? CAT_FUR[seed % CAT_FUR.length];
  const [dark, light] = [shade(fur, -0.12), shade(fur, 0.1)];
  const by = a.leg + a.body * 1.05;
  const H = a.head;
  const b = new RigBuilder();

  b.at("root", [0, 0, 0]);
  b.put("sph", [0, by, 0], { s: [a.body, a.body * 1.12, a.body * 0.95], c: fur });
  b.put("sph", [0, by - 0.02, a.body * 0.52], { s: [a.body * 0.72, a.body * 0.85, a.body * 0.5], c: a.belly });

  const shoulder = (sx: number) => new Vector3(sx * a.body * 0.92, by + a.body * 0.35, 0);
  const hip = (sx: number) => new Vector3(sx * a.body * 0.45, a.leg + 0.06, 0);
  const leg = Math.max(0.02, a.leg - 0.02);
  for (const [sx, side] of [[-1, "L"], [1, "R"]] as const) {
    b.at(`arm${side}`, shoulder(sx));
    b.put("sph", [0, -0.083, 0], { s: [0.06, 0.125, 0.06], c: fur });
    b.put("sph", [0, -0.166, 0], { s: 0.08, c: light });
    b.at(`leg${side}`, hip(sx));
    b.put("sph", [0, -leg / 2 - 0.02, 0], { s: [0.075, leg / 2 + 0.075, 0.075], c: fur });
    b.put("sph", [0, -leg - 0.045, 0.04], { s: [0.11, 0.066, 0.143], c: dark });
  }

  const head = new Vector3(0, by + a.body + H * 0.7, 0);
  b.at("head", head);
  b.put("sph", [0, 0, 0], { s: [H * 1.08, H, H * 0.98], c: fur });
  if (animal === "owl") {
    for (const sx of [-1, 1]) b.put("sph", [sx * H * 0.36, H * 0.02, H * 0.8], { s: [H * 0.42, H * 0.46, H * 0.2], c: a.belly });
    eyes(b, H, { spread: H * 0.37, y: H * 0.04, size: 1.3, z: H * 0.98 });
    b.put("cone", [0, -H * 0.2, H * 0.98], { r: [Math.PI / 2 + 0.6, 0, 0], s: [0.045, 0.12, 0.045], c: "#e8b84a" });
    for (const sx of [-1, 1]) {
      b.put("cone", [sx * H * 0.62, H * 0.82, 0], { r: [0, 0, -sx * 0.5], s: [0.07, 0.2, 0.07], c: dark });
      // The reviewer's round spectacles.
      b.put("dot", [sx * H * 0.37, H * 0.04, H * 1.08], { r: [Math.PI / 2, 0, 0], s: [0.1, 0.012, 0.1], c: "#6b5444" });
    }
  } else {
    const hog = animal === "hedgehog";
    b.put("sph", hog ? [0, -H * 0.24, H * 0.82] : [0, -H * 0.3, H * 0.78], { s: hog ? [H * 0.3, H * 0.24, H * 0.5] : [H * 0.42, H * 0.3, H * 0.3], c: a.belly });
    b.put("dot", hog ? [0, -H * 0.2, H * 1.3] : [0, -H * 0.18, H * 1.02], {
      s: hog ? 0.05 : [0.045, 0.035, 0.035], c: animal === "cat" || animal === "hare" ? "#e79a9a" : "#3a2e2e",
    });
    eyes(b, H, { spread: H * 0.36, y: H * 0.08, size: (H / 0.29) * 0.9, tall: 1.3 });
  }
  for (const sx of [-1, 1]) b.put("dot", [sx * H * 0.66, -H * 0.2, H * 0.72], { s: [0.05, 0.03, 0.02], c: "#f0a99a" });

  if (animal === "cat") {
    for (const sx of [-1, 1]) {
      b.put("cone", [sx * H * 0.55, H * 0.82, -0.02], { r: [0, 0, -sx * 0.35], s: [0.1, 0.19, 0.1], c: fur });
      b.put("cone", [sx * H * 0.55, H * 0.8, 0.04], { r: [0, 0, -sx * 0.35], s: [0.05, 0.11, 0.05], c: PINK });
      for (const k of [-1, 1]) b.put("dot", [sx * H * 0.45, -H * 0.24 + k * 0.03, H * 0.86], { r: [0, 0, sx * k * 0.15], s: [0.08, 0.005, 0.005], c: "#3a2e2e" });
    }
    b.at("root", [0, a.leg + 0.1, -a.body * 0.85], [-0.5, 0, 0]).put("sph", [0, 0.21, 0], { s: [0.05, 0.26, 0.05], c: fur });
  } else if (animal === "beaver") {
    for (const sx of [-1, 1]) {
      b.put("sph", [sx * H * 0.68, H * 0.68, -0.02], { s: [0.09, 0.09, 0.05], c: fur });
      b.put("dot", [sx * 0.025, -H * 0.5, H * 0.86], { s: [0.022, 0.035, 0.01], c: "#fbf6ea" });
    }
    b.at("root", [0, a.leg + 0.04, -a.body * 0.7], [0.25, 0, 0]).put("box", [0, 0, -0.2], { s: [0.28, 0.06, 0.42], c: "#5f4a3c" });
  } else if (animal === "hare") {
    for (const sx of [-1, 1]) {
      b.at("head", [sx * H * 0.3, head.y + H * 0.6, -0.02], [-0.15, 0, -sx * 0.18]);
      b.put("sph", [0, 0.22, 0], { s: [0.06, 0.25, 0.06], c: fur });
      b.put("sph", [0, 0.22, 0.04], { s: [0.03, 0.19, 0.03], c: PINK });
    }
    b.at("root", [0, 0, 0]).put("sph", [0, a.leg + 0.15, -a.body * 0.95], { s: 0.09, c: "#ffffff" });
  } else if (animal === "hedgehog") {
    spikes(b, seed, head, H, new Vector3(0, by, 0), a.body);
  }
  dress(b, clothes, a.body, by, colour);

  const hatAt = new Vector3(0, head.y + H * (animal === "hare" ? 0.5 : animal === "hedgehog" ? 0.7 : animal === "cat" ? 0.66 : 0.62), animal === "cat" ? 0.03 : 0);
  hatParts(b, hat, colour, hatAt);
  const hand = (sx: number) => shoulder(sx).add(new Vector3(0, -0.166, 0));
  const hands = { L: hand(-1), R: hand(1) };
  for (const prop of props) propParts(b, prop, { hands }, colour);
  const joints: Record<Joint, Vector3> = { root: new Vector3(), head, armL: shoulder(-1), armR: shoulder(1), legL: hip(-1), legR: hip(1) };
  return { parts: b.parts, joints, hands, hat: hatAt, sitDrop: a.leg * 0.9 };
}

/** A hat on its own, its base at the origin: for the kit page. */
export function hatRig(hat: Costume["hat"], colour: string): Rig {
  const b = new RigBuilder();
  const origin = new Vector3();
  hatParts(b, hat, colour, origin);
  for (const p of b.parts) p.joint = "root";
  const joints: Record<Joint, Vector3> = { root: origin, head: origin, armL: origin, armR: origin, legL: origin, legR: origin };
  return { parts: b.parts, joints, hands: { L: origin, R: origin }, hat: origin, sitDrop: 0 };
}
