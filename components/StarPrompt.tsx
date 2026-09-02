import { Star } from "@phosphor-icons/react";
import { GITHUB_URL } from "@/components/BrandMark";

type StarPromptProps = {
  /** Tailwind classes for the outer wrapper */
  className?: string;
  /** Compact mode — smaller padding, inline */
  compact?: boolean;
};

/**
 * A gentle, non-intrusive prompt inviting the user to star the repo on GitHub.
 * Designed to appear after meaningful AI-generated output (portrait, routes).
 */
export function StarPrompt({ className = "", compact = false }: StarPromptProps) {
  if (compact) {
    return (
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 border-2 border-ink bg-amber-soft px-3 py-1.5 text-xs font-medium text-ink shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] hover:bg-amber ${className}`}
      >
        <Star size={12} weight="fill" className="text-amber" />
        觉得有用？在 GitHub 给我们点 Star
      </a>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 border-2 border-ink bg-amber-soft/50 px-4 py-3 shadow-sm ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center border-2 border-ink bg-amber-soft shadow-sm">
          <Star size={16} weight="fill" className="text-amber" />
        </span>
        <div>
          <p className="text-sm font-medium text-ink">
            如果这个工具对你有帮助
          </p>
          <p className="text-xs text-ink-muted">
            在 GitHub 给我们点个 Star，让更多人看见它
          </p>
        </div>
      </div>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 border-2 border-ink bg-amber px-4 py-2 text-sm font-bold text-ink shadow-md transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-sm hover:bg-amber-soft"
      >
        去 Star
      </a>
    </div>
  );
}
