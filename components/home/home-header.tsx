import Link from "next/link";

function headerActionClassName(kind: "primary" | "secondary") {
  const base =
    "inline-flex min-h-[44px] items-center justify-center rounded-full px-4 text-[10px] font-semibold uppercase tracking-[0.2em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7cff00] focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:min-h-[46px] sm:px-5 sm:text-[11px]";

  if (kind === "primary") {
    return `${base} bg-[#7cff00] text-black shadow-[0_16px_34px_rgba(124,255,0,0.22)] hover:bg-[#b7ff58]`;
  }

  return `${base} border border-white/10 bg-white/[0.04] text-white/72 hover:border-white/18 hover:bg-white/[0.08] hover:text-white`;
}

export function HomeHeader() {
  return (
    <header className="page-shell safe-top-pad">
      <nav
        aria-label="Primary"
        className="flex items-center justify-between gap-3 rounded-[28px] border border-white/8 bg-black/35 px-4 py-3 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:px-5"
      >
        <Link
          href="/"
          className="text-lg font-semibold uppercase tracking-[0.28em] text-white focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7cff00] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          aria-label="BVRB3R home"
        >
          BVRB3R
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login" className={headerActionClassName("secondary")}>
            Log in
          </Link>
          <Link href="/signup" className={headerActionClassName("primary")}>
            Create account
          </Link>
        </div>
      </nav>
    </header>
  );
}
