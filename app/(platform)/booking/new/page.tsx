import { Suspense } from "react";
import Link from "next/link";
import { BookingForm } from "@/components/booking/booking-form";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getClientExperienceContext } from "@/lib/client-experience/session";

function BookingPageFallback() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
      <Card className="rounded-[38px] p-6 sm:p-8">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="mt-5 h-14 w-3/4" />
        <Skeleton className="mt-4 h-24 w-full" />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Skeleton className="h-24 rounded-[28px] md:col-span-2" />
          <Skeleton className="h-24 rounded-[28px]" />
          <Skeleton className="h-24 rounded-[28px]" />
          <Skeleton className="h-24 rounded-[28px]" />
          <Skeleton className="h-24 rounded-[28px]" />
        </div>
      </Card>
      <Card className="rounded-[38px] p-6 sm:p-8">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-4 h-12 w-56" />
        <Skeleton className="mt-4 h-20 w-full" />
        <div className="mt-8 space-y-3">
          <Skeleton className="h-14 rounded-[22px]" />
          <Skeleton className="h-14 rounded-[22px]" />
          <Skeleton className="h-14 rounded-[22px]" />
          <Skeleton className="h-14 rounded-[22px]" />
        </div>
      </Card>
    </div>
  );
}

export default async function BookingPage() {
  const context = await getClientExperienceContext();
  const mode = context.isGuest ? "guest" : "client";

  if (!context.isGuest && !context.isSignedInClient) {
    return (
      <ClientAppShell activeTab="search" mode="guest">
        <Card className="mx-auto max-w-2xl rounded-[34px] p-6 sm:p-8">
          <p className="surface-label text-[#d7ffab]">Booking access</p>
          <h1 className="mt-3 text-3xl font-semibold text-white" data-display="true">Use a client account or continue as a guest.</h1>
          <p className="mt-3 text-sm leading-7 text-white/64">
            This booking flow is for clients and public guests. Team and internal sessions should use their own workspace tools.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/discover?entry=guest" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#7CFF00] px-5 text-sm font-semibold text-black transition hover:bg-[#baff69]">
              Continue browsing
            </Link>
            <Link href="/login?redirect=/booking/new" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-black/25 px-5 text-sm font-semibold text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
              Sign in as client
            </Link>
          </div>
        </Card>
      </ClientAppShell>
    );
  }

  return (
    <ClientAppShell activeTab="search" mode={mode}>
      <Suspense fallback={<BookingPageFallback />}>
        <BookingForm mode={mode} />
      </Suspense>
    </ClientAppShell>
  );
}

