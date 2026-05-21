#!/usr/bin/env node
import { streamCodexText } from "../src/index.js";

function parseArgs(argv) {
  const args = {
    model: "gpt-5.4",
    prompt: "Reply with exactly: CODEX_OAUTH_OK_4",
    expect: "CODEX_OAUTH_OK_4",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--prompt" && argv[index + 1]) {
      args.prompt = argv[index + 1];
      index += 1;
    } else if (value === "--expect" && argv[index + 1]) {
      args.expect = argv[index + 1];
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
    } else if (value === "--base-url" && argv[index + 1]) {
      args.baseUrl = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

async function runAnswerSmoke(args) {
  const body = {
    model: args.model,
    store: false,
    stream: true,
    instructions:
      "You are a deterministic test responder. Follow the user's requested exact output.",
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

  const answer = await streamCodexText({
    storePath: args.storePath,
    profileId: args.profileId,
    baseUrl: args.baseUrl,
    originator: "codex-oauth-answer-smoke",
    body,
    onText: (text) => process.stdout.write(text),
  });
  if (!answer.endsWith("\n")) {
    process.stdout.write("\n");
  }
  if (args.expect && !answer.includes(args.expect)) {
    throw new Error(`Expected answer to include "${args.expect}", got: ${answer}`);
  }
}

runAnswerSmoke(parseArgs(process.argv.slice(2))).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/profile_missing|No Codex OAuth profile/i.test(message)) {
    console.error("Codex OAuth profile is missing. Run this first:");
    console.error("  node ./bin/codex-oauth.js login");
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
