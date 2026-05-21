export class CodexOAuthError extends Error {
  constructor(code, message, options = {}) {
    super(`Codex OAuth failed (${code}): ${message}`, options);
    this.name = "CodexOAuthError";
    this.code = code;
  }
}

export function formatUnknownError(error) {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  if (
    typeof error === "string" ||
    typeof error === "number" ||
    typeof error === "boolean" ||
    typeof error === "bigint"
  ) {
    return String(error);
  }
  try {
    return JSON.stringify(error) || String(error);
  } catch {
    return Object.prototype.toString.call(error);
  }
}

export function redactCredentialSecrets(message, credentials) {
  let redacted = message;
  for (const secret of [credentials?.access, credentials?.refresh, credentials?.idToken]) {
    if (typeof secret === "string" && secret.length > 0) {
      redacted = redacted.split(secret).join("[redacted]");
    }
  }
  return redacted;
}
