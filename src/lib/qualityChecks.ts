export interface QualityMetrics {
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

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

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

function passiveVoicePercentage(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;
  const passivePattern =
    /\b(is|are|was|were|be|been|being)\s+(\w+ed|written|shown|known|made|done|given|taken|seen|found|built|told|sent|held|kept|brought|thought|said)\b/gi;
  const passiveCount = sentences.filter((s) => passivePattern.test(s)).length;
  passivePattern.lastIndex = 0;
  return Math.round((passiveCount / sentences.length) * 100);
}

function countFillerPhrases(text: string): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const phrase of FILLER_PHRASES) {
    let idx = lower.indexOf(phrase);
    while (idx !== -1) {
      count++;
      idx = lower.indexOf(phrase, idx + phrase.length);
    }
  }
  for (const word of AI_TRANSITION_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches) count += matches.length;
  }
  return count;
}

export function computeMetrics(
  original: string,
  rewritten: string
): QualityMetrics {
  const readabilityBefore = fleschKincaidScore(original);
  const readabilityAfter = fleschKincaidScore(rewritten);
  const lengthRatio =
    Math.round((countWords(rewritten) / Math.max(countWords(original), 1)) * 100) / 100;
  const sentenceVarianceBefore = sentenceLengthVariance(original);
  const sentenceVarianceAfter = sentenceLengthVariance(rewritten);
  const passiveVoiceBefore = passiveVoicePercentage(original);
  const passiveVoiceAfter = passiveVoicePercentage(rewritten);
  const fillerCountBefore = countFillerPhrases(original);
  const fillerCountAfter = countFillerPhrases(rewritten);

  let overallScore = 50;

  if (readabilityAfter > readabilityBefore) overallScore += 10;
  else if (readabilityAfter < readabilityBefore - 10) overallScore -= 5;

  if (sentenceVarianceAfter > sentenceVarianceBefore) overallScore += 10;

  if (passiveVoiceAfter < passiveVoiceBefore) overallScore += 10;
  else if (passiveVoiceAfter > passiveVoiceBefore) overallScore -= 5;

  if (fillerCountAfter < fillerCountBefore) overallScore += 10;

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
