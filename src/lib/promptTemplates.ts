export type Tone = "professional" | "friendly" | "confident";
export type Strength = "light" | "medium" | "strong";

interface PromptConfig {
  tone: Tone;
  strength: Strength;
  preserveKeyPoints: boolean;
}

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  professional: `Maintain a polished, business-appropriate tone. Use clear and direct language suitable for emails, reports, and documentation. Avoid slang but don't be stiff — write like a competent professional who values the reader's time.`,
  friendly: `Use a warm, approachable tone. Write as if speaking to a respected colleague over coffee — conversational but not sloppy. Contractions are welcome. Sprinkle in natural transitions like "honestly," "here's the thing," or "that said."`,
  confident: `Write with authority and conviction. Use strong, declarative sentences. Avoid hedging words like "maybe," "perhaps," "it seems." State things directly. The reader should feel the writer knows exactly what they're talking about.`,
};

const STRENGTH_INSTRUCTIONS: Record<Strength, string> = {
  light: `Make minimal changes. Fix only the most obviously robotic patterns — uniform sentence length, overuse of "Furthermore/Moreover/Additionally," and unnecessary filler phrases. Keep the original structure largely intact. Think of this as a light editorial pass.`,
  medium: `Restructure for natural flow while preserving the original organization. Vary sentence lengths noticeably. Replace generic transitions with specific ones. Cut filler phrases and redundant qualifiers. Simplify vocabulary where a simpler word works just as well. This should read like a solid second draft.`,
  strong: `Substantially rewrite for maximum naturalness. Reorganize sentences and paragraphs if it improves flow. Replace all robotic patterns. Add natural rhythm — mix short punchy sentences with longer explanatory ones. Cut aggressively. The output should feel like it was written from scratch by a skilled human writer who had the same information.`,
};

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

export function buildUserPrompt(text: string): string {
  return `Rewrite the following text:\n\n${text}`;
}

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

Respond with a JSON object:
{
  "meaningPreserved": true/false,
  "issuesFound": ["list of specific issues, if any"],
  "severity": "none" | "minor" | "major"
}

If meaning is fully preserved, respond: {"meaningPreserved": true, "issuesFound": [], "severity": "none"}`;
}
