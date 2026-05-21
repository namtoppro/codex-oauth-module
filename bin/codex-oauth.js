#!/usr/bin/env node
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  CodexOAuthClient,
  createCodexAuthHeaders,
  getCredentialProfile,
  loginCodexOAuth,
  resolveDefaultStorePath,
  runOpenAIAuthPreflight,
  upsertCredentialProfile,
} from "../src/index.js";

function printUsage() {
  console.log(`codex-oauth

Usage:
  codex-oauth login [--profile default] [--store path] [--remote|--external-browser|--headless] [--no-open] [--json]
  codex-oauth token [--profile default] [--store path] [--json]
  codex-oauth refresh [--profile default] [--store path] [--json]
  codex-oauth profiles [--store path] [--json]
  codex-oauth logout [--profile default] [--store path]
  codex-oauth doctor [--store path] [--json]
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (
      key === "json" ||
      key === "remote" ||
      key === "external-browser" ||
      key === "headless" ||
      key === "no-browser" ||
      key === "no-open"
    ) {
      args[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function openInBrowser(url) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", (error) => {
    console.error(`Could not open browser automatically: ${error.message}`);
    console.error("Open the URL printed above in a browser and continue manually.");
  });
  child.unref();
}

async function promptInput(prompt) {
  const rl = readline.createInterface({ input, output });
  let abort;
  const abortPromise = new Promise((_, reject) => {
    abort = () => {
      rl.close();
      reject(new Error("Prompt aborted"));
    };
  });
  prompt.signal?.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([rl.question(`${prompt.message} `), abortPromise]);
  } finally {
    if (abort) {
      prompt.signal?.removeEventListener("abort", abort);
    }
    rl.close();
  }
}

function summarizeCredential(profileId, credential) {
  return {
    profileId,
    provider: credential.provider,
    accountId: credential.accountId,
    email: credential.email,
    expires: credential.expires,
    expiresAt: credential.expires ? new Date(credential.expires).toISOString() : null,
  };
}

function writeJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "help";
  const storePath = args.store || resolveDefaultStorePath();
  const profileId = args.profile || "default";
  const client = new CodexOAuthClient({ storePath, profileId });

  if (command === "help" || args.help) {
    printUsage();
    return;
  }

  if (command === "login") {
    const externalBrowser = Boolean(
      args.remote || args["external-browser"] || args.headless || args["no-browser"],
    );
    const credential = await loginCodexOAuth({
      remote: externalBrowser,
      useLocalServer: externalBrowser ? false : undefined,
      openUrl: args["no-open"] || externalBrowser ? undefined : openInBrowser,
      onAuth(info) {
        if (externalBrowser) {
          console.error("Open this URL in any browser on another machine:");
          console.error("After sign-in, the browser may show a localhost error page.");
          console.error("Copy the full address bar URL and paste it back here.");
        } else {
          console.error(info.instructions || "Open this URL in your browser:");
        }
        console.error(info.url);
      },
      onPrompt: promptInput,
    });
    await upsertCredentialProfile(credential, { storePath, profileId });
    const summary = summarizeCredential(profileId, credential);
    if (args.json) {
      writeJson(summary);
    } else {
      console.log(`Logged in profile "${profileId}" (${summary.accountId})`);
      console.log(`Store: ${storePath}`);
    }
    return;
  }

  if (command === "token") {
    const result = await client.getAccessToken();
    if (args.json) {
      writeJson({
        profileId,
        accessToken: result.accessToken,
        headers: createCodexAuthHeaders(result.credential),
        credential: summarizeCredential(profileId, result.credential),
      });
    } else {
      console.log(result.accessToken);
    }
    return;
  }

  if (command === "refresh") {
    const credential = await client.refresh();
    if (args.json) {
      writeJson(summarizeCredential(profileId, credential));
    } else {
      console.log(`Refreshed profile "${profileId}"`);
    }
    return;
  }

  if (command === "profiles") {
    const profiles = await client.listProfiles();
    if (args.json) {
      writeJson(profiles);
    } else if (profiles.length === 0) {
      console.log("No profiles found.");
    } else {
      for (const profile of profiles) {
        const expiresAt = profile.expires ? new Date(profile.expires).toISOString() : "unknown";
        console.log(
          `${profile.profileId}\t${profile.provider}\t${profile.accountId || "-"}\t${expiresAt}`,
        );
      }
    }
    return;
  }

  if (command === "logout") {
    const removed = await client.logout();
    console.log(removed ? `Removed profile "${profileId}"` : `Profile "${profileId}" not found`);
    return;
  }

  if (command === "doctor") {
    const preflight = await runOpenAIAuthPreflight({ timeoutMs: 5000 });
    const profile = await getCredentialProfile({ storePath, profileId });
    const report = {
      node: process.version,
      storePath,
      profileId,
      authPreflight: preflight,
      profilePresent: Boolean(profile),
      profile: profile ? summarizeCredential(profileId, profile) : null,
    };
    if (args.json) {
      writeJson(report);
    } else {
      console.log(`[${preflight.ok ? "PASS" : "WARN"}] auth.openai.com preflight`);
      if (!preflight.ok) {
        console.log(`  ${preflight.kind}: ${preflight.message}`);
      }
      console.log(`[${profile ? "PASS" : "WARN"}] profile "${profileId}"`);
      console.log(`Store: ${storePath}`);
    }
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
