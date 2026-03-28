/* ================================================================
   Prompt Composer Service (T007)

   Composes a final session task string by combining:
   1. The user's goal
   2. Optional Ruflo project prompt
   3. Optional OpenClaw project prompt (only when promptContext === 'openclaw')

   Blocks are separated by "---" dividers and omitted when empty.
   ================================================================ */

/**
 * Compose the final task string sent to the CLI session.
 *
 * Composition order:
 *   1. userGoal (always present)
 *   2. "---\nAdditional Instructions (Ruflo):\n{rufloPrompt}" — if rufloPrompt is non-empty
 *   3. "---\nAdditional Instructions (OpenClaw):\n{openclawPrompt}" — only if
 *      promptContext === 'openclaw' AND openclawPrompt is non-empty
 */
export function composeSessionTask(
  userGoal: string,
  rufloPrompt?: string,
  openclawPrompt?: string,
  promptContext?: string,
): string {
  const parts: string[] = [userGoal];

  if (rufloPrompt && rufloPrompt.trim()) {
    parts.push(`---\nAdditional Instructions (Ruflo):\n${rufloPrompt.trim()}`);
  }

  if (promptContext === 'openclaw' && openclawPrompt && openclawPrompt.trim()) {
    parts.push(`---\nAdditional Instructions (OpenClaw):\n${openclawPrompt.trim()}`);
  }

  return parts.join('\n\n');
}
