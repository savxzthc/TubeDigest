import { AppError } from "../errors.js";
import { logger } from "../logger.js";
import { formatTimestamp } from "../text.js";
import type { Transcript, TranscriptChunk, VideoSummary } from "../types.js";
import type { Summarizer } from "./summarizer.js";

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

interface SectionSummary {
  overview: string;
  points: string[];
  details: string[];
  takeaway: string;
}

interface SectionSelection {
  overviewIds: number[];
  pointIds: number[];
  detailIds: number[];
  takeawayIds: number[];
}

interface SourceSentence {
  id: number;
  text: string;
}

const SECTION_SUMMARY_SCHEMA = {
  type: "object",
  required: ["overview_ids", "point_ids", "detail_ids", "takeaway_ids"],
  properties: {
    overview_ids: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: { type: "integer" },
    },
    point_ids: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "integer" },
    },
    detail_ids: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "integer" },
    },
    takeaway_ids: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: { type: "integer" },
    },
  },
} as const;

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("OLLAMA_BASE_URL must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/$/, "");
}

function cleanItem(value: string): string {
  return value
    .replace(/^```(?:json)?|```$/gi, "")
    .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/\bAFK\s*\(almost full activity\)/gi, "almost fully AFK")
    .replace(/\s+/g, " ")
    .trim();
}

function distinct(values: string[], limit = Number.POSITIVE_INFINITY): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const rawValue of values) {
    const value = cleanItem(rawValue);
    const key = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").slice(0, 180);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    results.push(value);
    if (results.length >= limit) break;
  }
  return results;
}

function extractShareCodes(transcript: Transcript): string[] {
  const text = transcript.segments.map((segment) => segment.text).join(" ");
  const codes = new Set<string>();
  for (const match of text.matchAll(/share code.{0,80}?\b(\d{6,12})\b/gi)) {
    if (match[1]) codes.add(match[1]);
  }
  return [...codes];
}

function isDirectionalClaim(value: string): boolean {
  return /\brival\b/i.test(value) && /\b(?:slower|faster|beat|beats|beating)\b/i.test(value);
}

function extractDirectionalRequirements(transcript: Transcript): string[] {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return distinct(
    [...segmenter.segment(transcript.text)]
      .map(({ segment }) => cleanItem(segment))
      .filter(isDirectionalClaim),
    2,
  );
}

function claimNumbersAreGrounded(value: string, source: string): boolean {
  const sourceNumbers = new Set(
    [...source.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)].map(([number]) => number.replaceAll(",", "")),
  );
  return [...value.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)]
    .every(([number]) => sourceNumbers.has(number.replaceAll(",", "")));
}

function contradictsAfkQualification(value: string, source: string): boolean {
  return !/\bnot (?:100%|fully|completely) AFK\b/i.test(value)
    && /\b(?:fully|completely|100%)\s+AFK\b/i.test(value)
    && /\bnot (?:100%|fully|completely) AFK\b/i.test(source);
}

function isCompleteSummaryItem(value: string): boolean {
  const words = value.match(/[\p{L}\p{N}$%'-]+/gu) ?? [];
  return words.length >= 6 && !/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(value);
}

function groundedModelItems(items: string[], source: string): string[] {
  return distinct(items.filter((item) =>
    isCompleteSummaryItem(item)
    && !isDirectionalClaim(item)
    && claimNumbersAreGrounded(item, source)
    && !contradictsAfkQualification(item, source)));
}

function extractCostRewardFacts(transcript: Transcript): string[] {
  const facts: string[] = [];
  const patterns = [
    /\b(?:so|and)?\s*(?:the\s+)?([^.!?]{2,55}?)\s+costs\s+(\d[\d,]*)\s+skill points?\s+and\s+(\d[\d,]*)\s+credits?\s+for\s+([^.!?]{1,120})/gi,
    /\b(?:so|and)?\s*(?:the\s+)?([^.!?]{2,55}?)\s+costs\s+(\d[\d,]*)\s+credits?\s+and\s+(\d[\d,]*)\s+skill points?\s+for\s+([^.!?]{1,120})/gi,
  ];

  for (const [index, pattern] of patterns.entries()) {
    for (const match of transcript.text.matchAll(pattern)) {
      const name = cleanItem(match[1] ?? "").replace(/^(?:the|and|so)\s+/i, "");
      const firstNumber = match[2];
      const secondNumber = match[3];
      const reward = cleanItem(match[4] ?? "");
      if (!name || !firstNumber || !secondNumber || !/wheel spins?/i.test(reward)) continue;
      const skillPoints = index === 0 ? firstNumber : secondNumber;
      const credits = index === 0 ? secondNumber : firstNumber;
      facts.push(`${name} costs ${credits} credits and requires ${skillPoints} skill points for ${reward}.`);
    }
  }
  return distinct(facts, 6);
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function sectionPurpose(chunk: TranscriptChunk, fallback: string): string {
  const source = chunk.text.toLowerCase();
  const credits = countMatches(source, /credits?|money|colossus|rivals? event/g);
  const skillPoints = countMatches(source, /skill points?|skill multiplier/g);
  const wheelspins = countMatches(source, /wheel ?spins?|car mastery/g);

  if (wheelspins > 0 && wheelspins >= skillPoints && wheelspins >= credits) {
    return "This section compares the cars, costs, and mastery rewards used to obtain wheelspins.";
  }
  if (skillPoints > credits) {
    return "This section explains the custom skill-point farming method and required setup.";
  }
  if (credits > 0) return "This section explains the video's AFK credit-farming method and its requirements.";
  return fallback || "This section covers the next part of the video's process.";
}

function sectionHeading(purpose: string, index: number): string {
  if (/cars, costs, and mastery rewards/i.test(purpose)) return "Wheelspin cars and mastery rewards";
  if (/skill-point farming/i.test(purpose)) return "Fast skill-point farm";
  if (/credit-farming/i.test(purpose)) return "AFK credit farm";
  return `Section ${index + 1}`;
}

function fullVideoOverview(purposes: string[], summaries: SectionSummary[]): string {
  if (!purposes.every((purpose) => /^This section\s+/i.test(purpose))) {
    return distinct(summaries.map((summary) => summary.overview), 4).join(" ");
  }
  const clauses = purposes.map((purpose) =>
    purpose
      .replace(/^This section\s+/i, "")
      .replace(/\.$/, ""));
  if (clauses.length === 0) return "The transcript does not contain enough information for an overview.";
  if (clauses.length === 1) return `The video ${clauses[0]}.`;
  if (clauses.length === 2) return `The video ${clauses[0]}, then ${clauses[1]}.`;
  return `The video ${clauses[0]}, then ${clauses.slice(1, -1).join(", then ")}, and finally ${clauses.at(-1)}.`;
}

function cleanSourceSentence(value: string): string {
  const cleaned = cleanItem(value)
    .replace(/^(?:(?:and|but|so|well|okay|yeah|all right|I mean|like|then),?\s+)+/i, "")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([.!?]\s+)([a-z])/g, (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase())
    .trim();
  return cleaned ? cleaned[0]!.toLocaleUpperCase() + cleaned.slice(1) : "";
}

function sourceSentenceScore(value: string): number {
  let score = 0;
  score += countMatches(value, /\b\d[\d,]*(?:\.\d+)?\b/g) * 2;
  score += countMatches(
    value,
    /\b(?:costs?|credits?|skill points?|wheel spins?|share code|requires?|gives?|provides?|unlocks?|settings?|braking|steering|traction|stability|shifting|AFK|rivals?|per hour|per race|million|warning|important)\b/gi,
  ) * 2;
  if (/\bshare code\b/i.test(value)) score += 6;
  score += countMatches(value, /\b(?:need|must|want|should|recommend|because|if you)\b/gi);
  if (/\b(?:\d+\s+){3,}\d+\b/.test(value)) score -= 15;
  if (/\b(?:probably|times as less|if you remember, I did say|or else)\b/i.test(value)) score -= 5;
  score -= countMatches(
    value,
    /\b(?:I'm going to show|let me show|I uploaded|you guys|like and subscribe|here we go|that's funny|what's ironic|super goated)\b/gi,
  ) * 4;
  if (/^(?:I|I'm|we|we're|let me)\b/i.test(value)) score -= 2;
  return score;
}

function sourceSentences(chunk: TranscriptChunk): SourceSentence[] {
  const text = chunk.text
    .replace(/^\[[\d:]+\]\s*/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  const sentences = [...segmenter.segment(text)]
    .map(({ segment }) => cleanSourceSentence(segment))
    .filter((sentence) => {
      const words = sentence.match(/[\p{L}\p{N}$%'-]+/gu) ?? [];
      return words.length >= 7
        && words.length <= 90
        && !/\b(?:like and subscribe|subscribe if|see you guys in the next)\b/i.test(sentence);
    });
  return distinct(sentences)
    .map((textValue, originalIndex) => ({
      text: textValue,
      originalIndex,
      score: sourceSentenceScore(textValue),
    }))
    .sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex)
    .slice(0, 24)
    .map(({ text: textValue }, index) => ({ id: index + 1, text: textValue }));
}

function parseSectionSelection(value: string, maximumId: number): SectionSelection {
  const objectStart = value.indexOf("{");
  const objectEnd = value.lastIndexOf("}");
  if (objectStart < 0 || objectEnd <= objectStart) {
    throw new Error("No JSON object was returned.");
  }
  const parsed = JSON.parse(value.slice(objectStart, objectEnd + 1)) as Record<string, unknown>;
  const field = (...names: string[]) => names.map((name) => parsed[name]).find((item) => item !== undefined);
  const ids = (input: unknown): number[] => {
    if (typeof input === "number") return Number.isInteger(input) ? [input] : [];
    if (typeof input === "string") return [...input.matchAll(/\d+/g)].map(([number]) => Number(number));
    if (Array.isArray(input)) return input.flatMap(ids);
    if (input && typeof input === "object") return Object.values(input).flatMap(ids);
    return [];
  };
  const validIds = (input: unknown, limit: number) =>
    [...new Set(ids(input).filter((id) => id >= 1 && id <= maximumId))].slice(0, limit);
  const selection = {
    overviewIds: validIds(field("overview_ids", "overviewIds"), 2),
    pointIds: validIds(field("point_ids", "pointIds", "main_point_ids", "mainPointIds"), 5),
    detailIds: validIds(field("detail_ids", "detailIds", "important_detail_ids"), 4),
    takeawayIds: validIds(field("takeaway_ids", "takeawayIds"), 2),
  };
  if (selection.pointIds.length === 0) throw new Error("No source sentence IDs were returned.");
  return selection;
}

function resolveSelection(selection: SectionSelection, sentences: SourceSentence[]): SectionSummary {
  const byId = new Map(sentences.map((sentence) => [sentence.id, sentence.text]));
  const resolve = (ids: number[]) => distinct(ids.map((id) => byId.get(id) ?? "").filter(Boolean));
  const ranked = sentences.map((sentence) => sentence.text);
  const points = distinct([...ranked.slice(0, 3), ...resolve(selection.pointIds)], 5);
  const details = distinct([...ranked.slice(3, 7), ...resolve(selection.detailIds)], 4);
  const overviewItems = distinct([ranked[0] ?? "", ...resolve(selection.overviewIds)], 2);
  const takeawayItems = distinct([ranked[0] ?? "", ...resolve(selection.takeawayIds)], 2);
  return {
    overview: (overviewItems.join(" ") || points[0] || "").slice(0, 1_500),
    points,
    details,
    takeaway: (takeawayItems.join(" ") || points[0] || "").slice(0, 800),
  };
}

export class OllamaSummarizer implements Summarizer {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) return false;
      const payload = await response.json() as OllamaTagsResponse;
      return (payload.models ?? []).some((item) => item.name === this.model || item.model === this.model);
    } catch {
      return false;
    }
  }

  private async summarizeChunk(chunk: TranscriptChunk, title: string): Promise<SectionSummary> {
    const sentences = sourceSentences(chunk);
    if (sentences.length === 0) {
      throw new AppError(422, "TRANSCRIPT_UNAVAILABLE", "This transcript section did not contain usable sentences.");
    }
    const numberedSentences = sentences.map((sentence) => `[${sentence.id}] ${sentence.text}`).join("\n");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImplementation(`${this.baseUrl}/api/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            system: [
              "You select the most informative source sentences from a transcript section.",
              "Return sentence IDs only; never write, rewrite, combine, correct, or invent summary text.",
              "Prefer sentences that state complete methods, exact results, requirements, settings, comparisons, and warnings.",
              "Avoid introductions, repetition, filler, transitions, opinions, and calls to action.",
              "Keep separate methods separate and preserve the section's actual chronology.",
            ].join(" "),
            prompt: [
              `VIDEO TITLE: ${title}`,
              `SECTION: ${formatTimestamp(chunk.startMs)}-${formatTimestamp(chunk.endMs)}`,
              "",
              "NUMBERED SOURCE SENTENCES:",
              numberedSentences,
              "",
              attempt === 0
                ? "Select IDs for a brief overview, 3-5 main points, 2-4 important details, and 1-2 takeaways. Return JSON matching the schema."
                : "Return ONLY one JSON object containing overview_ids, point_ids, detail_ids, and takeaway_ids. Every value must be an array of valid source sentence IDs.",
            ].join("\n"),
            format: SECTION_SUMMARY_SCHEMA,
            stream: false,
            think: false,
            keep_alive: "15m",
            options: {
              temperature: 0,
              num_ctx: 8_192,
              num_predict: 250,
            },
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        throw new AppError(
          502,
          "AI_ERROR",
          error instanceof Error && error.name === "TimeoutError"
            ? `Local AI exceeded ${Math.ceil(this.timeoutMs / 1_000)} seconds. Try a smaller Ollama model.`
            : "Could not connect to the local Ollama service.",
        );
      }

      const payload = await response.json().catch(() => ({})) as OllamaGenerateResponse;
      if (!response.ok || payload.error) {
        throw new AppError(502, "AI_ERROR", payload.error ?? "The local Ollama model failed.");
      }
      try {
        return resolveSelection(parseSectionSelection(payload.response ?? "", sentences.length), sentences);
      } catch {
        if (attempt === 1) {
          throw new AppError(502, "AI_ERROR", "The local Ollama model returned invalid structured summaries.");
        }
      }
    }
    throw new AppError(502, "AI_ERROR", "The local Ollama model returned an invalid structured summary.");
  }

  async summarize(transcript: Transcript, chunks: TranscriptChunk[]): Promise<VideoSummary> {
    const startedAt = Date.now();
    const sections: Array<{ chunk: TranscriptChunk; summary: SectionSummary }> = [];
    for (const chunk of chunks) {
      sections.push({ chunk, summary: await this.summarizeChunk(chunk, transcript.title) });
    }

    const purposes = sections.map(({ chunk, summary }) => sectionPurpose(chunk, summary.overview));
    const sectionPoints = sections.map(({ chunk, summary }) =>
      groundedModelItems([...summary.points, ...summary.details], chunk.text));
    const costRewardFacts = extractCostRewardFacts(transcript);
    const mainPoints = distinct(
      sectionPoints.flatMap((points) => points.slice(0, 3)),
      12,
    );
    const importantDetails = distinct(
      [
        ...costRewardFacts,
        ...sections.flatMap(({ chunk, summary }) => groundedModelItems(summary.details, chunk.text).slice(0, 2)),
      ],
      10,
    );
    for (const code of extractShareCodes(transcript)) {
      if (![...mainPoints, ...importantDetails].some((item) => item.includes(code))) {
        importantDetails.push(`Share code: \`${code}\`.`);
      }
    }
    const directionalRequirements = extractDirectionalRequirements(transcript);
    importantDetails.push(...directionalRequirements);
    const takeaways = distinct([
      ...sectionPoints.map((points, index) => points[0] ?? purposes[index] ?? ""),
      ...directionalRequirements,
    ], 6);

    const markdown = [
      `# ${transcript.title}`,
      "",
      "## Short overview",
      fullVideoOverview(purposes, sections.map(({ summary }) => summary)),
      "",
      "## Main points",
      ...mainPoints.map((point) => `- ${point}`),
      "",
      "## Important details",
      ...importantDetails.map((detail) => `- ${detail}`),
      "",
      "## Sections",
      ...sections.flatMap(({ chunk }, index) => [
        `### ${index + 1}. ${sectionHeading(purposes[index]!, index)} (${formatTimestamp(chunk.startMs)}-${formatTimestamp(chunk.endMs)})`,
        purposes[index]!,
        ...sectionPoints[index]!.slice(0, 5)
          .map((point) => `- ${point}`),
        ...(index === sections.length - 1
          ? directionalRequirements.map((requirement) => `- ${requirement}`)
          : []),
        "",
      ]),
      "## Key takeaways",
      ...takeaways.map((takeaway) => `- ${takeaway}`),
    ].join("\n");

    logger.info("Local Ollama summary generated", {
      model: this.model,
      chunks: chunks.length,
      elapsedMs: Date.now() - startedAt,
    });
    return { markdown, provider: "ollama", model: this.model };
  }
}
