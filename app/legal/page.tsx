import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  LEGAL_HUB_DOCUMENTS,
  resolveLegalHubDocument,
  type LegalHubDocumentKey
} from "@/lib/legal/hub-documents";

export const metadata: Metadata = {
  title: "Legal | BVRB3R",
  description: "Read BVRB3R's published legal documents and see which legal surfaces are still awaiting counsel approval."
};

type LegalPageProps = {
  searchParams?: Promise<{
    document?: string | string[];
  }>;
};

function legalHref(key: LegalHubDocumentKey) {
  switch (key) {
    case "privacy":
      return "/legal?document=privacy" as const;
    case "community":
      return "/legal?document=community-guidelines" as const;
    case "paymentTerms":
      return "/legal?document=payment-terms" as const;
    default:
      return "/legal" as const;
  }
}

export default async function LegalPage({ searchParams }: LegalPageProps) {
  const params = searchParams ? await searchParams : {};
  const requestedDocument = Array.isArray(params.document) ? params.document[0] : params.document;
  const selected = resolveLegalHubDocument(requestedDocument);

  return (
    <main className="min-h-screen overflow-hidden bg-[#060708] px-5 py-8 text-[#F5F1E8] sm:px-8 sm:py-12">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgba(196,242,78,0.08),transparent_62%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-[900px]">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/"
            className="font-display text-[13px] font-extrabold tracking-[0.28em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/70"
            aria-label="BVRB3R home"
          >
            BVRB<span className="text-[#C4F24E]">3</span>R
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#C9A87C]">
            Legal — in plain words first
          </span>
        </header>

        <nav
          aria-label="Legal documents"
          className="mt-7 grid gap-2 rounded-[24px] border border-white/10 bg-white/[0.025] p-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {(Object.entries(LEGAL_HUB_DOCUMENTS) as Array<[
            LegalHubDocumentKey,
            (typeof LEGAL_HUB_DOCUMENTS)[LegalHubDocumentKey]
          ]>).map(([key, item]) => {
            const active = key === selected.key;
            const pending = item.status === "counsel_pending";

            return (
              <Link
                key={key}
                href={legalHref(key)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center justify-between gap-3 rounded-[18px] border px-4 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/70 ${
                  active
                    ? "border-[#C4F24E]/45 bg-[#C4F24E] text-[#060708]"
                    : "border-transparent text-white/62 hover:border-white/12 hover:bg-white/[0.045] hover:text-white"
                }`}
              >
                <span>{item.shortLabel}</span>
                {pending ? (
                  <span
                    className={`font-mono text-[8px] uppercase tracking-[0.13em] ${active ? "text-black/58" : "text-amber-200/66"}`}
                  >
                    Pending
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <article className="mt-8" data-legal-document={selected.key} data-legal-status={selected.document.status}>
          <header className="border-b border-white/8 pb-7">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 font-mono text-[9px] uppercase tracking-[0.18em] ${
                  selected.document.status === "published"
                    ? "border-[#C4F24E]/24 bg-[#C4F24E]/8 text-[#E4F9B8]"
                    : "border-amber-300/24 bg-amber-300/8 text-amber-100"
                }`}
              >
                {selected.document.status === "published" ? (
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {selected.document.status === "published" ? "Published" : "Counsel review required"}
              </span>
              {selected.document.status === "counsel_pending" ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/38">
                  Not accepted
                </span>
              ) : null}
            </div>

            <h1 className="mt-5 font-serif text-[clamp(2.8rem,8vw,4.8rem)] font-normal leading-[0.98] text-white">
              {selected.document.label}<span className="text-[#C4F24E]">.</span>
            </h1>

            {selected.document.status === "published" ? (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/42">
                Version {selected.document.version} · Effective {selected.document.effectiveDate}
              </p>
            ) : (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-100/62">
                Not published · Not effective · Not eligible for acceptance
              </p>
            )}
          </header>

          <section
            className={`mt-6 rounded-[24px] border p-5 sm:p-6 ${
              selected.document.status === "published"
                ? "border-[#C4F24E]/25 bg-[#C4F24E]/[0.055]"
                : "border-amber-300/20 bg-amber-300/[0.055]"
            }`}
            {...(selected.document.status === "counsel_pending" ? { role: "status" as const } : {})}
          >
            <p
              className={`font-mono text-[9px] uppercase tracking-[0.24em] ${
                selected.document.status === "published" ? "text-[#C4F24E]" : "text-amber-200"
              }`}
            >
              The plain-words version
            </p>
            <p className="mt-3 text-[15px] leading-7 text-white/82">{selected.document.plainWords}</p>
          </section>

          <div className="mt-2">
            {selected.document.sections.map((section, index) => (
              <section
                key={section.title}
                className="grid gap-3 border-b border-white/8 py-6 sm:grid-cols-[2.2rem_1fr] sm:gap-4"
              >
                <span className="font-mono text-[11px] text-[#C9A87C]" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2 className="text-lg font-extrabold leading-tight text-white">{section.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-white/62">{section.body}</p>
                </div>
              </section>
            ))}
          </div>

          {selected.document.status === "published" ? (
            <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-white/8 bg-white/[0.025] p-4">
              <p className="text-sm leading-6 text-white/48">
                This is a plain-language reader for the existing document. The standalone published document is the controlling text.
              </p>
              <Link
                href={selected.document.sourceHref}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#C4F24E]/30 px-4 text-sm font-extrabold text-[#C4F24E] transition hover:bg-[#C4F24E]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/70"
              >
                Open published document
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="mt-7 rounded-[22px] border border-amber-300/18 bg-black/22 p-5">
              <p className="text-sm font-extrabold text-amber-100">Acceptance is unavailable.</p>
              <p className="mt-2 text-sm leading-6 text-white/52">
                BVRB3R will not store or imply Payment Terms acceptance before counsel approves and the platform publishes an exact dated version.
              </p>
              <button
                type="button"
                disabled
                className="mt-4 inline-flex min-h-11 cursor-not-allowed items-center rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/34"
              >
                Acceptance unavailable
              </button>
            </div>
          )}

          <footer className="mt-8 flex flex-wrap gap-5 border-t border-white/8 pt-6 text-sm text-white/46">
            <Link href="/data-rights" className="underline decoration-white/20 underline-offset-4 hover:text-white">
              Data Rights
            </Link>
            <Link href="/" className="underline decoration-white/20 underline-offset-4 hover:text-white">
              Return home
            </Link>
          </footer>
        </article>
      </div>
    </main>
  );
}
