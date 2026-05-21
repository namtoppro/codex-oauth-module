import test from "node:test";
import assert from "node:assert/strict";
import { buildSajuPrompt, validateSajuInput } from "../examples/saju-web/server.js";

test("validateSajuInput accepts required saju fields", () => {
  const result = validateSajuInput({
    name: "테스트",
    gender: "female",
    calendarType: "solar",
    birthDate: "1990-02-03",
    birthTime: "08:30",
    question: "가벼운 조언",
  });

  assert.equal(result.ok, true);
  assert.equal(result.input.name, "테스트");
});

test("buildSajuPrompt frames the reading as entertainment", () => {
  const prompt = buildSajuPrompt({
    name: "테스트",
    gender: "male",
    calendarType: "lunar",
    birthDate: "1988-10-12",
    birthTime: "",
    timeUnknown: true,
    question: "",
  });

  assert.match(prompt, /엔터테인먼트용/u);
  assert.match(prompt, /음력/u);
  assert.match(prompt, /태어난 시간 모름/u);
});
