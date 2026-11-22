# The app is Electron, drawing the town in Chrome's engine

Funtown becomes a Mac app through Electron: a small TypeScript main file opens one window on the
local server's page, and a Launch Agent runs the server on the user's own Node, so the app is only
a window. We weighed Tauri 2 (a 3 MB shell, Rust), a Swift app with WKWebView (57 KB, Swift, and
the only route to a native terminal view) and Electron (about 255 MB). Swift was picked first and
then dropped, for two reasons in the user's words: "we don't want to develop for both Chrome and
Safari. We want to pick one", and "In my head, it is an app." Tauri and Swift both draw with
Safari's engine while the tests and the agents' hidden checks run Chrome's, so Electron is the
only shell with one engine everywhere and no second language.

## Consequences

- About 255 MB on disk. Electron ships a major version every 8 weeks and supports the latest
  three; we update before ours leaves support.
- No native terminal view: the terminal stays xterm.js in the page.
- The page never calls the app, so changing the app means rewriting only its main file.
- Chrome's engine has WebGPU. The town stays on three.js's WebGL renderer with four approved GLSL
  shaders (sea, sky, ink outline, tilt-shift blur) until the user decides otherwise; moving to
  WebGPU means rewriting those four in TSL.
- If we change our minds, the user's words stand: "We will have to redo it if we change our
  minds, but we choose electron now."
