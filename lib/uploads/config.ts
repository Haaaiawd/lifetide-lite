export const UPLOAD_MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export type AllowedType = {
  mime: string;
  ext: string;
  parser: "text" | "markdown" | "json";
};

export const ALLOWED_UPLOAD_TYPES: AllowedType[] = [
  { mime: "text/plain", ext: ".txt", parser: "text" },
  { mime: "text/markdown", ext: ".md", parser: "markdown" },
  { mime: "application/json", ext: ".json", parser: "json" },
];

export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_UPLOAD_TYPES.some((t) => t.mime === mime);
}

export function getParser(mime: string): AllowedType["parser"] | null {
  return ALLOWED_UPLOAD_TYPES.find((t) => t.mime === mime)?.parser ?? null;
}

export const UPLOAD_STATUS = {
  QUEUED: "queued",
  SCANNING: "scanning",
  PARSING: "parsing",
  READY: "ready",
  REJECTED: "rejected",
  FAILED: "failed",
  DELETED: "deleted",
} as const;
