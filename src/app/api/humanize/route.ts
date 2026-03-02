/**
 * route.ts  —  POST /api/humanize
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   The single Next.js API route that the frontend calls.  It validates the
 *   incoming request, then delegates to the `humanize()` pipeline function
 *   and returns the result (or a structured error) as JSON.
 *
 * ARCHITECTURE:
 *   Browser (page.tsx)
 *       │  POST /api/humanize  { text, tone, strength, preserveKeyPoints }
 *       ▼
 *   route.ts  (this file)
 *       │  validates input
 *       ▼
 *   humanize()  (humanize.ts)
 *       │  calls OpenAI twice (rewrite + meaning check)
 *       ▼
 *   JSON response  { original, rewritten, metrics, meaningCheck, retried }
 *
 * VALIDATION:
 *   • text must be a non-empty string, max 10 000 chars
 *   • tone must be one of ["professional", "friendly", "confident"]
 *   • strength must be one of ["light", "medium", "strong"]
 *   • preserveKeyPoints is treated as a boolean (truthy coercion)
 *
 * ERROR RESPONSES:
 *   400  — bad request (missing/invalid fields, text too long)
 *   401  — invalid or missing OpenAI API key
 *   500  — unexpected server error
 */

import { NextRequest, NextResponse } from "next/server";
import { humanize, type HumanizeOptions } from "@/lib/humanize";
import type { Tone, Strength } from "@/lib/promptTemplates";

/** Hard character limit enforced both here and in the frontend textarea. */
const MAX_INPUT_LENGTH = 10000;

/** All accepted tone values — used for strict enum validation. */
const VALID_TONES: Tone[] = ["professional", "friendly", "confident"];

/** All accepted strength values — used for strict enum validation. */
const VALID_STRENGTHS: Strength[] = ["light", "medium", "strong"];

/**
 * POST /api/humanize
 *
 * Accepts a JSON body with:
 *   - text             {string}  The AI-generated text to humanize.
 *   - tone             {Tone}    Writing register for the output.
 *   - strength         {Strength} How aggressively to rewrite.
 *   - preserveKeyPoints {boolean} Whether to force key-point retention.
 *
 * Returns:
 *   200  {HumanizeResult}  on success
 *   4xx/5xx  { error: string }  on failure
 */
export async function POST(req: NextRequest) {
  // Track total request time for logging
  const start = Date.now();
  console.log("[GhostHuman] POST /api/humanize — request received");

  try {
    // ── Parse request body ─────────────────────────────────────────────────
    const body = await req.json();
    const { text, tone, strength, preserveKeyPoints } = body;

    // ── Input validation ───────────────────────────────────────────────────

    // Reject empty or missing text
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      console.log("[GhostHuman] Validation failed: empty or missing text");
      return NextResponse.json(
        { error: "Please provide some text to humanize." },
        { status: 400 }
      );
    }

    // Enforce character limit (same limit as the frontend textarea)
    if (text.length > MAX_INPUT_LENGTH) {
      console.log("[GhostHuman] Validation failed: text too long", {
        length: text.length,
        max: MAX_INPUT_LENGTH,
      });
      return NextResponse.json(
        {
          error: `Text is too long. Maximum ${MAX_INPUT_LENGTH.toLocaleString()} characters allowed.`,
        },
        { status: 400 }
      );
    }

    // Validate tone against the allowed enum
    if (!VALID_TONES.includes(tone)) {
      console.log("[GhostHuman] Validation failed: invalid tone", { tone });
      return NextResponse.json(
        { error: `Invalid tone. Choose from: ${VALID_TONES.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate strength against the allowed enum
    if (!VALID_STRENGTHS.includes(strength)) {
      console.log("[GhostHuman] Validation failed: invalid strength", { strength });
      return NextResponse.json(
        {
          error: `Invalid strength. Choose from: ${VALID_STRENGTHS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // ── Build options object and start pipeline ────────────────────────────

    const options: HumanizeOptions = {
      tone,
      strength,
      // !! coercion: treats truthy values (true, "true", 1) as true
      preserveKeyPoints: !!preserveKeyPoints,
    };

    console.log("[GhostHuman] Starting humanize", {
      textLength: text.trim().length,
      wordCount: text.trim().split(/\s+/).filter(Boolean).length,
      tone,
      strength,
      preserveKeyPoints: options.preserveKeyPoints,
    });

    // Trim the text before sending to the pipeline (matches what the user sees)
    const result = await humanize(text.trim(), options);

    const elapsed = Date.now() - start;
    console.log("[GhostHuman] Success", {
      elapsedMs: elapsed,
      rewrittenLength: result.rewritten.length,
      meaningPreserved: result.meaningCheck.preserved,
      overallScore: result.metrics.overallScore,
    });

    return NextResponse.json(result);

  } catch (err) {
    // ── Error handling ─────────────────────────────────────────────────────
    const elapsed = Date.now() - start;
    console.error("[GhostHuman] Error after", elapsed, "ms:", err);

    const message = err instanceof Error ? err.message : "Something went wrong";

    // Distinguish API key errors from general failures for clearer UX messages
    const isAuthError = message.toLowerCase().includes("api key");

    return NextResponse.json(
      {
        error: isAuthError
          ? "OpenAI API key is missing or invalid. Please check your .env.local file."
          : "Failed to humanize text. Please try again.",
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
