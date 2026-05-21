import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCodexAuthHeaders,
  createCodexResponsesUrl,
  decodeJwtPayload,
  extractCodexAccountId,
  loginCodexOAuth,
  parseAuthorizationInput,
} from "../src/index.js";

function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(payload) {
  return `${b64urlJson({ alg: "none" })}.${b64urlJson(payload)}.signature`;
}

test("parseAuthorizationInput accepts redirect URL, query string, and raw code", () => {
  assert.deepEqual(
    parseAuthorizationInput("http://localhost:1455/auth/callback?code=abc&state=xyz"),
    { code: "abc", state: "xyz" },
  );
  assert.deepEqual(parseAuthorizationInput("code=abc&state=xyz"), {
    code: "abc",
    state: "xyz",
  });
  assert.deepEqual(parseAuthorizationInput("abc#xyz"), {
    code: "abc",
    state: "xyz",
  });
  assert.deepEqual(parseAuthorizationInput("abc"), { code: "abc" });
});

test("decodeJwtPayload and extractCodexAccountId read Codex account claim", () => {
  const token = fakeJwt({
    email: "user@example.com",
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_123",
    },
  });
  assert.equal(decodeJwtPayload(token).email, "user@example.com");
  assert.equal(extractCodexAccountId(token), "acct_123");
});

test("createCodexAuthHeaders builds backend headers", () => {
  const token = fakeJwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_123",
    },
  });
  const headers = createCodexAuthHeaders(token, { originator: "test" });
  assert.equal(headers.Authorization, `Bearer ${token}`);
  assert.equal(headers["chatgpt-account-id"], "acct_123");
  assert.equal(headers.originator, "test");
  assert.equal(headers["OpenAI-Beta"], "responses=experimental");
});

test("createCodexResponsesUrl joins base and path", () => {
  assert.equal(
    createCodexResponsesUrl({ baseUrl: "https://example.test/", responsesPath: "v1" }),
    "https://example.test/v1",
  );
});

test("loginCodexOAuth supports manual flow without local callback server", async () => {
  const token = fakeJwt({
    email: "user@example.com",
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_manual",
    },
  });
  const credential = await loginCodexOAuth({
    preflight: false,
    useLocalServer: false,
    openUrl: async () => {},
    onAuth: async () => {},
    onPrompt: async () => "http://localhost:1455/auth/callback?code=manual-code",
    fetchImpl: async (_url, request) => {
      const body = new URLSearchParams(String(request.body));
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("code"), "manual-code");
      return new Response(
        JSON.stringify({
          access_token: token,
          refresh_token: "refresh-token",
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });
  assert.equal(credential.accountId, "acct_manual");
  assert.equal(credential.email, "user@example.com");
  assert.equal(credential.refresh, "refresh-token");
});
