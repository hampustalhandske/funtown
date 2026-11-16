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
    npm run install-hooks   # adds Funtown's hooks to ~/.claude/settings.json
    npm start               # serves http://127.0.0.1:4777

`npm run uninstall-hooks` removes the hooks again, leaving your own hooks as they were.

## Privacy

Funtown listens on 127.0.0.1 only and sends nothing off your machine. Sessions come from
`claude agents --json`, terminals from `claude attach`; it never reads Claude Code's own
files. Each answer card that closes adds a line to `~/.funtown/answers.jsonl`, saying
whether it was answered in Funtown or elsewhere.

## Development

    npx eslint . && npx vitest run && npx playwright test

Tests use a fake `claude` and never run the real one. Changes are listed in
[CHANGELOG.md](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE).
