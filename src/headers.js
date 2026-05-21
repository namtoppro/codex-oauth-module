import os from "node:os";
import {
  CODEX_RESPONSES_BASE_URL,
  CODEX_RESPONSES_PATH,
  DEFAULT_ORIGINATOR,
} from "./constants.js";
import { CodexOAuthError } from "./errors.js";
import { extractCodexAccountId } from "./jwt.js";

export function getCodexAccountId(credentialOrToken) {
  if (typeof credentialOrToken === "string") {
    return extractCodexAccountId(credentialOrToken);
  }
  return credentialOrToken?.accountId || extractCodexAccountId(credentialOrToken?.access);
}

export function createCodexAuthHeaders(credentialOrToken, options = {}) {
  const token =
    typeof credentialOrToken === "string" ? credentialOrToken : credentialOrToken?.access;
  if (!token) {
    throw new CodexOAuthError("access_token_missing", "Codex access token is required");
  }
  const accountId = options.accountId || getCodexAccountId(credentialOrToken);
  if (!accountId) {
    throw new CodexOAuthError("account_id_missing", "Codex accountId is required");
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    "chatgpt-account-id": accountId,
    originator: options.originator || DEFAULT_ORIGINATOR,
    "User-Agent":
      options.userAgent || `codex-oauth-module (${os.platform()} ${os.release()}; ${os.arch()})`,
  };
  if (options.responsesBeta !== false) {
    headers["OpenAI-Beta"] = "responses=experimental";
  }
  return headers;
}

export function createCodexResponsesUrl(options = {}) {
  const baseUrl = (options.baseUrl || CODEX_RESPONSES_BASE_URL).replace(/\/+$/u, "");
  const responsesPath = options.responsesPath || CODEX_RESPONSES_PATH;
  return `${baseUrl}${responsesPath.startsWith("/") ? "" : "/"}${responsesPath}`;
}
