"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { PixelIcon } from "@/components/art/PixelIcon";

type Mode = "login" | "register";

const GITHUB_REPO_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/Haaaiawd/lifetide-lite";

interface StarStatus {
  enabled: boolean;
  remaining: number;
  total: number;
  used: number;
  code: string | null;
}

export default function LoginPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Star campaign state
  const [starStatus, setStarStatus] = useState<StarStatus | null>(null);
  const [starLoading, setStarLoading] = useState(false);
  const [starMessage, setStarMessage] = useState<string | null>(null);

  const fetchStarStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/invite/star");
      if (res.ok) {
        const data = await res.json();
        setStarStatus(data);
      }
    } catch {
      // silently ignore — star section is optional
    }
  }, []);

  useEffect(() => {
    if (mode === "register") {
      fetchStarStatus();
    }
  }, [mode, fetchStarStatus]);

  async function handleGetStarCode() {
    setStarLoading(true);
    setStarMessage(null);
    try {
      const res = await fetch("/api/invite/star", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.code) {
        setInviteCode(data.code);
        setStarMessage("邀请码已填入，完成注册即可");
        setStarStatus((prev) =>
          prev ? { ...prev, remaining: data.remaining, total: data.total, used: data.used } : prev,
        );
      } else {
        setStarMessage(data.error ?? "名额已用完");
        setStarStatus((prev) =>
          prev ? { ...prev, enabled: false, remaining: 0 } : prev,
        );
      }
    } catch {
      setStarMessage("网络错误，请重试");
    } finally {
      setStarLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload: Record<string, string> = { email, password };
      if (mode === "register") {
        payload.inviteCode = inviteCode;
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "操作失败");
        return;
      }

      router.push("/account");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[80dvh] items-center justify-center px-4">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="border-2 border-ink bg-paper-raised shadow-md">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-ink bg-cobalt-soft px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
                <PixelIcon name="sparkle" size={12} className="text-cobalt" />
              </span>
              <span className="font-serif text-sm font-medium tracking-wide">
                {mode === "login" ? "登录" : "注册"}
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border-2 border-ink bg-paper px-3 py-2 text-sm outline-none focus:border-cobalt focus:shadow-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="w-full border-2 border-ink bg-paper px-3 py-2 text-sm outline-none focus:border-cobalt focus:shadow-sm"
                placeholder="至少 6 位"
              />
            </div>

            {mode === "register" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">邀请码</label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    required
                    autoComplete="off"
                    className="w-full border-2 border-ink bg-paper px-3 py-2 text-sm uppercase tracking-wider outline-none focus:border-cobalt focus:shadow-sm"
                    placeholder="8 位邀请码"
                  />
                </div>

                {/* Star campaign section */}
                {starStatus && (
                  <div className="border-2 border-ink/20 bg-paper px-3 py-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ink">没有邀请码？</span>
                      {starStatus.enabled ? (
                        <span className="text-success">
                          剩余名额：{starStatus.remaining} / {starStatus.total}
                        </span>
                      ) : (
                        <span className="text-danger">名额已用完</span>
                      )}
                    </div>
                    <p className="text-ink-muted leading-relaxed">
                      去 GitHub 给项目点个 Star（或 Follow），回来就能获取一个邀请码。
                    </p>
                    <div className="flex items-center gap-2">
                      <a
                        href={GITHUB_REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border-2 border-ink bg-paper-raised px-2.5 py-1.5 text-xs font-medium shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-cobalt-soft"
                      >
                        去 GitHub →
                      </a>
                      <button
                        type="button"
                        onClick={handleGetStarCode}
                        disabled={!starStatus.enabled || starLoading}
                        className="border-2 border-ink bg-cobalt px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-40"
                      >
                        {starLoading ? "..." : "我已 Star，获取邀请码"}
                      </button>
                    </div>
                    {starMessage && (
                      <p className="text-ink-muted">{starMessage}</p>
                    )}
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="border border-danger/40 bg-danger-soft/50 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full border-2 border-ink bg-cobalt px-4 py-2.5 text-sm font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm disabled:opacity-50"
            >
              {loading ? "..." : mode === "login" ? "登录" : "注册"}
            </button>
          </form>

          {/* Mode switch */}
          <div className="border-t border-ink/20 px-5 py-3 text-center text-sm">
            {mode === "login" ? (
              <span className="text-ink-muted">
                还没有账号？{" "}
                <button
                  type="button"
                  onClick={() => { setMode("register"); setError(null); }}
                  className="font-medium text-cobalt underline-offset-2 hover:underline"
                >
                  注册
                </button>
              </span>
            ) : (
              <span className="text-ink-muted">
                已有账号？{" "}
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(null); }}
                  className="font-medium text-cobalt underline-offset-2 hover:underline"
                >
                  登录
                </button>
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
