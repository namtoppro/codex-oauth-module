# Codex OAuth Saju Web

Local test web app for `@namtoppro/codex-oauth-module`.

The page collects a name or alias, birth date, gender, and solar/lunar calendar type. The local server sends that input to Codex through the stored OAuth profile and returns a short Korean saju-style reading.

This is an entertainment and integration test app. Do not use it for medical, legal, financial, or other high-impact decisions.

## Run

Login once:

```bash
node ./bin/codex-oauth.js login
```

If your shell cannot find `node` on macOS inside Codex:

```bash
/Applications/Codex.app/Contents/Resources/node ./bin/codex-oauth.js login
```

Start the web app:

```bash
node ./examples/saju-web/server.js
```

or with the Codex bundled Node:

```bash
/Applications/Codex.app/Contents/Resources/node ./examples/saju-web/server.js
```

Open:

```text
http://127.0.0.1:4177
```

## Options

```bash
node ./examples/saju-web/server.js --port 4180 --profile work
```

Supported options:

- `--host`
- `--port`
- `--model`
- `--store`
- `--profile`

## Privacy Note

The browser talks to the local server, and the local server sends the entered fields to Codex. Use a nickname while testing if you do not want to send a real name.
