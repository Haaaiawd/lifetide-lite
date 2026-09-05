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
      source: string;
      createdAt: string;
    }>;
  };
  waveDistribution: Record<number, number>;
  recentUsers: Array<{
    id: string;
    email: string;
    createdAt: string;
    banned: boolean;
    bannedAt: string | null;
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

type AdminUser = {
  id: string;
  email: string;
  createdAt: string;
  banned: boolean;
  bannedAt: string | null;
  lastSessionAt: string | null;
};

type Tab = "overview" | "invites" | "users" | "sessions" | "logs";

type ProgressData = {
  meta: {
    session_id: string;
    user_email: string;
    created_at: string;
    last_wave_index: number;
    revision: number;
  };
  dialogue: Array<{
    wave_index: number;
    wave_id: string;
    status: string;
    created_at: string;
    qa_pairs: Array<{
      question_id: string;
      question_text: string;
      question_type: string;
      answer_value: string | null;
      answered_at: string | null;
    }>;
  }>;
  radar: Array<{
    dimension: string;
    state: string;
    reason: string;
    evidence_count: number;
    updated_at: string;
  }>;
  last_insight: {
    wave_id: string;
    user_told_me: string;
    current_reading: string;
    important_unknown: string;
    route_impact: string;
    language_strength: string;
    radar_deltas: Array<{ dimension: string; from: string; to: string }>;
    generated_at: string;
  } | null;
  route_intents: Array<{ id: string; label: string; status: string; evidence_count: number }>;
  portrait: { essence: string; trait_summary: string; generated: boolean } | null;
  final_plan: { lives: Array<{ title: string; ordinary_day_summary: string }>; generated: boolean } | null;
  streaming_insight: { partial: boolean; user_told_me?: string } | null;
};

const RADAR_DIMENSION_LABELS: Record<string, string> = {
  traits: "特质",
  motivation: "动机",
  capabilities: "能力",
  relationships: "关系",
  environment: "环境",
  narrative: "叙事",
};

const RADAR_STATE_LABELS: Record<string, string> = {
  unseen: "未观察",
  signaled: "已信号",
  grounded: "已落地",
  conflicted: "冲突",
  declined: "已拒绝",
};

const RADAR_STATE_COLORS: Record<string, string> = {
  unseen: "border-ink/20 bg-paper text-ink-muted",
  signaled: "border-cobalt/40 bg-cobalt-soft/50 text-cobalt",
  grounded: "border-success/40 bg-success-soft/50 text-success",
  conflicted: "border-amber/40 bg-amber-soft/50 text-amber",
  declined: "border-danger/40 bg-danger-soft/50 text-danger",
};

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

  // Logs
  type LogEntry = {
    id: string;
    sessionId: string;
    waveId: string | null;
    purpose: string;
    status: string;
    modelConfigId: string;
    promptVersion: string;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number | null;
    createdAt: string;
  };
  type LogData = {
    summary: { total: number; errors: number; successes: number; errorRate: string };
    logs: LogEntry[];
  };
  const [logData, setLogData] = useState<LogData | null>(null);
  const [logFilter, setLogFilter] = useState<"error" | "all">("error");

  // Users (full list for user management)
  const [userList, setUserList] = useState<AdminUser[] | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [banActionId, setBanActionId] = useState<string | null>(null);

  // Social campaign
  type SocialCampaign = {
    enabled: boolean;
    campaign: {
      id: string;
      code: string;
      maxUses: number;
      usedCount: number;
      remaining: number;
      exhausted: boolean;
    } | null;
  };
  const [socialCampaign, setSocialCampaign] = useState<SocialCampaign | null>(null);
  const [socialMaxUses, setSocialMaxUses] = useState(50);
  const [socialSaving, setSocialSaving] = useState(false);

  const loadLogs = useCallback(async (filter: "error" | "all") => {
    try {
      const url = filter === "error"
        ? "/api/admin/logs?status=error&limit=50"
        : "/api/admin/logs?limit=50";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setLogData(data);
    } catch {}
  }, []);

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

  const loadUsers = useCallback(async () => {
    setUserLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUserList(data.users);
      }
    } finally {
      setUserLoading(false);
    }
  }, []);

  async function handleBan(userId: string) {
    setBanActionId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, { method: "POST" });
      if (res.ok) {
        await loadUsers();
      }
    } finally {
      setBanActionId(null);
    }
  }

  async function handleUnban(userId: string) {
    setBanActionId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, { method: "DELETE" });
      if (res.ok) {
        await loadUsers();
      }
    } finally {
      setBanActionId(null);
    }
  }

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

  const loadSocialCampaign = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/invite-codes/social");
      if (res.ok) {
        const data = await res.json();
        setSocialCampaign(data);
        if (data.campaign) {
          setSocialMaxUses(data.campaign.maxUses);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (tab === "invites") {
      loadSocialCampaign();
    }
  }, [tab, loadSocialCampaign]);

  async function handleSaveSocialCampaign() {
    setSocialSaving(true);
    try {
      const res = await fetch("/api/admin/invite-codes/social", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxUses: socialMaxUses }),
      });
      if (res.ok) {
        await Promise.all([loadSocialCampaign(), loadStats()]);
      }
    } finally {
      setSocialSaving(false);
    }
  }

  // Debug export
  const [exportingId, setExportingId] = useState<string | null>(null);

  // Progress viewer
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [progressLoadingId, setProgressLoadingId] = useState<string | null>(null);

  async function handleViewProgress(sessionId: string) {
    if (progressData?.meta.session_id === sessionId) {
      setProgressData(null);
      return;
    }
    setProgressLoadingId(sessionId);
    try {
      const res = await fetch(`/api/admin/debug/progress?session_id=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setProgressData(data);
      }
    } finally {
      setProgressLoadingId(null);
    }
  }

  async function handleExport(sessionId: string, format: "txt" | "json") {
    setExportingId(sessionId);
    try {
      const res = await fetch(
        `/api/admin/debug/export?session_id=${sessionId}&format=${format}`,
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="(.+?)"/);
      a.download = match ? match[1] : `debug_${sessionId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportingId(null);
    }
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

  const { counts, invites, waveDistribution, recentSessions } = stats;

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
              ["logs", "日志"],
            ] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  if (key === "logs" && !logData) loadLogs(logFilter);
                  if (key === "users" && !userList) loadUsers();
                }}
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
          {/* Social campaign management */}
          <div className="border-2 border-purple/40 bg-purple-soft/30 p-4 shadow-sm">
            <h3 className="mb-3 font-serif text-sm font-medium">
              社交活动名额（GitHub Star / 小红书关注）
            </h3>
            {socialCampaign?.campaign ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs">
                  <code className="font-mono text-base font-bold tracking-wider text-purple">
                    {socialCampaign.campaign.code}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyCode(socialCampaign.campaign!.code)}
                    className="text-xs text-cobalt hover:underline"
                  >
                    {copiedCode === socialCampaign.campaign.code ? "已复制" : "复制"}
                  </button>
                  <span className="text-ink-muted">
                    {socialCampaign.campaign.usedCount} / {socialCampaign.campaign.maxUses} 已用
                    {" · "}
                    剩余 {socialCampaign.campaign.remaining}
                  </span>
                  {socialCampaign.campaign.exhausted && (
                    <span className="border border-danger/40 bg-danger-soft/50 px-1.5 py-0.5 text-[10px] text-danger">
                      已用完
                    </span>
                  )}
                </div>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-ink-muted">名额总数</label>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={socialMaxUses}
                      onChange={(e) => setSocialMaxUses(Number(e.target.value))}
                      className="w-28 border-2 border-ink bg-paper px-3 py-2 text-sm outline-none focus:border-cobalt"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSocialCampaign}
                    disabled={socialSaving}
                    className="border-2 border-ink bg-purple px-4 py-2 text-sm font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm disabled:opacity-50"
                  >
                    {socialSaving ? "保存中..." : "保存名额"}
                  </button>
                </div>
                <p className="text-xs text-ink-muted">
                  用户在注册页点「去 GitHub」或「去小红书」后，回来点确认即可获取此邀请码。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-ink-muted">
                  还没有社交活动邀请码。设置一个名额数即可创建。
                </p>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-ink-muted">名额总数</label>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={socialMaxUses}
                      onChange={(e) => setSocialMaxUses(Number(e.target.value))}
                      className="w-28 border-2 border-ink bg-paper px-3 py-2 text-sm outline-none focus:border-cobalt"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSocialCampaign}
                    disabled={socialSaving}
                    className="border-2 border-ink bg-purple px-4 py-2 text-sm font-medium text-white shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm disabled:opacity-50"
                  >
                    {socialSaving ? "创建中..." : "创建社交活动"}
                  </button>
                </div>
              </div>
            )}
          </div>

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
                      {c.source === "social" && (
                        <span className="border border-purple/40 bg-purple-soft/50 px-1.5 py-0.5 text-[10px] text-purple">
                          社交活动
                        </span>
                      )}
                      {c.note && <span>· {c.note}</span>}
                      <span>· {c.createdAt.slice(0, 10)}</span>
                    </div>
                  </div>
                  {/* Usage bar — capped at 20 segments to avoid DOM explosion on large maxUses */}
                  <div className="hidden w-24 sm:block">
                    <div className="flex gap-0.5">
                      {Array.from({ length: Math.min(c.maxUses, 20) }).map((_, i) => {
                        const filledCount = Math.round((c.usedCount / c.maxUses) * Math.min(c.maxUses, 20));
                        return (
                          <div
                            key={i}
                            className={`h-3 flex-1 border border-ink/30 ${
                              i < filledCount ? "bg-purple" : "bg-paper"
                            }`}
                          />
                        );
                      })}
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
          <div className="flex items-center justify-between border-b border-ink/20 px-4 py-2">
            <h3 className="font-serif text-sm font-medium">用户（{userList?.length ?? counts.users}）</h3>
            <button
              type="button"
              onClick={() => loadUsers()}
              disabled={userLoading}
              className="text-xs text-cobalt hover:underline disabled:opacity-50"
            >
              {userLoading ? "加载中..." : "刷新"}
            </button>
          </div>
          <div className="divide-y divide-ink/10">
            {!userList && (
              <div className="px-4 py-6 text-center text-sm text-ink-muted">
                {userLoading ? "加载中..." : "点击「刷新」加载用户列表"}
              </div>
            )}
            {userList && userList.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-ink-muted">还没有用户</div>
            )}
            {userList && userList.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{u.email}</span>
                    {u.banned && (
                      <span className="shrink-0 border border-danger/40 bg-danger-soft/50 px-1.5 py-0.5 text-[10px] text-danger">
                        已封禁
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted">
                    注册于 {u.createdAt.slice(0, 10)}
                    {u.lastSessionAt && ` · 最近活跃 ${u.lastSessionAt.slice(0, 10)}`}
                    {u.banned && u.bannedAt && ` · 封禁于 ${u.bannedAt.slice(0, 10)}`}
                  </div>
                </div>
                {u.banned ? (
                  <button
                    type="button"
                    onClick={() => handleUnban(u.id)}
                    disabled={banActionId === u.id}
                    className="shrink-0 border-2 border-ink bg-success px-3 py-1 text-xs font-medium text-white shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
                  >
                    {banActionId === u.id ? "..." : "解封"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleBan(u.id)}
                    disabled={banActionId === u.id}
                    className="shrink-0 border-2 border-ink bg-danger px-3 py-1 text-xs font-medium text-white shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
                  >
                    {banActionId === u.id ? "..." : "封禁"}
                  </button>
                )}
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
              <div key={s.id}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {s.userEmail ?? "guest"}
                    </div>
                    <div className="truncate text-xs text-ink-muted">
                      {s.progress} · 创建 {s.createdAt.slice(0, 16).replace("T", " ")} · 过期 {s.expiresAt.slice(0, 10)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleViewProgress(s.id)}
                      disabled={progressLoadingId === s.id}
                      className="border-2 border-ink bg-purple px-2 py-1 text-[10px] font-medium text-white shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-purple/80 disabled:opacity-50"
                    >
                      {progressLoadingId === s.id ? "..." : progressData?.meta.session_id === s.id ? "收起" : "进展"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport(s.id, "txt")}
                      disabled={exportingId === s.id}
                      className="border-2 border-ink bg-paper-raised px-2 py-1 text-[10px] font-medium shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-cobalt-soft disabled:opacity-50"
                    >
                      {exportingId === s.id ? "..." : "TXT"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport(s.id, "json")}
                      disabled={exportingId === s.id}
                      className="border-2 border-ink bg-paper-raised px-2 py-1 text-[10px] font-medium shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-cobalt-soft disabled:opacity-50"
                    >
                      {exportingId === s.id ? "..." : "JSON"}
                    </button>
                    <div className={`border px-2 py-0.5 text-[10px] ${
                      new Date(s.expiresAt) > new Date()
                        ? "border-success/40 bg-success-soft/50 text-success"
                        : "border-ink/20 bg-paper text-ink-muted"
                    }`}>
                      {new Date(s.expiresAt) > new Date() ? "活跃" : "过期"}
                    </div>
                  </div>
                </div>
                {/* Progress panel */}
                {progressData?.meta.session_id === s.id && (
                  <ProgressPanel data={progressData} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs tab */}
      {tab === "logs" && (
        <div className="space-y-4">
          {/* Filter + summary */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setLogFilter("error"); loadLogs("error"); }}
                className={`border-2 border-ink px-3 py-1.5 text-sm font-medium ${
                  logFilter === "error" ? "bg-danger text-white" : "bg-paper-raised text-ink"
                }`}
              >
                仅错误
              </button>
              <button
                type="button"
                onClick={() => { setLogFilter("all"); loadLogs("all"); }}
                className={`border-2 border-ink px-3 py-1.5 text-sm font-medium ${
                  logFilter === "all" ? "bg-cobalt text-white" : "bg-paper-raised text-ink"
                }`}
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => loadLogs(logFilter)}
                className="border-2 border-ink bg-paper-raised px-3 py-1.5 text-sm text-ink-muted"
              >
                刷新
              </button>
            </div>
            {logData && (
              <div className="text-xs text-ink-muted">
                {logData.summary.errors} 错误 / {logData.summary.total} 总计 · 错误率 {logData.summary.errorRate}
              </div>
            )}
          </div>

          {/* Log table */}
          <div className="border-2 border-ink bg-paper-raised shadow-sm">
            <div className="divide-y divide-ink/10">
              {!logData && (
                <div className="px-4 py-6 text-center text-sm text-ink-muted">
                  {logFilter === "error" ? "点击「仅错误」或「全部」加载日志" : "加载中…"}
                </div>
              )}
              {logData && logData.logs.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-ink-muted">
                  {logFilter === "error" ? "没有错误记录 🎉" : "没有日志记录"}
                </div>
              )}
              {logData && logData.logs.map((log) => (
                <div key={log.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block border px-1.5 py-0.5 text-[10px] font-medium ${
                      log.status === "error"
                        ? "border-danger/40 bg-danger-soft/50 text-danger"
                        : "border-success/40 bg-success-soft/50 text-success"
                    }`}>
                      {log.status}
                    </span>
                    <span className="text-sm font-medium">{log.purpose}</span>
                    <span className="text-xs text-ink-muted">{log.modelConfigId}</span>
                    {log.waveId && (
                      <span className="text-xs text-ink-muted">· {log.waveId}</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-ink-muted">
                    <span>{log.createdAt.slice(0, 19).replace("T", " ")}</span>
                    {log.latencyMs != null && <span>{log.latencyMs}ms</span>}
                    {log.inputTokens != null && <span>in:{log.inputTokens}</span>}
                    {log.outputTokens != null && <span>out:{log.outputTokens}</span>}
                    <span className="truncate">session={log.sessionId.slice(0, 8)}</span>
                  </div>
                </div>
              ))}
            </div>
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

function ProgressPanel({ data }: { data: ProgressData }) {
  return (
    <div className="border-t border-ink/10 bg-paper/50 px-4 py-4 space-y-4">
      {/* Meta */}
      <div className="flex flex-wrap gap-3 text-xs text-ink-muted">
        <span>Wave {data.meta.last_wave_index}</span>
        <span>Revision {data.meta.revision}</span>
        <span>{data.meta.user_email}</span>
        {data.streaming_insight && (
          <span className="border border-amber/40 bg-amber-soft/50 px-1.5 py-0.5 text-amber">
            流式中断
          </span>
        )}
      </div>

      {/* Radar */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-ink">六维观察</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.radar.map((cell) => (
            <div
              key={cell.dimension}
              className={`border px-2 py-1.5 text-xs ${RADAR_STATE_COLORS[cell.state] ?? RADAR_STATE_COLORS.unseen}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {RADAR_DIMENSION_LABELS[cell.dimension] ?? cell.dimension}
                </span>
                <span className="text-[10px]">
                  {RADAR_STATE_LABELS[cell.state] ?? cell.state}
                </span>
              </div>
              <div className="mt-1 line-clamp-2 text-[10px] opacity-80">
                {cell.reason}
              </div>
              <div className="mt-0.5 text-[10px] opacity-60">
                {cell.evidence_count} 条证据
              </div>
            </div>
          ))}
          {data.radar.length === 0 && (
            <span className="text-xs text-ink-muted">暂无 radar 数据</span>
          )}
        </div>
      </div>

      {/* Last insight */}
      {data.last_insight && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-ink">最近一条理解</h4>
          <div className="border border-ink/20 bg-paper p-3 text-xs space-y-2">
            <div>
              <span className="text-ink-muted">用户说：</span>
              <span>{data.last_insight.user_told_me}</span>
            </div>
            <div>
              <span className="text-ink-muted">我的解读：</span>
              <span>{data.last_insight.current_reading}</span>
            </div>
            <div>
              <span className="text-ink-muted">还不确定：</span>
              <span>{data.last_insight.important_unknown}</span>
            </div>
            <div>
              <span className="text-ink-muted">路线影响：</span>
              <span>{data.last_insight.route_impact}</span>
            </div>
            {data.last_insight.radar_deltas.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.last_insight.radar_deltas.map((d, i) => (
                  <span key={i} className="border border-ink/20 px-1 py-0.5 text-[10px]">
                    {RADAR_DIMENSION_LABELS[d.dimension] ?? d.dimension}: {d.from} → {d.to}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[10px] text-ink-muted">
              {data.last_insight.language_strength} · {(data.last_insight.generated_at ?? "").slice(0, 16).replace("T", " ") || "—"}
            </div>
          </div>
        </div>
      )}

      {/* Route intents */}
      {data.route_intents.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-ink">路线意图（{data.route_intents.length}）</h4>
          <div className="flex flex-wrap gap-2">
            {data.route_intents.map((r) => (
              <div key={r.id} className="border border-ink/20 bg-paper px-2 py-1 text-xs">
                <span className="font-medium">{r.label}</span>
                <span className="ml-1 text-[10px] text-ink-muted">
                  {r.status} · {r.evidence_count} 证据
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Portrait */}
      {data.portrait && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-ink">人格画像</h4>
          <div className="border border-ink/20 bg-paper p-3 text-xs space-y-1">
            <div><span className="text-ink-muted">核心：</span>{data.portrait.essence}</div>
            <div><span className="text-ink-muted">特质：</span>{data.portrait.trait_summary}</div>
          </div>
        </div>
      )}

      {/* Final plan */}
      {data.final_plan && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-ink">三条平行人生</h4>
          <div className="space-y-2">
            {data.final_plan.lives.map((life, i) => (
              <div key={i} className="border border-ink/20 bg-paper p-2 text-xs">
                <div className="font-medium">{life.title}</div>
                <div className="mt-0.5 text-[10px] text-ink-muted">
                  {life.ordinary_day_summary}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialogue */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-ink">对话记录（{data.dialogue.length} 波）</h4>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {data.dialogue.map((wave) => (
            <div key={wave.wave_id} className="border-l-2 border-ink/20 pl-3">
              <div className="text-[10px] font-medium text-ink-muted">
                Wave {wave.wave_index} · {wave.status}
              </div>
              {wave.qa_pairs.map((qa, i) => (
                <div key={qa.question_id} className="mt-1.5 text-xs">
                  <div className="text-ink">
                    <span className="text-ink-muted">Q{i + 1}:</span> {qa.question_text}
                  </div>
                  <div className="ml-4 text-ink-muted">
                    {qa.answer_value ?? "(未回答)"}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {data.dialogue.length === 0 && (
            <span className="text-xs text-ink-muted">暂无对话数据</span>
          )}
        </div>
      </div>
    </div>
  );
}
