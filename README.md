# GhostHuman

Give AI-generated text a human touch. GhostHuman rewrites stiff, robotic copy into clear, natural prose—with a ghost theme and quality metrics built in.

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set your OpenAI API key**

   Copy `.env.example` to `.env.local` and add your key:

   ```bash
   cp .env.example .env.local
   # Edit .env.local: OPENAI_API_KEY=sk-your-key
   ```

3. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Paste text, pick tone and strength, then click **Ghostify**.

## Features

- **Tone**: Professional, Friendly, or Confident
- **Strength**: Light, Medium, or Strong rewrite
- **Quality report**: Readability, sentence variety, passive voice, filler phrases, length ratio, meaning check
- **Ghost theme**: Ethereal UI with translucent cards and soft glow

Built with Next.js, Tailwind CSS, and GPT-5 Nano.

## Backend logging

When you run `npm run dev`, the terminal shows what the backend is doing:

- `[GhostHuman] POST /api/humanize` — request received
- Validation (text length, tone, strength)
- `Starting humanize` — options and word count
- `Calling OpenAI for rewrite` / `Rewrite done`
- `Meaning check` — result or retry if meaning drifted
- `Computing quality metrics` and `Success` with elapsed time and score

Errors are logged with `[GhostHuman] Error` and the thrown exception.

## Publishing this repo

Before pushing publicly:

1. **Secrets** — Never commit `.env` or `.env.local`. They are in `.gitignore`; only `.env.example` (no real keys) should be committed.
2. **Dependencies** — Run `npm run build` to confirm the project builds.
3. **README** — This file explains setup; new users need an OpenAI API key and `cp .env.example .env.local`.
4. **License** — Add a `LICENSE` file (e.g. MIT) if you want to publish as open source.
