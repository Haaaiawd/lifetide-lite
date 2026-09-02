import Link from "next/link";
import Image from "next/image";

const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/Haaaiawd/lifetide-lite";

export function BrandMark() {
  return (
    <Link
      href="/"
      className="pointer-events-auto flex items-center gap-2 border-2 border-ink bg-paper-raised px-2.5 py-1.5 shadow-sm transition-transform active:translate-x-[1px] active:translate-y-[1px] hover:bg-cobalt-soft"
    >
      <Image
        src="/logo.svg"
        alt="人生试运行"
        width={24}
        height={24}
        priority
        className="shrink-0"
      />
      <span className="hidden font-serif text-sm font-bold tracking-wide text-ink sm:block">
        人生试运行
      </span>
    </Link>
  );
}

export { GITHUB_URL };
