// Pure helpers for session import: payload validation and merge planning.
// Kept DB-free so they can be unit-tested without Prisma.

import { workingMemorySchema } from "@/lib/working-memory/schema";

// Top-level keys allowed on an imported working_memory payload. Anything else
// means the file was not produced by this app's export (or was tampered with).
const ALLOWED_WORKING_MEMORY_KEYS = new Set(
  Object.keys(workingMemorySchema.shape),
);

export type ImportedWave = {
  wave_id: string;
  wave_index: number;
  focus_uncertainty_id: string | null;
  status: string;
  questions: string; // serialized JSON, as stored on Wave.questions
};

export type ImportedAnswer = {
  question_id: string;
  value: string | null;
  skipped: boolean;
};

export type ParsedSessionImport = {
  sourceSessionId: string | null;
  sourceUserId: string | null;
  workingMemoryPayload: Record<string, unknown> | null;
  waves: ImportedWave[];
  answers: ImportedAnswer[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate and normalize an uploaded export file (same shape produced by
 * buildSessionExport). Returns null when the payload is unusable.
 */
export function parseSessionImport(body: unknown): ParsedSessionImport | null {
  if (!isRecord(body)) return null;

  const meta = isRecord(body.meta) ? body.meta : null;
  const sourceSessionId =
    meta && typeof meta.session_id === "string" ? meta.session_id : null;
  const sourceUserId =
    meta && typeof meta.user_id === "string" ? meta.user_id : null;

  const wm = isRecord(body.working_memory) ? body.working_memory : null;
  let workingMemoryPayload: Record<string, unknown> | null = null;
  if (wm) {
    if (!isRecord(wm.payload)) return null;
    // Reject unknown top-level keys so foreign or corrupted payloads are not
    // silently merged into the user's working memory.
    for (const key of Object.keys(wm.payload)) {
      if (!ALLOWED_WORKING_MEMORY_KEYS.has(key)) return null;
    }
    workingMemoryPayload = wm.payload;
  }

  const waves: ImportedWave[] = [];
  if (Array.isArray(body.waves)) {
    for (const w of body.waves) {
      if (!isRecord(w) || typeof w.wave_id !== "string") continue;
      const questions =
        typeof w.questions === "string"
          ? w.questions
          : JSON.stringify(w.questions ?? []);
      waves.push({
        wave_id: w.wave_id,
        wave_index: typeof w.wave_index === "number" ? w.wave_index : 0,
        focus_uncertainty_id:
          typeof w.focus_uncertainty_id === "string"
            ? w.focus_uncertainty_id
            : null,
        status: typeof w.status === "string" ? w.status : "committed",
        questions,
      });
    }
  }

  const answers: ImportedAnswer[] = [];
  if (Array.isArray(body.answers)) {
    for (const a of body.answers) {
      if (!isRecord(a) || typeof a.question_id !== "string") continue;
      answers.push({
        question_id: a.question_id,
        value: typeof a.value === "string" ? a.value : null,
        skipped: a.skipped === true,
      });
    }
  }

  if (!workingMemoryPayload && waves.length === 0 && answers.length === 0) {
    return null;
  }

  return {
    sourceSessionId,
    sourceUserId,
    workingMemoryPayload,
    waves,
    answers,
  };
}

/**
 * Merge an imported working-memory payload into the existing one without
 * overwriting anything:
 * - scalar/object keys already present on the existing payload win;
 * - absent or null keys are filled from the imported payload;
 * - array keys are unioned item-by-item (by `id` when present, otherwise by
 *   serialized value); matching items are merged field-by-field with the
 *   existing item's fields winning;
 * - `last_wave_index` takes the max so restored wave progress isn't lost;
 * - `updated_at` keeps the existing record's timestamp instead of adopting
 *   the imported file's timestamp.
 */
export function mergeWorkingMemoryPayload(
  existing: Record<string, unknown> | null,
  imported: Record<string, unknown>,
): Record<string, unknown> {
  if (!existing) return imported;

  const merged: Record<string, unknown> = { ...existing };
  for (const [key, importedValue] of Object.entries(imported)) {
    const existingValue = merged[key];

    if (key === "last_wave_index") {
      const a = typeof existingValue === "number" ? existingValue : 0;
      const b = typeof importedValue === "number" ? importedValue : 0;
      merged[key] = Math.max(a, b);
      continue;
    }

    if (key === "updated_at") {
      // Preserve the existing payload's timestamp; only take the imported
      // one when the existing payload lacks it.
      if (typeof existingValue !== "string" || existingValue.length === 0) {
        merged[key] = importedValue;
      }
      continue;
    }

    if (existingValue === undefined || existingValue === null) {
      merged[key] = importedValue;
      continue;
    }

    if (Array.isArray(existingValue) && Array.isArray(importedValue)) {
      merged[key] = mergeArrayByIdentity(existingValue, importedValue);
    }
    // Existing non-null scalar/object wins — never overwritten.
  }
  return merged;
}

function itemKey(item: unknown): string {
  if (isRecord(item) && typeof item.id === "string") return `id:${item.id}`;
  try {
    return `json:${JSON.stringify(item)}`;
  } catch {
    return `json:${String(item)}`;
  }
}

function mergeArrayByIdentity(existing: unknown[], imported: unknown[]) {
  const indexByKey = new Map<string, number>();
  existing.forEach((item, i) => indexByKey.set(itemKey(item), i));
  const merged = [...existing];
  for (const item of imported) {
    const key = itemKey(item);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length);
      merged.push(item);
      continue;
    }
    // Same identity: merge fields instead of dropping the imported item
    // wholesale. Existing fields win; imported fields fill gaps so no data
    // from the export is lost.
    const existingItem = merged[existingIndex];
    if (isRecord(existingItem) && isRecord(item)) {
      merged[existingIndex] = { ...item, ...existingItem };
    }
  }
  return merged;
}
