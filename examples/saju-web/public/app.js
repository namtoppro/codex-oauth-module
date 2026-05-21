const form = document.querySelector("#sajuForm");
const resultBox = document.querySelector("#resultBox");
const resultHint = document.querySelector("#resultHint");
const submitButton = document.querySelector("#submitButton");
const statusRow = document.querySelector("#statusRow");
const statusText = document.querySelector("#statusText");
const timeUnknown = document.querySelector("#timeUnknown");
const birthTime = document.querySelector("#birthTime");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAnswer(markdown) {
  const escaped = escapeHtml(markdown);
  return escaped.replace(/^## (.+)$/gmu, "<h2>$1</h2>");
}

function showLoading() {
  resultHint.textContent = "Codex OAuth로 풀이를 요청하고 있습니다.";
  resultBox.innerHTML = `
    <div class="loading">
      <strong>풀이 생성 중</strong>
      <div class="loading-bar" aria-hidden="true"></div>
      <span>저장된 OAuth 프로필로 Codex 백엔드에 연결하고 있습니다.</span>
    </div>
  `;
}

function showError(errors) {
  const list = Array.isArray(errors) ? errors : [String(errors)];
  resultHint.textContent = "요청을 완료하지 못했습니다.";
  resultBox.innerHTML = `<div class="error-box">${list.map(escapeHtml).join("<br />")}</div>`;
}

function showAnswer(answer) {
  resultHint.textContent = "간단 풀이가 도착했습니다.";
  resultBox.innerHTML = `<article class="answer">${renderAnswer(answer)}</article>`;
}

function readForm() {
  const formData = new FormData(form);
  return {
    name: formData.get("name"),
    gender: formData.get("gender"),
    calendarType: formData.get("calendarType"),
    birthDate: formData.get("birthDate"),
    birthTime: formData.get("birthTime"),
    timeUnknown: formData.get("timeUnknown") === "on",
    question: formData.get("question"),
  };
}

async function refreshStatus() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    const data = await response.json();
    if (data.ok) {
      statusRow.classList.remove("error");
      statusRow.classList.add("ready");
      statusText.textContent = `OAuth 연결됨: ${data.profileId}`;
      return;
    }
    throw new Error("OAuth 로그인이 필요합니다.");
  } catch {
    statusRow.classList.remove("ready");
    statusRow.classList.add("error");
    statusText.textContent = "OAuth 로그인 필요";
  }
}

timeUnknown.addEventListener("change", () => {
  birthTime.disabled = timeUnknown.checked;
  if (timeUnknown.checked) {
    birthTime.value = "";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  showLoading();

  try {
    const response = await fetch("/api/saju", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(readForm()),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      showError(data.errors || [`요청 실패: ${response.status}`]);
      return;
    }
    showAnswer(data.answer);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    submitButton.disabled = false;
  }
});

await refreshStatus();
