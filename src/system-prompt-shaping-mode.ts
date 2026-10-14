/**
 * Whether this extension rewrites Pi's system prompt for Anthropic OAuth.
 *
 * On (the default) `src/system-prompt-shaping.ts` de-fingerprints the prompt:
 * it replaces Pi's preamble with a minimal neutral one, drops the `docs`
 * section, strips the custom-tool filler from `tools`, applies
 * `TEXT_REPLACEMENTS`, and runs the same rules over the mid-conversation
 * `role: "system"` updates Pi re-sends.  Off passes Pi's prompt through
 * byte-identically.
 *
 * Off is a prompt-shaping switch only.  The billing header, the Claude Code
 * version sync, and the version-floor recovery all still run: the header is
 * what keeps a real agent prompt from being answered with Anthropic's
 * misleading "You're out of extra usage." 400, so it is not optional.
 *
 * Named like the sibling `PI_ANTHROPIC_AUTH_*` switches in `src/debug.ts`
 * and `src/claude-code-version.ts`: a bare env check, not a config-file key,
 * because the only supported way to change it is the shell Pi is launched
 * from.  The parsing is inverted from `getDebugMode` on purpose — shaping is
 * the default, so the switch is read for an explicit off rather than an
 * explicit on.
 */

/** Environment variable that turns system prompt shaping off. */
export const SYSTEM_PROMPT_SHAPING_ENV =
  "PI_ANTHROPIC_AUTH_SYSTEM_PROMPT_SHAPING";

/** The value of {@link SYSTEM_PROMPT_SHAPING_ENV} that disables shaping. */
export const SYSTEM_PROMPT_SHAPING_OFF = "off";

/**
 * Reports whether Pi's system prompt is passed through unshaped.
 *
 * Only the exact value `off` (case-insensitive, surrounding whitespace
 * ignored) disables shaping.  Anything else — including an empty value or a
 * typo — leaves the default behavior in place, so the switch can never
 * degrade a request by accident.
 */
export function isSystemPromptShapingDisabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    environment[SYSTEM_PROMPT_SHAPING_ENV]?.trim().toLowerCase() ===
    SYSTEM_PROMPT_SHAPING_OFF
  );
}
