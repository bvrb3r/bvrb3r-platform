import { redirect } from "next/navigation";

export default async function ArchitectAccountDetailPage({
  params
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  redirect(`/architect/users/${profileId}`);
}
