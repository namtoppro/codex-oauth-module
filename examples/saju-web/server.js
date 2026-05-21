#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CodexOAuthClient, streamCodexText } from "../../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const DEFAULT_PORT = 4177;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_MODEL = "gpt-5.4";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function parseArgs(argv) {
  const args = {
    host: process.env.HOST || DEFAULT_HOST,
    port: Number(process.env.PORT || DEFAULT_PORT),
    model: process.env.CODEX_SAJU_MODEL || DEFAULT_MODEL,
    storePath: process.env.CODEX_OAUTH_STORE,
    profileId: process.env.CODEX_OAUTH_PROFILE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--host" && argv[index + 1]) {
      args.host = argv[index + 1];
      index += 1;
    } else if (value === "--port" && argv[index + 1]) {
      args.port = Number(argv[index + 1]);
      index += 1;
    } else if (value === "--model" && argv[index + 1]) {
      args.model = argv[index + 1];
      index += 1;
    } else if (value === "--store" && argv[index + 1]) {
      args.storePath = argv[index + 1];
      index += 1;
    } else if (value === "--profile" && argv[index + 1]) {
      args.profileId = argv[index + 1];
      index += 1;
    } else if (value === "--help" || value === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown or incomplete option: ${value}`);
    }
  }

  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
    throw new Error(`Invalid port: ${args.port}`);
  }

  return args;
}

function usage() {
  return `Usage:
  node ./examples/saju-web/server.js [options]

Options:
  --host <host>       Host to bind (default: 127.0.0.1)
  --port <port>       Port to bind (default: 4177)
  --model <name>      Codex model name (default: gpt-5.4)
  --store <path>      Credential store path
  --profile <id>      Credential profile ID
  --help              Show this help
`;
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function textResponse(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(text);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) {
      throw new Error("request_too_large");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeInput(input) {
  return {
    name: String(input.name || "").trim(),
    gender: String(input.gender || "").trim(),
    calendarType: String(input.calendarType || "solar").trim(),
    birthDate: String(input.birthDate || "").trim(),
    birthTime: String(input.birthTime || "").trim(),
    timeUnknown: Boolean(input.timeUnknown),
    question: String(input.question || "").trim(),
  };
}

export function validateSajuInput(input) {
  const normalized = normalizeInput(input);
  const errors = [];

  if (!normalized.name) {
    errors.push("이름 또는 별칭을 입력해주세요.");
  }
  if (!["female", "male", "other"].includes(normalized.gender)) {
    errors.push("성별을 선택해주세요.");
  }
  if (!["solar", "lunar"].includes(normalized.calendarType)) {
    errors.push("양력 또는 음력을 선택해주세요.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized.birthDate)) {
    errors.push("생년월일을 YYYY-MM-DD 형식으로 입력해주세요.");
  }
  if (!normalized.timeUnknown && normalized.birthTime && !/^\d{2}:\d{2}$/u.test(normalized.birthTime)) {
    errors.push("태어난 시간은 HH:MM 형식으로 입력해주세요.");
  }

  return { ok: errors.length === 0, errors, input: normalized };
}

function genderLabel(value) {
  if (value === "female") {
    return "여성";
  }
  if (value === "male") {
    return "남성";
  }
  return "기타/미지정";
}

function calendarLabel(value) {
  return value === "lunar" ? "음력" : "양력";
}

export function buildSajuPrompt(input) {
  const timeText = input.timeUnknown || !input.birthTime ? "태어난 시간 모름" : input.birthTime;
  const questionText = input.question || "전반적인 성향과 오늘 바로 참고할 조언";

  return `간단한 사주 테스트 웹의 응답을 작성해주세요.

사용자 입력:
- 이름/별칭: ${input.name}
- 성별: ${genderLabel(input.gender)}
- 생년월일: ${input.birthDate}
- 달력 기준: ${calendarLabel(input.calendarType)}
- 태어난 시간: ${timeText}
- 관심 질문: ${questionText}

작성 규칙:
- 한국어로 답변합니다.
- 이 서비스는 엔터테인먼트용 간단 풀이이며, 전문 만세력 계산 또는 운명 단정이 아니라고 자연스럽게 안내합니다.
- 입력값만으로 정밀한 음력 변환이나 사주팔자 산출을 확정하지 않습니다.
- 의학, 법률, 투자, 채용, 결혼 같은 중대한 결정을 단정하지 않습니다.
- 불안감을 조장하지 말고, 실천 가능한 조언 중심으로 씁니다.
- 답변은 아래 형식을 지킵니다.

형식:
## 한 줄 요약
1문장

## 기질 흐름
3-4문장

## 강점
- 3개

## 조심할 점
- 3개

## 오늘의 작은 조언
2-3문장
`;
}

export function buildCodexBody({ input, model }) {
  return {
    model,
    store: false,
    stream: true,
    instructions:
      "You write concise Korean entertainment-style saju readings from user supplied fields. Be warm, practical, and avoid deterministic claims.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildSajuPrompt(input),
          },
        ],
      },
    ],
    text: { verbosity: "low" },
    include: ["reasoning.encrypted_content"],
    tool_choice: "auto",
    parallel_tool_calls: true,
  };
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const resolvedPath = path.normalize(path.join(publicDir, pathname));

  if (!resolvedPath.startsWith(publicDir)) {
    textResponse(response, 403, "Forbidden");
    return;
  }

  try {
    const content = await readFile(resolvedPath);
    const extension = path.extname(resolvedPath);
    response.writeHead(200, {
      "content-type": MIME_TYPES[extension] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(content);
  } catch {
    textResponse(response, 404, "Not Found");
  }
}

function createHandler(options) {
  return async function handler(request, response) {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

      if (request.method === "GET" && url.pathname === "/api/status") {
        const client = new CodexOAuthClient({
          storePath: options.storePath,
          profileId: options.profileId,
        });
        const profile = await client.getProfile().catch(() => null);
        jsonResponse(response, 200, {
          ok: Boolean(profile),
          profileId: options.profileId || "default",
          accountId: profile?.accountId || null,
          expires: profile?.expires ? new Date(profile.expires).toISOString() : null,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/saju") {
        const rawInput = await readJsonBody(request);
        const validation = validateSajuInput(rawInput);
        if (!validation.ok) {
          jsonResponse(response, 400, { ok: false, errors: validation.errors });
          return;
        }

        const answer = await streamCodexText({
          storePath: options.storePath,
          profileId: options.profileId,
          originator: "codex-oauth-saju-web",
          body: buildCodexBody({
            input: validation.input,
            model: options.model,
          }),
        });

        jsonResponse(response, 200, {
          ok: true,
          answer,
          model: options.model,
        });
        return;
      }

      if (request.method === "GET") {
        await serveStatic(request, response);
        return;
      }

      textResponse(response, 405, "Method Not Allowed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "request_too_large") {
        jsonResponse(response, 413, { ok: false, errors: ["요청이 너무 큽니다."] });
        return;
      }
      if (/profile_missing|No Codex OAuth profile/i.test(message)) {
        jsonResponse(response, 401, {
          ok: false,
          errors: ["Codex OAuth 로그인이 필요합니다. 터미널에서 codex-oauth login을 먼저 실행해주세요."],
        });
        return;
      }
      jsonResponse(response, 500, {
        ok: false,
        errors: [message],
      });
    }
  };
}

export function createSajuServer(options = {}) {
  return http.createServer(createHandler(options));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const server = createSajuServer(args);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(args.port, args.host, resolve);
  });

  const url = `http://${args.host}:${args.port}`;
  console.log(`Codex OAuth Saju Web: ${url}`);
  console.log("Press Ctrl+C to stop.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
