// Shared by the fake `claude` and the fake shell, which are copied apart from this folder: each
// finds this file next to itself (FakeClaude links it there). The server's own list of these names
// is TERMINAL_OWN in server/agents.ts.

/** The names in `env` that a terminal program sets about itself, which Funtown must not pass on to a pty. */
module.exports = (env = process.env) => Object.keys(env).filter((k) => /^(TERM_PROGRAM|TERM_PROGRAM_VERSION|TERM_SESSION_ID|LC_TERMINAL|LC_TERMINAL_VERSION|TMUX|TMUX_PANE|STY|VTE_VERSION|WT_SESSION|TERMINAL_EMULATOR)$|^(ITERM_|KITTY_|GHOSTTY_|WEZTERM_|ALACRITTY_|KONSOLE_)/.test(k));
