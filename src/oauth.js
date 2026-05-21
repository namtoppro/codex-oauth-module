import http from "node:http";
import { randomBytes } from "node:crypto";
import {
  CODEX_OAUTH_AUTHORIZE_URL,
  CODEX_OAUTH_CLIENT_ID,
  CODEX_OAUTH_DEFAULT_CALLBACK_HOST,
  CODEX_OAUTH_DEFAULT_CALLBACK_PATH,
  CODEX_OAUTH_DEFAULT_CALLBACK_PORT,
  CODEX_OAUTH_DEFAULT_REDIRECT_URI,
  CODEX_OAUTH_PROVIDER_ID,
  CODEX_OAUTH_SCOPE,
  CODEX_OAUTH_TOKEN_URL,
  DEFAULT_MANUAL_FALLBACK_MS,
  DEFAULT_ORIGINATOR,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "./constants.js";
import { CodexOAuthError, formatUnknownError } from "./errors.js";
import { extractCodexAccountId, extractCodexEmail } from "./jwt.js";
import { generatePkcePair } from "./pkce.js";

const OAUTH_SUCCESS_HTML =
  "<!doctype html><meta charset=\"utf-8\"><title>Codex OAuth</title><h1>Authentication complete</h1><p>You can close this window.</p>";
const OAUTH_ERROR_HTML =
  "<!doctype html><meta charset=\"utf-8\"><title>Codex OAuth</title><h1>Authentication failed</h1><p>Return to the terminal and try again.</p>";

export function createOAuthState() {
  return randomBytes(16).toString("hex");
}

export function parseAuthorizationInput(input) {
  const value = String(input || "").trim();
  if (!value) {
    return {};
  }
  try {
    const url = new URL(value);
    return {
      code: url.searchParams.get("code") || undefined,
      state: url.searchParams.get("state") || undefined,
    };
  } catch {
    // Continue with non-URL parsing.
  }
  if (value.includes("#")) {
    const [code, state] = value.split("#", 2);
    return { code: code || undefined, state: state || undefined };
  }
  if (value.includes("code=")) {
    const params = new URLSearchParams(value);
    return {
      code: params.get("code") || undefined,
      state: params.get("state") || undefined,
    };
  }
  return { code: value };
}

export async function createCodexOAuthAuthorization(options = {}) {
  const { verifier, challenge } = await generatePkcePair();
  const state = options.state || createOAuthState();
  const redirectUri = options.redirectUri || CODEX_OAUTH_DEFAULT_REDIRECT_URI;
  const originator = options.originator || DEFAULT_ORIGINATOR;
  const url = new URL(CODEX_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CODEX_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", CODEX_OAUTH_SCOPE);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", originator);
  return { verifier, state, redirectUri, url: url.toString() };
}

export async function runOpenAIAuthPreflight(options = {}) {
  const timeoutMs = options.timeoutMs ?? 5000;
  const probeUrl =
    options.url ||
    "https://auth.openai.com/oauth/authorize?response_type=code&client_id=openclaw-preflight&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&scope=openid+profile+email";
  try {
    await (options.fetchImpl || fetch)(probeUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: true };
  } catch (error) {
    const message = formatUnknownError(error);
    const code =
      error && typeof error === "object" && typeof error.cause?.code === "string"
        ? error.cause.code
        : undefined;
    const tls =
      /certificate|self.?signed|issuer|UNABLE_TO|CERT_|TLS/i.test(message) ||
      (typeof code === "string" && /CERT|TLS|ISSUER|SIGNATURE/i.test(code));
    return {
      ok: false,
      kind: tls ? "tls-cert" : "network",
      code,
      message,
    };
  }
}

export function startLocalCallbackServer(options = {}) {
  const host = options.host || CODEX_OAUTH_DEFAULT_CALLBACK_HOST;
  const port = options.port || CODEX_OAUTH_DEFAULT_CALLBACK_PORT;
  const path = options.path || CODEX_OAUTH_DEFAULT_CALLBACK_PATH;
  const expectedState = options.state;
  let settle;
  let settled = false;
  const waitForCodePromise = new Promise((resolve) => {
    settle = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
  });
  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url || "", `http://${host}:${port}`);
      if (url.pathname !== path) {
        response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        response.end(OAUTH_ERROR_HTML);
        return;
      }
      if (expectedState && url.searchParams.get("state") !== expectedState) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        response.end(OAUTH_ERROR_HTML);
        settle({ error: new CodexOAuthError("state_mismatch", "Callback state mismatch") });
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        response.end(OAUTH_ERROR_HTML);
        settle({ error: new CodexOAuthError("missing_code", "Callback did not include code") });
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(OAUTH_SUCCESS_HTML);
      settle({ code });
    } catch (error) {
      response.writeHead(500, { "content-type": "text/html; charset=utf-8" });
      response.end(OAUTH_ERROR_HTML);
      settle({ error });
    }
  });
  return new Promise((resolve) => {
    server
      .listen(port, host, () => {
        resolve({
          available: true,
          close: () => server.close(),
          cancel: () => settle(null),
          waitForCode: () => waitForCodePromise,
        });
      })
      .on("error", () => {
        settle(null);
        resolve({
          available: false,
          close: () => {
            try {
              server.close();
            } catch {
              // ignore close errors
            }
          },
          cancel: () => {},
          waitForCode: async () => null,
        });
      });
  });
}

async function exchangeToken(body, options = {}) {
  const response = await (options.fetchImpl || fetch)(CODEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new CodexOAuthError(
      "token_exchange_failed",
      `OpenAI token endpoint returned ${response.status}: ${text || response.statusText}`,
    );
  }
  const json = await response.json();
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== "number") {
    throw new CodexOAuthError(
      "token_response_invalid",
      `OpenAI token response missing required fields`,
    );
  }
  const access = json.access_token;
  const accountId = extractCodexAccountId(access);
  if (!accountId) {
    throw new CodexOAuthError("account_id_missing", "Access token did not contain accountId");
  }
  return {
    type: "oauth",
    provider: CODEX_OAUTH_PROVIDER_ID,
    access,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
    accountId,
    email: extractCodexEmail(access),
    idToken: typeof json.id_token === "string" ? json.id_token : undefined,
  };
}

export async function exchangeAuthorizationCode(options) {
  if (!options?.code || !options?.verifier) {
    throw new CodexOAuthError("invalid_request", "code and verifier are required");
  }
  return await exchangeToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CODEX_OAUTH_CLIENT_ID,
      code: options.code,
      code_verifier: options.verifier,
      redirect_uri: options.redirectUri || CODEX_OAUTH_DEFAULT_REDIRECT_URI,
    }),
    options,
  );
}

export async function refreshCodexOAuth(refreshTokenOrCredential, options = {}) {
  const refreshToken =
    typeof refreshTokenOrCredential === "string"
      ? refreshTokenOrCredential
      : refreshTokenOrCredential?.refresh;
  if (!refreshToken) {
    throw new CodexOAuthError("invalid_request", "refresh token is required");
  }
  return await exchangeToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CODEX_OAUTH_CLIENT_ID,
    }),
    options,
  );
}

async function waitForManualInput(options, state, server, signal) {
  if (!options.onPrompt) {
    return null;
  }
  const manualFallbackMs =
    options.manualFallbackMs === undefined
      ? DEFAULT_MANUAL_FALLBACK_MS
      : options.manualFallbackMs;
  if (!options.remote && Number.isFinite(manualFallbackMs) && manualFallbackMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, manualFallbackMs));
  }
  const input = await options.onPrompt({
    message: "Paste the authorization code (or full redirect URL):",
    signal,
  });
  const parsed = parseAuthorizationInput(input);
  if (parsed.state && parsed.state !== state) {
    throw new CodexOAuthError("state_mismatch", "Manual authorization state mismatch");
  }
  return parsed.code ? { code: parsed.code } : null;
}

export async function loginCodexOAuth(options = {}) {
  const preflight =
    options.preflight === false
      ? { ok: true }
      : await runOpenAIAuthPreflight({
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs,
          ...(typeof options.preflight === "object" ? options.preflight : {}),
        });
  if (!preflight.ok && preflight.kind === "tls-cert") {
    throw new CodexOAuthError(
      "tls_preflight_failed",
      `TLS preflight failed before OAuth login: ${preflight.message}`,
    );
  }

  const authorization = await createCodexOAuthAuthorization(options);
  const server =
    options.useLocalServer === false
      ? null
      : await startLocalCallbackServer({
          state: authorization.state,
          host: options.callbackHost,
          port: options.callbackPort,
          path: options.callbackPath,
        });

  await options.onAuth?.({
    url: authorization.url,
    instructions: server?.available
      ? "Complete login in your browser. If callback does not finish, paste the redirect URL."
      : "Open this URL in a browser, sign in, then paste the redirect URL.",
  });
  if (options.openUrl) {
    await options.openUrl(authorization.url);
  }

  const manualAbort = new AbortController();
  try {
    const manualPromise = waitForManualInput(
      {
        ...options,
        remote: options.remote || !server?.available,
        manualFallbackMs: server?.available ? options.manualFallbackMs : 0,
      },
      authorization.state,
      server,
      manualAbort.signal,
    ).catch((error) => ({ error }));
    const result = server?.available
      ? await Promise.race([server.waitForCode(), manualPromise])
      : await manualPromise;
    manualAbort.abort();
    if (result?.error) {
      throw result.error;
    }
    const code = result?.code;
    if (!code) {
      throw new CodexOAuthError("missing_code", "Authorization code was not received");
    }
    return await exchangeAuthorizationCode({
      code,
      verifier: authorization.verifier,
      redirectUri: authorization.redirectUri,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    if (error instanceof CodexOAuthError) {
      throw error;
    }
    const message = formatUnknownError(error);
    if (/unsupported_country_region_territory/i.test(message)) {
      throw new CodexOAuthError(
        "unsupported_region",
        "OpenAI rejected token exchange for this country, region, or network route",
        { cause: error },
      );
    }
    throw new CodexOAuthError("login_failed", message, { cause: error });
  } finally {
    server?.close?.();
    manualAbort.abort();
  }
}
