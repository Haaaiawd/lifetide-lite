"use client";

import { useEffect, useRef, useState } from "react";
import { FileArrowUp } from "@phosphor-icons/react";
import { UPLOAD_MAX_SIZE, MAX_UPLOAD_FILES } from "@/lib/uploads/config";

export type Material = {
  uploadIds: string[];
  pastedText?: string;
};

export type MaterialCardProps = {
  onSubmit: (material: Material) => void;
  onSkip: () => void;
};

type UploadPreview = {
  id: string;
  fileName: string;
  status: string;
  previewText?: string;
  pageImages?: string[];
};

export function MaterialCard({ onSubmit, onSkip }: MaterialCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [uploads, setUploads] = useState<UploadPreview[]>([]);
  const [confirmedTexts, setConfirmedTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remainingFiles = MAX_UPLOAD_FILES - uploads.length;
  const totalItems = uploads.length + (pastedText.trim() ? 1 : 0);

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
      setError("上传同意记录失败");
      return false;
    }
    setConsentGiven(true);
    return true;
  };

  const uploadFile = async (file: File) => {
    if (!(await ensureConsent())) return;

    if (file.size > UPLOAD_MAX_SIZE) {
      setError(`单个文件不能超过 ${Math.round(UPLOAD_MAX_SIZE / 1024 / 1024)}MB`);
      return;
    }

    setBusy(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      setBusy(false);

      if (!res.ok) {
        setError(data.error || "上传失败");
        return;
      }

      if (data.upload) {
        const preview: UploadPreview = {
          id: data.upload.id,
          fileName: data.upload.fileName,
          status: data.upload.status,
          previewText: data.upload.preview?.text ?? "",
          pageImages: data.upload.preview?.pageImages ?? [],
        };
        setUploads((prev) => [...prev, preview]);
        setConfirmedTexts((prev) => ({ ...prev, [preview.id]: preview.previewText ?? "" }));
      }
    } catch {
      setBusy(false);
      setError("上传失败");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (remainingFiles <= 0) {
      setError(`最多上传 ${MAX_UPLOAD_FILES} 份材料`);
      return;
    }
    Array.from(files).slice(0, remainingFiles).forEach(uploadFile);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    if (remainingFiles <= 0) {
      setError(`最多上传 ${MAX_UPLOAD_FILES} 份材料`);
      return;
    }
    Array.from(files).slice(0, remainingFiles).forEach(uploadFile);
  };

  const uploadTextAsFile = async (text: string): Promise<string | null> => {
    const file = new File([text], "note.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "保存文字失败");
      return null;
    }
    return data.upload?.id ?? null;
  };

  const confirmUpload = async (upload: UploadPreview): Promise<string | null> => {
    if (upload.status !== "preview_ready") return upload.id;

    const text = confirmedTexts[upload.id] ?? upload.previewText ?? "";
    const res = await fetch(`/api/uploads/${upload.id}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmedText: text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "确认失败");
      return null;
    }
    return upload.id;
  };

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);

    try {
      if (totalItems > MAX_UPLOAD_FILES) {
        setError(`最多提交 ${MAX_UPLOAD_FILES} 份材料，请删除或减少`);
        setBusy(false);
        return;
      }

      const ids: string[] = [];

      for (const upload of uploads) {
        const id = await confirmUpload(upload);
        if (id) ids.push(id);
      }

      if (pastedText.trim()) {
        if (ids.length >= MAX_UPLOAD_FILES) {
          setError(`最多提交 ${MAX_UPLOAD_FILES} 份材料，粘贴文字会算作一份`);
          setBusy(false);
          return;
        }
        const textId = await uploadTextAsFile(pastedText.trim());
        if (textId) ids.push(textId);
      }

      if (ids.length === 0 && !pastedText.trim()) {
        setError("没有可提交的内容");
        setBusy(false);
        return;
      }

      onSubmit({ uploadIds: ids, pastedText: pastedText.trim() || undefined });
    } catch {
      setBusy(false);
      setError("提交失败");
    }
  };

  return (
    <div className="flex h-full min-h-[75dvh] flex-col gap-5">
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
          已上传 {uploads.length}/{MAX_UPLOAD_FILES} 份，单个文件最大 {Math.round(UPLOAD_MAX_SIZE / 1024 / 1024)}MB；支持 .txt / .md / .json / .pdf / .docx / .png / .jpg / .webp
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.json,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif"
          multiple
          onChange={handleFileChange}
          disabled={busy || remainingFiles <= 0}
          className="sr-only"
        />
      </div>

      {uploads.length > 0 && (
        <div className="space-y-4">
          {uploads.map((upload) => (
            <div key={upload.id} className="rounded-sm border-2 border-ink bg-paper p-3">
              <div className="mb-2 flex items-center gap-2 text-sm text-ink-muted">
                {upload.fileName}
                {upload.status === "preview_ready" && <span className="ml-2 text-cobalt">· 待确认</span>}
                {upload.status === "ready" && <span className="ml-2 text-green-600">· 已就绪</span>}
              </div>

              {upload.pageImages && upload.pageImages.length > 0 && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-2">
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

              {upload.status === "preview_ready" && (
                <textarea
                  value={confirmedTexts[upload.id] ?? upload.previewText ?? ""}
                  onChange={(e) => setConfirmedTexts((prev) => ({ ...prev, [upload.id]: e.target.value }))}
                  rows={4}
                  className="w-full border-2 border-ink bg-paper p-3 text-sm shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  placeholder="这是 AI 从图片中识别出的文字，你可以直接修改。"
                />
              )}

              {upload.status === "ready" && upload.previewText && (
                <p className="text-sm text-ink-muted line-clamp-3">{upload.previewText}</p>
              )}
            </div>
          ))}
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
          disabled={busy}
          className="w-full border-2 border-ink bg-paper p-3 text-base shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          placeholder="推荐贴简历或 MBTI 报告文字版；也可以贴一段自我描述或日记片段。"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="mt-auto flex flex-col gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="w-full border-2 border-ink bg-cobalt px-5 py-3.5 text-center text-base font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:shadow-md disabled:opacity-50"
        >
          {busy ? "上传/确认中…" : "提交"}
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
