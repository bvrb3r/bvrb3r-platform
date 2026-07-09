import Link from "next/link";
import { SignalZero, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function OfflinePage() {
  return (
    <main className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-center py-6 sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-10">
        <div className="mx-auto flex max-w-2xl flex-col items-start gap-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C4F24E]/18 bg-[#C4F24E]/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e4f9b8]">
            <SignalZero className="h-4 w-4" />
            Offline-safe mode
          </div>
          <div>
            <h1 className="text-3xl font-semibold sm:text-5xl" data-display="true">Connection lost. The app shell is still here.</h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/68">
              You can keep browsing cached BVRB3R screens, but live booking, check-in, checkout, and realtime marketplace updates need a connection before they can safely continue.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <div className="rounded-[26px] border border-white/8 bg-black/20 p-5">
              <p className="surface-label">Still available</p>
              <p className="mt-3 text-sm leading-7 text-white/66">Shell navigation, branded UI, and any previously cached read views.</p>
            </div>
            <div className="rounded-[26px] border border-white/8 bg-black/20 p-5">
              <p className="surface-label">Needs connection</p>
              <p className="mt-3 text-sm leading-7 text-white/66">Operational writes, booking creation, checkout capture, follow actions, and live discovery refreshes.</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <Link href="/">
              <Button className="w-full px-6 sm:w-auto">
                <Sparkles className="h-4 w-4" />
                Return home
              </Button>
            </Link>
            <Link
              href="/discover"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-black/25 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition hover:border-[#C4F24E]/24 hover:text-[#e4f9b8] sm:w-auto"
            >
              Keep browsing
            </Link>
          </div>
        </div>
      </Card>
    </main>
  );
}
