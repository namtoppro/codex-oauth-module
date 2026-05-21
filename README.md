# Codex OAuth Module

Standalone Node.js module for OpenAI Codex / ChatGPT OAuth authentication.

Developer integration guide: [docs/INTEGRATION.md](docs/INTEGRATION.md)
Functional testing guide: [docs/FUNCTIONAL_TESTING.md](docs/FUNCTIONAL_TESTING.md)

This project extracts the useful OpenClaw/Hermes pattern into a portable package:

- PKCE OAuth login against `auth.openai.com`
- local callback on `http://localhost:1455/auth/callback`
- manual redirect URL paste fallback for remote/headless hosts
- refresh-token rotation
- small JSON profile store with a file lock
- helpers for Codex `chatgpt.com/backend-api` auth headers
- CLI for login, token retrieval, refresh, logout, and diagnostics

## Install

Use the package directly from this folder during development:

```bash
node ./bin/codex-oauth.js doctor
```

When published or linked into another project:

```bash
codex-oauth login
codex-oauth token
```

Default credential store:

```text
~/.codex-oauth/auth.json
```

Override it with either:

```bash
CODEX_OAUTH_STORE=/path/to/auth.json codex-oauth login
CODEX_OAUTH_HOME=/path/to/state codex-oauth login
```

## Library Usage

For complete application integration patterns, see [docs/INTEGRATION.md](docs/INTEGRATION.md).

```js
import { CodexOAuthClient } from "@namtoppro/codex-oauth-module";

const client = new CodexOAuthClient({
  storePath: "./.codex-oauth/auth.json",
});

const { accessToken, credential } = await client.getAccessToken();
const headers = await client.getHeaders();
```

Login from a CLI:

```js
import { loginCodexOAuth, upsertCredentialProfile } from "@namtoppro/codex-oauth-module";

const credential = await loginCodexOAuth({
  openUrl: (url) => console.log(url),
  onPrompt: async () => process.stdin.read(),
});

await upsertCredentialProfile(credential);
```

## CLI

```bash
codex-oauth login
codex-oauth login --remote
codex-oauth login --external-browser
codex-oauth profiles
codex-oauth token
codex-oauth token --json
codex-oauth refresh
codex-oauth logout
codex-oauth doctor
```

`token --json` returns the access token and ready-to-use headers. Do not log that output in production.

## Headless / External Browser Login

On Linux servers, SSH sessions, containers, or appliances with no usable browser:

```bash
codex-oauth login --remote
```

or the more explicit alias:

```bash
codex-oauth login --external-browser
```

The CLI prints an OpenAI OAuth URL and waits for input. Open the URL on any
other device with a browser. After sign-in, the browser may fail to load
`http://localhost:1455/auth/callback`; that is expected. Copy the full address
bar URL, including `code=...` and `state=...`, then paste it into the CLI.

In app code, use:

```js
await client.login({
  remote: true,
  useLocalServer: false,
});
```

## Weather Smoke Test

After login, run a real Codex backend request:

```bash
node ./bin/codex-oauth.js login
node ./examples/weather-smoke.js --location "Seoul, South Korea"
```

This asks Codex about today's weather using the stored OAuth profile. The prompt
tells the model not to invent live weather if it has no real-time weather access;
the purpose is to verify OAuth + request headers + streaming response handling.

For local integration tests, point it at a test server:

```bash
node ./examples/weather-smoke.js --base-url "http://127.0.0.1:3000/backend-api"
```

## Deterministic Answer Smoke Test

Use this when you want a response assertion rather than a live-weather caveat:

```bash
node ./examples/answer-smoke.js
```

By default it asks Codex to reply with `CODEX_OAUTH_OK_4` and exits non-zero if
that text is not present in the response.

## Functional Test

Use this when you want to verify the whole module on your machine:

```bash
node ./bin/codex-oauth.js login
node ./examples/functional-check.js
```

Expected output ends with:

```text
CODEX_OAUTH_FUNCTIONAL_OK_7
PASS Codex OAuth functional check completed.
```

To also force token refresh before the live request:

```bash
node ./examples/functional-check.js --refresh
```

For the full checklist, see [docs/FUNCTIONAL_TESTING.md](docs/FUNCTIONAL_TESTING.md).

## Design Notes

The OpenClaw source separates three concerns:

- OAuth browser flow and refresh logic
- profile storage and token refresh locking
- provider/runtime request headers

This module keeps the same separation but removes OpenClaw-specific plugin, wizard, and agent concepts.

The refresh token is treated as canonical local state. If multiple apps share the same file, use the file lock by going through `getCodexAccessToken()` or `CodexOAuthClient`.

## Runtime Requirements

- Node.js 20+
- Browser access for normal login, or copy/paste access for `--remote`
- Network access to `auth.openai.com`

## Source References

- OpenClaw OAuth concept docs: https://github.com/openclaw/openclaw/blob/main/docs/concepts/oauth.md
- OpenClaw Codex OAuth runtime: `extensions/openai/openai-codex-oauth.runtime.ts`
- `@earendil-works/pi-ai` OAuth flow shape: `dist/utils/oauth/openai-codex.js`
