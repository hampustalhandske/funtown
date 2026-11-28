import type { Animal } from "./folk.ts";
import type { Prop } from "./folk-dress.ts";
import type { FolkPose } from "./layout.ts";

/**
 * How a folk is drawn moving or still: the joint angles of each act at a time. Working folk act their role's work (the cat
 * planes at a bench, the beaver hammers, the hedgehog ticks a clipboard, the hare walks its track, the owl reads through a
 * glass) and move; every other act is still, whatever the time. A new pose is a new act: a name, its props and its angles.
 */
export type Act = "plane" | "hammer" | "clipboard" | "track" | "glass" | "stand" | "rest" | "stuck" | "wait" | "walk";

/** Each animal's work. */
const WORK: Record<Animal, Act> = { cat: "plane", beaver: "hammer", hedgehog: "clipboard", hare: "track", owl: "glass" };

/** The act a folk in `pose` draws: working its animal's work, a leaver walking, any other pose as itself. */
export const actOf = ({ pose, animal }: { pose: FolkPose; animal: Animal }): Act =>
  pose === "work" ? WORK[animal] : pose === "leave" ? "walk" : pose;

/** What each act holds or works at. */
export const PROPS: Record<Act, Prop[]> = {
  plane: ["bench", "plane"], hammer: ["hammer", "crate"], clipboard: ["clipboard"], track: ["stick"], glass: ["glass"],
  stand: [], rest: ["letter"], stuck: [], wait: ["slip"], walk: [],
};

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
    case "wait":
      p.armR = { up: -1.5, out: 0.3 };
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
