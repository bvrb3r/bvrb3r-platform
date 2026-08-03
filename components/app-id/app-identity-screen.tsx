import type { Route } from "next";
import Link from "next/link";
import { CheckCircle2, Clock3, LockKeyhole, PauseCircle, QrCode, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { regenerateAppIdentityCardAction, setAppIdentityCardPausedAction } from "@/app/id/actions";
import { AppIdShareButton } from "@/components/app-id/app-id-share-button";
import type { AppIdentityScanResolution, AppIdentitySnapshot, AppIdentityWalletProvider } from "@/lib/app-id/service.server";
import type { KioskQrSymbol } from "@/lib/kiosk/qr";
import { cn } from "@/lib/utils";

const ROLE_PILLS = [
  { role: "client_user", label: "Client" },
  { role: "barber_user", label: "Barber" },
  { role: "shop_owner_user", label: "Shop" }
] as const;

function QrSymbol({ symbol, paused }: { symbol: KioskQrSymbol; paused: boolean }) {
  const path = symbol.modules.flatMap((row, rowIndex) => row.flatMap((dark, columnIndex) => (
    dark ? [`M${columnIndex} ${rowIndex}h1v1h-1z`] : []
  ))).join("");
  return (
    <div className="relative h-28 w-28 overflow-hidden rounded-2xl bg-[#F5F1E8] p-3" data-app-id-qr={paused ? "paused" : "active"}>
      <svg viewBox={`0 0 ${symbol.size} ${symbol.size}`} className={cn("h-full w-full", paused && "opacity-[0.07]")} shapeRendering="crispEdges" aria-label={paused ? "App ID QR paused" : "Signed App ID QR code"}>
        <path d={path} fill="#060708" />
      </svg>
      {paused ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/75 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-white/72">Paused</span>
      ) : null}
    </div>
  );
}

function WalletButton({ provider }: { provider: AppIdentityWalletProvider }) {
  const contents = (
    <>
      <Smartphone className="h-4 w-4" aria-hidden="true" />
      {provider.label}
      {provider.status !== "ready" ? <span className="font-mono text-[8px] uppercase tracking-[0.12em]">{provider.status === "paused" ? "dark" : "setup"}</span> : null}
    </>
  );
  const classes = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 text-sm font-bold text-white/78";
  if (provider.status === "ready" && provider.href) {
    return <a href={provider.href} className={classes} title={provider.detail}>{contents}</a>;
  }
  return <button type="button" disabled className={`${classes} cursor-not-allowed opacity-45`} title={provider.detail}>{contents}</button>;
}

function AppIdCard({ snapshot }: { snapshot: AppIdentitySnapshot }) {
  const ownerAccent = snapshot.role === "shop_owner_user";
  const accent = ownerAccent ? "#D9B461" : "#C4F24E";
  return (
    <div>
      <div
        className={cn(
          "relative mx-auto aspect-[63/98] w-full max-w-[340px] overflow-hidden rounded-[26px] border-[1.5px] bg-[linear-gradient(160deg,#101107,#0B0C0D_50%,#0A0A0C)] shadow-[0_30px_90px_rgba(0,0,0,0.48)]",
          snapshot.paused && "grayscale"
        )}
        style={{ borderColor: `${accent}70` }}
      >
        <div className="absolute inset-0" style={{ background: `radial-gradient(70% 45% at 50% 0%, ${accent}1f, transparent 65%)` }} />
        <div className="absolute inset-x-0 top-[22px] text-center">
          <span className="text-xs font-extrabold tracking-[0.26em]">BVRB<span className="text-[#C4F24E]">3</span>R</span>
          <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.28em]" style={{ color: accent }}>APP ID · {snapshot.roleTag}</span>
        </div>
        <div
          className="absolute left-1/2 top-[88px] flex h-[86px] w-[86px] -translate-x-1/2 items-center justify-center overflow-hidden rounded-full border-2 bg-black/35 font-mono text-2xl font-bold"
          style={{ borderColor: accent, color: accent }}
          aria-label="Public profile avatar"
        >
          {snapshot.initials}
        </div>
        <div className="absolute inset-x-0 top-[188px] px-5 text-center">
          <div className="font-serif text-[26px] leading-none">{snapshot.displayName}</div>
          <div className="mt-2 font-mono text-[11px] text-white/55">{snapshot.username ? `@${snapshot.username}` : "Public handle not published"}</div>
          <div className="mt-2 inline-flex min-h-[22px] items-center gap-1.5 rounded-full border px-3 font-mono text-[8px] uppercase tracking-[0.12em]" style={{ borderColor: `${accent}70`, color: accent }}>
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {snapshot.verificationLabel}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-[62px] flex justify-center">
          {snapshot.qr ? (
            <QrSymbol symbol={snapshot.qr} paused={snapshot.paused} />
          ) : (
            <div className="flex h-28 w-28 flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/45 text-center text-white/42">
              <QrCode className="h-8 w-8" aria-hidden="true" />
              <span className="mt-2 px-2 font-mono text-[8px] uppercase tracking-[0.12em]">QR unavailable</span>
            </div>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-6 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">
          {snapshot.paused ? "Card paused — scans rejected" : snapshot.scanHint}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {snapshot.walletProviders.map((provider) => <WalletButton key={provider.provider} provider={provider} />)}
        <AppIdShareButton scanUrl={snapshot.scanUrl} disabled={snapshot.paused} />
      </div>
      <div className="mt-3 space-y-1 text-center text-[11px] text-white/42">
        {snapshot.walletProviders.filter((provider) => provider.status !== "ready").map((provider) => (
          <p key={provider.provider}>{provider.detail}</p>
        ))}
      </div>
    </div>
  );
}

function ActionList({ actions }: { actions: AppIdentitySnapshot["actions"] }) {
  return (
    <div className="space-y-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#D9B461]">What a scan opens</p>
      {actions.map((action, index) => {
        const content = (
          <>
            <span className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-mono text-[11px] font-bold",
              action.availability === "available" ? "border-[#C4F24E]/35 bg-[#C4F24E]/[0.08] text-[#C4F24E]" : "border-white/12 bg-white/[0.03] text-white/45"
            )}>0{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
                {action.title}
                <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-white/38">{action.availability === "available" ? "live" : "needs setup"}</span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-white/50">{action.detail}</span>
            </span>
          </>
        );
        return action.href ? (
          <Link key={action.title} href={action.href as Route} className="flex min-h-[88px] items-start gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.025] p-4 transition hover:border-[#C4F24E]/25 hover:bg-white/[0.04]">
            {content}
          </Link>
        ) : (
          <div key={action.title} className="flex min-h-[88px] items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.015] p-4 opacity-75">
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function AppIdentityScreen({ snapshot }: { snapshot: AppIdentitySnapshot }) {
  const expiryLabel = snapshot.expiresAt
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(snapshot.expiresAt))
    : "Not issued";
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#060708] px-5 py-6 text-[#F5F1E8] sm:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(ellipse_at_top,rgba(196,242,78,0.055),transparent_65%)]" />
      <div className="relative mx-auto max-w-[960px]">
        <header className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-extrabold tracking-[0.28em]">BVRB<span className="text-[#C4F24E]">3</span>R</span>
          <span className="rounded-full border border-[#D9B461]/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#D9B461]">BVRB3R App ID — your name, scannable</span>
          <span className="flex-1" />
          <span className="inline-flex gap-1 rounded-full border border-white/14 p-1">
            {ROLE_PILLS.map((pill) => (
              <span key={pill.role} className={cn("rounded-full px-4 py-2 font-mono text-[9px] uppercase tracking-[0.12em]", pill.role === snapshot.role ? "bg-[#C4F24E] font-bold text-black" : "text-white/38")}>{pill.label}</span>
            ))}
          </span>
        </header>

        <div className="mt-5 grid items-start gap-6 md:grid-cols-2">
          <AppIdCard snapshot={snapshot} />
          <div className="space-y-4">
            <ActionList actions={snapshot.actions} />

            <section className="rounded-2xl border border-white/[0.09] bg-white/[0.02] p-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#D9B461]">Privacy — you control the card</p>
              <div className="mt-3 space-y-2 text-xs leading-5 text-white/66">
                <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#9BE15D]" aria-hidden="true" />Shows only public profile data — never phone, email, or money.</p>
                <p className="flex gap-2"><RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-[#9BE15D]" aria-hidden="true" />Regenerating increments server authority; every older signed scan dies immediately.</p>
                <p className="flex gap-2"><PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#9BE15D]" aria-hidden="true" />Pausing rejects scans and darkens QR and wallet state.</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={regenerateAppIdentityCardAction}>
                  <button type="submit" disabled={snapshot.serverTruth !== "connected"} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/14 px-5 text-xs font-bold text-white/76 disabled:cursor-not-allowed disabled:opacity-35">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" /> Regenerate code
                  </button>
                </form>
                <form action={setAppIdentityCardPausedAction}>
                  <input type="hidden" name="paused" value={snapshot.paused ? "false" : "true"} />
                  <button type="submit" disabled={snapshot.serverTruth !== "connected"} className={cn("inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-35", snapshot.paused ? "bg-[#C4F24E] text-black" : "border border-amber-300/25 bg-amber-300/[0.06] text-amber-200")}>
                    {snapshot.paused ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <PauseCircle className="h-4 w-4" aria-hidden="true" />}
                    {snapshot.paused ? "Resume card" : "Pause card"}
                  </button>
                </form>
              </div>
              <div className="mt-4 grid gap-2 rounded-xl bg-black/25 p-3 text-[11px] text-white/48 sm:grid-cols-2">
                <span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Code expires {expiryLabel}</span>
                <span className="flex items-center gap-2"><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />{snapshot.serverTruth === "connected" ? "Signed server authority" : "Server truth unavailable"}</span>
              </div>
              {snapshot.qrUnavailableReason ? <p className="mt-3 text-xs leading-5 text-amber-200/72">{snapshot.qrUnavailableReason}</p> : null}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

export function AppIdentityScanScreen({ resolution }: { resolution: AppIdentityScanResolution }) {
  if (resolution.status !== "valid" || !resolution.identity) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#060708] px-5 text-[#F5F1E8]">
        <section className="w-full max-w-lg rounded-[30px] border border-white/10 bg-white/[0.035] p-8 text-center">
          <LockKeyhole className="mx-auto h-10 w-10 text-[#D9B461]" aria-hidden="true" />
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#D9B461]">App ID · {resolution.status}</p>
          <h1 className="mt-3 font-serif text-4xl">This card does not open.</h1>
          <p className="mt-4 text-sm leading-7 text-white/58">{resolution.message}</p>
          <Link href="/" className="mt-7 inline-flex min-h-12 items-center rounded-full bg-[#C4F24E] px-6 text-sm font-black text-black">Go to BVRB3R</Link>
        </section>
      </main>
    );
  }

  const identity = resolution.identity;
  return (
    <main className="min-h-screen bg-[#060708] px-5 py-8 text-[#F5F1E8]">
      <div className="mx-auto max-w-2xl">
        <header className="text-center">
          <span className="text-sm font-extrabold tracking-[0.28em]">BVRB<span className="text-[#C4F24E]">3</span>R</span>
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.2em] text-[#C4F24E]">Signed App ID verified</p>
          <div className="mx-auto mt-6 flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#C4F24E] bg-[#C4F24E]/[0.08] font-mono text-2xl font-bold text-[#C4F24E]" aria-label="Public profile avatar">{identity.initials}</div>
          <h1 className="mt-5 font-serif text-4xl">{identity.displayName}</h1>
          <p className="mt-2 font-mono text-xs text-white/52">{identity.username ? `@${identity.username}` : "Public handle not published"}</p>
          <div className="mt-3 inline-flex min-h-7 items-center gap-2 rounded-full border border-[#C4F24E]/30 px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#C4F24E]"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{identity.roleTag} · {identity.verificationLabel}</div>
          <p className="mt-4 text-xs text-white/42">Only public profile data was resolved. Phone, email, documents, and money stay private.</p>
        </header>
        <div className="mt-8"><ActionList actions={identity.actions} /></div>
      </div>
    </main>
  );
}
