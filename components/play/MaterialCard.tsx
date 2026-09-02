"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FileArrowUp, X, CheckCircle, Spinner, Warning } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { UPLOAD_MAX_SIZE, MAX_UPLOAD_FILES } from "@/lib/uploads/config";

export type Material = {
  uploadIds: string[];
  pastedText?: string;
};

export type MaterialCardProps = {
  onSubmit: (material: Material) => void;
  onSkip: () => void;
};

type UploadItem = {
  // Client-side temp id for optimistic UI; replaced by server id after upload
  tempId: string;
  serverId?: string;
  fileName: string;
  status: "uploading" | "parsing" | "preview_ready" | "ready" | "failed" | "cancelled";
  error?: string;
  previewText?: string;
  pageImages?: string[];
  controller?: AbortController;
};

type Toast = {
  id: number;
  type: "success" | "error";
  message: string;
};

const STATUS_LABEL: Record<UploadItem["status"], string> = {
  uploading: "上传中",
  parsing: "解析中",
  preview_ready: "待确认",
  ready: "已就绪",
  failed: "失败",
  cancelled: "已取消",
};

let toastCounter = 0;

export function MaterialCard({ onSubmit, onSkip }: MaterialCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [confirmedTexts, setConfirmedTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Files that count toward limit (exclude failed and cancelled)
  const activeUploads = uploads.filter((u) => u.status !== "failed" && u.status !== "cancelled");
  const remainingFiles = MAX_UPLOAD_FILES - activeUploads.length;
  const totalItems = activeUploads.length + (pastedText.trim() ? 1 : 0);

  const pushToast = useCallback((type: "success" | "error", message: string) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((data) => {
        setConsentGiven(data.consents?.some((c: { type: string; given: boolean }) => c.type === "upload" && c.given));
      })
      .catch(() => setConsentGiven(false));
  }, []);

  const ensureConsent = async () => {
    if (consentGiven) return true;
    const res = await fetch("/api/session/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consents: [{ type: "upload", given: true }] }),
    });
    if (!res.ok) {
      pushToast("error", "上传同意记录失败");
      return false;
    }
    setConsentGiven(true);
    return true;
  };

  const uploadFile = async (file: File) => {
    if (!(await ensureConsent())) return;

    if (file.size > UPLOAD_MAX_SIZE) {
      pushToast("error", `${file.name} 超过 ${Math.round(UPLOAD_MAX_SIZE / 1024 / 1024)}MB 限制`);
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    // Optimistic: immediately show uploading state
    setUploads((prev) => [...prev, {
      tempId,
      fileName: file.name,
      status: "uploading",
      controller,
    }]);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/uploads", { method: "POST", body: form, signal: controller.signal });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.error || "上传失败";
        setUploads((prev) => prev.map((u) =>
          u.tempId === tempId ? { ...u, status: "failed", error: msg, controller: undefined } : u
        ));
        pushToast("error", `${file.name}：${msg}`);
        return;
      }

      if (data.upload) {
        const serverId = data.upload.id;
        const serverStatus = data.upload.status;
        const previewText = data.upload.preview?.text ?? "";
        const pageImages = data.upload.preview?.pageImages ?? [];

        // Map server status to our UI status
        const uiStatus: UploadItem["status"] =
          serverStatus === "ready" ? "ready" :
          serverStatus === "preview_ready" ? "preview_ready" :
          serverStatus === "failed" ? "failed" :
          "ready"; // fallback

        setUploads((prev) => prev.map((u) =>
          u.tempId === tempId ? {
            ...u,
            serverId,
            status: uiStatus,
            previewText,
            pageImages,
            error: uiStatus === "failed" ? data.upload.error : undefined,
            controller: undefined,
          } : u
        ));

        if (previewText) {
          setConfirmedTexts((prev) => ({ ...prev, [serverId]: previewText }));
        }

        pushToast("success", `${file.name} ${uiStatus === "ready" ? "上传成功" : "解析完成，待确认"}`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Already handled by cancelUpload — just ensure it's marked cancelled
        return;
      }
      setUploads((prev) => prev.map((u) =>
        u.tempId === tempId ? { ...u, status: "failed", error: "网络错误", controller: undefined } : u
      ));
      pushToast("error", `${file.name}：网络错误`);
    }
  };

  const cancelUpload = (tempId: string) => {
    setUploads((prev) => prev.map((u) => {
      if (u.tempId === tempId && u.controller) {
        u.controller.abort();
        return { ...u, status: "cancelled" as const, controller: undefined };
      }
      return u;
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (remainingFiles <= 0) {
      pushToast("error", `最多上传 ${MAX_UPLOAD_FILES} 份材料`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const toUpload = Array.from(files).slice(0, remainingFiles);
    // Don't disable input — each file uploads independently
    toUpload.forEach(uploadFile);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    if (remainingFiles <= 0) {
      pushToast("error", `最多上传 ${MAX_UPLOAD_FILES} 份材料`);
      return;
    }
    Array.from(files).slice(0, remainingFiles).forEach(uploadFile);
  };

  const removeUpload = (tempId: string) => {
    // If still uploading, abort first
    setUploads((prev) => prev.map((u) => {
      if (u.tempId === tempId && u.controller) {
        u.controller.abort();
      }
      return u;
    }));
    setUploads((prev) => prev.filter((u) => u.tempId !== tempId));
  };

  const uploadTextAsFile = async (text: string): Promise<string | null> => {
    const file = new File([text], "note.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      pushToast("error", data.error || "保存文字失败");
      return null;
    }
    return data.upload?.id ?? null;
  };

  const confirmUpload = async (upload: UploadItem): Promise<string | null> => {
    if (upload.status !== "preview_ready" || !upload.serverId) return upload.serverId ?? null;

    const text = confirmedTexts[upload.serverId] ?? upload.previewText ?? "";
    const res = await fetch(`/api/uploads/${upload.serverId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmedText: text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      pushToast("error", data.error || "确认失败");
      return null;
    }
    // Update status to ready
    setUploads((prev) => prev.map((u) =>
      u.tempId === upload.tempId ? { ...u, status: "ready" } : u
    ));
    return upload.serverId;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      if (totalItems > MAX_UPLOAD_FILES) {
        setError(`最多提交 ${MAX_UPLOAD_FILES} 份材料，请删除或减少`);
        setSubmitting(false);
        return;
      }

      const ids: string[] = [];

      for (const upload of uploads) {
        if (upload.status === "failed" || upload.status === "cancelled") continue;
        const id = await confirmUpload(upload);
        if (id) ids.push(id);
      }

      if (pastedText.trim()) {
        if (ids.length >= MAX_UPLOAD_FILES) {
          setError(`最多提交 ${MAX_UPLOAD_FILES} 份材料，粘贴文字会算作一份`);
          setSubmitting(false);
          return;
        }
        const textId = await uploadTextAsFile(pastedText.trim());
        if (textId) ids.push(textId);
      }

      if (ids.length === 0 && !pastedText.trim()) {
        setError("没有可提交的内容");
        setSubmitting(false);
        return;
      }

      onSubmit({ uploadIds: ids, pastedText: pastedText.trim() || undefined });
    } catch {
      setSubmitting(false);
      setError("提交失败");
    }
  };

  const isBusy = uploads.some((u) => u.status === "uploading" || u.status === "parsing");

  return (
    <div className="flex h-full min-h-[75dvh] flex-col gap-5">
      {/* Toast notifications */}
      <div className="fixed right-4 top-20 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className={`flex items-center gap-2 rounded-sm border-2 px-3 py-2 text-sm shadow-md ${
                toast.type === "success"
                  ? "border-success bg-success-soft/80 text-success"
                  : "border-danger bg-danger-soft/80 text-danger"
              }`}
              onClick={() => dismissToast(toast.id)}
            >
              {toast.type === "success" ? <CheckCircle size={16} /> : <Warning size={16} />}
              <span>{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div>
        <h2 className="font-serif text-xl leading-snug md:text-2xl">
          上传一些材料，能帮我更准确地理解你。
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          推荐上传简历和 MBTI 报告（尤其是带具体数值的截图或 PDF）。也欢迎贴一段自我描述、日记片段、或任何你觉得"这就是我"的文字。图片和 PDF 会转成预览，确认后才会使用。
        </p>
      </div>

      {!consentGiven && (
        <label className="flex items-start gap-3 rounded-sm border-2 border-ink bg-paper p-3">
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            className="mt-1 h-4 w-4 accent-cobalt"
          />
          <span className="text-sm leading-snug">允许系统临时保存上传材料 24 小时，作为追问线索。</span>
        </label>
      )}

      {/* Upload dropzone — never disabled by individual file uploads */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-ink bg-paper p-6 text-center transition-colors ${
          remainingFiles > 0 ? "cursor-pointer hover:bg-paper-raised" : "cursor-not-allowed opacity-60"
        }`}
        onClick={() => remainingFiles > 0 && fileRef.current?.click()}
      >
        <FileArrowUp size={28} className="text-cobalt" />
        <p className="text-sm font-medium">
          {remainingFiles > 0 ? "拖拽文件到此处，或点击选择" : "已达最大材料数量"}
        </p>
        <p className="text-xs text-ink-muted">
          已上传 {activeUploads.length}/{MAX_UPLOAD_FILES} 份，单个文件最大 {Math.round(UPLOAD_MAX_SIZE / 1024 / 1024)}MB；支持 .txt / .md / .json / .pdf / .docx / .png / .jpg / .webp
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.json,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif"
          multiple
          onChange={handleFileChange}
          disabled={remainingFiles <= 0}
          className="sr-only"
        />
      </div>

      {/* Upload status cards — long and slim */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence>
            {uploads.map((upload) => (
              <motion.div
                key={upload.tempId}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={`rounded-sm border-2 bg-paper p-3 ${
                  upload.status === "failed" ? "border-danger/40" : "border-ink"
                }`}
              >
                {/* Slim status bar */}
                <div className="flex items-center gap-2">
                  {/* Status icon */}
                  <div className="flex-shrink-0">
                    {(upload.status === "uploading" || upload.status === "parsing") && (
                      <Spinner size={16} className="animate-spin text-cobalt" />
                    )}
                    {upload.status === "ready" && <CheckCircle size={16} className="text-success" />}
                    {upload.status === "preview_ready" && <CheckCircle size={16} className="text-cobalt" />}
                    {upload.status === "failed" && <Warning size={16} className="text-danger" />}
                    {upload.status === "cancelled" && <X size={16} className="text-ink-muted" />}
                  </div>

                  {/* File name + status label */}
                  <span className="flex-1 truncate text-sm font-medium">{upload.fileName}</span>
                  <span className={`flex-shrink-0 text-xs ${
                    upload.status === "failed" ? "text-danger" :
                    upload.status === "ready" ? "text-success" :
                    upload.status === "preview_ready" ? "text-cobalt" :
                    upload.status === "cancelled" ? "text-ink-muted" :
                    "text-ink-muted"
                  }`}>
                    {STATUS_LABEL[upload.status]}
                  </span>

                  {/* Cancel button (during upload/parse) or remove button (after done) */}
                  {(upload.status === "uploading" || upload.status === "parsing") ? (
                    <button
                      type="button"
                      onClick={() => cancelUpload(upload.tempId)}
                      className="flex-shrink-0 border border-ink/30 px-2 py-0.5 text-[10px] text-ink-muted hover:border-danger hover:text-danger"
                      aria-label="取消"
                    >
                      取消
                    </button>
                  ) : upload.status !== "cancelled" ? (
                    <button
                      type="button"
                      onClick={() => removeUpload(upload.tempId)}
                      className="flex-shrink-0 text-ink-muted hover:text-danger"
                      aria-label="移除"
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeUpload(upload.tempId)}
                      className="flex-shrink-0 text-ink-muted hover:text-danger"
                      aria-label="移除"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Error message */}
                {upload.status === "failed" && upload.error && (
                  <p className="mt-1 text-xs text-danger">{upload.error}</p>
                )}

                {/* Preview images (for preview_ready) */}
                {upload.status === "preview_ready" && upload.pageImages && upload.pageImages.length > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                    {upload.pageImages.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={`${upload.fileName} 第 ${i + 1} 页`}
                        className="h-32 w-auto rounded-sm border border-ink object-contain"
                      />
                    ))}
                  </div>
                )}

                {/* Editable text (for preview_ready) */}
                {upload.status === "preview_ready" && upload.serverId && (
                  <textarea
                    value={confirmedTexts[upload.serverId] ?? upload.previewText ?? ""}
                    onChange={(e) => setConfirmedTexts((prev) => ({ ...prev, [upload.serverId as string]: e.target.value }))}
                    rows={4}
                    className="mt-2 w-full border-2 border-ink bg-paper p-3 text-sm shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    placeholder="这是 AI 从图片中识别出的文字，你可以直接修改。"
                  />
                )}

                {/* Preview text (for ready) */}
                {upload.status === "ready" && upload.previewText && (
                  <p className="mt-1 text-xs text-ink-muted line-clamp-2">{upload.previewText}</p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="material-paste" className="text-sm text-ink-muted">
          或者粘贴文字（算作一份材料）
        </label>
        <textarea
          id="material-paste"
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          rows={4}
          disabled={submitting}
          className="w-full border-2 border-ink bg-paper p-3 text-base shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          placeholder="推荐贴简历或 MBTI 报告文字版；也可以贴一段自我描述或日记片段。"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="mt-auto flex flex-col gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || isBusy}
          className="w-full border-2 border-ink bg-cobalt px-5 py-3.5 text-center text-base font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md disabled:opacity-50"
        >
          {submitting ? "提交中…" : isBusy ? "等待文件处理完成…" : "提交"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full border-2 border-ink bg-paper-raised px-5 py-3.5 text-center text-base text-ink shadow-sm transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm"
        >
          跳过，直接继续
        </button>
      </div>
    </div>
  );
}
