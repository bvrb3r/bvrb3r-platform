import { MessageProfileViewPage } from "@/components/messages/message-profile-view-page";

export default async function BarberMessageProfileViewPage({
  params,
  searchParams
}: {
  params: Promise<{ targetKind: string; target: string }>;
  searchParams: Promise<{ sourceThreadId?: string | string[] }>;
}) {
  return MessageProfileViewPage({
    surface: "barber",
    params,
    searchParams
  });
}
