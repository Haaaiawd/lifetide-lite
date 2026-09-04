"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import { PixelIcon } from "@/components/art/PixelIcon";
import { GitHubIcon, XiaohongshuIcon } from "@/components/art/SocialIcons";

type Mode = "login" | "register";

const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/Haaaiawd/lifetide-lite";
const XIAOHONGSHU_URL = "https://xhslink.com/m/8BTBv4WZsmn";

interface SocialStatus {
  enabled: boolean;
  remaining: number;
  total: number;
  used: number;
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

  // Social campaign state
  const [socialStatus, setSocialStatus] = useState<SocialStatus | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialMessage, setSocialMessage] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [claimedCode, setClaimedCode] = useState<string | null>(null);
  const [clickedPlatform, setClickedPlatform] = useState<"github" | "xhs" | null>(null);

  const fetchSocialStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/invite/social");
      if (res.ok) {
        const data = await res.json();
        setSocialStatus(data);
      }
    } catch {
      // silently ignore — social section is optional
    }
  }, []);

  useEffect(() => {
    if (mode === "register") {
      fetchSocialStatus();
    }
  }, [mode, fetchSocialStatus]);

  function handlePlatformClick(platform: "github" | "xhs") {
    setClickedPlatform(platform);
    const url = platform === "github" ? GITHUB_URL : XIAOHONGSHU_URL;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleClaimCode() {
    setSocialLoading(true);
    setSocialMessage(null);
    try {
      const res = await fetch("/api/invite/social", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.code) {
        setClaimedCode(data.code);
        setInviteCode(data.code);
        setShowCodeModal(true);
        setSocialStatus((prev) =>
          prev ? { ...prev, remaining: data.remaining, total: data.total, used: data.used } : prev,
        );
      } else {
        setSocialMessage(data.error ?? "名额已用完");
        setSocialStatus((prev) =>
          prev ? { ...prev, enabled: false, remaining: 0 } : prev,
        );
      }
    } catch {
      setSocialMessage("网络错误，请重试");
    } finally {
      setSocialLoading(false);
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

                {/* Social campaign section */}
                {socialStatus && (
                  <div className="border-2 border-ink/20 bg-paper px-3 py-3 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ink">没有邀请码？</span>
                      {socialStatus.enabled ? (
                        <span className="text-success">
                          剩余名额：{socialStatus.remaining} / {socialStatus.total}
                        </span>
                      ) : (
                        <span className="text-danger">名额已用完</span>
                      )}
                    </div>
                    <p className="text-ink-muted leading-relaxed">
                      去 GitHub 给项目点个 Star，或者去小红书点个关注，回来就能获取一个邀请码。
                    </p>
                    {/* Platform buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handlePlatformClick("github")}
                        className="flex items-center justify-center gap-1.5 border-2 border-ink bg-paper-raised px-2.5 py-2 text-xs font-medium shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-cobalt-soft"
                      >
                        <GitHubIcon size={14} className="text-ink" />
                        去 GitHub
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlatformClick("xhs")}
                        className="flex items-center justify-center gap-1.5 border-2 border-ink bg-paper-raised px-2.5 py-2 text-xs font-medium shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-danger-soft"
                      >
                        <XiaohongshuIcon size={14} className="text-danger" />
                        去小红书
                      </button>
                    </div>
                    {/* Claim button — enabled after user clicked a platform link */}
                    <button
                      type="button"
                      onClick={handleClaimCode}
                      disabled={!socialStatus.enabled || socialLoading || !clickedPlatform}
                      className="w-full border-2 border-ink bg-cobalt px-2.5 py-2 text-xs font-medium text-white shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-40"
                    >
                      {socialLoading
                        ? "..."
                        : clickedPlatform
                          ? `我已${clickedPlatform === "github" ? " Star" : "关注"}，获取邀请码`
                          : "先点击上方链接，再回来获取"}
                    </button>
                    {socialMessage && (
                      <p className="text-ink-muted">{socialMessage}</p>
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

      {/* Code reveal modal */}
      <AnimatePresence>
        {showCodeModal && claimedCode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
            onClick={() => setShowCodeModal(false)}
          >
            <motion.div
              initial={reduce ? false : { scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={reduce ? undefined : { scale: 0.9, y: 10 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-xs border-2 border-ink bg-paper-raised shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b-2 border-ink bg-success-soft/50 px-4 py-2">
                <span className="font-serif text-sm font-medium">邀请码已获取</span>
              </div>
              <div className="space-y-3 p-5 text-center">
                <p className="text-xs text-ink-muted">已自动填入注册表单，完成注册即可</p>
                <code className="block select-all font-mono text-2xl font-bold tracking-[0.2em] text-cobalt">
                  {claimedCode}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(claimedCode);
                  }}
                  className="border-2 border-ink bg-paper-raised px-3 py-1.5 text-xs font-medium shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-cobalt-soft"
                >
                  复制邀请码
                </button>
                <button
                  type="button"
                  onClick={() => setShowCodeModal(false)}
                  className="block w-full text-xs text-ink-muted hover:text-ink"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
