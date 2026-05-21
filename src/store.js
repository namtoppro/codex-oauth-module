import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CODEX_DEFAULT_HOME_ENV,
  CODEX_DEFAULT_STORE_ENV,
  DEFAULT_LOCK_STALE_MS,
  DEFAULT_LOCK_TIMEOUT_MS,
  DEFAULT_PROFILE_ID,
  DEFAULT_REFRESH_SKEW_MS,
} from "./constants.js";
import { CodexOAuthError } from "./errors.js";
import { refreshCodexOAuth } from "./oauth.js";

export function resolveDefaultStorePath(env = process.env) {
  if (env[CODEX_DEFAULT_STORE_ENV]) {
    return path.resolve(env[CODEX_DEFAULT_STORE_ENV]);
  }
  const home = env[CODEX_DEFAULT_HOME_ENV]
    ? path.resolve(env[CODEX_DEFAULT_HOME_ENV])
    : path.join(os.homedir(), ".codex-oauth");
  return path.join(home, "auth.json");
}

export function createEmptyCredentialStore() {
  return {
    version: 1,
    profiles: {},
  };
}

export async function loadCredentialStore(storePath = resolveDefaultStorePath()) {
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      ...parsed,
      profiles:
        parsed && typeof parsed.profiles === "object" && parsed.profiles !== null
          ? parsed.profiles
          : {},
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return createEmptyCredentialStore();
    }
    throw error;
  }
}

export async function saveCredentialStore(
  store,
  storePath = resolveDefaultStorePath(),
) {
  await fs.mkdir(path.dirname(storePath), { recursive: true, mode: 0o700 });
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(
    {
      version: 1,
      profiles: store.profiles || {},
    },
    null,
    2,
  );
  await fs.writeFile(tempPath, `${payload}\n`, { mode: 0o600 });
  await fs.rename(tempPath, storePath);
  try {
    await fs.chmod(storePath, 0o600);
  } catch {
    // chmod can fail on some filesystems; the initial mode still protects new files.
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeStaleLock(lockPath, staleMs) {
  try {
    const stat = await fs.stat(lockPath);
    if (Date.now() - stat.mtimeMs > staleMs) {
      await fs.unlink(lockPath);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function withCredentialStoreLock(storePath, callback, options = {}) {
  const lockPath = options.lockPath || `${storePath}.lock`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
  const startedAt = Date.now();
  await fs.mkdir(path.dirname(storePath), { recursive: true, mode: 0o700 });
  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
        );
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      await removeStaleLock(lockPath, staleMs);
      if (Date.now() - startedAt > timeoutMs) {
        throw new CodexOAuthError(
          "store_lock_timeout",
          `Timed out waiting for credential store lock: ${lockPath}`,
        );
      }
      await sleep(100);
    }
  }
  try {
    return await callback();
  } finally {
    await fs.unlink(lockPath).catch(() => {});
  }
}

export function isCredentialExpired(credential, options = {}) {
  const skewMs = options.skewMs ?? DEFAULT_REFRESH_SKEW_MS;
  return !credential?.expires || Number(credential.expires) - skewMs <= Date.now();
}

export async function getCredentialProfile(options = {}) {
  const profileId = options.profileId || DEFAULT_PROFILE_ID;
  const storePath = options.storePath || resolveDefaultStorePath();
  const store = await loadCredentialStore(storePath);
  return store.profiles[profileId] || null;
}

export async function upsertCredentialProfile(credential, options = {}) {
  const profileId = options.profileId || DEFAULT_PROFILE_ID;
  const storePath = options.storePath || resolveDefaultStorePath();
  await withCredentialStoreLock(storePath, async () => {
    const store = await loadCredentialStore(storePath);
    store.profiles[profileId] = {
      ...credential,
      type: "oauth",
      provider: credential.provider || "openai-codex",
    };
    await saveCredentialStore(store, storePath);
  }, options.lock);
  return await getCredentialProfile({ profileId, storePath });
}

export async function deleteCredentialProfile(options = {}) {
  const profileId = options.profileId || DEFAULT_PROFILE_ID;
  const storePath = options.storePath || resolveDefaultStorePath();
  return await withCredentialStoreLock(storePath, async () => {
    const store = await loadCredentialStore(storePath);
    const existed = Object.prototype.hasOwnProperty.call(store.profiles, profileId);
    delete store.profiles[profileId];
    await saveCredentialStore(store, storePath);
    return existed;
  }, options.lock);
}

export async function listCredentialProfiles(options = {}) {
  const storePath = options.storePath || resolveDefaultStorePath();
  const store = await loadCredentialStore(storePath);
  return Object.entries(store.profiles).map(([profileId, credential]) => ({
    profileId,
    provider: credential.provider,
    accountId: credential.accountId,
    email: credential.email,
    expires: credential.expires,
    expired: isCredentialExpired(credential, options),
  }));
}

export async function getCodexAccessToken(options = {}) {
  const profileId = options.profileId || DEFAULT_PROFILE_ID;
  const storePath = options.storePath || resolveDefaultStorePath();
  const forceRefresh = options.forceRefresh === true;
  const credential = await withCredentialStoreLock(storePath, async () => {
    const store = await loadCredentialStore(storePath);
    const current = store.profiles[profileId];
    if (!current) {
      throw new CodexOAuthError(
        "profile_missing",
        `No Codex OAuth profile found for "${profileId}"`,
      );
    }
    if (!forceRefresh && !isCredentialExpired(current, options)) {
      return current;
    }
    const refreshed = await (options.refreshImpl || refreshCodexOAuth)(current, options);
    store.profiles[profileId] = {
      ...current,
      ...refreshed,
      type: "oauth",
      provider: "openai-codex",
    };
    await saveCredentialStore(store, storePath);
    return store.profiles[profileId];
  }, options.lock);
  return {
    accessToken: credential.access,
    credential,
    profileId,
  };
}
