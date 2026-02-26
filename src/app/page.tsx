"use client";

import { useState, useCallback } from "react";

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

const TONE_OPTIONS: { value: Tone; label: string; desc: string }[] = [
  {
    value: "professional",
    label: "Professional",
    desc: "Clear and polished business tone",
  },
  {
    value: "friendly",
    label: "Friendly",
    desc: "Warm and approachable",
  },
  {
    value: "confident",
    label: "Confident",
    desc: "Direct and authoritative",
  },
];

const STRENGTH_OPTIONS: { value: Strength; label: string; desc: string }[] = [
  { value: "light", label: "Light", desc: "Minimal touch-ups" },
  { value: "medium", label: "Medium", desc: "Balanced rewrite" },
  { value: "strong", label: "Strong", desc: "Full transformation" },
];

function MetricCard({
  label,
  before,
  after,
  unit,
  higherIsBetter,
}: {
  label: string;
  before: number;
  after: number;
  unit?: string;
  higherIsBetter: boolean;
}) {
  const improved = higherIsBetter ? after >= before : after <= before;
  const delta = after - before;
  const sign = delta > 0 ? "+" : "";

  return (
    <div className="rounded-lg bg-surface/60 p-3">
      <div className="text-xs text-muted mb-1.5 font-medium">{label}</div>
      <div className="flex items-end justify-between">
        <div className="text-lg font-semibold text-foreground">
          {after}
          {unit}
        </div>
        <div
          className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            improved
              ? "bg-success/15 text-success"
              : "bg-danger/15 text-danger"
          }`}
        >
          {sign}
          {delta}
          {unit}
        </div>
      </div>
      <div className="text-[11px] text-muted mt-1">
        was {before}
        {unit}
      </div>
    </div>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [strength, setStrength] = useState<Strength>("medium");
  const [preserveKeyPoints, setPreserveKeyPoints] = useState(true);
  const [result, setResult] = useState<HumanizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [copied, setCopied] = useState(false);

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleSubmit = useCallback(async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setFeedback(null);
    setCopied(false);

    try {
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), tone, strength, preserveKeyPoints }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [text, tone, strength, preserveKeyPoints, loading]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.rewritten);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const handleClear = useCallback(() => {
    setText("");
    setResult(null);
    setError(null);
    setFeedback(null);
    setCopied(false);
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative z-[1]">
      {/* Header */}
      <header className="border-b border-card-border/50 bg-card/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-ghost-white/10 border border-card-border flex items-center justify-center animate-float shadow-[0_0_24px_rgba(148,163,184,0.15)]">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-foreground/90"
              >
                <path d="M12 2C6.5 2 2 6.5 2 12c0 2 .5 3.5 1 4.5v5h3v-2h2v2h2v-2h2v2h3v-5c.5-1 1-2.5 1-4.5C22 6.5 17.5 2 12 2z" />
                <circle cx="9" cy="10" r="1.5" fill="#0a0d12" />
                <circle cx="15" cy="10" r="1.5" fill="#0a0d12" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                GhostHuman
              </h1>
              <p className="text-xs text-muted hidden sm:block">
                Give AI text a human touch
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="hidden sm:inline">Powered by</span>
            <span className="px-2 py-1 rounded-md bg-surface/80 text-foreground/80 font-mono text-[11px] border border-card-border/50">
              GPT-5 Nano
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6">
        {/* Left panel — Input */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="ghost-card rounded-xl p-4 sm:p-5 flex flex-col flex-1">
            <div className="flex items-center justify-between mb-3">
              <label
                htmlFor="input-text"
                className="text-sm font-semibold text-foreground"
              >
                Original Text
              </label>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{wordCount} words</span>
                <span>{charCount.toLocaleString()} / 10,000 chars</span>
              </div>
            </div>
            <textarea
              id="input-text"
              className="flex-1 min-h-[240px] w-full bg-surface/50 rounded-lg border border-card-border p-4 text-sm text-foreground placeholder:text-muted/60 resize-none scrollbar-thin focus:border-accent/50 transition-colors"
              placeholder="Paste your AI-generated text here...&#10;&#10;For example, an email draft, blog post, report, or any professional writing that sounds too robotic and needs a human touch."
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 10000))}
            />

            {/* Controls */}
            <div className="mt-4 space-y-4">
              {/* Tone */}
              <div>
                <div className="text-xs font-semibold text-foreground mb-2">
                  Tone
                </div>
                <div className="flex gap-2">
                  {TONE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTone(opt.value)}
                      className={`flex-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                        tone === opt.value
                          ? "border-accent bg-accent-muted text-accent-hover"
                          : "border-card-border bg-surface/30 text-muted hover:text-foreground hover:border-muted/50"
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div
                        className={`mt-0.5 text-[10px] ${
                          tone === opt.value ? "text-accent/70" : "text-muted/60"
                        }`}
                      >
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Strength */}
              <div>
                <div className="text-xs font-semibold text-foreground mb-2">
                  Rewrite Strength
                </div>
                <div className="flex gap-2">
                  {STRENGTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setStrength(opt.value)}
                      className={`flex-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                        strength === opt.value
                          ? "border-accent bg-accent-muted text-accent-hover"
                          : "border-card-border bg-surface/30 text-muted hover:text-foreground hover:border-muted/50"
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div
                        className={`mt-0.5 text-[10px] ${
                          strength === opt.value
                            ? "text-accent/70"
                            : "text-muted/60"
                        }`}
                      >
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preserve key points + Submit */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={preserveKeyPoints}
                  onClick={() => setPreserveKeyPoints(!preserveKeyPoints)}
                  className="flex items-center gap-2 cursor-pointer select-none group"
                >
                  <div
                    className={`w-8 h-[18px] rounded-full transition-colors relative ${
                      preserveKeyPoints ? "bg-accent" : "bg-surface"
                    }`}
                  >
                    <div
                      className={`absolute top-[1px] w-4 h-4 rounded-full transition-all ${
                        preserveKeyPoints
                          ? "left-[14px] bg-white"
                          : "left-0.5 bg-muted"
                      }`}
                    />
                  </div>
                  <span className="text-xs text-muted group-hover:text-foreground transition-colors">
                    Preserve all key points
                  </span>
                </button>

                <div className="flex gap-2 w-full sm:w-auto">
                  {(text || result) && (
                    <button
                      onClick={handleClear}
                      className="px-4 py-2.5 rounded-lg border border-card-border bg-surface/30 text-xs font-medium text-muted hover:text-foreground hover:border-muted/50 transition-all"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={!text.trim() || loading}
                    className="flex-1 sm:flex-none px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Ghostifying...
                      </>
                    ) : (
                      "Ghostify"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — Output */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Output card */}
          <div className="ghost-card rounded-xl p-4 sm:p-5 flex flex-col flex-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-foreground">
                Humanized Output
              </span>
              {result && (
                <div className="flex items-center gap-2">
                  {/* Feedback buttons */}
                  <div className="flex items-center gap-1 mr-1">
                    <button
                      onClick={() => setFeedback("up")}
                      className={`p-1.5 rounded-md transition-all ${
                        feedback === "up"
                          ? "bg-success/15 text-success"
                          : "text-muted hover:text-foreground hover:bg-surface"
                      }`}
                      title="Good result"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill={feedback === "up" ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M7 10v12" />
                        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setFeedback("down")}
                      className={`p-1.5 rounded-md transition-all ${
                        feedback === "down"
                          ? "bg-danger/15 text-danger"
                          : "text-muted hover:text-foreground hover:bg-surface"
                      }`}
                      title="Needs improvement"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill={feedback === "down" ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M17 14V2" />
                        <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface text-xs font-medium text-muted hover:text-foreground transition-all"
                  >
                    {copied ? (
                      <>
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect
                            width="14"
                            height="14"
                            x="8"
                            y="8"
                            rx="2"
                          />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Output content */}
            <div className="flex-1 min-h-[240px] rounded-lg bg-surface/50 border border-card-border p-4 scrollbar-thin overflow-y-auto">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                  </div>
                  <div className="text-sm text-muted">
                    Ghostifying your text...
                  </div>
                  <div className="w-48 h-1.5 rounded-full overflow-hidden bg-surface">
                    <div className="h-full rounded-full animate-shimmer bg-accent/40" />
                  </div>
                </div>
              ) : error ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-sm">
                    <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-3">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-danger"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    </div>
                    <p className="text-sm text-danger font-medium">{error}</p>
                  </div>
                </div>
              ) : result ? (
                <div className="animate-fade-in">
                  {result.retried && (
                    <div className="mb-3 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning">
                      Meaning drift detected — automatically re-ran with
                      stricter constraints.
                    </div>
                  )}
                  {!result.meaningCheck.preserved && (
                    <div className="mb-3 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning">
                      Minor meaning differences detected. Please review
                      carefully.
                    </div>
                  )}
                  <div className="prose-output text-foreground/90">
                    {result.rewritten}
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-xs">
                    <div className="w-12 h-12 rounded-xl bg-ghost-white/10 border border-card-border flex items-center justify-center mx-auto mb-3">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="text-foreground/70"
                      >
                        <path d="M12 2C6.5 2 2 6.5 2 12c0 2 .5 3.5 1 4.5v5h3v-2h2v2h2v-2h2v2h3v-5c.5-1 1-2.5 1-4.5C22 6.5 17.5 2 12 2z" />
                        <circle cx="9" cy="10" r="1.5" fill="#0a0d12" />
                        <circle cx="15" cy="10" r="1.5" fill="#0a0d12" />
                      </svg>
                    </div>
                    <p className="text-sm text-muted">
                      Your humanized text will appear here
                    </p>
                    <p className="text-xs text-muted/50 mt-1">
                      Paste text on the left and click Ghostify
                    </p>
                  </div>
                </div>
              )}
            </div>

            {feedback && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-accent-muted text-xs text-accent animate-fade-in">
                {feedback === "up"
                  ? "Thanks for the feedback! This helps us improve."
                  : "Thanks — we'll use this to refine our prompts."}
              </div>
            )}
          </div>

          {/* Metrics card */}
          {result && (
            <div className="ghost-card rounded-xl p-4 sm:p-5 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">
                  Quality Report
                </span>
                <div
                  className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    result.metrics.overallScore >= 75
                      ? "bg-success/15 text-success"
                      : result.metrics.overallScore >= 50
                        ? "bg-warning/15 text-warning"
                        : "bg-danger/15 text-danger"
                  }`}
                >
                  {result.metrics.overallScore}/100
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <MetricCard
                  label="Readability"
                  before={result.metrics.readabilityBefore}
                  after={result.metrics.readabilityAfter}
                  higherIsBetter={true}
                />
                <MetricCard
                  label="Sentence Variety"
                  before={result.metrics.sentenceVarianceBefore}
                  after={result.metrics.sentenceVarianceAfter}
                  higherIsBetter={true}
                />
                <MetricCard
                  label="Passive Voice %"
                  before={result.metrics.passiveVoiceBefore}
                  after={result.metrics.passiveVoiceAfter}
                  unit="%"
                  higherIsBetter={false}
                />
                <MetricCard
                  label="Filler Phrases"
                  before={result.metrics.fillerCountBefore}
                  after={result.metrics.fillerCountAfter}
                  higherIsBetter={false}
                />
                <div className="rounded-lg bg-surface/60 p-3">
                  <div className="text-xs text-muted mb-1.5 font-medium">
                    Length Ratio
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {result.metrics.lengthRatio}x
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    {result.metrics.lengthRatio < 1
                      ? "More concise"
                      : result.metrics.lengthRatio === 1
                        ? "Same length"
                        : "Slightly longer"}
                  </div>
                </div>
                <div className="rounded-lg bg-surface/60 p-3">
                  <div className="text-xs text-muted mb-1.5 font-medium">
                    Meaning Check
                  </div>
                  <div
                    className={`text-lg font-semibold ${
                      result.meaningCheck.preserved
                        ? "text-success"
                        : "text-warning"
                    }`}
                  >
                    {result.meaningCheck.preserved ? "Preserved" : "Review"}
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    {result.meaningCheck.severity === "none"
                      ? "No drift detected"
                      : `${result.meaningCheck.severity} issues`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-card-border/30 bg-card/50 backdrop-blur-sm py-4 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-muted">
          <span>GhostHuman v1.0</span>
          <span>
            Built with Next.js + GPT-5 Nano
          </span>
        </div>
      </footer>
    </div>
  );
}
