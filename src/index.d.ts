export type CodexOAuthCredential = {
  type: "oauth";
  provider: "openai-codex";
  access: string;
  refresh: string;
  expires: number;
  accountId: string;
  email?: string;
  idToken?: string;
};

export type CodexOAuthPrompt = {
  message: string;
  signal?: AbortSignal;
};

export type CodexOAuthLoginOptions = {
  onAuth?: (info: { url: string; instructions?: string }) => void | Promise<void>;
  onPrompt?: (prompt: CodexOAuthPrompt) => Promise<string>;
  openUrl?: (url: string) => void | Promise<void>;
  remote?: boolean;
  useLocalServer?: boolean;
  callbackHost?: string;
  callbackPort?: number;
  callbackPath?: string;
  manualFallbackMs?: number;
  preflight?: false | { timeoutMs?: number; fetchImpl?: typeof fetch };
  originator?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export declare class CodexOAuthError extends Error {
  code: string;
  constructor(code: string, message: string, options?: ErrorOptions);
}

export declare class CodexOAuthClient {
  constructor(options?: {
    storePath?: string;
    profileId?: string;
    env?: Record<string, string | undefined>;
    onAuth?: CodexOAuthLoginOptions["onAuth"];
    onPrompt?: CodexOAuthLoginOptions["onPrompt"];
    openUrl?: CodexOAuthLoginOptions["openUrl"];
  });
  login(options?: CodexOAuthLoginOptions & { storePath?: string; profileId?: string }): Promise<CodexOAuthCredential>;
  refresh(options?: { storePath?: string; profileId?: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<CodexOAuthCredential>;
  getAccessToken(options?: {
    storePath?: string;
    profileId?: string;
    forceRefresh?: boolean;
    skewMs?: number;
  }): Promise<{ accessToken: string; credential: CodexOAuthCredential; profileId: string }>;
  getHeaders(options?: {
    accountId?: string;
    originator?: string;
    userAgent?: string;
    responsesBeta?: boolean;
  }): Promise<Record<string, string>>;
  getProfile(options?: { storePath?: string; profileId?: string }): Promise<CodexOAuthCredential | null>;
  listProfiles(options?: { storePath?: string; skewMs?: number }): Promise<Array<{
    profileId: string;
    provider: string;
    accountId?: string;
    email?: string;
    expires?: number;
    expired: boolean;
  }>>;
  logout(options?: { storePath?: string; profileId?: string }): Promise<boolean>;
}

export declare function loginCodexOAuth(options?: CodexOAuthLoginOptions): Promise<CodexOAuthCredential>;
export declare function refreshCodexOAuth(
  refreshTokenOrCredential: string | Pick<CodexOAuthCredential, "refresh">,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<CodexOAuthCredential>;
export declare function createCodexAuthHeaders(
  credentialOrToken: CodexOAuthCredential | string,
  options?: {
    accountId?: string;
    originator?: string;
    userAgent?: string;
    responsesBeta?: boolean;
  },
): Record<string, string>;
export declare function createCodexResponsesUrl(options?: {
  baseUrl?: string;
  responsesPath?: string;
}): string;
export declare function parseCodexSse(response: Response): AsyncGenerator<unknown>;
export declare function textFromCompletedResponse(response: unknown): string;
export declare function streamCodexText(options: {
  storePath?: string;
  profileId?: string;
  baseUrl?: string;
  originator?: string;
  body: unknown;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onText?: (text: string) => void;
}): Promise<string>;
export declare function resolveDefaultStorePath(env?: Record<string, string | undefined>): string;
export declare function getCodexAccessToken(options?: {
  storePath?: string;
  profileId?: string;
  forceRefresh?: boolean;
  skewMs?: number;
}): Promise<{ accessToken: string; credential: CodexOAuthCredential; profileId: string }>;
