/**
 * layout.tsx — Root layout for Ghost-Human
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Sets up the HTML shell with dark theme class, Google Fonts via next/font,
 *   and imports the global glassmorphic stylesheet.
 *
 * FONTS:
 *   - DM Sans       → body text (--font-dm-sans)
 *   - JetBrains Mono → metrics/scores (--font-jetbrains)
 *   Both are loaded via next/font/google for optimal performance (no FOUT).
 *   Instrument Serif is loaded via CSS @import (not available in next/font).
 */

import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/* ── Font configuration ─────────────────────────────────────────────────── */

/** DM Sans — clean, modern body font used throughout the UI */
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

/** JetBrains Mono — monospaced font for scores, metrics, and code-like text */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/* ── Page metadata ──────────────────────────────────────────────────────── */
export const metadata: Metadata = {
  title: "Ghost-Human — AI Text Humanizer",
  description:
    "Transform AI-generated text into natural, human-sounding prose. 3-stage pipeline: GPT rewrite → semantic similarity → quality scoring.",
};

/* ── Root layout component ──────────────────────────────────────────────── */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} antialiased min-h-screen`}
        style={{ fontFamily: "var(--font-dm-sans), var(--font-body)" }}
      >
        {children}
      </body>
    </html>
  );
}
