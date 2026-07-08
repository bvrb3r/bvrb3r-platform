import Link from "next/link";

export function HomeHeader() {
  return (
    <header className="page-shell safe-top-pad">
      <nav
        aria-label="Primary"
        className="flex items-center justify-center rounded-[28px] border border-white/8 bg-black/35 px-4 py-3 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:justify-start sm:px-5"
      >
        <Link
          href="/"
          className="text-lg font-semibold uppercase tracking-[0.28em] text-white focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4f24e] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          aria-label="BVRB3R home"
        >
          BVRB3R
        </Link>
      </nav>
    </header>
  );
}
