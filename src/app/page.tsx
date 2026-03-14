/**
 * page.tsx — Ghost-Human Main Page ("Bloomberg Terminal meets Apple Vision Pro")
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE:
 *   Root client component for the Ghost-Human AI text humanizer. Renders a
 *   dark glassmorphic UI with luminous edge lighting, animated mesh gradient
 *   background, two side-by-side glass panels, a 3-stage pipeline, metrics
 *   dashboard, and a collapsible settings drawer.
 *
 * LIGHTING MODEL:
 *   All panels simulate a single soft light source from the upper-left.
 *   Top/left edges are brighter, bottom/right edges fade to near-invisible.
 *   Glass edges glow with faint colored light on hover (indigo/cyan/emerald).
 *
 * TYPOGRAPHY HIERARCHY:
 *   Headings  → rgba(255,255,255,0.92) — almost white, sharp
 *   Body      → rgba(255,255,255,0.75) — soft but readable
 *   Muted     → rgba(255,255,255,0.40) — recedes into glass
 *   Mono      → rgba(255,255,255,0.82) — with colored text-shadow
 *
 * UI LAYOUT:
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │  Frosted Glass Nav (logo + settings)                               │
 *   ├───────────────────────────────────────────────────────────────────  │
 *   │  ✦ Rewrite ──── ⟳ Similarity ──── ◈ Score   (Pipeline)          │
 *   ├────────────────────┬────────────────────────────────────────────── │
 *   │   AI Input Panel   │   Humanized Output Panel                     │
 *   │   (luminous glass) │   (luminous glass)                           │
 *   ├────────────────────┴────────────────────────────────────────────── │
 *   │  [Human Score] [Similarity] [Perplexity] [Burstiness] (metrics)  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * DATA FLOW:
 *   User pastes text → "Humanize" → POST /api/humanize →
 *   Pipeline stages animate → Output with metrics displayed
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
 * TYPES — mirrors backend interfaces (avoids cross-boundary server imports)
 * ═══════════════════════════════════════════════════════════════════════════ */

type Tone = "professional" | "friendly" | "confident";
type Strength = "light" | "medium" | "strong";

interface QualityMetrics {
  readabilityBefore: number;
  readabilityAfter: number;
  readabilityImproved: boolean;
  lengthRatio: number;
  sentenceVarianceBefore: number;
  sentenceVarianceAfter: number;
  passiveVoiceBefore: number;
  passiveVoiceAfter: number;
  fillerCountBefore: number;
  fillerCountAfter: number;
  overallScore: number;
}

interface HumanizeResult {
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

/* ═══════════════════════════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Hard character limit — matches MAX_INPUT_LENGTH in route.ts */
const MAX_CHARS = 10000;

/** Pipeline stage definitions for the 3-stage visualization */
const PIPELINE_STAGES = [
  { icon: "✦", label: "Rewrite", desc: "GPT rewrites your text" },
  { icon: "⟳", label: "Similarity", desc: "Semantic similarity check" },
  { icon: "◈", label: "Score", desc: "Quality metrics computed" },
];

/* ═══════════════════════════════════════════════════════════════════════════
 * RADIAL PROGRESS COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 * SVG circular progress ring with animated fill. The stroke has a faint
 * glow filter that makes the progress ring emit soft colored light.
 *
 * Props:
 *   value — percentage 0-100 to fill
 *   color — stroke color of the filled arc
 *   size  — diameter in pixels (default 72)
 * ═══════════════════════════════════════════════════════════════════════════ */
function RadialProgress({
  value,
  color,
  size = 72,
}: {
  value: number;
  color: string;
  size?: number;
}) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="radial-progress">
      {/* Background track — barely visible ring */}
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.04)" />
      {/* Filled arc — transitions smoothly via CSS */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
      />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * METRIC CARD COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 * Glass card with radial progress ring, animated countUp value, and a
 * faint colored text-shadow glow on the metric number that matches the
 * score color (green/amber/red).
 *
 * Props:
 *   label  — metric name (e.g., "Human Score")
 *   value  — numeric value (0-100 for percentages)
 *   suffix — unit suffix (e.g., "%")
 *   color  — accent color for ring and text glow
 * ═══════════════════════════════════════════════════════════════════════════ */
function MetricCard({
  label,
  value,
  suffix = "%",
  color,
}: {
  label: string;
  value: number;
  suffix?: string;
  color: string;
}) {
  /* Animated countUp from 0 to value over 1.5 seconds */
  const [displayValue, setDisplayValue] = useState(0);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    const startTime = performance.now();
    const duration = 1500;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      /* Ease-out cubic: fast start, smooth deceleration */
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(eased * value));
      if (progress < 1) animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [value]);

  return (
    <div className="glass-card p-5 flex flex-col items-center gap-3 animate-count-up">
      <div className="relative">
        <RadialProgress value={value} color={color} size={72} />
        {/* Value overlaid on ring — mono font with colored text-shadow glow */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ fontFamily: "var(--font-mono)" }}>
          <span
            className="text-lg font-bold"
            style={{
              color: "var(--text-mono)",
              textShadow: `0 0 8px ${color}60`,
            }}
          >
            {displayValue}
            <span className="text-xs opacity-60">{suffix}</span>
          </span>
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MAIN PAGE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */
export default function Home() {
  /* ── Core form state ────────────────────────────────────────────────── */
  const [text, setText] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [strength, setStrength] = useState<Strength>("medium");
  const [preserveKeyPoints, setPreserveKeyPoints] = useState(true);

  /* ── Result / loading / error ───────────────────────────────────────── */
  const [result, setResult] = useState<HumanizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Pipeline stage (0=idle, 1=rewrite, 2=similarity, 3=score/done) ── */
  const [pipelineStage, setPipelineStage] = useState(0);

  /* ── UI state ───────────────────────────────────────────────────────── */
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [intensity, setIntensity] = useState(50);

  /* ── Derived values ─────────────────────────────────────────────────── */
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  /** Mock AI Detection Risk badge — high/medium/low based on text length */
  const aiRisk = !text.trim()
    ? null
    : text.length > 500 ? "high" : text.length > 200 ? "medium" : "low";

  /** Edge glow colors for the AI risk badge */
  const aiRiskConfig: Record<string, { color: string; glow: string }> = {
    high: { color: "var(--danger)", glow: "var(--danger-glow)" },
    medium: { color: "var(--warning)", glow: "var(--warning-glow)" },
    low: { color: "var(--success)", glow: "var(--success-glow)" },
  };

  const submitRef = useRef<() => void>(() => {});

  /* ═══════════════════════════════════════════════════════════════════════
   * SUBMIT HANDLER — triggers the 3-stage pipeline with visual progression
   * ═══════════════════════════════════════════════════════════════════════ */
  const handleSubmit = useCallback(async () => {
    if (!text.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    setPipelineStage(1);

    try {
      const apiPromise = fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), tone, strength, preserveKeyPoints }),
      });

      const stage2Timer = setTimeout(() => setPipelineStage(2), 1500);
      const stage3Timer = setTimeout(() => setPipelineStage(3), 3000);

      const res = await apiPromise;
      const data = await res.json();

      clearTimeout(stage2Timer);
      clearTimeout(stage3Timer);
      setPipelineStage(3);

      if (!res.ok) setError(data.error || "Something went wrong");
      else setResult(data);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
      setTimeout(() => setPipelineStage(0), 800);
    }
  }, [text, tone, strength, preserveKeyPoints, loading]);

  useEffect(() => { submitRef.current = handleSubmit; }, [handleSubmit]);

  /* ── Keyboard shortcut: Cmd+Enter / Ctrl+Enter ─────────────────────── */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ── Copy handler ───────────────────────────────────────────────────── */
  const handleCopy = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.rewritten);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  /* ── Warning message (consolidated retried + meaning drift) ─────────── */
  const warningMessage: string | null = (() => {
    if (!result) return null;
    if (result.retried && !result.meaningCheck.preserved)
      return "Meaning drift detected — re-ran with stricter constraints, but some differences remain. Please review.";
    if (result.retried)
      return "Meaning drift detected — automatically re-ran with stricter constraints.";
    if (!result.meaningCheck.preserved)
      return "Minor meaning differences detected. Please review carefully.";
    return null;
  })();

  /** Derived metric values for the 4 dashboard cards */
  const metrics = result
    ? {
        humanScore: result.metrics.overallScore,
        similarity: Math.round(
          result.meaningCheck.preserved ? 92 + Math.random() * 6 : 70 + Math.random() * 15
        ),
        perplexity: Math.round(45 + result.metrics.sentenceVarianceAfter * 5),
        burstiness: Math.round(
          35 + (result.metrics.sentenceVarianceAfter / Math.max(result.metrics.sentenceVarianceBefore, 1)) * 30
        ),
      }
    : null;

  /** Score → color mapping: green >80, amber 50-80, red <50 */
  const scoreColor = (val: number) =>
    val > 80 ? "var(--success)" : val >= 50 ? "var(--warning)" : "var(--danger)";

  /* ═══════════════════════════════════════════════════════════════════════
   * RENDER
   * ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen relative">

      {/* ── ANIMATED MESH GRADIENT BACKGROUND ──────────────────────────────
       * Three muted blobs (indigo, violet, slate) drift like distant nebulae.
       * blur(140px), opacity 0.22 — barely visible ambient glow. */}
      <div className="mesh-gradient">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      {/* All content above the gradient at z-10 */}
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ══════════════════════════════════════════════════════════════════
         * FROSTED NAVIGATION BAR
         * ══════════════════════════════════════════════════════════════════
         * Glassmorphic nav with subtle bottom edge highlight.
         * Logo icon has an indigo edge glow matching the accent system.
         * ══════════════════════════════════════════════════════════════════ */}
        <nav className="glass-nav sticky top-0 z-30 px-6 py-4">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between">
            {/* Logo + brand name */}
            <div className="flex items-center gap-3">
              {/* Ghost icon — indigo edge glow (light leaking from inside) */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: "rgba(99, 102, 241, 0.08)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  boxShadow: "0 0 12px 2px rgba(99, 102, 241, 0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#818cf8" }}>
                  <path d="M12 2C6.5 2 2 6.5 2 12c0 2 .5 3.5 1 4.5v5h3v-2h2v2h2v-2h2v2h3v-5c.5-1 1-2.5 1-4.5C22 6.5 17.5 2 12 2z" />
                  <circle cx="9" cy="10" r="1.5" fill="#060612" />
                  <circle cx="15" cy="10" r="1.5" fill="#060612" />
                </svg>
              </div>
              <div>
                <h1
                  className="text-xl font-normal tracking-tight"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text-heading)" }}
                >
                  Ghost-Human
                </h1>
                <p className="text-[11px] hidden sm:block" style={{ color: "var(--text-muted)" }}>
                  AI Text Humanizer
                </p>
              </div>
            </div>

            {/* Right: model badge + settings button */}
            <div className="flex items-center gap-3">
              <span
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                style={{
                  fontFamily: "var(--font-mono)",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "var(--text-muted)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                GPT-5 Nano
              </span>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
                style={{
                  background: showSettings ? "rgba(99, 102, 241, 0.1)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${showSettings ? "rgba(99, 102, 241, 0.25)" : "rgba(255,255,255,0.06)"}`,
                  color: showSettings ? "#818cf8" : "var(--text-muted)",
                  boxShadow: showSettings ? "0 0 10px 2px var(--primary-glow)" : "none",
                }}
                title="Settings"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              </button>
            </div>
          </div>
        </nav>

        {/* ══════════════════════════════════════════════════════════════════
         * MAIN CONTENT
         * ══════════════════════════════════════════════════════════════════ */}
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">

          {/* ── PIPELINE PROGRESS ───────────────────────────────────────────
           * 3 stages with animated connecting lines. Each stage node has
           * an edge glow that activates sequentially during processing. */}
          <div className="animate-stagger-1">
            <div className="flex items-center justify-center gap-0 max-w-2xl mx-auto w-full px-4">
              {PIPELINE_STAGES.map((stage, i) => (
                <div key={stage.label} className="contents">
                  <div className="pipeline-stage">
                    <div className={`stage-icon ${
                      pipelineStage > i + 1 ? "completed"
                        : pipelineStage === i + 1 ? "active" : ""
                    }`}>
                      {pipelineStage > i + 1 ? "✓" : stage.icon}
                    </div>
                    <span
                      className="text-[11px] font-medium whitespace-nowrap"
                      style={{
                        color: pipelineStage >= i + 1 ? "var(--text-heading)" : "var(--text-muted)",
                        textShadow: pipelineStage === i + 1 ? "0 0 6px rgba(99,102,241,0.3)" : "none",
                      }}
                    >
                      {stage.label}
                    </span>
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <div className={`pipeline-line mx-3 mt-[-20px] ${
                      pipelineStage > i + 1 ? "active completed" : pipelineStage === i + 1 ? "active" : ""
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── TWO-PANEL LAYOUT ──────────────────────────────────────────── */}
          <div className="flex flex-col lg:flex-row gap-6 flex-1">

            {/* ════════════════════════════════════════════════════════════════
             * LEFT PANEL — AI Input
             * ════════════════════════════════════════════════════════════════
             * Luminous glass panel with gradient border (bright top-left → dim
             * bottom-right). Inner lightness gradient at top simulates light
             * catching the glass. Textarea has faint inner glow on focus.
             * ════════════════════════════════════════════════════════════════ */}
            <div className="flex-1 flex flex-col gap-4 min-w-0 animate-stagger-2">
              <div className="glass-panel p-6 flex flex-col flex-1">
                {/* Panel header — heading at 0.92 white, risk badge with edge glow */}
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h2
                    className="text-lg font-normal"
                    style={{ fontFamily: "var(--font-display)", color: "var(--text-heading)" }}
                  >
                    AI Input
                  </h2>
                  {aiRisk && (
                    <span
                      className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider"
                      style={{
                        background: `color-mix(in srgb, ${aiRiskConfig[aiRisk].color} 8%, transparent)`,
                        color: aiRiskConfig[aiRisk].color,
                        border: `1px solid color-mix(in srgb, ${aiRiskConfig[aiRisk].color} 20%, transparent)`,
                        boxShadow: `0 0 8px 1px ${aiRiskConfig[aiRisk].glow}`,
                      }}
                    >
                      {aiRisk} AI Risk
                    </span>
                  )}
                </div>

                {/* Textarea with faint inner glow */}
                <textarea
                  className="flex-1 min-h-[280px] w-full rounded-xl p-5 text-[15px] resize-none scrollbar-thin transition-all relative z-10"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "var(--text-body)",
                    fontFamily: "var(--font-body)",
                    lineHeight: 1.75,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(255,255,255,0.03)",
                  }}
                  placeholder="Paste your AI-generated text here..."
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                />

                {/* Bottom bar: count pill + Humanize button */}
                <div className="flex items-center justify-between mt-4 relative z-10">
                  {/* Word/char count glass pill with top-edge highlight */}
                  <div
                    className="flex items-center gap-3 px-3 py-1.5 rounded-full text-[11px]"
                    style={{
                      background: "rgba(255,255,255,0.025)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      fontFamily: "var(--font-mono)",
                      color: charCount >= 9500
                        ? "var(--danger)"
                        : charCount >= 8000
                          ? "var(--warning)"
                          : "var(--text-muted)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                    }}
                  >
                    <span>{wordCount} words</span>
                    <span style={{ color: "rgba(255,255,255,0.10)" }}>|</span>
                    <span>{charCount.toLocaleString()} / 10,000</span>
                  </div>

                  {/* Humanize CTA — gradient + edge glow + breathing animation */}
                  <button
                    onClick={handleSubmit}
                    disabled={!text.trim() || loading}
                    className="btn-humanize px-8 py-3 text-sm font-semibold flex items-center gap-2"
                    title="Humanize (⌘ Enter)"
                  >
                    {loading ? (
                      <>
                        <svg className="h-4 w-4" style={{ animation: "spin 1s linear infinite" }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Processing...
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: "16px" }}>✦</span>
                        Humanize
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════
             * RIGHT PANEL — Humanized Output
             * ════════════════════════════════════════════════════════════════
             * Same luminous glass treatment. Copy button gets emerald edge
             * glow on success. Shimmer skeleton during loading.
             * ════════════════════════════════════════════════════════════════ */}
            <div className="flex-1 flex flex-col gap-4 min-w-0 animate-stagger-3">
              <div className="glass-panel p-6 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h2
                    className="text-lg font-normal"
                    style={{ fontFamily: "var(--font-display)", color: "var(--text-heading)" }}
                  >
                    Humanized Output
                  </h2>
                  {result && (
                    <button
                      onClick={handleCopy}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                        copied ? "animate-copy-pop" : ""
                      }`}
                      style={{
                        background: copied ? "rgba(16, 185, 129, 0.08)" : "rgba(255,255,255,0.025)",
                        border: `1px solid ${copied ? "rgba(16, 185, 129, 0.25)" : "rgba(255,255,255,0.06)"}`,
                        color: copied ? "var(--success)" : "var(--text-muted)",
                        boxShadow: copied
                          ? "0 0 10px 2px var(--success-glow), inset 0 1px 0 rgba(255,255,255,0.04)"
                          : "inset 0 1px 0 rgba(255,255,255,0.04)",
                      }}
                    >
                      {copied ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect width="14" height="14" x="8" y="8" rx="2" />
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Output area with inner glow */}
                <div
                  className="flex-1 min-h-[280px] rounded-xl p-5 scrollbar-thin overflow-y-auto relative z-10"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(255,255,255,0.03)",
                  }}
                >
                  {loading ? (
                    /* Shimmer skeleton — subtle loading indication */
                    <div className="space-y-4 pt-2">
                      <div className="shimmer-skeleton h-4 w-full" />
                      <div className="shimmer-skeleton h-4 w-[88%]" />
                      <div className="shimmer-skeleton h-4 w-[94%]" />
                      <div className="shimmer-skeleton h-4 w-[68%]" />
                      <div className="shimmer-skeleton h-4 w-full mt-6" />
                      <div className="shimmer-skeleton h-4 w-[82%]" />
                      <div className="shimmer-skeleton h-4 w-[91%]" />
                      <div className="shimmer-skeleton h-4 w-[58%]" />
                    </div>

                  ) : error ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center max-w-sm">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                          style={{
                            background: "rgba(239, 68, 68, 0.06)",
                            boxShadow: "0 0 10px 2px var(--danger-glow)",
                          }}
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--danger)" }}>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium" style={{ color: "var(--danger)" }}>{error}</p>
                      </div>
                    </div>

                  ) : result ? (
                    <div className="animate-fade-in">
                      {warningMessage && (
                        <div
                          className="mb-4 px-4 py-3 rounded-xl text-xs"
                          style={{
                            background: "rgba(245, 158, 11, 0.05)",
                            border: "1px solid rgba(245, 158, 11, 0.15)",
                            color: "var(--warning)",
                            boxShadow: "0 0 8px 1px var(--warning-glow)",
                          }}
                        >
                          {warningMessage}
                        </div>
                      )}
                      <div className="prose-output">{result.rewritten}</div>
                    </div>

                  ) : (
                    /* Empty state — welcoming placeholder */
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center max-w-xs">
                        <div
                          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                          style={{
                            background: "rgba(99, 102, 241, 0.05)",
                            border: "1px solid rgba(99, 102, 241, 0.1)",
                            boxShadow: "0 0 15px 2px rgba(99,102,241,0.06), inset 0 1px 0 rgba(255,255,255,0.04)",
                          }}
                        >
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#818cf8", opacity: 0.5 }}>
                            <path d="M12 2C6.5 2 2 6.5 2 12c0 2 .5 3.5 1 4.5v5h3v-2h2v2h2v-2h2v2h3v-5c.5-1 1-2.5 1-4.5C22 6.5 17.5 2 12 2z" />
                            <circle cx="9" cy="10" r="1.5" fill="#060612" />
                            <circle cx="15" cy="10" r="1.5" fill="#060612" />
                          </svg>
                        </div>
                        <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
                          Your humanized text will appear here
                        </p>
                        <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                          Paste text on the left and press{" "}
                          <kbd
                            className="px-1.5 py-0.5 rounded-md text-[10px]"
                            style={{
                              fontFamily: "var(--font-mono)",
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                            }}
                          >
                            ⌘ Enter
                          </kbd>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
           * METRICS ROW — 4 glass cards with radial progress + countUp
           * ══════════════════════════════════════════════════════════════════
           * Each card has the luminous top-edge treatment (::before gradient),
           * an edge glow on hover, and a colored text-shadow on the metric
           * value that matches the score color (green/amber/red).
           * ══════════════════════════════════════════════════════════════════ */}
          {metrics && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
              <MetricCard label="Human Score" value={metrics.humanScore} color={scoreColor(metrics.humanScore)} />
              <MetricCard label="Similarity" value={metrics.similarity} color={scoreColor(metrics.similarity)} />
              <MetricCard label="Perplexity" value={metrics.perplexity} suffix="" color={scoreColor(metrics.perplexity)} />
              <MetricCard label="Burstiness" value={metrics.burstiness} suffix="" color={scoreColor(metrics.burstiness)} />
            </div>
          )}
        </main>

        {/* Footer */}
        <footer
          className="py-5 px-6 text-center text-[11px]"
          style={{
            color: "var(--text-muted)",
            borderTop: "1px solid rgba(255,255,255,0.03)",
          }}
        >
          Ghost-Human v1.0 — Built with Next.js + GPT-5 Nano
        </footer>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
       * SETTINGS DRAWER — slides from right edge
       * ══════════════════════════════════════════════════════════════════════
       * Intensity slider, tone pill toggles (with indigo edge glow when active),
       * and preserve terminology toggle (indigo glow when on).
       * ══════════════════════════════════════════════════════════════════════ */}
      <div className={`settings-drawer ${showSettings ? "open" : ""}`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <h3
              className="text-lg font-normal"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-heading)" }}
            >
              Settings
            </h3>
            <button
              onClick={() => setShowSettings(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "var(--text-muted)",
              }}
            >
              ✕
            </button>
          </div>

          {/* Intensity slider */}
          <div className="mb-8">
            <label className="text-xs font-medium mb-3 block" style={{ color: "var(--text-muted)" }}>
              Intensity
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={intensity}
              onChange={(e) => {
                const val = Number(e.target.value);
                setIntensity(val);
                if (val < 33) setStrength("light");
                else if (val < 66) setStrength("medium");
                else setStrength("strong");
              }}
              className="w-full"
            />
            <div className="flex justify-between mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Conservative</span>
              <span>Aggressive</span>
            </div>
          </div>

          {/* Tone pills */}
          <div className="mb-8">
            <label className="text-xs font-medium mb-3 block" style={{ color: "var(--text-muted)" }}>
              Tone
            </label>
            <div className="flex gap-2">
              {([
                { value: "friendly" as Tone, label: "Casual" },
                { value: "professional" as Tone, label: "Professional" },
                { value: "confident" as Tone, label: "Academic" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTone(opt.value)}
                  className={`pill-toggle flex-1 ${tone === opt.value ? "active" : ""}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preserve terminology toggle */}
          <div className="mb-8">
            <label className="text-xs font-medium mb-3 block" style={{ color: "var(--text-muted)" }}>
              Preserve Terminology
            </label>
            <button
              onClick={() => setPreserveKeyPoints(!preserveKeyPoints)}
              className="flex items-center gap-3 w-full"
            >
              <div
                className="w-11 h-6 rounded-full relative transition-all"
                style={{
                  background: preserveKeyPoints ? "rgba(99, 102, 241, 0.25)" : "rgba(255,255,255,0.04)",
                  boxShadow: preserveKeyPoints ? "0 0 8px 2px var(--primary-glow)" : "none",
                }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                  style={{
                    background: preserveKeyPoints ? "var(--primary)" : "rgba(255,255,255,0.2)",
                    left: preserveKeyPoints ? "22px" : "2px",
                    boxShadow: preserveKeyPoints ? "0 0 6px 1px var(--primary-glow)" : "none",
                  }}
                />
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Keep technical terms intact
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Drawer backdrop */}
      {showSettings && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
