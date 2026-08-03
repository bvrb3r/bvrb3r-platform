"use client";

export default function AppIdentityError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#060708] px-5 text-[#F5F1E8]">
      <section className="w-full max-w-lg rounded-[30px] border border-white/10 bg-white/[0.035] p-8 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#D9B461]">App ID needs attention</p>
        <h1 className="mt-4 font-serif text-4xl">The card could not load safely.</h1>
        <p className="mt-4 text-sm leading-7 text-white/58">No unsigned or guessed code was shown. Retry the server-owned App ID authority.</p>
        <button type="button" onClick={reset} className="mt-7 min-h-12 rounded-full bg-[#C4F24E] px-6 text-sm font-black text-black">
          Try again
        </button>
      </section>
    </main>
  );
}
