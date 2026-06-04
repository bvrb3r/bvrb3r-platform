import { MessageProfileViewPage } from "@/components/messages/message-profile-view-page";

export default async function ClientMessageProfileViewPage({
  params,
  searchParams
}: {
  params: Promise<{ targetKind: string; target: string }>;
  searchParams: Promise<{ sourceThreadId?: string | string[] }>;
}) {
  return MessageProfileViewPage({
    surface: "client",
    params,
    searchParams
  });
}
