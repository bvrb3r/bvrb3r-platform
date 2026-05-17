import { DebugConsole } from "@/components/architect/debug/debug-console";
import { getPlatformAdminUser } from "@/lib/auth/guards";

const SUPPORTED_MODULES = new Set([
  "appointment",
  "user",
  "barber",
  "shop",
  "payment",
  "routing",
  "discovery",
  "calendar",
  "schema",
  "deployments",
  "logs",
  "issues",
  "repairs",
  "codex",
  "validation"
]);

export default async function ArchitectDebugModulePage({ params }: { params: Promise<{ module: string }> }) {
  await getPlatformAdminUser();
  const { module } = await params;
  return <DebugConsole initialMode={SUPPORTED_MODULES.has(module) ? module : "appointment"} />;
}
