import { CodexOAuthClient } from "./client.js";
import { createCodexResponsesUrl } from "./headers.js";

export async function* parseCodexSse(response) {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") {
          continue;
        }
        yield JSON.parse(data);
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export function textFromCompletedResponse(response) {
  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("");
}

export async function streamCodexText(options) {
  const client = new CodexOAuthClient({
    storePath: options.storePath,
    profileId: options.profileId,
  });
  const headers = await client.getHeaders({
    originator: options.originator,
  });
  const response = await (options.fetchImpl || fetch)(
    createCodexResponsesUrl({ baseUrl: options.baseUrl }),
    {
      method: "POST",
      headers: {
        ...headers,
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(options.body),
      signal: options.signal,
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Codex request failed (${response.status}): ${text || response.statusText}`);
  }

  let answer = "";
  for await (const event of parseCodexSse(response)) {
    if (event.type === "error") {
      throw new Error(`Codex stream error: ${event.message || JSON.stringify(event)}`);
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      answer += event.delta;
      options.onText?.(event.delta);
    }
    if (
      (event.type === "response.completed" ||
        event.type === "response.done" ||
        event.type === "response.incomplete") &&
      answer.trim().length === 0
    ) {
      const completedText = textFromCompletedResponse(event.response);
      answer += completedText;
      options.onText?.(completedText);
    }
  }
  return answer;
}
