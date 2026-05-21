# Codex OAuth Module

## Goal

This repository provides a standalone Node.js module for OpenAI Codex OAuth login,
refresh, credential storage, and request-header helpers.

## Source Context

- The design follows OpenClaw/Hermes Codex OAuth behavior.
- Keep OpenClaw-specific agent, wizard, and plugin concepts out of this package.
- Preserve compatibility with the OpenAI Codex OAuth PKCE flow and local callback
  shape used by OpenClaw.

## Safety Rules

- Do not print refresh tokens in normal CLI output.
- Do not add networked tests that require real OpenAI login.
- Keep the module dependency-free unless a dependency clearly removes meaningful
  security or portability risk.
- Treat OAuth endpoints, client id, redirect URI, token shape, and refresh
  semantics as contract surfaces.

## Validation

- Run `node --test` after code changes.
- Run `node ./bin/codex-oauth.js doctor --json` when auth/network behavior changes.
- Run `node ./examples/weather-smoke.js --location "Seoul, South Korea"` only
  after a real OAuth profile has been created with `node ./bin/codex-oauth.js login`.
- Run `node ./examples/answer-smoke.js` when you need a deterministic real
  Codex answer assertion.
