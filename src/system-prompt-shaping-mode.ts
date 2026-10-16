import { readFileSync } from "node:fs";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { globalConfigPath } from "./extension-config";

/**
 * Reports whether Pi's system prompt is passed through unshaped.
 *
 * Reads `<agentDir>/extensions/pi-anthropic-auth/config.json` (honoring
 * `PI_CODING_AGENT_DIR` via `getAgentDir()`) and returns `true` only when
 * `systemPromptShaping` is explicitly `false`.  A missing or malformed file, or
 * any other value, leaves the default shaping in place.
 *
 * The billing header, the Claude Code version sync, and the version-floor
 * recovery all still run: the header is what keeps a real agent prompt from
 * being answered with Anthropic's misleading "You're out of extra usage." 400,
 * so it is not part of this switch.
 */
export function isSystemPromptShapingDisabled(
  path: string = globalConfigPath(getAgentDir()),
  readFile: (path: string) => string = (p) => readFileSync(p, "utf8"),
): boolean {
  try {
    const parsed: unknown = JSON.parse(readFile(path));
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      (parsed as { systemPromptShaping?: unknown }).systemPromptShaping ===
        false
    );
  } catch {
    return false;
  }
}
