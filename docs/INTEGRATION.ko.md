# Codex OAuth 모듈 한글 사용 설명서

English version: [INTEGRATION.md](INTEGRATION.md)

이 문서는 `@namtoppro/codex-oauth-module`을 다른 Node.js 프로젝트에 붙여서
OpenAI Codex OAuth로 인증하고 Codex 백엔드에 요청하는 방법을 설명합니다.

이 모듈은 OpenClaw/Hermes 전체 런타임을 가져오지 않고, OAuth 인증과 토큰 갱신,
Codex 요청 헤더 생성, 간단한 스트리밍 응답 처리만 독립적으로 사용할 수 있게 만든
패키지입니다.

## 제공 기능

- `codex-oauth` CLI: 로그인, 토큰 확인, 갱신, 로그아웃, 진단
- `CodexOAuthClient`: 앱 코드에서 OAuth 토큰과 헤더를 안전하게 가져오는 클라이언트
- 파일 기반 인증 저장소: `auth.json`에 프로필 저장
- refresh token 회전 시 파일 잠금 처리
- 브라우저 없는 서버에서도 쓸 수 있는 외부 브라우저 로그인
- Codex `chatgpt.com/backend-api` 호출용 헤더 생성
- 간단한 SSE 스트리밍 텍스트 헬퍼 `streamCodexText()`

## 요구사항

- Node.js 20 이상
- 최초 로그인용 브라우저, 또는 외부 브라우저에서 로그인 후 URL을 복사해 붙여넣을 수 있는 환경
- `auth.openai.com`과 `chatgpt.com`으로 나가는 네트워크
- 쓰기 가능한 인증 저장소 경로

기본 인증 저장소는 다음 위치입니다.

```text
~/.codex-oauth/auth.json
```

프로젝트별로 분리하고 싶으면 환경변수로 바꿀 수 있습니다.

```bash
CODEX_OAUTH_STORE=/absolute/path/to/auth.json
CODEX_OAUTH_HOME=/absolute/path/to/state-dir
```

## GitHub에서 설치

다른 Node.js 프로젝트에서 바로 설치할 수 있습니다.

```bash
npm install github:namtoppro/codex-oauth-module
```

SSH 배포키를 쓰는 환경이면 아래처럼 설치할 수 있습니다.

```bash
npm install git+ssh://git@github.com/namtoppro/codex-oauth-module.git
```

설치 후 프로젝트 안에서 CLI를 실행합니다.

```bash
npx codex-oauth login --remote
npx codex-oauth doctor
```

로컬 개발 중 이 저장소에서 직접 실행할 때는 다음처럼 씁니다.

```bash
node ./bin/codex-oauth.js doctor
node ./bin/codex-oauth.js login --remote
```

## Node 명령이 없을 때

Codex 앱 안의 macOS 터미널에서 `node: command not found`가 나오면 Codex 앱에
포함된 Node 런타임을 사용할 수 있습니다.

```bash
/Applications/Codex.app/Contents/Resources/node ./bin/codex-oauth.js doctor
/Applications/Codex.app/Contents/Resources/node ./bin/codex-oauth.js login --remote
```

일반 개발 환경에서는 Node.js 20 이상을 설치하고 `node`가 `PATH`에 잡히게 하는
것을 권장합니다.

## 최초 로그인

데스크톱처럼 브라우저를 바로 열 수 있는 환경에서는 다음 명령을 사용합니다.

```bash
npx codex-oauth login
```

Linux 서버, SSH 접속 장비, 컨테이너, 브라우저가 없는 장비에서는 `--remote`를
사용합니다.

```bash
npx codex-oauth login --remote
```

동작 방식은 다음과 같습니다.

1. CLI가 OpenAI OAuth URL을 출력합니다.
2. 그 URL을 복사해서 브라우저가 있는 다른 PC나 휴대폰에서 엽니다.
3. OpenAI 로그인을 완료합니다.
4. 브라우저가 `localhost:1455` 오류 화면을 보여줄 수 있습니다. 정상입니다.
5. 브라우저 주소창 전체 URL을 복사합니다.
6. 터미널의 `Paste the authorization code (or full redirect URL):` 프롬프트에 붙여넣습니다.

성공하면 `auth.json`에 OAuth 프로필이 저장됩니다.

## CLI 명령

```bash
codex-oauth login
codex-oauth login --remote
codex-oauth login --external-browser
codex-oauth login --headless
codex-oauth profiles
codex-oauth token
codex-oauth token --json
codex-oauth refresh
codex-oauth logout
codex-oauth doctor
```

`token --json`은 실제 access token과 요청 헤더를 출력합니다. 운영 로그나 공유
문서에 남기지 마세요.

## 가장 간단한 사용 방식

사용자가 CLI로 한 번 로그인하고, 앱은 저장된 인증 정보를 읽어서 Codex 요청 헤더를
만드는 방식입니다.

```js
import { CodexOAuthClient } from "@namtoppro/codex-oauth-module";

const codexAuth = new CodexOAuthClient({
  storePath: process.env.CODEX_OAUTH_STORE,
});

const headers = await codexAuth.getHeaders({
  originator: "my-product",
});

const response = await fetch("https://chatgpt.com/backend-api/codex/responses", {
  method: "POST",
  headers: {
    ...headers,
    accept: "text/event-stream",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-5.4",
    store: false,
    stream: true,
    instructions: "Answer concisely.",
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "Reply with hello." }],
      },
    ],
    text: { verbosity: "low" },
    include: ["reasoning.encrypted_content"],
    tool_choice: "auto",
    parallel_tool_calls: true,
  }),
});
```

## 텍스트 응답만 필요할 때

`streamCodexText()`를 쓰면 토큰 로딩, 만료 시 갱신, 헤더 생성, Codex 요청,
SSE 텍스트 파싱을 한 번에 처리합니다.

```js
import { streamCodexText } from "@namtoppro/codex-oauth-module";

export async function askCodex(prompt) {
  return await streamCodexText({
    storePath: process.env.CODEX_OAUTH_STORE,
    originator: "my-product",
    body: {
      model: "gpt-5.4",
      store: false,
      stream: true,
      instructions: "You are a helpful assistant.",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      text: { verbosity: "low" },
      include: ["reasoning.encrypted_content"],
      tool_choice: "auto",
      parallel_tool_calls: true,
    },
  });
}
```

## 서버 라우트에 붙이는 예시

인증 파일은 저장소 밖에 두고, 경로만 환경변수로 주입하는 것을 권장합니다.

```js
import express from "express";
import { streamCodexText } from "@namtoppro/codex-oauth-module";

const app = express();
app.use(express.json());

app.post("/ask-codex", async (req, res, next) => {
  try {
    const answer = await streamCodexText({
      storePath: process.env.CODEX_OAUTH_STORE,
      originator: "my-server",
      body: {
        model: "gpt-5.4",
        store: false,
        stream: true,
        instructions: "Answer concisely.",
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: req.body.prompt }],
          },
        ],
        text: { verbosity: "low" },
        include: ["reasoning.encrypted_content"],
        tool_choice: "auto",
        parallel_tool_calls: true,
      },
    });

    res.json({ answer });
  } catch (error) {
    next(error);
  }
});
```

서버에서 최초 로그인은 한 번만 실행하면 됩니다.

```bash
CODEX_OAUTH_STORE=/srv/my-app/codex-auth.json npx codex-oauth login --remote
```

## 여러 계정 사용

하나의 장비에서 여러 OpenAI 계정을 써야 하면 프로필을 나눕니다.

```bash
npx codex-oauth login --profile work
npx codex-oauth login --profile personal
npx codex-oauth profiles
```

앱 코드에서는 다음처럼 선택합니다.

```js
const workCodex = new CodexOAuthClient({ profileId: "work" });
const personalCodex = new CodexOAuthClient({ profileId: "personal" });
```

## 테스트

모듈 자체 테스트:

```bash
node --test
```

저장된 프로필과 네트워크 상태 확인:

```bash
npx codex-oauth doctor
```

실제 Codex 응답까지 확인:

```bash
node ./examples/functional-check.js
```

기대 출력:

```text
CODEX_OAUTH_FUNCTIONAL_OK_7
PASS Codex OAuth functional check completed.
```

특정 응답을 검증하고 싶으면:

```bash
node ./examples/functional-check.js \
  --prompt "Reply with exactly: NAMTOPPRO_OK" \
  --expect "NAMTOPPRO_OK"
```

토큰 갱신까지 강제로 확인하려면:

```bash
node ./examples/functional-check.js --refresh
```

## Docker 또는 내부 서비스에서 쓰는 방식

컨테이너 안에서는 인증 파일을 볼륨으로 마운트하고, 앱에 경로를 환경변수로 전달합니다.

```yaml
services:
  app:
    environment:
      - CODEX_OAUTH_STORE=/app/codex-oauth/auth.json
      - CODEX_OAUTH_PROFILE=default
      - CODEX_MODEL=gpt-5.4
    volumes:
      - ./codex-oauth:/app/codex-oauth
```

호스트에서 한 번 로그인합니다.

```bash
mkdir -p ./codex-oauth
CODEX_OAUTH_STORE="$PWD/codex-oauth/auth.json" npx codex-oauth login --remote
```

컨테이너의 앱은 `/app/codex-oauth/auth.json`을 읽어 Codex 요청을 보냅니다.

## 보안 주의사항

- `auth.json`을 Git에 커밋하지 마세요.
- `access`, `refresh`, `token --json` 출력값을 로그에 남기지 마세요.
- 운영 서비스별로 인증 저장소를 분리하는 것을 권장합니다.
- 인증 저장소는 로컬 디스크에 두고 권한을 제한하세요.
- JSON 파일을 직접 읽기보다 `CodexOAuthClient.getAccessToken()` 또는
  `streamCodexText()`를 사용하세요. 그래야 refresh token 회전 시 파일 잠금이 적용됩니다.
- refresh token을 다른 장비로 복사하는 것은 의도한 경우에만 하세요.

## 자주 나는 오류

`profile_missing`

로그인을 먼저 실행하세요.

```bash
npx codex-oauth login --remote
```

`tls_preflight_failed`

Node가 `auth.openai.com` TLS 인증서를 검증하지 못한 상태입니다. 사내 프록시,
루트 인증서, 네트워크 보안 장비 설정을 확인하세요.

`token_exchange_failed`

로그인 코드 또는 refresh token이 거절된 상태입니다. 다시 로그인하세요.

`store_lock_timeout`

다른 프로세스가 토큰을 갱신 중이거나 잠금 파일이 오래 남아 있을 수 있습니다.
동시에 여러 앱이 같은 저장소를 쓰는지 확인하세요.

`Codex request failed (401)`

저장된 토큰이 무효화되었거나 갱신에 실패했습니다. 다시 로그인하세요.

`Codex request failed (403)`

해당 OpenAI 계정이 요청한 Codex 백엔드나 모델에 접근 권한이 없을 수 있습니다.

## 운영 체크리스트

1. `npm install github:namtoppro/codex-oauth-module`로 설치한다.
2. `CODEX_OAUTH_STORE` 경로를 프로젝트별로 정한다.
3. `npx codex-oauth login --remote`로 최초 인증 파일을 만든다.
4. `npx codex-oauth doctor`로 프로필과 네트워크를 확인한다.
5. 앱에서는 `CodexOAuthClient` 또는 `streamCodexText()`를 사용한다.
6. `auth.json`은 `.gitignore`에 넣고 권한을 제한한다.
7. 배포 환경에서는 `auth.openai.com`, `chatgpt.com` 네트워크 접근을 확인한다.
