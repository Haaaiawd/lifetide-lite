"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { PixelIcon } from "@/components/art/PixelIcon";

type Stats = {
  counts: {
    users: number;
    sessions: number;
    activeSessions: number;
    workingMemories: number;
    waves: number;
    portraits: number;
    finalPlans: number;
    derivedInsights: number;
    derivedRoutes: number;
  };
  invites: {
    total: number;
    active: number;
    totalUses: number;
    codes: Array<{
      id: string;
      code: string;
      maxUses: number;
      usedCount: number;
      exhausted: boolean;
      note: string | null;
      createdAt: string;
    }>;
  };
  waveDistribution: Record<number, number>;
  recentUsers: Array<{
    id: string;
    email: string;
    createdAt: string;
    lastSessionAt: string | null;
  }>;
  recentSessions: Array<{
    id: string;
    userId: string | null;
    userEmail: string | null;
    expiresAt: string;
    createdAt: string;
    progress: string;
  }>;
};

type Tab = "overview" | "invites" | "users" | "sessions";

export default function AdminPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  // Invite generation form
  const [newMaxUses, setNewMaxUses] = useState(5);
  const [newNote, setNewNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 401 || res.status === 403) {
        setAuthError(true);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/invite-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxUses: newMaxUses, note: newNote || null }),
      });
      if (res.ok) {
        setNewNote("");
        await loadStats();
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteCode(id: string) {
    await fetch(`/api/admin/invite-codes?id=${id}`, { method: "DELETE" });
    await loadStats();
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  }

  if (authError) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-ink-muted">需要管理员权限</p>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="mt-3 border-2 border-ink bg-cobalt px-4 py-2 text-sm font-medium text-white shadow-md"
          >
            登录管理员账号
          </button>
        </div>
      </div>
    );
  }

  if (loading || !stats) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="flex items-center gap-2 text-ink-muted">
          <span className="inline-flex h-6 w-6 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
            <PixelIcon name="sparkle" size={12} className="text-cobalt" />
          </span>
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  const { counts, invites, waveDistribution, recentUsers, recentSessions } = stats;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      {/* Header */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="border-2 border-ink bg-paper-raised shadow-md">
          <div className="flex items-center justify-between border-b-2 border-ink bg-purple-soft px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center border-2 border-ink bg-paper-raised shadow-sm">
                <PixelIcon name="sparkle" size={12} className="text-purple" />
              </span>
              <span className="font-serif text-sm font-medium tracking-wide">管理员后台</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-ink/20">
            {([
              ["overview", "数据分析"],
              ["invites", "邀请码"],
              ["users", "用户"],
              ["sessions", "会话"],
            ] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === key
                    ? "border-b-2 border-purple bg-purple-soft/50 text-purple"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="用户" value={counts.users} color="cobalt" />
            <StatCard label="活跃会话" value={counts.activeSessions} color="teal" />
            <StatCard label="人格画像" value={counts.portraits} color="purple" />
            <StatCard label="奥德赛计划" value={counts.finalPlans} color="amber" />
            <StatCard label="总会话" value={counts.sessions} color="ink" />
            <StatCard label="WorkingMemory" value={counts.workingMemories} color="cobalt" />
            <StatCard label="Wave 记录" value={counts.waves} color="teal" />
            <StatCard label="邀请码使用" value={invites.totalUses} color="success" />
          </div>

          {/* Wave distribution */}
          <div className="border-2 border-ink bg-paper-raised p-4 shadow-sm">
            <h3 className="mb-3 font-serif text-sm font-medium">Wave 进度分布</h3>
            <div className="space-y-2">
              {Object.entries(waveDistribution)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([wave, count]) => {
                  const max = Math.max(...Object.values(waveDistribution), 1);
                  const pct = (count / max) * 100;
                  return (
                    <div key={wave} className="flex items-center gap-3">
                      <span className="w-16 text-xs text-ink-muted">Wave {wave}</span>
                      <div className="flex-1 border border-ink/20 bg-paper">
                        <div
                          className="h-5 bg-cobalt"
                          style={{ width: `${pct}%`, minWidth: count > 0 ? "20px" : "0" }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs font-medium">{count}</span>
                    </div>
                  );
                })}
              {Object.keys(waveDistribution).length === 0 && (
                <p className="text-sm text-ink-muted">暂无数据</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invites tab */}
      {tab === "invites" && (
        <div className="space-y-4">
          {/* Generate form */}
          <div className="border-2 border-ink bg-paper-raised p-4 shadow-sm">
            <h3 className="mb-3 font-serif text-sm font-medium">生成邀请码</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-ink-muted">可用次数</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(Number(e.target.value))}
                  className="w-24 border-2 border-ink bg-paper px-3 py-2 text-sm outline-none focus:border-cobalt"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-ink-muted">备注（可选）</label>
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="w-full border-2 border-ink bg-paper px-3 py-2 text-sm outline-none focus:border-cobalt"
                  placeholder="比如：第一批测试用户"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="border-2 border-ink bg-purple px-4 py-2 text-sm font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm disabled:opacity-50"
              >
                {generating ? "生成中..." : "生成"}
              </button>
            </div>
          </div>

          {/* Code list */}
          <div className="border-2 border-ink bg-paper-raised shadow-sm">
            <div className="border-b border-ink/20 px-4 py-2">
              <h3 className="font-serif text-sm font-medium">
                邀请码列表（{invites.total} 个，{invites.active} 个可用）
              </h3>
            </div>
            <div className="divide-y divide-ink/10">
              {invites.codes.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-ink-muted">还没有邀请码</div>
              )}
              {invites.codes.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-base font-bold tracking-wider">{c.code}</code>
                      <button
                        type="button"
                        onClick={() => copyCode(c.code)}
                        className="text-xs text-cobalt hover:underline"
                      >
                        {copiedCode === c.code ? "已复制" : "复制"}
                      </button>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                      <span>{c.usedCount}/{c.maxUses} 已用</span>
                      {c.exhausted && (
                        <span className="border border-danger/40 bg-danger-soft/50 px-1.5 py-0.5 text-[10px] text-danger">
                          已用完
                        </span>
                      )}
                      {c.note && <span>· {c.note}</span>}
                      <span>· {c.createdAt.slice(0, 10)}</span>
                    </div>
                  </div>
                  {/* Usage bar */}
                  <div className="hidden w-24 sm:block">
                    <div className="flex gap-0.5">
                      {Array.from({ length: c.maxUses }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-3 flex-1 border border-ink/30 ${
                            i < c.usedCount ? "bg-purple" : "bg-paper"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCode(c.id)}
                    className="text-xs text-danger hover:underline"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Users tab */}
      {tab === "users" && (
        <div className="border-2 border-ink bg-paper-raised shadow-sm">
          <div className="border-b border-ink/20 px-4 py-2">
            <h3 className="font-serif text-sm font-medium">用户（{counts.users}）</h3>
          </div>
          <div className="divide-y divide-ink/10">
            {recentUsers.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-ink-muted">还没有用户</div>
            )}
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{u.email}</div>
                  <div className="text-xs text-ink-muted">
                    注册于 {u.createdAt.slice(0, 10)}
                    {u.lastSessionAt && ` · 最近活跃 ${u.lastSessionAt.slice(0, 10)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sessions tab */}
      {tab === "sessions" && (
        <div className="border-2 border-ink bg-paper-raised shadow-sm">
          <div className="border-b border-ink/20 px-4 py-2">
            <h3 className="font-serif text-sm font-medium">
              会话（{counts.sessions} 总，{counts.activeSessions} 活跃）
            </h3>
          </div>
          <div className="divide-y divide-ink/10">
            {recentSessions.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-ink-muted">还没有会话</div>
            )}
            {recentSessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">
                    {s.userEmail ?? "guest"}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {s.progress} · 创建 {s.createdAt.slice(0, 16).replace("T", " ")} · 过期 {s.expiresAt.slice(0, 10)}
                  </div>
                </div>
                <div className={`border px-2 py-0.5 text-[10px] ${
                  new Date(s.expiresAt) > new Date()
                    ? "border-success/40 bg-success-soft/50 text-success"
                    : "border-ink/20 bg-paper text-ink-muted"
                }`}>
                  {new Date(s.expiresAt) > new Date() ? "活跃" : "过期"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    cobalt: "border-cobalt bg-cobalt-soft/50 text-cobalt",
    teal: "border-teal bg-teal-soft/50 text-teal",
    purple: "border-purple bg-purple-soft/50 text-purple",
    amber: "border-amber bg-amber-soft/50 text-amber",
    success: "border-success bg-success-soft/50 text-success",
    ink: "border-ink bg-paper-raised text-ink",
  };
  return (
    <div className={`border-2 p-3 shadow-sm ${colorMap[color] ?? colorMap.ink}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}
