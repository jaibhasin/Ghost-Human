/**
 * promptTemplates.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Central store for all prompts sent to the LLM.  Keeping prompts here
 *   (rather than inline in humanize.ts) makes them easy to iterate on without
 *   touching business logic.
 *
 * EXPORTS:
 *   • buildSystemPrompt(config)            — rewriter system message
 *   • buildUserPrompt(text)                — rewriter user message
 *   • buildEvaluatorPrompt(orig, rewritten) — meaning-check user message
 *   • Tone / Strength types
 *
 * ARCHITECTURE:
 *   humanize.ts
 *       ├── buildSystemPrompt()  ──►  callRewrite()  (LLM system role)
 *       ├── buildUserPrompt()    ──►  callRewrite()  (LLM user role)
 *       └── buildEvaluatorPrompt() ──► checkMeaning() (LLM user role)
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * TYPES
 * ───────────────────────────────────────────────────────────────────────────── */

/** Controls the overall writing register of the output. */
export type Tone = "professional" | "friendly" | "confident";

/** Controls how aggressively the text is restructured. */
export type Strength = "light" | "medium" | "strong";

/** Internal config shape passed to buildSystemPrompt. */
interface PromptConfig {
  tone: Tone;
  strength: Strength;
  preserveKeyPoints: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * INSTRUCTION BLOCKS
 * ─────────────────────────────────────────────────────────────────────────────
 * Each map entry is a self-contained instruction paragraph injected into the
 * system prompt.  They're separated so they can be composed independently.
 */

/**
 * Tone-specific writing register instructions.
 * Tells the LLM how formal / casual the output should feel.
 */
const TONE_INSTRUCTIONS: Record<Tone, string> = {
  professional: `Maintain a polished, business-appropriate tone. Use clear and direct language suitable for emails, reports, and documentation. Avoid slang but don't be stiff — write like a competent professional who values the reader's time.`,
  friendly: `Use a warm, approachable tone. Write as if speaking to a respected colleague over coffee — conversational but not sloppy. Contractions are welcome. Sprinkle in natural transitions like "honestly," "here's the thing," or "that said."`,
  confident: `Write with authority and conviction. Use strong, declarative sentences. Avoid hedging words like "maybe," "perhaps," "it seems." State things directly. The reader should feel the writer knows exactly what they're talking about.`,
};

/**
 * Strength-specific restructuring instructions.
 * Controls how much the sentence structure and vocabulary are changed.
 */
const STRENGTH_INSTRUCTIONS: Record<Strength, string> = {
  light: `Make minimal changes. Fix only the most obviously robotic patterns — uniform sentence length, overuse of "Furthermore/Moreover/Additionally," and unnecessary filler phrases. Keep the original structure largely intact. Think of this as a light editorial pass.`,
  medium: `Restructure for natural flow while preserving the original organization. Vary sentence lengths noticeably. Replace generic transitions with specific ones. Cut filler phrases and redundant qualifiers. Simplify vocabulary where a simpler word works just as well. This should read like a solid second draft.`,
  strong: `Substantially rewrite for maximum naturalness. Reorganize sentences and paragraphs if it improves flow. Replace all robotic patterns. Add natural rhythm — mix short punchy sentences with longer explanatory ones. Cut aggressively. The output should feel like it was written from scratch by a skilled human writer who had the same information.`,
};

/* ─────────────────────────────────────────────────────────────────────────────
 * EXPORTED PROMPT BUILDERS
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Builds the **system prompt** for the rewriter LLM call.
 *
 * Composed of four sections:
 *   1. Role definition — "you are an expert writing editor"
 *   2. Core rules — factual accuracy guardrails (always present)
 *   3. Tone instruction — from TONE_INSTRUCTIONS[config.tone]
 *   4. Strength instruction — from STRENGTH_INSTRUCTIONS[config.strength]
 *   5. Humanisation techniques — specific anti-AI-pattern instructions
 *   6. (Optional) Key-point preservation — injected when `preserveKeyPoints` is true
 *
 * @param config  User settings: tone, strength, preserveKeyPoints.
 */
export function buildSystemPrompt(config: PromptConfig): string {
  return `You are an expert writing editor who transforms AI-generated text into natural, human-sounding prose. Your rewrites should be indistinguishable from text written by a skilled human professional.

CORE RULES:
1. PRESERVE ALL FACTUAL CONTENT — every name, date, number, statistic, URL, technical term, and specific claim must appear in your output unchanged.
2. NEVER add information that wasn't in the original.
3. NEVER remove key points or arguments from the original.
4. Output ONLY the rewritten text — no preamble, no "Here's the rewritten version:", no commentary.

TONE:
${TONE_INSTRUCTIONS[config.tone]}

REWRITE STRENGTH:
${STRENGTH_INSTRUCTIONS[config.strength]}

HUMANIZATION TECHNIQUES TO APPLY:
- Vary sentence length deliberately (mix 5-word sentences with 25-word sentences)
- Replace overused AI transitions ("Furthermore," "Moreover," "Additionally," "It is important to note") with natural connectors or just start new sentences directly
- Cut filler phrases: "In order to" → "To", "Due to the fact that" → "Because", "It should be noted that" → cut entirely
- Reduce passive voice where active voice is clearer
- Use concrete language over abstract ("helped 50 teams" not "facilitated numerous organizational units")
- Don't start more than two consecutive sentences the same way
- Prefer common words over inflated vocabulary ("use" not "utilize", "help" not "facilitate", "start" not "commence")
${config.preserveKeyPoints ? "\nKEY POINT PRESERVATION: Pay extra attention to preserving every distinct argument, recommendation, and conclusion from the original. Do not merge or compress separate points." : ""}`;
}

/**
 * Builds the **user message** for the rewriter LLM call.
 *
 * Intentionally minimal — the system prompt already contains all instructions.
 * The user message just wraps the raw text.
 *
 * @param text  The original text the user wants humanized.
 */
export function buildUserPrompt(text: string): string {
  return `Rewrite the following text:\n\n${text}`;
}

/**
 * Builds the **user message** for the meaning-check (evaluator) LLM call.
 *
 * The evaluator is a separate LLM call that acts as a judge: it reads both
 * the original and rewritten text, then outputs a JSON verdict.
 *
 * SEVERITY GUIDANCE (injected into the prompt so the LLM uses it consistently):
 *
 *   "none"  — All facts, claims, and arguments are preserved.
 *             Example: tone changed, sentence order changed, but every
 *             number and argument is still there.
 *
 *   "minor" — Small detail changed or omitted but the overall meaning is intact.
 *             Example: "increased by 12%" became "increased by roughly 10%",
 *             or a supporting example was dropped but the main claim remains.
 *
 *   "major" — A key fact, number, name, or central argument was lost or
 *             distorted in a way that changes the reader's understanding.
 *             Example: "revenue fell 20%" became "revenue grew", or a whole
 *             paragraph's conclusion was omitted.
 *
 * This guidance prevents the LLM from rating style changes as "major" or
 * treating every paraphrase as a meaning change.
 *
 * @param original   The raw original text.
 * @param rewritten  The humanized text to evaluate.
 */
export function buildEvaluatorPrompt(original: string, rewritten: string): string {
  return `Compare the following original text and its rewritten version. Check if any key facts, claims, numbers, names, or arguments were lost, changed, or distorted in the rewrite.

ORIGINAL:
"""
${original}
"""

REWRITTEN:
"""
${rewritten}
"""

SEVERITY DEFINITIONS — use these exact criteria:
• "none"  — All facts and arguments are fully preserved. Style, tone, and structure may differ freely.
• "minor" — A small detail or supporting example was slightly altered or omitted, but the overall meaning and all main points are intact.
            Example: a percentage approximated, a minor example dropped, or a supporting clause paraphrased loosely.
• "major" — A key fact, number, name, or central argument was LOST or DISTORTED in a way that changes what the reader understands.
            Example: a statistic changed, a conclusion reversed, a named person omitted, or a whole argument removed.

IMPORTANT: Changes to tone, sentence structure, word choice, or ordering are NOT meaning issues. Only flag factual or argumentative content.

Respond with a JSON object:
{
  "meaningPreserved": true/false,
  "issuesFound": ["list of specific issues, if any"],
  "severity": "none" | "minor" | "major"
}

If meaning is fully preserved, respond: {"meaningPreserved": true, "issuesFound": [], "severity": "none"}`;
}
