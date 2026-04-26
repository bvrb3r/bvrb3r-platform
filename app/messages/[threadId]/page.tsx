import type { Route } from "next";
import { redirect } from "next/navigation";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function ClientMessageThreadPage({
  params
}: {
  params: Promise<{ threadId: string }>;
}) {
  await getAuthorizedUser(["client"]);
  const { threadId } = await params;

  redirect(`/dashboard/client/messages/${encodeURIComponent(threadId)}` as Route);
}
