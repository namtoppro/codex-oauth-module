import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  getCodexAccessToken,
  getCredentialProfile,
  listCredentialProfiles,
  upsertCredentialProfile,
} from "../src/index.js";

function credential(overrides = {}) {
  return {
    type: "oauth",
    provider: "openai-codex",
    access: "access-1",
    refresh: "refresh-1",
    expires: Date.now() + 60_000,
    accountId: "acct_123",
    ...overrides,
  };
}

test("credential store upserts and lists profiles", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-oauth-store-"));
  const storePath = path.join(dir, "auth.json");
  await upsertCredentialProfile(credential(), { storePath, profileId: "default" });
  const loaded = await getCredentialProfile({ storePath, profileId: "default" });
  assert.equal(loaded.accountId, "acct_123");
  const profiles = await listCredentialProfiles({ storePath });
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].profileId, "default");
});

test("getCodexAccessToken refreshes expired profile and persists result", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-oauth-refresh-"));
  const storePath = path.join(dir, "auth.json");
  await upsertCredentialProfile(
    credential({ access: "old", refresh: "old-refresh", expires: Date.now() - 1 }),
    { storePath, profileId: "default" },
  );
  const result = await getCodexAccessToken({
    storePath,
    profileId: "default",
    refreshImpl: async () =>
      credential({
        access: "new-access",
        refresh: "new-refresh",
        expires: Date.now() + 120_000,
      }),
  });
  assert.equal(result.accessToken, "new-access");
  const loaded = await getCredentialProfile({ storePath, profileId: "default" });
  assert.equal(loaded.refresh, "new-refresh");
});
