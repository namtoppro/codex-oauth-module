# Architecture

## Goal

Provide a small module that any Node.js project can embed when it needs Codex OAuth access without importing OpenClaw/Hermes.

## Boundaries

- `src/oauth.js`: PKCE, callback server, token exchange, token refresh.
- `src/store.js`: JSON credential store, profile CRUD, refresh lock.
- `src/headers.js`: Codex backend auth headers.
- `src/client.js`: convenience class joining OAuth, store, and headers.
- `bin/codex-oauth.js`: local developer CLI.

## Non-Goals

- Full OpenClaw model routing.
- WebSocket/SSE response streaming.
- Multi-agent inheritance.
- Keychain integration.

## Credential Model

```json
{
  "version": 1,
  "profiles": {
    "default": {
      "type": "oauth",
      "provider": "openai-codex",
      "access": "...",
      "refresh": "...",
      "expires": 1770000000000,
      "accountId": "..."
    }
  }
}
```

## Security Posture

- Store file is written with `0600` where the filesystem honors modes.
- Parent state directory is created with `0700`.
- Refresh is protected by a simple lock file to avoid concurrent refresh-token rotation.
- Errors redact known credential fields where the module formats them.
