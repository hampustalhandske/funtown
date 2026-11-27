import { Fragment, useCallback, useState, type ReactNode } from "react";
import { useKey, useLayer } from "./keys.ts";

/** A key as keycaps; a combination ("Cmd", "Enter") is its caps joined by a plus. */
const caps = (...parts: string[]): ReactNode =>
  parts.map((part, i) => (
    <Fragment key={part}>
      {i > 0 && "+"}
      <kbd>{part}</kbd>
    </Fragment>
  ));

/** Every key Funtown answers to: the cap, where it works, what it does. */
const ROWS: { key: ReactNode; where: string; what: string }[] = [
  { key: caps("Space"), where: "Town, classroom, plain list, any pane", what: "Goes to the next thing that needs you and opens its pane; wraps." },
  { key: caps("Shift", "Space"), where: "Town, classroom, plain list, any pane", what: "Goes to the previous one." },
  { key: caps("Enter"), where: "An open card", what: "Sends the card's choices, which start as the agent's pick, when the card shows the Enter key. Esc stops it in the 1.5 s before it goes." },
  { key: caps("Enter"), where: "Town, no pane open", what: "Goes into the marked house." },
  { key: caps("Esc"), where: "Everywhere but the terminal", what: "Closes the top layer, one per press: the undo window, a text box (its text stays), this sheet, a pane, the classroom, the mark." },
  {
    key: (
      <>
        <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>
      </>
    ),
   
    where: "Town, no pane open",
    what: "Move the mark to the nearest house that way on screen.",
  },
  { key: (<><kbd>1</kbd>–<kbd>4</kbd></>), where: "An open card with one question", what: "Chooses that option (toggles it on a multi-select). Never sends." },
  { key: caps("Q"), where: "An open card", what: "Asks the Queen for her word on it; it spends some usage, so it follows Enter's rule." },
  { key: caps("D"), where: "An open card", what: "Shows or hides the raw detail. Never sends." },
  { key: caps("R"), where: "Pane of a background lead", what: "Puts the cursor in the reply box when the terminal is hidden, in the terminal when it is shown." },
  { key: caps("Cmd", "Enter"), where: "The reply box", what: "Sends the reply. Plain Enter is a new line." },
  { key: caps("M"), where: "Outside typing places", what: "Opens the next letter: the pane of the character with the newest letter, then the next newest, wrapping." },
  { key: caps("L"), where: "Outside typing places", what: "Flips between the town and the plain list, keeping the house." },
  { key: caps("?"), where: "Outside typing places", what: "Opens this sheet. The keyboard icon does the same." },
  { key: caps("Cmd", "Esc"), where: "The terminal", what: "Leaves it: the keyboard is back in the pane and the terminal stays shown." },
];

/** The key sheet: a pane listing every key and where it works; Esc closes it (its layer, above the panes). */
export function KeySheet({ onClose }: { onClose: () => void }) {
  useLayer("sheet", true, onClose);
  return (
    <aside className="pane keysheet" role="dialog" aria-label="Key sheet">
      <button type="button" className="close" aria-label="Close key sheet" title="Close" onClick={onClose}>✕</button>
      <h2>Keys</h2>
      <p>In a text box or the terminal every key is typing, and Funtown takes none. With Cmd, Ctrl or Option held, a key is the browser's.</p>
      <table>
        <thead>
          <tr><th>Key</th><th>Where</th><th>What it does</th></tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => (
            <tr key={i}>
              <td className="key">{row.key}</td>
              <td>{row.where}</td>
              <td>{row.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}

/** The key sheet's state for a page: whether it is open, a way to open it (the ? key, or an icon) and one to close it. */
export function useKeySheet(): [boolean, () => void, () => void] {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  useKey("?", show);
  return [open, show, hide];
}
