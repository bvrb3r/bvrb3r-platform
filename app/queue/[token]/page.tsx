import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicQueueStatus } from "@/components/rent/public-queue-status";
import { getPublicQueueStatus } from "@/lib/rent/service";

export const metadata: Metadata = {
  title: "Live Queue Status | BVRB3R",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

export default async function PublicQueueStatusPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const status = await getPublicQueueStatus(token);
  if (!status) notFound();
  return <PublicQueueStatus token={token} initialStatus={status} />;
}
