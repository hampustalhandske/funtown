import type { Animal } from "./folk.ts";
import type { Prop } from "./folk-dress.ts";
import type { FolkPose } from "./layout.ts";
import type { InLine } from "./line.ts";

/**
 * How a folk is drawn moving or still: the joint angles of each act at a time. Working folk act their role's work (the cat
 * planes at a bench, the beaver hammers, the hedgehog ticks a clipboard, the hare walks its track, the owl reads through a
 * glass) and move, and a lead at a handled fire swings its bucket; every other act is still, whatever the time. A new pose is a new act: a name, its props and its angles.
 */
export type Act = "plane" | "hammer" | "clipboard" | "track" | "glass" | "bucket" | "stand" | "rest" | "stuck" | "wait" | "walk" | "wave" | "tap" | "sit" | "asleep";

/** Each animal's work. */
const WORK: Record<Animal, Act> = { cat: "plane", beaver: "hammer", hedgehog: "clipboard", hare: "track", owl: "glass" };

/**
 * The act a folk in `pose` draws: working its animal's work, a leaver walking, one in the line waving its flag or acting its
 * wait (standing is `wait`), any other pose as itself.
 */
export const actOf = ({ pose, animal, line }: { pose: FolkPose; animal: Animal; line?: InLine }): Act =>
  pose === "work" ? WORK[animal] : pose === "leave" ? "walk" : line === undefined ? pose : line.flag === "wave" ? "wave" : line.posture === "stand" ? "wait" : line.posture;

/** What each act holds or works at. */
export const PROPS: Record<Act, Prop[]> = {
  plane: ["bench", "plane"], hammer: ["hammer", "crate"], clipboard: ["clipboard"], track: ["stick"], glass: ["glass"],
  bucket: ["bucket"], stand: [], rest: ["letter"], stuck: [], wait: ["slip"], walk: [], wave: [], tap: ["slip"], sit: ["slip"], asleep: ["slip"],
};

/** The right arm holding a still flag up at the folk's side; the flag turns back by it to stand upright. */
export const FLAG_ARM = { up: -0.45, out: 0.35 } as const;
/** The right arm waving the flag: raised high, swinging out from upright to well out to the side and back. */
const WAVE = { up: -2.75, out: 0.4, swing: 0.42, speed: 2.3 } as const;

/**
 * A folk's joint angles. The root moves the whole folk within its spot (`x`, `y`, `z`, in its own frame), leans it forward
 * (`lean`) and turns it (`yaw`); the head nods (`nod`); an arm is raised forward (`up`, radians) and swung out from the body
 * (`out`, negative swings it in); a leg is raised forward.
 */
export type Posture = {
  x: number; y: number; z: number; lean: number; yaw: number; nod: number;
  armL: { up: number; out: number }; armR: { up: number; out: number }; legL: number; legR: number;
};

export const restPosture = (): Posture => ({
  x: 0, y: 0, z: 0, lean: 0, yaw: 0, nod: 0, armL: { up: 0, out: 0.3 }, armR: { up: 0, out: 0.3 }, legL: 0, legR: 0,
});

/** How far the hare walks either way along its track, in its own frame. */
const TRACK = 0.9;

/** Swings the legs and arms of `p` in step at time `t`, as walking does. */
export function walkLegs(p: Posture, t: number) {
  const w = Math.sin(t * 9);
  p.legL = w * 0.5;
  p.legR = -w * 0.5;
  p.y = Math.abs(w) * 0.03;
}

/** Sets `p` to `act` at time `t` (seconds, already offset by the folk's own phase); `sitDrop` is how far the body drops to sit. */
export function pose(p: Posture, act: Act, t: number, sitDrop: number) {
  Object.assign(p, restPosture());
  switch (act) {
    case "stand":
      return;
    case "rest":
      p.armL = { up: -0.9, out: -0.4 };
      return;
    case "wave":
      // Stands at the table, its left paw on the table's edge, waving the flag in slow arcs.
      p.armL = { up: -1.35, out: 0 };
      p.armR = { up: WAVE.up, out: WAVE.out + WAVE.swing * Math.sin(t * WAVE.speed) };
      return;
    case "wait":
    case "tap":
    case "sit":
    case "asleep":
      // Its slip held at its chest, its flag held up and still at its side; the rest is how long it has waited.
      p.armL = { up: -1.3, out: 0.1 };
      p.armR = { ...FLAG_ARM };
      if (act === "tap") p.legR = -Math.max(0, Math.sin(t * 9)) * 0.3;
      if (act === "sit" || act === "asleep") {
        p.legL = p.legR = -1.45;
        p.y = -sitDrop;
        p.lean = act === "asleep" ? 0.12 : -0.1;
      }
      if (act === "asleep") p.nod = 0.5;
      return;
    case "stuck":
      // Sits slumped on the step, head in its paws.
      p.legL = p.legR = -1.45;
      p.y = -sitDrop;
      p.armL = p.armR = { up: -2, out: -0.5 };
      p.nod = 0.35;
      return;
    case "plane": {
      const k = Math.sin(t * 3) * 0.18;
      p.armL = { up: -1.3 + k, out: -0.2 };
      p.armR = { up: -1.3 - k, out: -0.2 };
      p.z = Math.sin(t * 3) * 0.03;
      p.lean = 0.15;
      return;
    }
    case "hammer":
      p.armR = { up: -1.7 + Math.abs(Math.sin(t * 5)) * 1.1, out: 0.3 };
      p.armL = { up: -0.6, out: 0.3 };
      p.lean = 0.1;
      return;
    case "clipboard":
      p.armL = { up: -1.2, out: 0 };
      p.armR = { up: -1 + Math.sin(t * 6) * 0.12, out: -0.4 };
      p.nod = 0.2;
      return;
    case "glass":
      p.armL = { up: 0.6, out: 0.3 };
      p.armR = { up: -1.6, out: 0 };
      p.lean = 0.12 + Math.sin(t * 0.7) * 0.04;
      return;
    case "bucket": {
      // Swings the bucket up and forward, over and over, to throw its water at the roof.
      const k = Math.sin(t * 4);
      p.armR = { up: -1.4 - k * 0.8, out: 0.1 };
      p.armL = { up: -1.2 - k * 0.6, out: 0.2 };
      p.lean = 0.12 + k * 0.08;
      return;
    }
    case "track":
      p.x = Math.sin(t * 0.5) * TRACK;
      p.yaw = Math.cos(t * 0.5) >= 0 ? Math.PI / 2 : -Math.PI / 2;
      walkLegs(p, t);
      p.armR = { up: -0.3, out: 0.3 };
      return;
    case "walk":
      walkLegs(p, t);
      p.armL = { up: -p.legL * 0.7, out: 0.3 };
      p.armR = { up: -p.legR * 0.7, out: 0.3 };
      return;
  }
}
