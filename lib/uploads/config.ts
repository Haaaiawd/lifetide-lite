export const UPLOAD_MAX_SIZE = 10 * 1024 * 1024; // 10 MB per file
export const MAX_UPLOAD_FILES = 5; // max material items per session

export type AllowedType = {
  mime: string;
  ext: string;
  parser: "text" | "markdown" | "json" | "pdf" | "docx" | "image";
};

export const ALLOWED_UPLOAD_TYPES: AllowedType[] = [
  { mime: "text/plain", ext: ".txt", parser: "text" },
  { mime: "text/markdown", ext: ".md", parser: "markdown" },
  { mime: "application/json", ext: ".json", parser: "json" },
  { mime: "application/pdf", ext: ".pdf", parser: "pdf" },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ".docx", parser: "docx" },
  { mime: "image/png", ext: ".png", parser: "image" },
  { mime: "image/jpeg", ext: ".jpg", parser: "image" },
  { mime: "image/jpeg", ext: ".jpeg", parser: "image" },
  { mime: "image/webp", ext: ".webp", parser: "image" },
  { mime: "image/gif", ext: ".gif", parser: "image" },
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
  PREVIEW_READY: "preview_ready",
  READY: "ready",
  REJECTED: "rejected",
  FAILED: "failed",
  DELETED: "deleted",
} as const;
