# GhostHuman

Give AI-generated text a human touch. GhostHuman rewrites stiff, robotic copy into clear, natural prose — with quality metrics and meaning-preservation checks built in.

Built with Next.js, Tailwind CSS, and OpenAI (GPT-5 Nano).

---

## Table of Contents

1. [How It Works — The Pipeline](#how-it-works--the-pipeline)
2. [Prompt Design](#prompt-design)
3. [Meaning Preservation](#meaning-preservation)
4. [Quality Scoring](#quality-scoring)
5. [Project Structure](#project-structure)
6. [Getting Started](#getting-started)
7. [Backend Logging](#backend-logging)
8. [Contributing](#contributing)

---

## How It Works — The Pipeline

Every humanization request flows through a three-stage pipeline:

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│  1. REWRITE  │ ──▶ │  2. MEANING      │ ──▶ │  3. QUALITY    │
│  (LLM call)  │     │     CHECK        │     │     METRICS    │
│              │     │  (LLM call)      │     │  (local code)  │
└──────────────┘     └──────────────────┘     └────────────────┘
                              │
                     ┌────────┴────────┐
                     │  Major drift?   │
                     │  YES → retry    │
                     │  rewrite with   │
                     │  stricter       │
                     │  constraints    │
                     └─────────────────┘
```

**Stage 1 — Rewrite**: The original text is sent to the LLM with a carefully crafted system prompt (tone + strength + humanization rules). The LLM returns the rewritten text.

**Stage 2 — Meaning Check**: A separate LLM call compares the original and rewritten text. It returns a JSON verdict: `{ meaningPreserved, issuesFound, severity }`. If severity is `"major"`, the pipeline **retries Stage 1** with an extra instruction forcing stricter fact preservation, then re-checks meaning.

**Stage 3 — Quality Metrics**: Entirely local (no LLM). Computes readability, sentence variety, passive voice %, filler phrase count, and length ratio — for both original and rewritten text — then rolls them into an overall score.

> **Why two LLM calls?** The rewriter is optimized for natural prose. The evaluator is optimized for factual comparison. Separating these roles avoids the conflict of "rewrite freely but also check yourself," which LLMs handle poorly in a single pass.

> **Why local quality metrics?** LLMs are unreliable at counting things (syllables, sentence lengths, word frequencies). Deterministic code is more trustworthy for these measurements and doesn't add latency or cost.

**Orchestration code:** [`src/lib/humanize.ts`](src/lib/humanize.ts)

---

## Prompt Design

All prompts live in [`src/lib/promptTemplates.ts`](src/lib/promptTemplates.ts). There are three prompt builders:

### `buildSystemPrompt(config)`

The system prompt has four sections:

| Section | Purpose |
|---|---|
| **Core Rules** | Non-negotiable guardrails: preserve all facts, never add info, never remove key points, output only the rewrite. |
| **Tone** | One of three instruction blocks (`professional`, `friendly`, `confident`) that shape the voice. |
| **Strength** | Controls how aggressively the text is changed (`light` = editorial pass, `medium` = solid second draft, `strong` = rewrite from scratch). |
| **Humanization Techniques** | Concrete rules: vary sentence length, kill filler phrases, reduce passive voice, prefer simple words, avoid repetitive sentence starts. |

The `preserveKeyPoints` flag appends an extra paragraph emphasizing that no arguments should be merged or compressed.

### `buildUserPrompt(text)`

Simply wraps the input text as `"Rewrite the following text:\n\n{text}"`. Kept minimal so the system prompt does the heavy lifting.

### `buildEvaluatorPrompt(original, rewritten)`

Asks the LLM to compare original vs. rewritten and respond with structured JSON. The prompt explicitly lists what to check for (facts, claims, numbers, names, arguments) and provides the exact response schema.

### Design decisions

- **Tone and Strength are independent axes.** You can have a "friendly + light" rewrite (minimal changes, warm voice) or a "confident + strong" rewrite (aggressive restructuring, authoritative voice). This gives 9 combinations.
- **The humanization techniques are concrete, not vague.** Instead of "make it sound human," the prompt says things like `"In order to" → "To"` and `"Don't start more than two consecutive sentences the same way."` Concrete instructions produce more consistent results from LLMs.
- **The evaluator is told to respond only with JSON** and is given the exact schema, reducing the chance of free-form answers that break parsing.

---

## Meaning Preservation

Meaning preservation is the hardest problem in text rewriting. GhostHuman handles it with a **check-and-retry** loop:

```
rewrite(text) → result₁
check_meaning(text, result₁) → verdict₁

if verdict₁.severity === "major":
    rewrite(text, stricter=true) → result₂
    check_meaning(text, result₂) → verdict₂
    return result₂ + verdict₂ + retried=true

return result₁ + verdict₁ + retried=false
```

### The stricter retry

When `stricter=true`, two things change:
1. `preserveKeyPoints` is forced on (regardless of user setting).
2. An extra instruction is appended: `"A previous rewrite lost meaning. Be extremely careful to preserve every single fact, number, and claim."` This has shown to significantly reduce information loss on the second attempt.

### Error handling

If the meaning-check LLM returns malformed JSON, the system **assumes meaning is preserved** (`preserved: true`) rather than blocking the user. This is a deliberate tradeoff: a false "preserved" is less disruptive than a hard failure. The UI always shows the meaning check result, so the user can still review manually.

### Current limitation

Only `"major"` severity triggers a retry, not `"minor"`. This is intentional — minor issues (e.g., slightly rephrased but equivalent statements) are acceptable in a humanized rewrite and retrying for them often makes the output worse (more robotic).

---

## Quality Scoring

All quality metrics are computed locally in [`src/lib/qualityChecks.ts`](src/lib/qualityChecks.ts). No LLM involvement.

### Individual Metrics

| Metric | How It's Calculated | What "Better" Means |
|---|---|---|
| **Readability** | Flesch-Kincaid readability score (0–100). Based on avg sentence length and avg syllables per word. | Higher = easier to read |
| **Sentence Variety** | Standard deviation of sentence word counts. | Higher = more varied rhythm |
| **Passive Voice %** | Regex-based detection of passive constructions (`was written`, `is known`, etc.) as a percentage of total sentences. | Lower = more direct writing |
| **Filler Phrases** | Counts occurrences of 30+ known filler phrases (`"it is important to note"`, `"in order to"`, etc.) plus 10 overused AI transition words (`"furthermore"`, `"moreover"`, etc.). | Lower = tighter prose |
| **Length Ratio** | `words_after / words_before`. | 0.7–1.1 is ideal |

### Overall Score Calculation

The overall score starts at **50** and adjusts based on before/after comparisons:

```
Score starts at 50

+10  if readability improved
 -5  if readability dropped by >10 points

+10  if sentence variance increased

+10  if passive voice % decreased
 -5  if passive voice % increased

+10  if filler count decreased

+10  if length ratio is 0.7–1.1 (good range)
-10  if length ratio is <0.5 or >1.5 (too aggressive)

Clamped to [0, 100]
```

The theoretical max is **90** (50 + all five bonuses). This is by design — a perfect 100 would imply certainty, which isn't appropriate for a heuristic score.

### Why these specific metrics?

These metrics target the most common patterns that make AI-generated text detectable:

- **Uniform sentence length** — LLMs default to ~15–20 word sentences. Humans vary wildly (5 to 35+).
- **Passive voice overuse** — LLMs prefer `"The report was completed"` over `"We finished the report."`
- **Filler phrases** — `"It is important to note that"` is a hallmark of AI text.
- **Bloated length** — AI text tends to be wordier than necessary.

---

## Project Structure

```
src/
├── app/
│   ├── api/humanize/route.ts    # POST endpoint — validates input, calls humanize(), returns result
│   ├── page.tsx                 # Single-page React UI (client component)
│   ├── layout.tsx               # Root layout with ghost theme class + Geist fonts
│   └── globals.css              # CSS variables, ghost theme, custom animations
└── lib/
    ├── humanize.ts              # Pipeline orchestrator — rewrite → meaning check → metrics
    ├── promptTemplates.ts       # All LLM prompts (system, user, evaluator)
    └── qualityChecks.ts         # Local text analysis — readability, passive voice, fillers, scoring
```

### Key design principle

**LLM for generation, code for measurement.** The LLM handles rewriting and semantic comparison (things it's good at). Local code handles counting, scoring, and validation (things it's reliable at). This separation keeps the system predictable and debuggable.

---

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set your OpenAI API key**

   ```bash
   cp .env.example .env.local
   # Edit .env.local and add: OPENAI_API_KEY=sk-your-key
   ```

3. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Paste text, pick tone and strength, then click **Ghostify**.

---

## Backend Logging

When you run `npm run dev`, the terminal shows what the backend is doing at each pipeline stage:

- `[GhostHuman] POST /api/humanize` — request received
- Validation logs (text length, tone, strength)
- `Starting humanize` — options and word count
- `Calling OpenAI for rewrite` / `Rewrite done` — with token usage
- `Meaning check` — result and severity
- `Computing quality metrics` and `Success` — with elapsed time and overall score

Errors are logged with `[GhostHuman] Error` and the full exception.

---

## Contributing

### Areas for improvement

The core logic in `src/lib/` is where contributions matter most. Some open questions:

1. **Better quality metrics** — The current scoring is heuristic-based. Can we add more signals? N-gram diversity? Burstiness (variance in paragraph-level complexity)? Vocabulary richness?
2. **Smarter meaning checking** — The current approach uses a second LLM call. Could we use embedding similarity (cosine distance) as a faster/cheaper first-pass filter?
3. **Prompt tuning** — The humanization prompts work well for English prose, but could be improved for technical writing, marketing copy, or academic text. Specialized prompt variants could help.
4. **Passive voice detection** — The current regex approach catches common patterns but misses irregular forms. A more complete solution could use part-of-speech tagging.
5. **Strength calibration** — "Light" and "Strong" are qualitative. Can we make them more quantitative (e.g., target a specific edit distance or paragraph restructuring rate)?

### Before pushing

1. **Secrets** — Never commit `.env` or `.env.local`. Only `.env.example` (no real keys) is in version control.
2. **Build check** — Run `npm run build` to confirm the project compiles.
