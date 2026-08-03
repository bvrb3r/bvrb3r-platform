import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { getAuthorizedUser } from "@/lib/auth/guards";
import {
  PRODUCT_PR27_LEGAL_DRAFTS,
  resolveProductPr27LegalDraft
} from "@/lib/legal/product-pr27-drafts";

export default async function ProductPr27LegalDraftsPage({
  searchParams
}: {
  searchParams: Promise<{ document?: string }>;
}) {
  await getAuthorizedUser(["platform_admin", "architect"]);
  const params = await searchParams;
  const selected = resolveProductPr27LegalDraft(params.document);
  const content = await readFile(
    path.join(process.cwd(), "content/legal", selected.document.fileName),
    "utf8"
  );

  return (
    <main className="min-h-screen bg-[#060708] px-5 py-8 text-[#F5F1E8] sm:px-8">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <Link href="/" className="font-display text-sm font-black tracking-[0.28em] text-white">BVRB3R</Link>
        <span className="rounded-full border border-[#FF9B9B]/30 bg-[#FF9B9B]/8 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#FFB0B0]">
          Draft · counsel review required
        </span>
      </header>

      <section className="mx-auto max-w-6xl py-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#C9A87C]">
          Product PR27 · legal source integrity
        </p>
        <h1 className="mt-3 font-serif text-5xl">{selected.document.title}<span className="text-[#C4F24E]">.</span></h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/52">
          This is the byte-identical supplied draft. It is not published, effective, or eligible for account acceptance until counsel approves a dated version.
        </p>

        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Legal drafts">
          {Object.entries(PRODUCT_PR27_LEGAL_DRAFTS).map(([name, document]) => (
            <Link
              key={name}
              href={`/dashboard/legal/drafts?document=${name}`}
              className={[
                "rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em]",
                name === selected.name
                  ? "border-[#C4F24E]/40 bg-[#C4F24E]/10 text-[#C4F24E]"
                  : "border-white/10 text-white/46"
              ].join(" ")}
            >
              {document.title}
            </Link>
          ))}
        </nav>

        <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.025] p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap gap-3 border-b border-white/10 pb-5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
            <span>{selected.document.version}</span>
            <span>SHA-256 {selected.document.sha256}</span>
          </div>
          <pre className="whitespace-pre-wrap break-words font-body text-sm leading-7 text-white/72">
            {content}
          </pre>
        </div>
      </section>
    </main>
  );
}
