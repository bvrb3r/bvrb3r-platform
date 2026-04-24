import { Suspense } from "react";
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
  await getClientExperienceContext();

  return (
    <ClientAppShell activeTab="search">
      <Suspense fallback={<BookingPageFallback />}>
        <BookingForm />
      </Suspense>
    </ClientAppShell>
  );
}

