# Developer Integration Guide

This guide shows how to attach `@namtoppro/codex-oauth-module` to another Node.js project so the project can authenticate with OpenAI Codex OAuth and call the Codex backend.

## What This Module Gives You

- `codex-oauth` CLI for local login, refresh, token inspection, and diagnostics.
- `CodexOAuthClient` for app code.
- File-based OAuth profile storage with refresh locking.
- Helpers for Codex backend headers and SSE text streaming.
- No OpenClaw/Hermes runtime dependency.

## Requirements

- Node.js 20 or newer.
- A browser for normal login, or copy/paste access for remote login.
- Network access to `auth.openai.com` and `chatgpt.com`.
- A writable credential store path.

Default credential store:

```text
~/.codex-oauth/auth.json
```

You can override it per app:

```bash
CODEX_OAUTH_STORE=/absolute/path/to/auth.json
CODEX_OAUTH_HOME=/absolute/path/to/state-dir
```

Use a per-app store when you do not want multiple apps sharing the same refresh token.

## Integration Patterns

### Pattern A: Developer Logs In With CLI, App Only Reads Tokens

This is the simplest path for local tools, internal scripts, and desktop helpers.

```bash
codex-oauth login
codex-oauth doctor
codex-oauth token --json
```

Then app code:

```js
import { CodexOAuthClient } from "@namtoppro/codex-oauth-module";

const codexAuth = new CodexOAuthClient();
const headers = await codexAuth.getHeaders({
  originator: "my-product",
});

const response = await fetch("https://chatgpt.com/backend-api/codex/responses", {
  method: "POST",
  headers: {
    ...headers,
    accept: "text/event-stream",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-5.4",
    store: false,
    stream: true,
    instructions: "You are a helpful assistant.",
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "Reply with hello." }],
      },
    ],
    text: { verbosity: "low" },
    include: ["reasoning.encrypted_content"],
    tool_choice: "auto",
    parallel_tool_calls: true,
  }),
});
```

Use this when your app is running on the same machine where the user logs in.

### Pattern B: App Owns the Login Flow

Use this when your app has its own onboarding flow.

```js
import { CodexOAuthClient } from "@namtoppro/codex-oauth-module";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";

function openUrl(url) {
  const child = spawn("open", [url], { detached: true, stdio: "ignore" });
  child.unref();
}

const prompts = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const client = new CodexOAuthClient({
  storePath: "./.codex-oauth/auth.json",
  openUrl,
  onAuth(info) {
    console.log(info.instructions);
    console.log(info.url);
  },
  onPrompt(prompt) {
    return prompts.question(`${prompt.message} `);
  },
});

await client.login();
prompts.close();
```

For remote or headless servers:

```js
await client.login({
  remote: true,
  useLocalServer: false,
});
```

In remote mode, show the URL to the user, have them open it in any external
browser, then paste the redirect URL back into your app. The browser may show a
`localhost:1455` connection error after sign-in; that is expected because the
browser is running on a different machine. The address bar still contains the
`code` and `state` values needed by the CLI.

CLI equivalent:

```bash
codex-oauth login --remote
codex-oauth login --external-browser
codex-oauth login --headless
```

### Pattern C: Use the Built-In Streaming Helper

If you only need text output, use `streamCodexText()`.

```js
import { streamCodexText } from "@namtoppro/codex-oauth-module";

const answer = await streamCodexText({
  originator: "my-product",
  body: {
    model: "gpt-5.4",
    store: false,
    stream: true,
    instructions: "Answer concisely.",
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "What is 2 + 2?" }],
      },
    ],
    text: { verbosity: "low" },
    include: ["reasoning.encrypted_content"],
    tool_choice: "auto",
    parallel_tool_calls: true,
  },
  onText(chunk) {
    process.stdout.write(chunk);
  },
});

console.log("\nFinal answer:", answer);
```

This helper:

- loads the OAuth profile
- refreshes if expired
- creates Codex headers
- posts to `/codex/responses`
- parses SSE text deltas

### Pattern D: Server Route or Backend Worker

For a backend route, keep the credential store outside your repo and inject its path.

```js
import express from "express";
import { streamCodexText } from "@namtoppro/codex-oauth-module";

const app = express();
app.use(express.json());

app.post("/ask-codex", async (req, res, next) => {
  try {
    const answer = await streamCodexText({
      storePath: process.env.CODEX_OAUTH_STORE,
      originator: "my-server",
      body: {
        model: "gpt-5.4",
        store: false,
        stream: true,
        instructions: "Answer concisely.",
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: req.body.prompt }],
          },
        ],
        text: { verbosity: "low" },
        include: ["reasoning.encrypted_content"],
        tool_choice: "auto",
        parallel_tool_calls: true,
      },
    });
    res.json({ answer });
  } catch (error) {
    next(error);
  }
});
```

Run login once on that host:

```bash
CODEX_OAUTH_STORE=/srv/my-app/codex-auth.json codex-oauth login --remote
```

The remote login flow does not require a browser on the server. Copy the printed
URL to your workstation, complete OpenAI sign-in there, then paste the final
redirect URL into the server terminal.

## Credential Lifecycle

### Login

```bash
codex-oauth login
```

Creates or updates a profile:

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "type": "oauth",
      "provider": "openai-codex",
      "access": "...",
      "refresh": "...",
      "expires": 1780235274501,
      "accountId": "..."
    }
  }
}
```

### Read Access Token

```js
const { accessToken, credential } = await client.getAccessToken();
```

If the access token is expired or close to expiry, the module refreshes and saves the new refresh token under a file lock.

### Refresh Manually

```bash
codex-oauth refresh
```

or:

```js
await client.refresh();
```

### Logout

```bash
codex-oauth logout
```

This deletes the local profile. It does not revoke the remote OpenAI session.

## Multiple Profiles

Use profile IDs when one machine needs separate accounts.

```bash
codex-oauth login --profile work
codex-oauth login --profile personal
codex-oauth profiles
```

App code:

```js
const workCodex = new CodexOAuthClient({ profileId: "work" });
const personalCodex = new CodexOAuthClient({ profileId: "personal" });
```

## Testing Your Integration

First verify the module:

```bash
node --test
node ./bin/codex-oauth.js doctor --json
node ./examples/functional-check.js
node ./examples/answer-smoke.js
```

Expected live smoke output:

```text
CODEX_OAUTH_FUNCTIONAL_OK_7
CODEX_OAUTH_OK_4
```

For a complete local checklist, see [FUNCTIONAL_TESTING.md](FUNCTIONAL_TESTING.md).

For a deterministic local test without real Codex network calls, point examples at a mock server with `--base-url`.

```bash
node ./examples/answer-smoke.js --base-url "http://127.0.0.1:3000/backend-api"
```

The package test suite already does this in `test/weather-smoke.test.js`.

## Security Checklist

- Do not commit `auth.json`.
- Do not log `access`, `refresh`, or `token --json` output.
- Prefer one store path per product or deployment.
- Keep store files on local disk with restricted permissions.
- Use `CodexOAuthClient.getAccessToken()` or `streamCodexText()` instead of reading the JSON file directly, so refresh locking is respected.
- Treat refresh tokens as non-portable unless you intentionally share one local store.

## Error Handling

Common errors:

- `profile_missing`: run `codex-oauth login`.
- `tls_preflight_failed`: Node cannot validate TLS certificates for `auth.openai.com`.
- `token_exchange_failed`: login/refresh token was rejected; run login again.
- `store_lock_timeout`: another process is refreshing or the lock file is stale.

Example:

```js
try {
  const answer = await streamCodexText({ body });
} catch (error) {
  if (error.code === "profile_missing") {
    // Ask the user to run login or launch your login flow.
  }
  throw error;
}
```

## Minimal Copy-Paste Integration

```js
import { streamCodexText } from "@namtoppro/codex-oauth-module";

export async function askCodex(prompt) {
  return await streamCodexText({
    originator: "my-product",
    body: {
      model: "gpt-5.4",
      store: false,
      stream: true,
      instructions: "You are a helpful assistant.",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      text: { verbosity: "low" },
      include: ["reasoning.encrypted_content"],
      tool_choice: "auto",
      parallel_tool_calls: true,
    },
  });
}
```

Before first use:

```bash
codex-oauth login
```
