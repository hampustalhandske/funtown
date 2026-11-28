import { smooth } from "./noise.ts";

/** A direction as x, y, z: unit length. */
export type Vec3 = [number, number, number];

/** The part of the day: night until 06:00, dawn to 07:00, day to 19:00, dusk to 20:00, then night. */
export type Band = "night" | "dawn" | "day" | "dusk";

/** Everything the town's light is made of at one moment; colours are `#rrggbb`. */
export type Light = {
  band: Band;
  /** How much daylight: 0 at night, 1 by day, rising through dawn and falling through dusk, 0.5 at sunrise (06:30) and sunset (19:30). */
  day: number;
  /** How much the windows and lamps are lit, 0 to 1: dark by day, lit from dusk's first minutes, full from sunset to sunrise. */
  lamps: number;
  /** How many stars show, 0 to 1. */
  stars: number;
  /**
   * The shadow-casting light: the sun by day and the moon by night, crossing over each other through dusk and dawn. It always
   * comes from the viewer's side (`from[2] > 0`) and above, so the faces the viewer sees are the lit ones.
   */
  key: { from: Vec3; colour: string; intensity: number };
  /** The hemisphere light that fills the shade: from the sky above, from the ground below. */
  fill: { sky: string; ground: string; intensity: number };
  /**
   * The sky dome and the haze the sea fades into (`horizon`). `sun` and `moon` are the discs' directions as drawn: in front of the
   * camera, which looks away from the viewer's side. `night` is how much of the moon's disc shows, 0 to 1.
   */
  sky: { top: string; horizon: string; glow: string; sun: Vec3; moon: Vec3; night: number };
  /** The sea's colours and how much light it takes (1 by day). */
  sea: { deep: string; shallow: string; foam: string; light: number };
};

type Look = {
  top: string; horizon: string; glow: string; key: string; keyIntensity: number; fillSky: string; fillGround: string; fillIntensity: number;
  deep: string; shallow: string; foam: string; seaLight: number;
};

/** The colours at the three moments the light is built from: full night, sunrise or sunset, and full day. */
const NIGHT: Look = {
  top: "#0d1a45", horizon: "#1f2c55", glow: "#000000", key: "#9db4ff", keyIntensity: 0.6, fillSky: "#3e5596", fillGround: "#151b2e", fillIntensity: 0.6,
  deep: "#0d2342", shallow: "#1d4a6c", foam: "#7f96bd", seaLight: 0.6,
};
const EDGE: Look = {
  top: "#4b5a98", horizon: "#f39a6e", glow: "#ff7a48", key: "#ff9660", keyIntensity: 1.2, fillSky: "#a89cca", fillGround: "#4a3a40", fillIntensity: 0.75,
  deep: "#2c4f80", shallow: "#5f8fa8", foam: "#ffd2bc", seaLight: 0.85,
};
const DAY: Look = {
  top: "#56a2e6", horizon: "#d0e9f6", glow: "#fff6d8", key: "#fff6e6", keyIntensity: 2.5, fillSky: "#e2efff", fillGround: "#8a7a5c", fillIntensity: 1.1,
  deep: "#2f8fb8", shallow: "#82d8d2", foam: "#ffffff", seaLight: 1,
};

const mixNumber = (a: number, b: number, t: number) => a + (b - a) * t;
/** `a` to `b` by `t` (0 to 1), channel by channel. */
function mixColour(a: string, b: string, t: number): string {
  let out = "#";
  for (let i = 0; i < 3; i++) {
    const [x, y] = [parseInt(a.slice(1 + 2 * i, 3 + 2 * i), 16), parseInt(b.slice(1 + 2 * i, 3 + 2 * i), 16)];
    out += Math.round(mixNumber(x, y, t)).toString(16).padStart(2, "0");
  }
  return out;
}

/** The look at `day` (0 night, 0.5 sunrise or sunset, 1 day): each half eased, so the orange peaks at the middle of dawn and dusk. */
function lookAt(day: number): Look {
  const [from, to, t] = day < 0.5 ? [NIGHT, EDGE, smooth(0, 1, day * 2)] : [EDGE, DAY, smooth(0, 1, day * 2 - 1)];
  const out = {} as Record<keyof Look, string | number>;
  for (const k of Object.keys(from) as (keyof Look)[]) {
    out[k] = typeof from[k] === "string" ? mixColour(from[k] as string, to[k] as string, t) : mixNumber(from[k] as number, to[k] as number, t);
  }
  return out as Look;
}

const unit = ([x, y, z]: Vec3): Vec3 => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};

const SUNRISE = 6.5 * 60;
const SUNSET = 19.5 * 60;
/** Where the sun or moon is `along` its way (0 rising in the east, 1 setting in the west) and how high it climbs: its direction from the town. */
const course = (along: number, floor: number, climb: number): Vec3 => unit([0.45 + 1.1 * (2 * along - 1), floor + climb * Math.sin(Math.PI * along), 0.55]);

/**
 * The town's light at a local clock time, a pure function of the hour and minute. Night until 06:00, dawn from 06:00 to 07:00, day
 * from 07:00 to 19:00, dusk from 19:00 to 20:00, then night, so sunrise (06:30) and sunset (19:30) are the middles of their bands.
 * Windows and lamps are lit from dusk to dawn. The light is the same every day of the year.
 */
export function lightAt(at: Date): Light {
  const minute = at.getHours() * 60 + at.getMinutes() + at.getSeconds() / 60;
  const band: Band = minute < 360 ? "night" : minute < 420 ? "dawn" : minute < 1140 ? "day" : minute < 1200 ? "dusk" : "night";
  const day = band === "dawn" ? (minute - 360) / 60 : band === "dusk" ? 1 - (minute - 1140) / 60 : band === "day" ? 1 : 0;
  const look = lookAt(day);

  // The sun from sunrise to sunset; the moon from 19:00 to 07:00. Through dusk and dawn the key light slides from one to the other.
  const sun = course(Math.min(1, Math.max(0, (minute - SUNRISE) / (SUNSET - SUNRISE))), 0.12, 0.88);
  const moon = course(Math.min(1, Math.max(0, ((minute - 1140 + 1440) % 1440) / 720)), 0.35, 0.45);
  const toMoon = 1 - smooth(0.3, 0.7, day);
  const from = unit([0, 1, 2].map((i) => mixNumber(sun[i], moon[i], toMoon)) as Vec3);

  const night = 1 - day;
  return {
    band,
    day,
    lamps: Math.min(1, night * 2),
    stars: smooth(0.4, 1, night),
    key: { from, colour: look.key, intensity: look.keyIntensity },
    fill: { sky: look.fillSky, ground: look.fillGround, intensity: look.fillIntensity },
    sky: {
      top: look.top, horizon: look.horizon, glow: look.glow,
      sun: unit([sun[0], sun[1], -sun[2]]), moon: unit([moon[0], 0.3 + moon[1] * 0.5, -moon[2]]), night: smooth(0.5, 1, night),
    },
    sea: { deep: look.deep, shallow: look.shallow, foam: look.foam, light: look.seaLight },
  };
}
