import { useEffect, useRef } from "react";

/**
 * The layers Esc closes, topmost first: the undo window, a text box (made by the module itself, from the
 * focused element), the key sheet, a pane (the character panel, Settings, a pull request panel, the
 * "I had to switch" box), the classroom, the mark. One press closes one layer.
 */
export type LayerKind = "undo" | "text" | "sheet" | "pane" | "classroom" | "mark";
const RANK: Record<LayerKind, number> = { undo: 0, text: 1, sheet: 2, pane: 3, classroom: 4, mark: 5 };

/** A layer a page registers; the text box layer is never registered, the module finds it in the focused element. */
type Layer = { kind: Exclude<LayerKind, "text">; close: () => void };
type Walk = { list: { key: string }[]; current: string | null; open: (index: number) => void };

/** The open layers, oldest first. */
const layers: Layer[] = [];
/** The urgency walk the page registered, if any. */
let walk: Walk | null = null;
/** The single-character keys pages registered: per lowercased key the handlers, the latest registered last (it runs). */
const keys = new Map<string, (() => void)[]>();
let listening = false;

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

/** Whether `target` is somewhere typing goes (a text box, or a terminal), so Funtown takes no key there. */
const typingPlace = (target: EventTarget | null): boolean => inTerminal(target) || textBox(target);

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
    if (!walk || walk.list.length === 0) return;
    const at = walk.list.findIndex((w) => w.key === walk!.current);
    const size = walk.list.length;
    walk.open(event.shiftKey ? (at < 0 ? size - 1 : (at - 1 + size) % size) : (at + 1) % size);
    return;
  }
  // A letter, digit or sign by the character typed (so any layout works); Shift is only the way to type "?", never a letter's.
  if (typingPlace(event.target) || (event.shiftKey && /^[a-z]$/i.test(event.key))) return;
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

/** Starts the page's key listeners, once. */
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("click", onClick);
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
  const latest = useRef({ list, current, open });
  latest.current = { list, current, open };
  useEffect(() => {
    listen();
    const mine: Walk = {
      get list() { return latest.current.list; },
      get current() { return latest.current.current; },
      open: (i) => latest.current.open(latest.current.list[i]),
    };
    walk = mine;
    return () => {
      if (walk === mine) walk = null;
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
