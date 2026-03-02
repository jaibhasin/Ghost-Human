/**
 * qualityChecks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Computes a set of text-quality metrics that are used to measure how much
 *   the humanization pipeline actually improved the writing.  The metrics are
 *   calculated for both the *original* and the *rewritten* text so the UI can
 *   show a before/after diff.
 *
 * ARCHITECTURE:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  page.tsx  ─►  /api/humanize  ─►  humanize.ts           │
 *   │                                        │                 │
 *   │                                        ▼                 │
 *   │                               qualityChecks.ts  ◄────── │
 *   │                               (this file)               │
 *   └──────────────────────────────────────────────────────────┘
 *
 *   The main export is `computeMetrics(original, rewritten)` which returns a
 *   `QualityMetrics` object consumed by the frontend MetricCard components.
 *
 * KEY CONCEPTS:
 *   • Flesch-Kincaid readability  — higher score = easier to read (0–100)
 *   • Sentence-length variance    — higher = more varied rhythm (more human)
 *   • Passive voice percentage    — lower = more direct / active writing
 *   • Filler phrase count         — lower = less corporate / AI-sounding bloat
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * PUBLIC TYPES
 * ───────────────────────────────────────────────────────────────────────────── */

/** The full set of metrics returned for a before/after comparison. */
export interface QualityMetrics {
  readabilityBefore: number;
  readabilityAfter: number;
  readabilityImproved: boolean;
  /** Rewritten word count ÷ original word count (1.0 = same length). */
  lengthRatio: number;
  /** Standard deviation of sentence word-counts — a proxy for rhythm variety. */
  sentenceVarianceBefore: number;
  sentenceVarianceAfter: number;
  /** Percentage (0–100) of sentences containing a passive construction. */
  passiveVoiceBefore: number;
  passiveVoiceAfter: number;
  /** Raw count of detected filler / AI-transition phrases. */
  fillerCountBefore: number;
  fillerCountAfter: number;
  /** Composite score (0–100) summarising overall improvement quality. */
  overallScore: number;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * DICTIONARIES
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Phrases commonly produced by AI that make text feel corporate / generic.
 * Counted as-is (substring search, case-insensitive) to keep the check fast.
 */
const FILLER_PHRASES = [
  "it is important to note that",
  "it should be noted that",
  "it is worth mentioning that",
  "in order to",
  "due to the fact that",
  "as a matter of fact",
  "at the end of the day",
  "in today's world",
  "in this day and age",
  "it goes without saying",
  "needless to say",
  "all things considered",
  "when all is said and done",
  "in the realm of",
  "in terms of",
  "with regard to",
  "with respect to",
  "on the other hand",
  "in light of the fact that",
  "for the purpose of",
  "in the event that",
  "at this point in time",
  "the fact of the matter is",
  "it is crucial to",
  "it is essential to",
  "it is imperative to",
  "plays a crucial role",
  "plays a vital role",
  "plays an important role",
  "serves as a testament",
  "serves as a reminder",
];

/**
 * Transition words that AI overuses.  Counted as whole words so "moreover"
 * inside "moreoverish" (unlikely, but safe) won't trigger a false positive.
 */
const AI_TRANSITION_WORDS = [
  "furthermore",
  "moreover",
  "additionally",
  "consequently",
  "nevertheless",
  "henceforth",
  "notwithstanding",
  "in conclusion",
  "to summarize",
  "in summary",
];

/* ─────────────────────────────────────────────────────────────────────────────
 * PRIVATE HELPERS
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Splits a paragraph into individual sentences.
 *
 * Uses a *lookbehind* assertion `(?<=[.!?])` so the punctuation stays attached
 * to the preceding sentence rather than being stripped.  Lookbehinds are
 * supported in Node.js ≥ 10 and all modern browsers (V8 ≥ 6.2).
 *
 * @example
 *   splitSentences("Hello world. How are you?")
 *   // → ["Hello world.", "How are you?"]
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Returns the number of whitespace-delimited tokens (words) in `text`.
 * Filters empty strings that arise from consecutive spaces.
 */
function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/**
 * Estimates the number of syllables in a single English word.
 *
 * Algorithm (heuristic, good enough for Flesch-Kincaid estimation):
 *   1. Lowercase and strip non-alpha characters.
 *   2. Strip common silent-e / -ed / -es suffixes.
 *   3. Strip a leading "y" that acts as a consonant.
 *   4. Count vowel clusters (aeiouy treated as vowels).
 *   5. Minimum of 1 so no word returns 0.
 *
 * @param word  A single word (may contain punctuation — it's stripped internally).
 */
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * PUBLIC METRIC FUNCTIONS
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Computes the Flesch Reading-Ease score for `text`.
 *
 * Formula:
 *   206.835 − 1.015 × (words/sentences) − 84.6 × (syllables/words)
 *
 * Interpretation:
 *   90–100 = Very easy (comic books)
 *   60–70  = Standard (newspapers)
 *   0–30   = Very difficult (academic papers)
 *
 * Result is clamped to [0, 100] and rounded to 1 decimal place.
 *
 * @param text  Any block of prose.
 * @returns     A score in [0, 100].
 */
export function fleschKincaidScore(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;
  const words = countWords(text);
  if (words === 0) return 0;
  const allWords = text.split(/\s+/).filter((w) => w.length > 0);
  const totalSyllables = allWords.reduce((sum, w) => sum + countSyllables(w), 0);
  const score =
    206.835 -
    1.015 * (words / sentences.length) -
    84.6 * (totalSyllables / words);
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

/**
 * Computes the standard deviation of sentence word-counts (σ).
 *
 * A higher value means sentences vary more in length, which is a hallmark of
 * natural human writing.  Uniform sentence length is a common AI tell.
 *
 * Returns 0 for text with fewer than 2 sentences (variance is undefined).
 *
 * @param text  Any block of prose.
 * @returns     Standard deviation rounded to 1 decimal place.
 */
function sentenceLengthVariance(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return 0;
  const lengths = sentences.map(countWords);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) /
    lengths.length;
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

/**
 * Returns the percentage of sentences (0–100) that contain a passive
 * construction such as "was written", "is known", "are being held", etc.
 *
 * ⚠️  BUG FIX NOTE (stateful regex):
 *   A regex literal with the `g` flag maintains a `lastIndex` cursor.  When
 *   the *same* regex object is reused inside `.filter()`, the cursor advances
 *   across loop iterations and causes alternating false-negatives ("every other
 *   sentence is skipped").  The fix is to create a *new* RegExp per sentence
 *   inside the callback — the `i` flag alone (no `g`) is sufficient since we
 *   only need to know whether the pattern occurs at least once in each sentence.
 *
 * Pattern matches constructions like:
 *   "is written", "was given", "were being held", "been told", etc.
 *
 * @param text  Any block of prose.
 * @returns     Percentage integer in [0, 100].
 */
function passiveVoicePercentage(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;

  /*
   * ✅ FIXED: Create a fresh RegExp object for every sentence.
   * Previously one shared /gi regex was reused across the .filter() iterations,
   * causing lastIndex to advance and skip every-other matching sentence.
   * Using the `i` flag (case-insensitive, no `g`) is correct here because
   * we only need a boolean "does this sentence contain a passive?" answer.
   */
  const passiveCount = sentences.filter((s) =>
    /\b(is|are|was|were|be|been|being)\s+(\w+ed|written|shown|known|made|done|given|taken|seen|found|built|told|sent|held|kept|brought|thought|said)\b/i.test(s)
  ).length;

  return Math.round((passiveCount / sentences.length) * 100);
}

/**
 * Counts total occurrences of known filler phrases and AI transition words
 * in `text`.
 *
 * Two strategies are combined:
 *   1. **Substring search** (indexOf loop) for multi-word filler phrases —
 *      faster than regex for long static strings.
 *   2. **Word-boundary regex** (`\bword\b`) for single-word transition terms
 *      so "moreover" doesn't match inside a longer word.
 *
 * @param text  Any block of prose.
 * @returns     Raw integer count of all detected occurrences.
 */
function countFillerPhrases(text: string): number {
  const lower = text.toLowerCase();
  let count = 0;

  // Strategy 1: fast substring scan for multi-word phrases
  for (const phrase of FILLER_PHRASES) {
    let idx = lower.indexOf(phrase);
    while (idx !== -1) {
      count++;
      idx = lower.indexOf(phrase, idx + phrase.length);
    }
  }

  // Strategy 2: word-boundary regex for single transition words
  for (const word of AI_TRANSITION_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches) count += matches.length;
  }

  return count;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * MAIN EXPORT
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Computes all quality metrics for an original/rewritten text pair and returns
 * a single `QualityMetrics` object.
 *
 * Also computes a composite `overallScore` (0–100) using a simple additive
 * scoring rule:
 *   • Base: 50 points
 *   • Readability improved:          +10
 *   • Readability dropped by > 10:   −5
 *   • Sentence variety increased:    +10
 *   • Passive voice reduced:         +10
 *   • Passive voice increased:       −5
 *   • Filler phrases reduced:        +10
 *   • Length ratio in 0.7–1.1×:     +10
 *   • Length ratio < 0.5 or > 1.5×: −10
 *
 * @param original   The raw AI-generated text submitted by the user.
 * @param rewritten  The humanized text returned by the LLM pipeline.
 */
export function computeMetrics(
  original: string,
  rewritten: string
): QualityMetrics {
  // ── Individual metric calculations ──────────────────────────────────────
  const readabilityBefore = fleschKincaidScore(original);
  const readabilityAfter = fleschKincaidScore(rewritten);

  // lengthRatio: how long is the output relative to the input?
  // 0.8 = 20% shorter, 1.2 = 20% longer.  Math.max prevents divide-by-zero.
  const lengthRatio =
    Math.round((countWords(rewritten) / Math.max(countWords(original), 1)) * 100) / 100;

  const sentenceVarianceBefore = sentenceLengthVariance(original);
  const sentenceVarianceAfter = sentenceLengthVariance(rewritten);

  const passiveVoiceBefore = passiveVoicePercentage(original);
  const passiveVoiceAfter = passiveVoicePercentage(rewritten);

  const fillerCountBefore = countFillerPhrases(original);
  const fillerCountAfter = countFillerPhrases(rewritten);

  // ── Composite score ──────────────────────────────────────────────────────
  let overallScore = 50; // neutral baseline

  if (readabilityAfter > readabilityBefore) overallScore += 10;
  else if (readabilityAfter < readabilityBefore - 10) overallScore -= 5;

  if (sentenceVarianceAfter > sentenceVarianceBefore) overallScore += 10;

  if (passiveVoiceAfter < passiveVoiceBefore) overallScore += 10;
  else if (passiveVoiceAfter > passiveVoiceBefore) overallScore -= 5;

  if (fillerCountAfter < fillerCountBefore) overallScore += 10;

  // Reward length-neutral rewrites; penalise extreme compression/expansion
  if (lengthRatio >= 0.7 && lengthRatio <= 1.1) overallScore += 10;
  else if (lengthRatio < 0.5 || lengthRatio > 1.5) overallScore -= 10;

  overallScore = Math.max(0, Math.min(100, overallScore));

  return {
    readabilityBefore,
    readabilityAfter,
    readabilityImproved: readabilityAfter >= readabilityBefore,
    lengthRatio,
    sentenceVarianceBefore,
    sentenceVarianceAfter,
    passiveVoiceBefore,
    passiveVoiceAfter,
    fillerCountBefore,
    fillerCountAfter,
    overallScore,
  };
}
