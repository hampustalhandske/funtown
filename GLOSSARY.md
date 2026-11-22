# Funtown

Funtown shows every Claude Code session across your projects as a town you tend, with the real
terminal one key away. These are the words its specs and code use.

## Language

**The app**:
Funtown's own window on the Mac, showing the town and the work view. Say "Mac app" where the Mac
must be said.
_Avoid_: shell, wrapper, desktop app

**Open time**:
The time from the click or key that shows a session's terminal to its text being visible in it.
_Avoid_: load time, attach time

**Early attach**:
A session's `claude attach` started once its panel has been open 300 ms, before the terminal is shown.
_Avoid_: warm client, pre-attach, keep-alive

**Detach**:
Claude's attach client ends while the session keeps running.
_Avoid_: close, exit (Close session stops the session)

**Terminal sheet**:
The large sheet over the town or the list that holds a session's panel column and its terminal
while the terminal is shown.
_Avoid_: modal, overlay, fullscreen

**Typing place**:
A text box or the terminal, where every key is typing and Funtown takes none. Cmd+Esc leaves the
terminal.
