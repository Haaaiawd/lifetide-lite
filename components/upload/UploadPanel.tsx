"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { FileArrowUp, Trash, ArrowClockwise, X } from "@phosphor-icons/react";
import type { Prisma } from "@prisma/client";

type UploadWithChunks = Prisma.UploadGetPayload<{ include: { chunks: true } }>;

type Consent = {
  type: string;
  required: boolean;
  given: boolean;
  label: string;
};

const initial = { opacity: 0, y: 8 };
const animate = { opacity: 1, y: 0 };
const easeOutQuart: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function UploadPanel() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const fileRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<{ id: string; consents: Consent[] } | null>(null);
  const [uploads, setUploads] = useState<UploadWithChunks[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((data) => {
        setSession(data);
        setConsentGiven(data.consents.some((c: Consent) => c.type === "upload" && c.given));
      })
      .catch(() => setError("无法恢复会话"));
  }, []);

  const ensureConsent = async () => {
    if (!session || !consentGiven) return false;
    const res = await fetch("/api/session/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consents: [{ type: "upload", given: true }] }),
    });
    if (!res.ok) {
      setError("同意记录失败");
      return false;
    }
    return true;
  };

  const refreshUploads = async () => {
    // We don't have a list endpoint yet; list is maintained locally after each action.
    // For a real app this would fetch /api/uploads.
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);

    if (!(await ensureConsent())) {
      setBusy(false);
      return;
    }

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/uploads", {
      method: "POST",
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "上传失败");
      return;
    }

    if (data.upload) {
      setUploads((prev) => [data.upload, ...prev]);
    }

    if (fileRef.current) fileRef.current.value = "";
  };

  const retry = async (id: string) => {
    const res = await fetch(`/api/uploads/${id}/retry`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "重试失败");
      return;
    }
    setUploads((prev) => prev.map((u) => (u.id === id ? data.upload ?? u : u)));
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "删除失败");
      return;
    }
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

  const statusText: Record<string, string> = {
    queued: "排队中",
    scanning: "扫描中",
    parsing: "解析中",
    ready: "可用",
    rejected: "被拒绝",
    failed: "解析失败",
    deleted: "已删除",
  };

  const canUpload = session?.consents?.some((c) => c.type === "upload" && c.given) ?? false;

  return (
    <section className="w-full max-w-md rounded-lg border-2 border-ink bg-paper-raised p-5 shadow-md">
      <h2 className="font-serif text-2xl">可选材料</h2>
      <p className="mt-1 text-sm text-ink-muted">
        不上传也可以开始。简历、MBTI 等材料只作为追问线索，不是结论。
      </p>

      {!canUpload && (
        <div className="mt-4 rounded border-2 border-ink bg-paper p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              className="mt-1 h-4 w-4 accent-cobalt"
            />
            <span className="text-sm leading-snug">
              允许上传简历、MBTI 报告等文本材料并临时保存 24 小时。
            </span>
          </label>
        </div>
      )}

      <div className="mt-5">
        <label
          htmlFor="file-upload"
          className={`flex cursor-pointer items-center justify-center gap-2 rounded border-2 border-ink px-4 py-3 text-center font-medium transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt active:translate-x-[2px] active:translate-y-[2px] ${
            canUpload || consentGiven
              ? "bg-cobalt text-paper shadow-sm hover:shadow-md"
              : "bg-paper text-ink-muted"
          }`}
        >
          <FileArrowUp size={20} />
          <span>选择文件（.txt / .md / .json，最大 2MB）</span>
        </label>
        <input
          id="file-upload"
          ref={fileRef}
          type="file"
          accept=".txt,.md,.json,text/plain,text/markdown,application/json"
          onChange={handleFileChange}
          disabled={busy || (!canUpload && !consentGiven)}
          className="sr-only"
        />
      </div>

      {error && (
        <p className="mt-3 rounded border border-danger bg-danger/10 p-2 text-sm text-danger">{error}</p>
      )}

      <div className="mt-5 space-y-3">
        {uploads.map((upload) => (
          <motion.div
            key={upload.id}
            initial={reduce ? false : initial}
            animate={animate}
            transition={{ duration: 0.2, ease: easeOutQuart }}
            className="rounded border-2 border-ink bg-paper p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{upload.fileName}</p>
                <p className="text-xs text-ink-muted">
                  {statusText[upload.status] ?? upload.status}
                  {upload.error ? ` · ${upload.error}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {upload.status === "failed" && (
                  <button
                    onClick={() => retry(upload.id)}
                    className="rounded border-2 border-ink p-1.5 text-ink shadow-sm transition-transform hover:shadow-md active:translate-x-[1px] active:translate-y-[1px]"
                    aria-label="重试"
                  >
                    <ArrowClockwise size={16} />
                  </button>
                )}
                <button
                  onClick={() => remove(upload.id)}
                  className="rounded border-2 border-ink p-1.5 text-danger shadow-sm transition-transform hover:shadow-md active:translate-x-[1px] active:translate-y-[1px]"
                  aria-label="删除"
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>

            {upload.status === "ready" && upload.chunks.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-ink-muted">
                  解析出 {upload.chunks.length} 个片段
                </summary>
                <ul className="mt-2 space-y-2 border-t border-ink/20 pt-2">
                  {upload.chunks.slice(0, 3).map((chunk) => (
                    <li key={chunk.id} className="text-xs leading-relaxed text-ink-muted">
                      <span className="text-cobalt">{chunk.index + 1}.</span> {chunk.text}
                    </li>
                  ))}
                  {upload.chunks.length > 3 && (
                    <li className="text-xs text-ink-muted">…还有 {upload.chunks.length - 3} 个片段</li>
                  )}
                </ul>
              </details>
            )}
          </motion.div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between border-t-2 border-ink pt-4">
        <button
          onClick={() => router.push("/play")}
          className="text-sm font-medium text-ink-muted underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt"
        >
          先不上传，直接开始
        </button>
        <button
          onClick={() => router.push("/play")}
          className="rounded border-2 border-ink bg-cobalt px-4 py-2 text-sm font-medium text-paper shadow-sm transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt active:translate-x-[2px] active:translate-y-[2px]"
        >
          继续
        </button>
      </div>
    </section>
  );
}
