# Funtown

A local web page for running your Claude Code work. It lists every Claude Code session on
your Mac, grouped by project, opens a background session's live terminal in the page, and
lets you answer permission requests, questions and plans from cards.

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

Funtown listens on 127.0.0.1 only and sends nothing off your machine; a planned opt-in
"Suggest" button will show the exact text before sending it. Sessions come from
`claude agents --json`, terminals from `claude attach`; the server never reads Claude
Code's own files. The only Claude Code file Funtown touches is `settings.json`, where the
installer adds and removes its own hook entries. Each answer card that closes adds a line
to `~/.funtown/answers.jsonl`, saying whether it was answered in Funtown or elsewhere.

## Development

    npm test

Tests use a fake `claude` and never run the real one. Changes are listed in
[CHANGELOG.md](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE).
