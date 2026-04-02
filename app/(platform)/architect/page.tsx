import { ArchitectConsole } from "@/components/operations/architect-console";
import { getPlatformAdminUser } from "@/lib/auth/guards";
import { ARCHITECT_DEGRADED_WARNING, createEmptyPlatformAdminConsolePayload, normalizePlatformAdminConsolePayload } from "@/lib/platform-admin/payload";
import { getPlatformAdminConsolePayload } from "@/lib/platform-admin/service";

export default async function ArchitectPage() {
  const user = await getPlatformAdminUser();
  let initialData = createEmptyPlatformAdminConsolePayload(user.name);

  try {
    const payload = await getPlatformAdminConsolePayload(user);
    if (!payload || typeof payload !== "object") {
      console.error("[Architect Console] page loader received an invalid payload", payload);
    }
    initialData = normalizePlatformAdminConsolePayload(payload, {
      actorName: user.name
    });
  } catch (error) {
    console.error("[Architect Console] page loader failed", error);
    initialData = createEmptyPlatformAdminConsolePayload(user.name, [ARCHITECT_DEGRADED_WARNING]);
  }

  return <ArchitectConsole initialData={initialData} />;
}
