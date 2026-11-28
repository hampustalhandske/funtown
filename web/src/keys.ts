import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The layers Esc closes, topmost first: the undo window, a text box (made by the module itself, from the
 * focused element), the key sheet, a pane (the character panel, Settings, a pull request panel, the
 * "I had to switch" box), the classroom, the mark. One press closes one layer.
 */
export type LayerKind = "undo" | "text" | "sheet" | "pane" | "classroom" | "mark";
const RANK: Record<LayerKind, number> = { undo: 0, text: 1, sheet: 2, pane: 3, classroom: 4, mark: 5 };

/** A layer a page registers; the text box layer is never registered, the module finds it in the focused element. */
type Layer = { kind: Exclude<LayerKind, "text">; close: () => void };
/** The page's latest urgency walk, read when Space is pressed. */
type Walk = { current: { list: { key: string }[]; current: string | null; open: (index: number) => void } };

/** The open layers, oldest first. */
const layers: Layer[] = [];
/** The urgency walk the page registered, if any. */
let walk: Walk | null = null;
/** The single-character keys pages registered: per lowercased key the handlers, the latest registered last (it runs). */
const keys = new Map<string, (() => void)[]>();
let listening = false;
/** The arm clocks of the cards on screen: each starts its second again on a restart. */
const armClocks = new Set<() => void>();
/** The sends waiting in an undo window: Space sends them at once before it walks on. */
const waitingSends = new Set<() => void>();

/** How long a card must be on screen, untouched by a restart, before Enter (or Q) may answer it. */
export const ARM_MS = 1000;
/** How long a send waits after Enter (or Q) before it goes, for Esc to stop it. */
export const UNDO_MS = 1500;

/** Whether `target` is inside a terminal, where every key, Esc included, is Claude's. */
const inTerminal = (target: EventTarget | null): boolean => target instanceof Element && target.closest(".terminal") !== null;

/** Inputs that are not text: a button, a checkbox, a radio and the like take Funtown's keys. */
const NOT_TEXT = ["button", "checkbox", "radio", "range", "color", "file", "image", "submit", "reset", "hidden"];

/** Whether `target` is a text box: a text input, a textarea, a select or a contenteditable. */
function textBox(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NOT_TEXT.includes(target.type);
  return target.matches("textarea, select, [contenteditable]:not([contenteditable=false])") || target.isContentEditable;
}

/** Whether `target` is something Enter presses (a button, a link, a summary): a Tab-focused one keeps its Enter. */
const presses = (target: EventTarget | null): boolean => target instanceof Element && target.closest("button, a[href], summary") !== null;

/** Whether `target` is somewhere typing goes (a text box, or a terminal), so Funtown takes no key there. */
export const typingPlace = (target: EventTarget | null): boolean => inTerminal(target) || textBox(target);

/** What Esc does for a press at `target`: closes the highest layer (the latest opened of its kind), or the focused text box. */
function escapeAction(target: EventTarget | null): (() => void) | undefined {
  const top = layers.reduce<Layer | undefined>((best, l) => (!best || RANK[l.kind] <= RANK[best.kind] ? l : best), undefined);
  // Focus leaves a text box and its text stays; the layers above the text box (the undo window) come first.
  if (textBox(target) && (!top || RANK[top.kind] > RANK.text)) return () => target.blur();
  return top?.close;
}

function onKeyDown(event: KeyboardEvent) {
  // The browser's own keys, a composition or dead key in progress, and a held key are never Funtown's.
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.isComposing || event.key === "Dead" || event.keyCode === 229 || event.repeat) return;
  if (inTerminal(event.target)) return;
  if (event.key === "Escape") {
    if (event.shiftKey) return;
    const close = escapeAction(event.target);
    if (!close) return;
    event.preventDefault();
    close();
    return;
  }
  if (event.key === " ") {
    // Space is Funtown's wherever it is not typing; it never scrolls or presses a focused button.
    if (typingPlace(event.target)) return;
    event.preventDefault();
    for (const send of [...waitingSends]) send();
    if (!walk || walk.current.list.length === 0) return;
    const { list, current, open } = walk.current;
    const at = list.findIndex((w) => w.key === current);
    const size = list.length;
    open(event.shiftKey ? (at < 0 ? size - 1 : (at - 1 + size) % size) : (at + 1) % size);
    return;
  }
  // A letter, digit or sign by the character typed (so any layout works); Shift is only the way to type "?", never a letter's.
  if (typingPlace(event.target) || (event.shiftKey && /^[a-z]$/i.test(event.key))) return;
  if (event.key === "Enter" && presses(event.target)) return;
  const run = keys.get(event.key.toLowerCase())?.at(-1);
  if (!run) return;
  event.preventDefault();
  run();
}

/** A mouse click leaves no button focused, so a later Space or Enter never presses it again; Tab-focus and Enter work as usual. */
function onClick(event: MouseEvent) {
  // `detail` is 0 for a click the keyboard made.
  if (event.detail === 0 || !(event.target instanceof Element)) return;
  const button = event.target.closest("button");
  if (button && document.activeElement === button) button.blur();
}

/** Starts every card's second again: an Enter meant for a text box, the terminal or another app never answers a card. */
const restartArm = () => armClocks.forEach((restart) => restart());

/** Starts the page's key listeners, once. */
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("click", onClick);
  // Focus leaving a typing place, and the window coming to the front (by focus or by its tab being shown).
  window.addEventListener("focusout", (event) => typingPlace(event.target) && restartArm(), true);
  window.addEventListener("focus", (event) => event.target === window && restartArm());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && restartArm());
}

/**
 * Makes a layer of `kind` for as long as `open` is true: Esc closes the topmost layer with `close`, one per press.
 * The latest layer opened of a kind closes first, and a layer keeps its place when `close` changes.
 */
export function useLayer(kind: Layer["kind"], open: boolean, close: () => void): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    listen();
    const layer: Layer = { kind, close: () => latest.current() };
    layers.push(layer);
    return () => {
      layers.splice(layers.indexOf(layer), 1);
    };
  }, [kind, open]);
}

/**
 * Registers the urgency list Space walks: Space opens the entry after `current`, Shift+Space the one before it,
 * wrapping; with `current` not in the list they open the first and the last. Does nothing on an empty list.
 */
export function useWalk<T extends { key: string }>(list: T[], current: string | null, open: (entry: T) => void): void {
  const now = { list, current, open: (i: number) => open(list[i]) };
  const latest = useRef(now);
  latest.current = now;
  useEffect(() => {
    listen();
    walk = latest;
    return () => {
      if (walk === latest) walk = null;
    };
  }, []);
}

/**
 * Makes `run` the answer to the character `key` ("m", "?") while `enabled`, outside typing places and without
 * Cmd, Ctrl or Option. Matched by the character typed, so any layout works. With several registered for one key
 * the latest runs; the key does nothing else (the browser never sees it).
 */
export function useKey(key: string, run: () => void, enabled = true): void {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!enabled) return;
    listen();
    const name = key.toLowerCase();
    const mine = () => latest.current();
    keys.set(name, [...(keys.get(name) ?? []), mine]);
    return () => {
      keys.set(name, (keys.get(name) ?? []).filter((h) => h !== mine));
    };
  }, [key, enabled]);
}

/**
 * Whether a card that `can` be answered by a key is armed: true once ARM_MS have passed since the latest of the card
 * appearing (the caller mounting), focus leaving a typing place and the window coming to the front.
 */
export function useArmed(can: boolean): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    listen();
    let timer = setTimeout(() => setSettled(true), ARM_MS);
    const restart = () => {
      setSettled(false);
      clearTimeout(timer);
      timer = setTimeout(() => setSettled(true), ARM_MS);
    };
    armClocks.add(restart);
    return () => {
      armClocks.delete(restart);
      clearTimeout(timer);
    };
  }, []);
  return can && settled;
}

/**
 * The undo window: `start(what)` holds `what` for UNDO_MS, then gives it to `send`. Meanwhile it is the top Esc layer
 * (Esc drops it) and Space sends it at once. Gives what is waiting (null when nothing is) and `start`; a caller that
 * goes away drops what is waiting.
 */
export function useUndo<T>(send: (what: T) => void): [T | null, (what: T) => void] {
  const [waiting, setWaiting] = useState<{ what: T } | null>(null);
  const latest = useRef(send);
  latest.current = send;
  useLayer("undo", waiting !== null, () => setWaiting(null));
  useEffect(() => {
    if (!waiting) return;
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      setWaiting(null);
      latest.current(waiting.what);
    };
    waitingSends.add(go);
    const timer = setTimeout(go, UNDO_MS);
    return () => {
      waitingSends.delete(go);
      clearTimeout(timer);
    };
  }, [waiting]);
  return [waiting && waiting.what, useCallback((what: T) => setWaiting({ what }), [])];
}
