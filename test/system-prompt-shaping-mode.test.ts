import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished, test, vi } from "vitest";

import { globalConfigPath } from "#src/extension-config";
import { shapeAnthropicOAuthPayload } from "#src/request-shaping";
import { isSystemPromptShapingDisabled } from "#src/system-prompt-shaping-mode";

const PATH = "/home/me/.pi/agent/extensions/pi-anthropic-auth/config.json";

function withGlobalConfig(config: unknown): void {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-anthropic-auth-shaping-"));
  const path = globalConfigPath(agentDir);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(config));
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  onTestFinished(() => {
    vi.unstubAllEnvs();
    rmSync(agentDir, { recursive: true, force: true });
  });
}

function withNoGlobalConfig(): void {
  vi.stubEnv("PI_CODING_AGENT_DIR", "/nonexistent-pi-agent-dir");
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
}

/**
 * A payload shaped on both prompt-shaping routes: the Pi preamble in
 * `system[]`, and a mid-conversation `docs` section update inside
 * `messages[]`.
 */
function oauthPayload() {
  return {
    model: "claude-haiku-4-5",
    stream: true,
    messages: [
      { role: "user", content: [{ type: "text", text: "Hello" }] },
      {
        role: "system",
        content: [
          {
            type: "text",
            text: 'Updated system prompt section "docs":\n\n<docs>\nPi documentation (read only when the user asks about pi itself):\n- Main documentation: /home/user/.pi/agent/README.md\n</docs>',
          },
        ],
      },
    ],
    system: [
      {
        // Pi's own sections (`rules` among them) are what tell shaping this is
        // a structured prompt rather than the degraded passthrough path.
        type: "text",
        text: [
          "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.",
          "",
          "<rules>",
          "- Be concise in your responses",
          "</rules>",
        ].join("\n"),
      },
    ],
  };
}

test("isSystemPromptShapingDisabled returns true only when systemPromptShaping is false", () => {
  assert.equal(
    isSystemPromptShapingDisabled(PATH, () => "{}"),
    false,
  );
  assert.equal(
    isSystemPromptShapingDisabled(
      PATH,
      () => '{ "systemPromptShaping": true }',
    ),
    false,
  );
  assert.equal(
    isSystemPromptShapingDisabled(
      PATH,
      () => '{ "systemPromptShaping": "off" }',
    ),
    false,
  );
  assert.equal(
    isSystemPromptShapingDisabled(PATH, () => "not json"),
    false,
  );
  assert.equal(
    isSystemPromptShapingDisabled(PATH, () => "[]"),
    false,
  );
  assert.equal(
    isSystemPromptShapingDisabled(PATH, () => {
      throw new Error("ENOENT");
    }),
    false,
  );
  assert.equal(
    isSystemPromptShapingDisabled(
      PATH,
      () => '{ "systemPromptShaping": false }',
    ),
    true,
  );
});

test("shapes both prompt routes by default", () => {
  withNoGlobalConfig();

  const payload = oauthPayload();
  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;

  assert.ok(shaped.system[0]?.text.includes("x-anthropic-billing-header:"));
  assert.ok(
    shaped.system[1]?.text.startsWith("You are an expert coding assistant.\n"),
  );
  assert.equal(shaped.messages.length, 1);
});

test("leaves the system prompt untouched when systemPromptShaping is false in config.json", () => {
  withGlobalConfig({ systemPromptShaping: false });

  const payload = oauthPayload();
  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;

  // The prompt reaches Anthropic byte-identically: no preamble replacement,
  // no dropped docs section update, and the message array is not rebuilt.
  assert.equal(shaped.system[1]?.text, payload.system[0]?.text);
  assert.equal(shaped.messages, payload.messages);
  assert.equal(shaped.messages[1]?.content, payload.messages[1]?.content);
});

test("still prepends the billing header when systemPromptShaping is false", () => {
  withGlobalConfig({ systemPromptShaping: false });

  const payload = oauthPayload();
  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;

  // The billing header is what keeps a long agent prompt from being answered
  // with Anthropic's "You're out of extra usage." 400, so it is not part of
  // the shaping switch.
  assert.ok(shaped.system[0]?.text.includes("x-anthropic-billing-header:"));
  assert.equal(shaped.system.length, payload.system.length + 1);
});
