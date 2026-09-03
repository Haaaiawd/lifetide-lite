// Derive a short, human-readable question from a statement-shaped important_unknown.
// The important_unknown is always a statement ("我暂不知晓的是……"), never a question.
// We extract the core concern and wrap it in a generic, concrete-scene question.
//
// Edge cases handled:
// - Empty or whitespace-only input → generic fallback
// - Core is empty after prefix stripping → generic fallback
// - Core contains 「」 brackets → strip them to avoid nested quotes
// - Core exceeds 30 chars → generic fallback (don't embed long text)
// - Core ends with ？/? (looks like a question already) → generic fallback

const GENERIC_QUESTION = "最近有没有一个具体的时刻，让你对当前的方向感受最深？";
const MAX_CORE_LENGTH = 30;

export function deriveShortQuestion(importantUnknown: string): string {
  if (!importantUnknown || !importantUnknown.trim()) {
    return GENERIC_QUESTION;
  }

  // Strip common statement prefixes to get the core concern.
  const core = importantUnknown
    .replace(/^我暂不知[晓悉的是]+[，,]?\s*/u, "")
    .replace(/^仍不清楚的是[，,]?\s*/u, "")
    .replace(/^目前还不?清楚[，,]?\s*/u, "")
    .replace(/[「」]/g, "")
    .trim();

  // Empty core, too long, or already a question → don't embed.
  if (!core || core.length > MAX_CORE_LENGTH || /[？?]\s*$/.test(core)) {
    return GENERIC_QUESTION;
  }

  return `关于「${core}」，最近有没有一个具体的时刻让你感受最深？`;
}
