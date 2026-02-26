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
