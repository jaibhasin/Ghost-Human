import OpenAI from "openai";
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildEvaluatorPrompt,
  type Tone,
  type Strength,
} from "./promptTemplates";
import { computeMetrics, type QualityMetrics } from "./qualityChecks";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-5-nano";

export interface HumanizeOptions {
  tone: Tone;
  strength: Strength;
  preserveKeyPoints: boolean;
}

export interface HumanizeResult {
  original: string;
  rewritten: string;
  metrics: QualityMetrics;
  meaningCheck: {
    preserved: boolean;
    issues: string[];
    severity: string;
  };
  retried: boolean;
}

async function callRewrite(
  text: string,
  options: HumanizeOptions,
  stricter: boolean = false
): Promise<string> {
  const config = {
    ...options,
    preserveKeyPoints: options.preserveKeyPoints || stricter,
  };
  const systemPrompt = buildSystemPrompt(config);

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
  });
  const out = response.choices[0]?.message?.content?.trim() ?? "";
  console.log("[GhostHuman] Rewrite done", {
    outputLength: out.length,
    usage: (response as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? "—",
  });
  return out;
}

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
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
    const cleaned = raw.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const result = {
      preserved: parsed.meaningPreserved ?? true,
      issues: parsed.issuesFound ?? [],
      severity: parsed.severity ?? "none",
    };
    console.log("[GhostHuman] Meaning check result", result);
    return result;
  } catch (e) {
    console.warn("[GhostHuman] Meaning check failed, assuming preserved", e);
    return { preserved: true, issues: [], severity: "none" };
  }
}

export async function humanize(
  text: string,
  options: HumanizeOptions
): Promise<HumanizeResult> {
  let rewritten = await callRewrite(text, options);
  let meaningCheck = await checkMeaning(text, rewritten);
  let retried = false;

  if (!meaningCheck.preserved && meaningCheck.severity === "major") {
    console.log("[GhostHuman] Major meaning drift — retrying with stricter constraints");
    rewritten = await callRewrite(text, options, true);
    meaningCheck = await checkMeaning(text, rewritten);
    retried = true;
  }

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
