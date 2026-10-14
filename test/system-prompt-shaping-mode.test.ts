import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";

import { shapeAnthropicOAuthPayload } from "#src/request-shaping";
import {
  isSystemPromptShapingDisabled,
  SYSTEM_PROMPT_SHAPING_ENV,
  SYSTEM_PROMPT_SHAPING_OFF,
} from "#src/system-prompt-shaping-mode";

/** Sets the shaping switch for one test and restores the previous value. */
function withShapingValue(value: string): void {
  const previous = process.env[SYSTEM_PROMPT_SHAPING_ENV];
  process.env[SYSTEM_PROMPT_SHAPING_ENV] = value;
  onTestFinished(() => {
    if (previous === undefined) {
      Reflect.deleteProperty(process.env, SYSTEM_PROMPT_SHAPING_ENV);
      return;
    }
    process.env[SYSTEM_PROMPT_SHAPING_ENV] = previous;
  });
}

function unsetShapingValue(): void {
  const previous = process.env[SYSTEM_PROMPT_SHAPING_ENV];
  Reflect.deleteProperty(process.env, SYSTEM_PROMPT_SHAPING_ENV);
  onTestFinished(() => {
    if (previous !== undefined) {
      process.env[SYSTEM_PROMPT_SHAPING_ENV] = previous;
    }
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

test("isSystemPromptShapingDisabled reads an explicit off only", () => {
  assert.equal(isSystemPromptShapingDisabled({}), false);
  assert.equal(
    isSystemPromptShapingDisabled({ [SYSTEM_PROMPT_SHAPING_ENV]: "" }),
    false,
  );
  assert.equal(
    isSystemPromptShapingDisabled({ [SYSTEM_PROMPT_SHAPING_ENV]: "on" }),
    false,
  );
  assert.equal(
    isSystemPromptShapingDisabled({ [SYSTEM_PROMPT_SHAPING_ENV]: "true" }),
    false,
  );
  assert.equal(
    isSystemPromptShapingDisabled({
      [SYSTEM_PROMPT_SHAPING_ENV]: SYSTEM_PROMPT_SHAPING_OFF,
    }),
    true,
  );
  assert.equal(
    isSystemPromptShapingDisabled({ [SYSTEM_PROMPT_SHAPING_ENV]: " OFF " }),
    true,
  );
});

test("shapes both prompt routes by default", () => {
  unsetShapingValue();

  const payload = oauthPayload();
  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;

  assert.ok(shaped.system[0]?.text.includes("x-anthropic-billing-header:"));
  assert.ok(
    shaped.system[1]?.text.startsWith("You are an expert coding assistant.\n"),
  );
  assert.equal(shaped.messages.length, 1);
});

test("leaves the system prompt untouched when the switch is off", () => {
  withShapingValue("off");

  const payload = oauthPayload();
  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;

  // The prompt reaches Anthropic byte-identically: no preamble replacement,
  // no dropped docs section update, and the message array is not rebuilt.
  assert.equal(shaped.system[1]?.text, payload.system[0]?.text);
  assert.equal(shaped.messages, payload.messages);
  assert.equal(shaped.messages[1]?.content, payload.messages[1]?.content);
});

test("still prepends the billing header when the switch is off", () => {
  withShapingValue("off");

  const payload = oauthPayload();
  const shaped = shapeAnthropicOAuthPayload(payload) as typeof payload;

  // The billing header is what keeps a long agent prompt from being answered
  // with Anthropic's "You're out of extra usage." 400, so it is not part of
  // the shaping switch.
  assert.ok(shaped.system[0]?.text.includes("x-anthropic-billing-header:"));
  assert.equal(shaped.system.length, payload.system.length + 1);
});
