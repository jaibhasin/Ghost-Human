import { NextRequest, NextResponse } from "next/server";
import { humanize, type HumanizeOptions } from "@/lib/humanize";
import type { Tone, Strength } from "@/lib/promptTemplates";

const MAX_INPUT_LENGTH = 10000;

const VALID_TONES: Tone[] = ["professional", "friendly", "confident"];
const VALID_STRENGTHS: Strength[] = ["light", "medium", "strong"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, tone, strength, preserveKeyPoints } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Please provide some text to humanize." },
        { status: 400 }
      );
    }

    if (text.length > MAX_INPUT_LENGTH) {
      return NextResponse.json(
        {
          error: `Text is too long. Maximum ${MAX_INPUT_LENGTH.toLocaleString()} characters allowed.`,
        },
        { status: 400 }
      );
    }

    if (!VALID_TONES.includes(tone)) {
      return NextResponse.json(
        { error: `Invalid tone. Choose from: ${VALID_TONES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!VALID_STRENGTHS.includes(strength)) {
      return NextResponse.json(
        {
          error: `Invalid strength. Choose from: ${VALID_STRENGTHS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const options: HumanizeOptions = {
      tone,
      strength,
      preserveKeyPoints: !!preserveKeyPoints,
    };

    const result = await humanize(text.trim(), options);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Humanize API error:", err);
    const message =
      err instanceof Error ? err.message : "Something went wrong";
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
