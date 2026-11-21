# A terminal that feels real

Status: ready-for-agent
Serves: GOAL.md, "App: a native Mac app with a terminal that feels like the real one", and the
success line "Answers go through Funtown" (a slow terminal is one of the two reasons answers still
go through Terminal.app).

## Problem Statement

When I open a background session's terminal in Funtown it is slow and small, and it doesn't feel
like the real one. Today the first open takes about 480 ms. Most of that is the terminal's code
loading only on the click. The box is 95 x 25 at 1280 x 800, and Claude's prompt box ends up below
the fold. In the work view the panel runs off the window. Option doesn't reliably type the
characters my Swedish layout puts on it. Links don't open the way they do in Terminal.app. Claude
is told whatever terminal Funtown's server happened to start from. A detach leaves a dead box that
says "Terminal closed.", whether the session stopped, failed or kept running. So I answer in
Terminal.app instead, which is the opposite of what Funtown is for.

## Solution

A session's terminal opens in a big sheet over the town (and over the list in the work view). It
holds the session's text almost at once: the terminal loads with the page, and when I've had a
background lead's panel open for a moment, its `claude attach` is already running out of sight.
In the sheet the panel's lines and any card sit in a narrow column on the left, and the terminal
takes the rest at full height: 109 x 45 at 1280 x 800. It is set in Menlo 13, the font every Mac
has. It behaves like Terminal.app with Claude in it:

- Option types what my layout puts on it.
- Dragging copies.
- Cmd+V pastes.
- The wheel scrolls Claude's transcript.
- Cmd+click opens a web link in my browser.
- Cmd+Esc takes me out of the terminal without closing it.

If the session takes a moment to wake, "Waking the session..." shows inside the empty terminal. When
the client ends while the session keeps running (Ctrl+Z), the sheet folds back into the narrow panel
and says "Detached; the session keeps running." If the attach fails, the panel shows the client's
last line. Claude is always told the same terminal, so colours and links don't change with where
Funtown was started.

## User Stories

1. As the user, I want a background session's terminal to show its text within about a tenth of a
   second when I've had its panel open for a moment, so that opening it feels instant.
2. As the user, I want the first open of a terminal in a fresh page to take no more than about
   200 ms, so that even a cold open doesn't feel like waiting.
3. As the user, I want a re-open after "Hide terminal" in the same panel to be instant, so that
   hiding the terminal to read a card costs me nothing.
4. As the user, I want the terminal's code loaded with the page, so that no click waits on a
   download.
5. As the user, I want walking quickly through panels not to start a Claude client for every panel I
   pass, so that my Mac isn't loaded with clients I never looked at.
6. As the user, I want closing a panel to end the client it started, so that nothing lingers after
   I'm done.
7. As the user, I want the hidden terminal never to take my keyboard focus, so that keys I type in
   the page never land in a session I can't see.
8. As the user, I want an attach I haven't looked at to cost no tokens, so that a panel open in the
   background never spends my usage.
9. As the user, I want the shown terminal in a big sheet over the town, so that I get a working
   size (at least 100 columns and 40 rows at 1280 x 800) instead of a small box.
10. As the user, I want the stats corner, the icon row and the town's edges still visible around
    the sheet, so that I keep my bearings while I type.
11. As the user, I want the sheet capped at 96rem wide on a big screen, so that the town still shows
    on both sides on an external display.
12. As the user, I want the panel's lines, any card and the newest letter in a column beside the
    terminal, so that a card never takes rows from the terminal.
13. As the user, I want the same sheet in the work view, so that the terminal never runs off the
    window there.
14. As the user, I want Claude's prompt box always visible when the terminal opens, so that I never
    scroll the panel to find where to type.
15. As the user, I want the reply box hidden while the terminal is shown, so that there's one place
    to type.
16. As the user, I want the reply box back in the narrow panel while the terminal is hidden, so
    that I can still send a short reply without opening the terminal.
17. As the user, I want the terminal in Menlo 13, so that it looks like a Mac terminal and Claude's
    box lines draw without mixed fonts.
18. As the user, I want no scrollbar gutter in a session's terminal, so that I get those columns
    back (Claude draws full screen and never uses it).
19. As the user, I want the Shell tab to keep its scrollback, so that a shell's output can still be
    scrolled.
20. As a user on a Swedish keyboard, I want Option to type `@`, `$`, `|`, brackets, braces, `\` and
    `~` in the terminal, so that I can write code and paths in it.
21. As the user, I want Shift+Enter to make a new line in Claude's prompt, so that it works as
    it does today.
22. As the user, I want Escape inside the terminal to go to Claude, not close the panel, so that I
    can stop Claude or leave a menu.
23. As the user, I want Cmd+Esc to take my focus out of the terminal and leave it shown, so that I
    can leave the terminal by keyboard without detaching.
24. As the user, I want Cmd combinations to stay the page's and the app's, so that Cmd+C, Cmd+V and
    Cmd+Tab keep working.
25. As the user, I want dragging in the terminal to copy, as Claude does on a local session, so
    that copying works the way it does in Terminal.app.
26. As the user, I want Option+drag to make the terminal's own selection, and Cmd+C to copy it, so
    that I can copy what Claude's own selection won't.
27. As the user, I want Cmd+V to paste text as one paste, so that a long paste doesn't run as many
    prompts.
28. As the user, I want Ctrl+V to paste an image from my clipboard, so that I can show Claude a
    screenshot.
29. As the user, I want the mouse wheel, PgUp and PgDn to scroll Claude's transcript, so that I can
    read back.
30. As the user, I want Cmd+click on a web link to open it in my default browser, so that links work
    as in Terminal.app.
31. As the user, I want a plain click on a link to do nothing, so that selecting text never opens a
    page by accident.
32. As the user, I want only `http` and `https` links to open, so that a session can't make Funtown
    open anything else.
33. As the user, I want the terminal to refit when the window or the sheet changes size, so that
    Claude always draws to the size I see.
34. As the user, I want "Waking the session..." inside the empty terminal when no text has come
    300 ms after I showed it, so that a slow resume never looks frozen.
35. As the user, I want that line gone the moment text arrives, without the terminal moving, so
    that nothing jumps.
36. As the user, I want the sheet to fold back into the narrow panel when the client ends while the
    session keeps running, with "Detached; the session keeps running.", so that I'm not left with
    a dead box.
37. As the user, I want "Show terminal" after a detach to attach again, so that I can go straight
    back in.
38. As the user, I want a failed attach to show the client's last printed line in the panel, so
    that I can tell why it failed.
39. As the user, I want Close session to close the panel as today, so that a stopped session leaves
    the town.
40. As the user, I want `←` on an empty prompt to show Claude's agent view inside the sheet, so that
    I see what Claude shows in its own client.
41. As the user, I want Claude told the same terminal every time (256 colours, true colour, no
    other terminal's name), so that colours and links don't change with where Funtown was started.
42. As the user, I want Claude's recap switched off in the clients Funtown starts, so that an attach
    I haven't looked at can't make a model call in a case the test didn't cover.
43. As the user, I want my own `claude attach` in Terminal.app left as it is, so that I still get
    Claude's recap there.
44. As the user, I want the "open in N places" warning to stay, so that I know when a hidden client
    and my own attach share a session.
45. As a terminal-kind lead's user, I want "Go to terminal" and the `←` or `/bg` hint as today, so
    that nothing changes for sessions in my own Terminal app.
46. As an engineer reading the repo, I want the contracts in CLAUDE.md to say how the terminal socket
    ends and which terminal Claude is told, so that the behaviour is part of the contract.
47. As an engineer, I want GLOSSARY.md to define the app, open time, early attach, detach, the
    terminal sheet and the typing place, so that specs and code use one word for each.
48. As an engineer, I want ADR 0001 to record why the app is Electron, so that the choice that
    fixes the terminal to xterm.js in Chrome's engine has its reasons written down.
49. As the user, I want the open-time numbers measured once on a quiet Mac and written in the PR,
    so that "feels instant" is shown, not claimed.

## Implementation Decisions

**Open time**

- **The terminal and the reply box load with the page.** They are plain imports, so nothing waits
  on a download when Show terminal is pressed. It costs about 326 KB more on the first page load,
  from 127.0.0.1. The letters' Markdown renderer stays lazy, so the reply box moves out of the
  letters module. Beat: keeping the lazy load (300 ms of React's reveal delay on every first open).
- **Early attach** (the panel starts the session's `claude attach` before the terminal is shown):
  when a background lead's own panel has been open 300 ms, the page makes the terminal, keeps it
  out of view at the size the sheet will show it at, and opens the same `/term` socket as today.
  - Show terminal reveals and focuses it. If no socket is open yet (shown before 300 ms, or after
    a detach), Show opens one.
  - Hide terminal hides it and keeps the socket.
  - Closing the panel, or opening another character's panel, closes the socket, which kills the
    client as today.
  - After a detach, the panel starts no new client on its own. The next one comes only from Show
    terminal.
  - The hidden terminal can't take focus: it is out of the tab order and never focused by code.
    An xterm that has never had focus sends no focus events, which is the case the recap test
    measured.
  - Beat: starting on click only (about 170 ms every time), and one client kept attached to every
    listed session (a process per session, and sessions that never sleep after their idle hour).
- **The switch.** Early attach sits behind one named switch in the page. You decided it starts
  off and is turned on only if the recap test saw no model request. The test saw none in all
  three cases, so the spec turns it on. Off means "connects on Show terminal". That path is the
  same code as a Show pressed before 300 ms, so the suite covers it without a second build. Beat:
  a server env variable passed to the page (one more contract for a switch nobody flips day to
  day).
- **Server and contracts unchanged by early attach itself.** It is page-only. The socket still
  kills its client when it closes, so turning it off later touches only the page.

**The terminal sheet** (the large sheet over the town or the list that holds a session's panel
column and its terminal while the terminal is shown)

- Take B, as you picked it: the sheet sits 5rem from the top, 3rem from each side and 1rem from the
  bottom, at most 96rem wide. A 19rem column on the left holds the panel's lines, any card and the
  newest letter, with the buttons at the bottom. It scrolls inside itself when long. The terminal
  takes the rest at full height. At 1280 x 800 that is about 109 x 45 (95 x 25 today), and
  154 x 64 at 1920 x 1080.
- The same sheet in the work view, over the list (about 109 x 50 at 1280 x 800). It replaces the
  wide panel, which today runs off the window.
- The reply box is hidden while the sheet is shown. It shows in the narrow panel while the terminal
  is hidden. Sending with no open socket gives today's "Not sent: the terminal isn't connected."
- Today's cards show in the column as they are. Their new design is the Desk spec's.
- Beat: the panel at full height (102 x 36, and a card costs 8 rows), and today's box.

**Look of the terminal**

- **Font: Menlo 13** for every terminal Funtown draws, the Shell tab's too. You asked for the Mac
  Terminal's own font, if a page may use it. That font is SF Mono, and Chromium 159 on this Mac
  can't reach it: "SF Mono", "SFMono-Regular", `ui-monospace` and ".SF NS Mono" all measured as
  the next font in the list, while Menlo measured as itself. Terminal.app keeps SF Mono inside its
  own bundle, so a page can't see it. Bundling Apple's font would break "All code our own" and its
  licence. So the agreed fallback, Menlo, stands. Beat: Recursive Mono (Funtown's own font), which
  has no box-drawing glyphs in its bundled subset and needs its own font face before xterm.js
  measures it as monospace.
- **No scrollback in a session's terminal.** An attached session draws on the alternate screen
  (Claude's full-screen mode), so scrollback is never used, and turning it off gives back about two
  columns. The Shell tab keeps its scrollback.

**Keys, copy, paste, scrolling and links**

- Option stays a typing key (xterm.js's "Option is Meta" stays off). Claude's Option shortcuts
  don't work, as in Terminal.app's default. Beat: Option as Meta, which takes `@`, brackets and the
  pipe away on a Swedish layout.
- Shift+Enter sends Esc+Enter (today). Escape inside the terminal goes to Claude, and the panel
  stays (today's rule).
- **Cmd+Esc leaves the terminal:** caught in xterm.js's own key handler, so Claude never gets an
  Esc from it. Focus goes back to the sheet's column, and the terminal stays shown. Beat:
  Cmd+period and Cmd+Shift+Up. Nothing on macOS or in Chrome is known to use Cmd+Esc.
- Every other Cmd combination stays the page's. Claude never sees Cmd: xterm.js 6.0.0 has no kitty
  keyboard protocol.
- Copy: a drag selects inside Claude, and Claude copies on release. Option+drag forces xterm.js's
  own selection (on a Mac, Option is the only forcing key), and Cmd+C copies it.
- Paste: Cmd+V pastes text as one bracketed paste (spike S2). Ctrl+V lets Claude read an image from
  the Mac's clipboard. Dragging a file in to paste its path is not supported, because a page gets
  no file path.
- Scrolling: the wheel, PgUp and PgDn, Ctrl+O and `/` reach Claude as in a real terminal. Claude
  scrolls its transcript, and no xterm scrollback is involved.
- Links: Cmd+click on a link opens it with `window.open`. In the app, the window's rule sends it to
  the default browser. A plain click opens nothing, and only `http://` and `https://` open.
  Terminal hyperlinks (OSC 8) go through xterm.js's link handler, which replaces its default
  `confirm()` prompt. Plain URLs go through a small link provider of our own. Beat: the web-links
  addon (a new package for one regular expression).

**Waiting and the end**

- **Waking:** if no output has arrived 300 ms after the terminal is shown, "Waking the session..."
  shows centred over the empty terminal. It is gone at the first output. It is drawn over the
  terminal, never written into it, so Claude's screen stays untouched and nothing moves.
- **The exit code.** The server closes a session socket with close code `4000 + n` when the client
  exits with code `n` (0 to 255). A client killed by a signal closes with `4000 + 128 + signal`, as
  a shell reports it. The codes the server uses now (1011 couldn't start, 1007 unknown frame) stay.
  Beat: a last `{ "t": "exit" }` frame before the close, which adds a frame kind and can be lost
  when the send fails.
- **Detach** (Claude's attach client ends while the session keeps running): close code 4000. The
  sheet folds back into the narrow panel, which says "Detached; the session keeps running." above
  Show terminal and Close session. Ctrl+Z does it. `←` on an empty prompt opens Claude's agent view
  inside the sheet, and the sheet stays, as you accepted. Whether `/exit` ends the client is a live
  check.
- **Attach failed** (any other close): the narrow panel shows the client's last non-empty printed
  line, read from the page's own copy of the terminal's text. Beat: the server putting it in the
  close reason (123 bytes at most, and the server would have to keep output).
- **Session closed** (Close session): the lead leaves the listing and its panel closes (today).
- The Shell tab's ending is unchanged ("Terminal closed.").

**What Claude is told about the terminal** (contract changes, in CLAUDE.md on this branch)

- Every pty Funtown starts, the attach clients and the Shell tab's shell, gets one terminal
  identity:
  - `TERM=xterm-256color` and `COLORTERM=truecolor`.
  - None of the starting terminal's own variables: `TERM_PROGRAM`, `TERM_PROGRAM_VERSION`,
    `TERM_SESSION_ID`, `LC_TERMINAL`, `LC_TERMINAL_VERSION`, `TMUX`, `TMUX_PANE`, `STY`,
    `VTE_VERSION`, `WT_SESSION`, `TERMINAL_EMULATOR`, and anything starting `ITERM_`, `KITTY_`,
    `GHOSTTY_`, `WEZTERM_`, `ALACRITTY_` or `KONSOLE_`.
  - Beat: inheriting the server's variables, which makes Claude act as if it ran in whatever
    terminal Funtown was started from, and by luck under a Launch Agent.
- **The recap guard:** the attach clients alone also get `CLAUDE_CODE_ENABLE_AWAY_SUMMARY=0`, by
  your word. It is a guard for cases the recap test didn't measure: a lead woken after an idle
  hour, a long lead, a later Claude version. It is untested whether the variable acts on the
  client. The Shell tab's shell doesn't get it, so a `claude` you start there keeps its recap. Beat:
  relying on the test alone.
- The `--bg`, `agents --json` and `stop` runs are not ptys and keep today's env.
- The `claude` contract line, after "env drops `CLAUDE*`/`AI_AGENT` but `CLAUDE_CONFIG_DIR`",
  gains: "; the ptys Funtown starts also drop the starting terminal's own variables
  (`TERM_PROGRAM`, `TERM_PROGRAM_VERSION` and the like) and get `TERM=xterm-256color`,
  `COLORTERM=truecolor`; its attach clients also get `CLAUDE_CODE_ENABLE_AWAY_SUMMARY=0`".
- A new contract item after "Logs": "Terminal: `/term?lead=` runs `claude attach` in a pty per
  socket; closing the socket kills it, and the client's exit closes the socket with code 4000 + its
  exit code (4000 + 128 + the signal when killed)."
- The Map (not binding): "a background lead's terminal mounts only after Show terminal" becomes "a
  background lead's terminal connects when its panel has been open 300 ms and shows on Show
  terminal", and the panel line gains "a shown terminal opens the terminal sheet".

**On this branch, besides the code**

- "Decisions that bind" gains the three lines from "The drawing stack and the app shell", word for
  word: the WebGL renderer and the four approved shaders, the page never calling the app, and the
  app's window rules. No existing line moves.
- ADR 0001, "The app is Electron, drawing the town in Chrome's engine", as already written.
- GLOSSARY.md, new, with this spec's terms: the app, open time, early attach, detach, terminal
  sheet, typing place.

**Open-time targets** (median, p90; checked once at the end, not in the suite)

| Case | Today | Target |
| - | - | - |
| Cold open, no client running yet | 483 ms | 200, 250 ms |
| Warm open, panel open at least 1 s | n/a | 100, 120 ms |
| Re-open after Hide terminal | 170 ms | 100, 120 ms |
| The same three over the town at calm 30 fps | not measured | within 20 ms of the work view |

Open time is the time from the click or key that shows the terminal to the session's text being
visible in it. It is measured with the "Where the terminal's open time goes" scripts, changed to
time "terminal visible and holding text", 10 runs, one real session, load under 3. The numbers go
in the PR.

## Testing Decisions

- **A good test** checks what the user or the next program sees: the sheet, the text in the
  terminal, the bytes the fake `claude attach` receives, its processes, and the socket's close code.
  It never checks component state, timers or class names that carry no meaning. Each test names
  the break it catches. Timing is never asserted in milliseconds. The settle and the waking line
  use Playwright's clock, so they run the same on a busy Mac.
- **Two seams, both existing**, agreed with you:
  1. **The page, in Playwright** (`tests/e2e/`), against the real server and the fake `claude`,
     one spec file at a time. It covers:
     - Show terminal loads no script on the click.
     - A panel open past 300 ms starts exactly one attach. One closed before it starts none. Hide
       then Show reuses the client. Closing the panel ends it. After a detach, no client starts
       until Show.
     - The hidden terminal never holds focus, including through Tab.
     - The shown sheet gives at least 100 x 40 at 1280 x 800, in the town and the work view, with
       the icon row still visible.
     - The reply box is hidden while the sheet is shown and back when it is hidden.
     - Menlo is the terminal's font. A session terminal has no scrollback, and the Shell tab keeps
       its scrollback.
     - A character typed with Option held reaches the session as itself. Shift+Enter sends
       `\x1b\r`. Escape in the terminal leaves the panel open. Cmd+Esc moves focus out, leaves the
       terminal shown and sends the session nothing.
     - Cmd+V sends one bracketed paste. Option+drag makes a terminal selection. The wheel sends
       wheel sequences once the session turns mouse mode on.
     - Cmd+click on an http link calls `window.open` with it. A plain click, or a `javascript:`
       link, opens nothing.
     - A silent client shows "Waking the session..." 300 ms after Show, and the first output
       removes it.
     - Exit 0 folds the sheet and shows the detach line, and Show attaches again. A non-zero exit
       shows the client's last line.
  2. **The server, in Vitest** (`tests/`), over the real `/term` WebSocket:
     - The client's exit code reaches the page as `4000 + n`.
     - The attach env has `TERM`, `COLORTERM`, `CLAUDE_CODE_ENABLE_AWAY_SUMMARY=0` and
       `CLAUDE_CONFIG_DIR`, and none of the dropped variables, even when the server's own env has
       them.
     - The Shell tab's env has the same identity, without the recap variable.
     - Closing the socket still kills the client.
- **The fake `claude attach` grows flags** for these cases:
  - exit with a given code after printing a given line;
  - print nothing;
  - turn on bracketed paste and mouse mode;
  - print a plain URL and an OSC 8 link;
  - print its `COLORTERM` and `TERM_PROGRAM`.
  It never becomes a real terminal program.
- **Prior art:** `tests/e2e/terminal.spec.ts` (live terminal, Shift+Enter, size on open),
  `tests/e2e/town-terminal.spec.ts` (Escape in a terminal), `tests/terminal.test.ts` (attach env,
  frames, kill on close, the shared count), `tests/shell.test.ts` (the shell's env and life), and
  the fake's `attach-chatty` and `attach-sticky` flags.
- **Commands:** near a change, `npx vitest run tests/terminal.test.ts tests/shell.test.ts` and
  `npx playwright test tests/e2e/terminal.spec.ts` (one spec at a time). The whole suite before the
  PR is `npm test`.
- **Live checks at the end**, once, on a quiet Mac with your go (they run a real session, so they
  stay out of the suite):
  - the open-time table;
  - Claude's colours and links through Funtown;
  - a drag landing in the clipboard;
  - a Ctrl+V image reaching the prompt;
  - whether `/exit` ends the client;
  - the recap variable present in the client's env.

## Out of Scope

- Handing a background session off to Terminal.app ("Open in Terminal").
- A client kept attached to every listed session, or one kept alive on the server after its panel
  closes.
- xterm.js's WebGL renderer.
- SF Mono (a page can't reach it, see the font decision).
- The town's calm 30 fps while a terminal is shown (the look spec).
- Every key besides Cmd+Esc: R, the arm second, Esc closing layers one at a time, the letter keys
  (the Desk spec).
- The card's new design in the sheet's column (the Desk spec).
- The app itself: its main file, the Edit menu roles Cmd+C and Cmd+V need on macOS, the Launch
  Agent (next stretch).
- Spotting agent view on the screen to close the socket, or starting the client so `←` ends it.
- Dragging a file onto the terminal to paste its path.
- The Shell tab's ending and replay.

## Further Notes

- **Defaults you never reviewed**, taken on recommendation and open to change:
  - no hand-off to Terminal.app;
  - Option stays a typing key;
  - a detach hides the terminal;
  - links on Cmd+click;
  - the target numbers;
  - Cmd+Esc;
  - the reply box hidden while the sheet shows;
  - the waking line inside the terminal;
  - the sheet folding back on a detach;
  - the 96rem cap;
  - no scrollback for sessions;
  - the sheet in the work view.
- **Not measured:** a lead idle over an hour (its process stopped by Claude, then woken by the
  attach) and a long or busy lead. The recap guard is there for them.
- **Costs accepted with early attach:**
  - one Claude client (about 160 MB) per open panel;
  - opening a panel wakes a session Claude had stopped after its idle hour;
  - while the panel is open, your own `claude attach` of the same session in Terminal.app is held
    to the narrower of the two widths.
- `←` and agent view: agent view can show sessions outside the added projects, drawn by Claude's
  own client inside the sheet. Funtown reads and lists nothing new, so "sessions only in listed
  projects" holds for what Funtown sees.
- Planning trail (local only): `.scratch/first-stretch/`, tickets 07, 08, 09, 16, 18, 25, 26 and 28,
  and `review-answers.md`.
- Next step: `/workflow:to-tickets docs/specs/terminal-feels-real.md`.
