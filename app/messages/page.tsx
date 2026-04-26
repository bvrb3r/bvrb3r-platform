import type { Route } from "next";
import { redirect } from "next/navigation";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function ClientMessagesPage({
  searchParams
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  await getAuthorizedUser(["client"]);
  const params = await searchParams;
  const nextPath = (
    params.thread
      ? `/dashboard/client/messages?thread=${encodeURIComponent(params.thread)}`
      : "/dashboard/client/messages"
  ) as Route;

  redirect(nextPath);
}
