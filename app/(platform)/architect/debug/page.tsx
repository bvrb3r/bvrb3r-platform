import { DebugConsole } from "@/components/architect/debug/debug-console";
import { getPlatformAdminUser } from "@/lib/auth/guards";

export default async function ArchitectDebugPage() {
  await getPlatformAdminUser();
  return <DebugConsole />;
}
