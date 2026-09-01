"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { PixelIcon } from "@/components/art/PixelIcon";

type AuthUser = { id: string; email: string };

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";

export function GlobalNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setUser(data.user ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMenuOpen(false);
    router.push("/play");
  }

  // Don't show nav on login page
  if (pathname === "/login") return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50">
      <div className="pointer-events-auto flex items-center gap-2">
        {user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 border-2 border-ink bg-paper-raised px-2.5 py-1.5 text-sm shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px]"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center border border-ink bg-cobalt-soft">
                <PixelIcon name="sparkle" size={10} className="text-cobalt" />
              </span>
              <span className="max-w-[120px] truncate text-xs font-medium text-ink">
                {user.email}
              </span>
              <span className="text-[10px] text-ink-muted">▾</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 border-2 border-ink bg-paper-raised shadow-md">
                <button
                  type="button"
                  onClick={() => { router.push("/account"); setMenuOpen(false); }}
                  className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-cobalt-soft"
                >
                  个人中心
                </button>
                {user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && (
                  <button
                    type="button"
                    onClick={() => { router.push("/admin"); setMenuOpen(false); }}
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-purple-soft/50"
                  >
                    管理员后台
                  </button>
                )}
                <div className="border-t border-ink/20" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft/50"
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="border-2 border-ink bg-paper-raised px-3 py-1.5 text-sm font-medium text-ink shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] hover:bg-cobalt-soft"
          >
            登录
          </button>
        )}
      </div>
    </div>
  );
}
