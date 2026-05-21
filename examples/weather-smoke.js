#!/usr/bin/env node
import { streamCodexText } from "../src/index.js";

function parseArgs(argv) {
  const args = {
    location: "Seoul, South Korea",
    model: "gpt-5.4",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--location" && argv[index + 1]) {
      args.location = argv[index + 1];
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

async function askWeather(args) {
  const body = {
    model: args.model,
    store: false,
    stream: true,
    instructions:
      "You are a concise Korean assistant. Do not invent live weather. If you do not have live weather access, say that clearly and suggest checking a weather service.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `오늘 ${args.location} 날씨를 알려줘. 실시간 날씨 접근이 없으면 없다고 말해줘.`,
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
    originator: "codex-oauth-weather-smoke",
    body,
    onText: (text) => process.stdout.write(text),
  });
  if (!answer.endsWith("\n")) {
    process.stdout.write("\n");
  }
}

const args = parseArgs(process.argv.slice(2));
askWeather(args).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/profile_missing|No Codex OAuth profile/i.test(message)) {
    console.error("Codex OAuth profile is missing. Run this first:");
    console.error("  node ./bin/codex-oauth.js login");
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
