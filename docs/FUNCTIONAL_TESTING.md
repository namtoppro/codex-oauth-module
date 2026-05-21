# Functional Testing Guide

Use this guide when you want to verify that the module works end to end on a real machine.

The functional check validates:

- a stored OAuth profile exists
- an access token can be read or refreshed
- Codex request headers can be created
- a live streaming request reaches the Codex backend
- the returned text contains an expected value

The check never prints raw access or refresh tokens.

## 1. Install Dependencies

This repository has no runtime npm dependencies. You only need Node.js 20 or newer.

```bash
node --version
```

If your terminal prints `zsh: command not found: node` on macOS while testing
inside Codex, you can use the Node runtime bundled with the Codex app:

```bash
/Applications/Codex.app/Contents/Resources/node --version
```

Then replace `node` with that absolute path in the commands below:

```bash
/Applications/Codex.app/Contents/Resources/node ./bin/codex-oauth.js doctor
/Applications/Codex.app/Contents/Resources/node ./examples/functional-check.js
```

For normal development outside Codex, install Node.js 20 or newer and make sure
`node` is available in your shell `PATH`.

## 2. Login

On a desktop machine with a browser:

```bash
node ./bin/codex-oauth.js login
```

On a Linux server, SSH session, container, or appliance without a browser:

```bash
node ./bin/codex-oauth.js login --remote
```

Open the printed URL in any external browser. After OpenAI sign-in, copy the final redirect URL from the browser address bar and paste it back into the terminal.

## 3. Run Local Unit Tests

```bash
node --test
```

Expected result:

```text
tests 9
pass 9
fail 0
```

## 4. Run the Functional Check

```bash
node ./examples/functional-check.js
```

Expected output ends with:

```text
CODEX_OAUTH_FUNCTIONAL_OK_7
PASS Codex OAuth functional check completed.
```

This means OAuth storage, token loading, Codex headers, streaming request handling, and response verification all worked.

## 5. Force Refresh Test

Use this when you specifically want to test refresh-token rotation:

```bash
node ./examples/functional-check.js --refresh
```

This refreshes the OAuth token before making the live Codex request.

## 6. Custom Prompt Test

```bash
node ./examples/functional-check.js \
  --prompt "Reply with exactly: NAMTOPPRO_OK" \
  --expect "NAMTOPPRO_OK"
```

## 7. Multiple Profiles

Login with a named profile:

```bash
node ./bin/codex-oauth.js login --profile work
```

Run the functional check with that profile:

```bash
node ./examples/functional-check.js --profile work
```

## 8. Custom Credential Store

Use a custom store when testing inside another product:

```bash
CODEX_OAUTH_STORE=/absolute/path/to/auth.json node ./bin/codex-oauth.js login
CODEX_OAUTH_STORE=/absolute/path/to/auth.json node ./examples/functional-check.js
```

or:

```bash
node ./examples/functional-check.js --store /absolute/path/to/auth.json
```

## 9. JSON Output

```bash
node ./examples/functional-check.js --json
```

This is useful for CI or another wrapper script. Token values are still not printed.

## Troubleshooting

`profile_missing`

Run login first:

```bash
node ./bin/codex-oauth.js login
```

`Codex request failed (401)`

The stored token is invalid or expired in a way refresh could not recover. Run login again.

`Codex request failed (403)`

The authenticated account may not have access to the target Codex backend or model.

`Expected response to include ...`

The backend responded, but the text did not match the expected assertion. Try the default functional check again, then test with a simpler custom prompt.
