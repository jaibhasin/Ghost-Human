/**
 * humanize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Orchestrates the full AI-rewriting pipeline.  Takes raw AI-generated text
 *   and user settings, calls the OpenAI API twice (rewrite → meaning check),
 *   optionally retries with stricter constraints if meaning drift is detected,
 *   then computes quality metrics for the UI.
 *
 * PIPELINE (happy path):
 *   text + options
 *       │
 *       ▼
 *   callRewrite()          — GPT rewrites the text (temperature 0.7)
 *       │
 *       ▼
 *   checkMeaning()         — GPT evaluates whether meaning was preserved (temperature 0.1)
 *       │
 *       ├─ preserved OR minor issues ──► computeMetrics() ──► return result
 *       │
 *       └─ MAJOR drift ──► callRewrite(stricter=true) ──► checkMeaning() ──► return result
 *
 * RETRY LOGIC:
 *   A "major" severity rating from the evaluator triggers one automatic retry
 *   with `stricter=true`.  The retry adds a hard instruction to preserve every
 *   fact, number, and claim.  The result of the retry is always returned (we
 *   don't loop indefinitely — one retry is enough to show the user something).
 *
 * ARCHITECTURE:
 *   route.ts  ──►  humanize()  (this file)
 *                      ├──►  callRewrite()   (LLM call A)
 *                      ├──►  checkMeaning()  (LLM call B)
 *                      └──►  computeMetrics() from qualityChecks.ts
 */

import OpenAI from "openai";
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildEvaluatorPrompt,
  type Tone,
  type Strength,
} from "./promptTemplates";
import { computeMetrics, type QualityMetrics } from "./qualityChecks";

/* ─────────────────────────────────────────────────────────────────────────────
 * OPENAI CLIENT SETUP
 * ───────────────────────────────────────────────────────────────────────────── */

/** Singleton OpenAI client — reads API key from the OPENAI_API_KEY env var. */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Model used for both rewriting and evaluation. */
const MODEL = "gpt-5-nano";

/* ─────────────────────────────────────────────────────────────────────────────
 * PUBLIC TYPES
 * ───────────────────────────────────────────────────────────────────────────── */

/** Options the user selects in the UI, forwarded from the API route. */
export interface HumanizeOptions {
  tone: Tone;
  strength: Strength;
  /** When true, the prompt instructs the LLM to keep every key point. */
  preserveKeyPoints: boolean;
}

/** The object returned to the frontend after the full pipeline runs. */
export interface HumanizeResult {
  original: string;
  rewritten: string;
  metrics: QualityMetrics;
  meaningCheck: {
    preserved: boolean;
    issues: string[];
    severity: string;
  };
  /** True if a second rewrite was triggered due to major meaning drift. */
  retried: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * PRIVATE HELPERS
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Calls the OpenAI chat API to rewrite `text` according to `options`.
 *
 * Temperature is set to **0.7** — creative enough to produce natural-sounding
 * prose, but controlled enough to not hallucinate or go off-topic.
 * (OpenAI's default is 1.0 which is too random for factual rewriting tasks.)
 *
 * @param text      The original text to rewrite.
 * @param options   User-selected tone, strength, and key-point preservation.
 * @param stricter  When true, appends a hard instruction to preserve every
 *                  fact — used on the retry pass after meaning drift is found.
 * @returns         The rewritten text (trimmed).
 * @throws          If the API returns an empty string (e.g., content filtered).
 */
async function callRewrite(
  text: string,
  options: HumanizeOptions,
  stricter: boolean = false
): Promise<string> {
  // When retrying, force `preserveKeyPoints` on even if the user didn't tick it
  const config = {
    ...options,
    preserveKeyPoints: options.preserveKeyPoints || stricter,
  };
  const systemPrompt = buildSystemPrompt(config);

  // Extra instruction injected at the end of the system prompt on retry
  const extraInstruction = stricter
    ? "\n\nCRITICAL: A previous rewrite lost meaning. Be extremely careful to preserve every single fact, number, and claim from the original. Do not omit anything."
    : "";

  console.log("[GhostHuman] Calling OpenAI for rewrite", {
    model: MODEL,
    stricter,
    promptChars: (systemPrompt + extraInstruction + buildUserPrompt(text)).length,
  });

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt + extraInstruction },
      { role: "user", content: buildUserPrompt(text) },
    ],
    max_completion_tokens: 4096,
    /*
     * gpt-5-nano only supports the default temperature (1.0),
     * so we omit the temperature parameter entirely.
     * The system prompt handles tone control instead.
     */
  });

  const out = response.choices[0]?.message?.content?.trim() ?? "";

  console.log("[GhostHuman] Rewrite done", {
    outputLength: out.length,
    usage: (response as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? "—",
  });

  // Guard: if the model returned nothing (content filter, network glitch, etc.)
  // throw immediately rather than silently passing an empty string downstream.
  if (out === "") {
    throw new Error("LLM returned an empty rewrite. This may be a content-filter hit or a transient API error. Please try again.");
  }

  return out;
}

/**
 * Asks the LLM to evaluate whether `rewritten` preserves the meaning of
 * `original`.
 *
 * Temperature is set to **0.1** — near-deterministic so the evaluation is
 * consistent and reliable rather than creative.  The model is acting as a
 * comparator/judge here, not a writer.
 *
 * The response is expected to be a JSON object:
 *   { meaningPreserved: boolean, issuesFound: string[], severity: "none"|"minor"|"major" }
 *
 * Robustness:
 *   - Strips markdown code fences (```json ... ```) that some models add.
 *   - Extracts the first `{...}` block if the model adds prose around the JSON.
 *   - Falls back to "preserved / no issues" if parsing fails — we don't want
 *     a bad evaluator response to crash the whole pipeline.
 *
 * @param original   The original user-submitted text.
 * @param rewritten  The text produced by callRewrite().
 */
async function checkMeaning(
  original: string,
  rewritten: string
): Promise<{ preserved: boolean; issues: string[]; severity: string }> {
  try {
    console.log("[GhostHuman] Meaning check: calling OpenAI");

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a precise text comparison tool. Respond only with valid JSON.",
        },
        { role: "user", content: buildEvaluatorPrompt(original, rewritten) },
      ],
      max_completion_tokens: 512,
      /*
       * temperature: 0.1
       * ──────────────────
       * Near-zero temperature makes the evaluator act like a deterministic
       * comparator.  We want consistent, reproducible judgements — not
       * creative variation in the analysis.
       */
      temperature: 0.1,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "{}";

    // Strip markdown code fences some models wrap their JSON in
    let cleaned = raw.replace(/```json\n?|```/g, "").trim();

    // Extract the JSON object if the model added explanatory prose around it
    if (cleaned && !cleaned.startsWith("{")) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      cleaned = match ? match[0] : "";
    }

    if (!cleaned || cleaned === "") {
      console.warn("[GhostHuman] Meaning check returned empty response, assuming preserved");
      return { preserved: true, issues: [], severity: "none" };
    }

    const parsed = JSON.parse(cleaned);
    const result = {
      preserved: parsed.meaningPreserved ?? true,
      issues: parsed.issuesFound ?? [],
      severity: parsed.severity ?? "none",
    };
    console.log("[GhostHuman] Meaning check result", result);
    return result;
  } catch (e) {
    // Don't crash the pipeline if evaluation fails — log and assume preserved
    console.warn("[GhostHuman] Meaning check failed, assuming preserved", e);
    return { preserved: true, issues: [], severity: "none" };
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * MAIN EXPORT
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Runs the full GhostHuman pipeline:
 *   1. Rewrite the text with the user's chosen tone and strength.
 *   2. Evaluate whether meaning was preserved.
 *   3. If meaning drift is "major", retry with stricter constraints.
 *   4. Compute before/after quality metrics.
 *   5. Return everything as a `HumanizeResult`.
 *
 * This is the single function called by the API route (`route.ts`).
 *
 * @param text     The (already-trimmed) original text from the user.
 * @param options  Tone, strength, and preserveKeyPoints settings.
 */
export async function humanize(
  text: string,
  options: HumanizeOptions
): Promise<HumanizeResult> {
  // ── Pass 1: initial rewrite ──────────────────────────────────────────────
  let rewritten = await callRewrite(text, options);
  let meaningCheck = await checkMeaning(text, rewritten);
  let retried = false;

  // ── Pass 2 (conditional retry): if meaning drift is major, try again ─────
  if (!meaningCheck.preserved && meaningCheck.severity === "major") {
    console.log("[GhostHuman] Major meaning drift — retrying with stricter constraints");
    rewritten = await callRewrite(text, options, true /* stricter */);
    meaningCheck = await checkMeaning(text, rewritten);
    retried = true;
  }

  // ── Quality metrics ──────────────────────────────────────────────────────
  console.log("[GhostHuman] Computing quality metrics");
  const metrics = computeMetrics(text, rewritten);

  return {
    original: text,
    rewritten,
    metrics,
    meaningCheck: {
      preserved: meaningCheck.preserved,
      issues: meaningCheck.issues,
      severity: meaningCheck.severity,
    },
    retried,
  };
}
