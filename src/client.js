import { DEFAULT_PROFILE_ID } from "./constants.js";
import { createCodexAuthHeaders } from "./headers.js";
import { loginCodexOAuth, refreshCodexOAuth } from "./oauth.js";
import {
  deleteCredentialProfile,
  getCodexAccessToken,
  getCredentialProfile,
  listCredentialProfiles,
  resolveDefaultStorePath,
  upsertCredentialProfile,
} from "./store.js";

export class CodexOAuthClient {
  constructor(options = {}) {
    this.storePath = options.storePath || resolveDefaultStorePath(options.env);
    this.profileId = options.profileId || DEFAULT_PROFILE_ID;
    this.openUrl = options.openUrl;
    this.onAuth = options.onAuth;
    this.onPrompt = options.onPrompt;
  }

  async login(options = {}) {
    const credential = await loginCodexOAuth({
      openUrl: options.openUrl || this.openUrl,
      onAuth: options.onAuth || this.onAuth,
      onPrompt: options.onPrompt || this.onPrompt,
      remote: options.remote,
      manualFallbackMs: options.manualFallbackMs,
      useLocalServer: options.useLocalServer,
      callbackHost: options.callbackHost,
      callbackPort: options.callbackPort,
      callbackPath: options.callbackPath,
      preflight: options.preflight,
      originator: options.originator,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
    return await upsertCredentialProfile(credential, {
      storePath: options.storePath || this.storePath,
      profileId: options.profileId || this.profileId,
    });
  }

  async refresh(options = {}) {
    const profileId = options.profileId || this.profileId;
    const credential = await getCredentialProfile({
      storePath: options.storePath || this.storePath,
      profileId,
    });
    const refreshed = await refreshCodexOAuth(credential, options);
    return await upsertCredentialProfile(refreshed, {
      storePath: options.storePath || this.storePath,
      profileId,
    });
  }

  async getAccessToken(options = {}) {
    return await getCodexAccessToken({
      storePath: options.storePath || this.storePath,
      profileId: options.profileId || this.profileId,
      forceRefresh: options.forceRefresh,
      refreshImpl: options.refreshImpl,
      skewMs: options.skewMs,
    });
  }

  async getHeaders(options = {}) {
    const { credential } = await this.getAccessToken(options);
    return createCodexAuthHeaders(credential, options);
  }

  async getProfile(options = {}) {
    return await getCredentialProfile({
      storePath: options.storePath || this.storePath,
      profileId: options.profileId || this.profileId,
    });
  }

  async listProfiles(options = {}) {
    return await listCredentialProfiles({
      storePath: options.storePath || this.storePath,
      skewMs: options.skewMs,
    });
  }

  async logout(options = {}) {
    return await deleteCredentialProfile({
      storePath: options.storePath || this.storePath,
      profileId: options.profileId || this.profileId,
    });
  }
}
