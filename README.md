# Funtown

A local web page for running your Claude Code work. It shows the Claude Code sessions in
the projects you add in Settings as a small town (`/`), with a work view (`/work.html`) that
opens a background session's live terminal in the page and lets you answer permission
requests, questions and plans from cards.

Early and in progress.

## Requirements

- macOS
- Node.js 22.18 or later
- Claude Code 2.1.325 or later (`claude --version`)

## Run it

    npm install
    npm start               # serves http://127.0.0.1:4777

`npm start` first adds Funtown's hooks to Claude Code's `settings.json` (in
`$CLAUDE_CONFIG_DIR` when set, else `~/.claude`), so they stay current with each update;
`npm run install-hooks` does only that step. `npm run uninstall-hooks` removes them again,
leaving your own hooks as they were.

## Privacy

Funtown listens on 127.0.0.1 only and sends nothing off your machine itself; a planned
opt-in "Suggest" button will show the exact text before sending it. It runs `gh pr list`
in each project every minute, so GitHub sees those requests, and it starts one steward
session in `~/.funtown/steward` to review the pull requests you ask it to (an empty
`~/.funtown/steward.md` turns that off) and to give its word on a card when you ask for it
(the card's text goes to that session; an empty `~/.funtown/steward-card.md`
turns that off). Nothing is sent to it unless you ask. Sessions come from
`claude agents --json`, terminals from `claude attach`; the server never reads Claude
Code's own files. The only Claude Code file Funtown touches is `settings.json`, where the
installer adds and removes its own hook entries. Each ask of a session you've added adds a line
to `~/.funtown/answers.jsonl`: where it was answered (on a card in Funtown, in Funtown's own
terminal, elsewhere, or never shown because it came from a terminal session or no page was
open), with its kind, how serious it was and whether you asked the Queen for her word.

## Development

    npm test

Tests use a fake `claude` and never run the real one. Changes are listed in
[CHANGELOG.md](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE).
