import { CODEX_JWT_AUTH_CLAIM } from "./constants.js";
import { base64urlDecode } from "./base64url.js";

export function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    return JSON.parse(base64urlDecode(parts[1]).toString("utf8"));
  } catch {
    return null;
  }
}

export function extractCodexAccountId(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  const accountId = payload?.[CODEX_JWT_AUTH_CLAIM]?.chatgpt_account_id;
  return typeof accountId === "string" && accountId.length > 0 ? accountId : null;
}

export function extractCodexEmail(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  return typeof payload?.email === "string" && payload.email.length > 0
    ? payload.email
    : undefined;
}
