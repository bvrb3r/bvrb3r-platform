import { ArchitectMessagesWorkspace } from "@/components/architect/messages/architect-messages-workspace";
import { getPlatformAdminUser } from "@/lib/auth/guards";

export default async function ArchitectMessagesPage() {
  await getPlatformAdminUser();

  return <ArchitectMessagesWorkspace />;
}
