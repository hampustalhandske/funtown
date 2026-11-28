import { describe, expect, test } from "vitest";
import { ACTIVE_MS, framePace, type Activity } from "../../web/src/town/pace.ts";

const NOW = 100_000;
/** A calm, visible, connected town at NOW, with `over` laid on top. */
const calm = (over: Partial<Activity> = {}): Activity => ({ now: NOW, hidden: false, lost: false, walking: false, easing: false, pointerAt: null, key: null, ...over });

describe("the frame pace", () => {
  test("a_calm_town_draws_30_frames_a_second", () => {
    // Catches a calm town that burns a full 60 for nothing.
    expect(framePace(calm())).toBe(30);
  });

  test("a_hidden_window_and_a_lost_server_draw_nothing_whatever_else_is_going_on", () => {
    // Catches a hidden window drawing for a walker, and a lost town still drawing the camera easing.
    const busy = { walking: true, easing: true, pointerAt: NOW, key: { at: NOW, typing: false } };
    expect(framePace(calm({ hidden: true }))).toBe(0);
    expect(framePace(calm({ lost: true }))).toBe(0);
    expect(framePace(calm({ hidden: true, ...busy }))).toBe(0);
    expect(framePace(calm({ lost: true, ...busy }))).toBe(0);
  });

  test("a_walker_or_the_camera_easing_draws_60", () => {
    expect(framePace(calm({ walking: true }))).toBe(60);
    expect(framePace(calm({ easing: true }))).toBe(60);
  });

  test("the_pointer_or_a_key_on_the_town_draws_60_for_a_short_while_and_then_the_town_calms", () => {
    // Catches a pointer that never lets go of 60, and one that lets go before the mouse has stopped.
    expect(framePace(calm({ pointerAt: NOW - 10 }))).toBe(60);
    expect(framePace(calm({ pointerAt: NOW - ACTIVE_MS + 1 }))).toBe(60);
    expect(framePace(calm({ pointerAt: NOW - ACTIVE_MS }))).toBe(30);
    expect(framePace(calm({ key: { at: NOW - 10, typing: false } }))).toBe(60);
    expect(framePace(calm({ key: { at: NOW - ACTIVE_MS, typing: false } }))).toBe(30);
  });

  test("keys_typed_in_a_typing_place_such_as_a_terminal_do_not_count_as_using_the_town", () => {
    // Catches a terminal's typing holding the town at 60 frames.
    expect(framePace(calm({ key: { at: NOW - 10, typing: true } }))).toBe(30);
  });
});
