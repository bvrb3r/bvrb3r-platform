import { MessageProfileViewPage } from "@/components/messages/message-profile-view-page";

export default async function OwnerMessageProfileViewPage({
  params,
  searchParams
}: {
  params: Promise<{ targetKind: string; target: string }>;
  searchParams: Promise<{ sourceThreadId?: string | string[] }>;
}) {
  return MessageProfileViewPage({
    surface: "shop",
    params,
    searchParams
  });
}
