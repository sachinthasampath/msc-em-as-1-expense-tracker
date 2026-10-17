// Bare 'zod' specifier: resolves via node_modules under Jest, and via this function's
// deno.json import map ("zod" -> "npm:zod@3") under Deno — a bare 'zod' specifier does NOT
// resolve in Deno without that map (07-ai-prediction.md). This file stays runtime-neutral so
// jest-expo can import it directly.
import { z } from 'zod';

export const AiExplanationSchema = z.object({
  explanation: z.string().min(1).max(1200),
  insights: z.array(z.string().max(300)).max(10),
  limitations: z.array(z.string().max(300)).max(10),
});

export type AiExplanation = z.infer<typeof AiExplanationSchema>;

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

// Parses defensively: getting to the JSON is itself three steps that can each fail (no string
// content, invalid JSON, schema mismatch). Returns null on ANY failure — the caller must never
// let an LLM-response problem take down the numeric forecast (07-ai-prediction.md).
export function parseAiExplanation(raw: unknown): AiExplanation | null {
  if (typeof raw !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return null;
  }

  const result = AiExplanationSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
