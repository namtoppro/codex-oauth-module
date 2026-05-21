#!/usr/bin/env node
import { CodexOAuthClient, streamCodexText } from "../src/index.js";

const DEFAULT_EXPECTED = "CODEX_OAUTH_FUNCTIONAL_OK_7";

function usage() {
  return `Usage:
  node ./examples/functional-check.js [options]

Options:
  --prompt <text>       Prompt to send to Codex
  --expect <text>       Text that must appear in the Codex response
  --model <name>        Codex model name (default: gpt-5.4)
  --profile <id>        Credential profile ID (default: default)
  --store <path>        Credential store path
  --base-url <url>      Backend base URL for mock/local testing
  --refresh             Force one token refresh before the live request
  --json                Print final summary as JSON
  --help                Show this help
`;
}

function parseArgs(argv) {
  const args = {
    model: "gpt-5.4",
    prompt: `Reply with exactly: ${DEFAULT_EXPECTED}`,
    expect: DEFAULT_EXPECTED,
    refresh: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      args.help = true;
    } else if (value === "--prompt" && argv[index + 1]) {
      args.prompt = argv[index + 1];
      index += 1;
    } else if (value === "--expect" && argv[index + 1]) {
      args.expect = argv[index + 1];
      index += 1;
    } else if (value === "--model" && argv[index + 1]) {
      args.model = argv[index + 1];
      index += 1;
    } else if (value === "--profile" && argv[index + 1]) {
      args.profileId = argv[index + 1];
      index += 1;
    } else if (value === "--store" && argv[index + 1]) {
      args.storePath = argv[index + 1];
      index += 1;
    } else if (value === "--base-url" && argv[index + 1]) {
      args.baseUrl = argv[index + 1];
      index += 1;
    } else if (value === "--refresh") {
      args.refresh = true;
    } else if (value === "--json") {
      args.json = true;
    } else {
      throw new Error(`Unknown or incomplete option: ${value}`);
    }
  }

  return args;
}

function redact(value) {
  if (!value) {
    return "<missing>";
  }
  const text = String(value);
  if (text.length <= 12) {
    return "<redacted>";
  }
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function logStep(args, message) {
  if (!args.json) {
    console.log(message);
  }
}

function buildBody(args) {
  return {
    model: args.model,
    store: false,
    stream: true,
    instructions:
      "You are a deterministic functional test responder. Follow the user's requested exact output.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: args.prompt,
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

async function runFunctionalCheck(args) {
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const startedAt = new Date();
  const client = new CodexOAuthClient({
    storePath: args.storePath,
    profileId: args.profileId,
  });

  logStep(args, "[1/4] Loading stored Codex OAuth profile...");
  const profile = await client.getProfile();
  logStep(
    args,
    `      profile=${args.profileId || "default"} account=${profile.accountId || "<none>"} expires=${new Date(profile.expires).toISOString()}`,
  );

  if (args.refresh) {
    logStep(args, "[2/4] Refreshing OAuth token...");
    await client.refresh();
  } else {
    logStep(args, "[2/4] Reading OAuth token, refreshing only if needed...");
  }

  const headers = await client.getHeaders({
    originator: "codex-oauth-functional-check",
  });
  const authHeader = headers.authorization || headers.Authorization;
  const accountHeader = headers["chatgpt-account-id"];
  if (!authHeader || !String(authHeader).startsWith("Bearer ")) {
    throw new Error("Codex auth header was not created.");
  }
  logStep(args, `      authorization=Bearer ${redact(String(authHeader).slice(7))}`);
  logStep(args, `      chatgpt-account-id=${accountHeader || "<none>"}`);

  logStep(args, "[3/4] Sending deterministic live Codex request...");
  let streamedText = "";
  const answer = await streamCodexText({
    storePath: args.storePath,
    profileId: args.profileId,
    baseUrl: args.baseUrl,
    originator: "codex-oauth-functional-check",
    body: buildBody(args),
    onText: (chunk) => {
      streamedText += chunk;
      if (!args.json) {
        process.stdout.write(chunk);
      }
    },
  });
  if (!args.json && !streamedText.endsWith("\n")) {
    process.stdout.write("\n");
  }

  logStep(args, "[4/4] Verifying response text...");
  if (args.expect && !answer.includes(args.expect)) {
    throw new Error(`Expected response to include "${args.expect}", got: ${answer}`);
  }

  const summary = {
    ok: true,
    profileId: args.profileId || "default",
    accountId: profile.accountId || null,
    model: args.model,
    expected: args.expect,
    answer,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("PASS Codex OAuth functional check completed.");
  }
}

runFunctionalCheck(parseArgs(process.argv.slice(2))).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/profile_missing|No Codex OAuth profile/i.test(message)) {
    console.error("Codex OAuth profile is missing. Run one of these first:");
    console.error("  node ./bin/codex-oauth.js login");
    console.error("  node ./bin/codex-oauth.js login --remote");
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
