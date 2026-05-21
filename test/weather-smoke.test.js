import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { upsertCredentialProfile } from "../src/index.js";

function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(payload) {
  return `${b64urlJson({ alg: "none" })}.${b64urlJson(payload)}.signature`;
}

function execNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function runExampleAgainstMockCodex(params) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-weather-smoke-"));
  const storePath = path.join(tempDir, "auth.json");
  const access = fakeJwt({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_weather",
    },
  });
  await upsertCredentialProfile(
    {
      type: "oauth",
      provider: "openai-codex",
      access,
      refresh: "refresh-token",
      expires: Date.now() + 3_600_000,
      accountId: "acct_weather",
    },
    { storePath },
  );

  let capturedRequest;
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    capturedRequest = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
    response.writeHead(200, {
      "content-type": "text/event-stream",
    });
    response.write(
      `data: ${JSON.stringify({
        type: "response.output_text.delta",
        delta: params.delta,
      })}\n\n`,
    );
    response.write(
      `data: ${JSON.stringify({
        type: "response.completed",
        response: { output: [] },
      })}\n\n`,
    );
    response.end();
  });

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/backend-api`;
    const { stdout } = await execNode([
      params.script,
      "--store",
      storePath,
      "--base-url",
      baseUrl,
      "--model",
      "gpt-test",
      ...params.extraArgs,
    ]);
    assert.match(stdout, params.stdoutPattern);
    assert.equal(capturedRequest.method, "POST");
    assert.equal(capturedRequest.url, "/backend-api/codex/responses");
    assert.equal(capturedRequest.headers.authorization, `Bearer ${access}`);
    assert.equal(capturedRequest.headers["chatgpt-account-id"], "acct_weather");
    assert.equal(capturedRequest.headers.originator, params.originator);
    assert.equal(capturedRequest.body.model, "gpt-test");
    assert.equal(capturedRequest.body.store, false);
    assert.equal(capturedRequest.body.stream, true);
    assert.match(capturedRequest.body.input[0].content[0].text, params.promptPattern);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("weather smoke example sends Codex OAuth headers and parses SSE output", async () => {
  await runExampleAgainstMockCodex({
    script: "./examples/weather-smoke.js",
    delta: "테스트 날씨 응답",
    stdoutPattern: /테스트 날씨 응답/,
    originator: "codex-oauth-weather-smoke",
    promptPattern: /Busan, South Korea/,
    extraArgs: ["--location", "Busan, South Korea"],
  });
});

test("answer smoke example asserts a deterministic Codex response", async () => {
  await runExampleAgainstMockCodex({
    script: "./examples/answer-smoke.js",
    delta: "CODEX_OAUTH_OK_4",
    stdoutPattern: /CODEX_OAUTH_OK_4/,
    originator: "codex-oauth-answer-smoke",
    promptPattern: /Reply exactly CODEX_OAUTH_OK_4/,
    extraArgs: [
      "--prompt",
      "Reply exactly CODEX_OAUTH_OK_4",
      "--expect",
      "CODEX_OAUTH_OK_4",
    ],
  });
});
