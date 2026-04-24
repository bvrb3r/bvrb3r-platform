import { getPlatformAdminUser } from "@/lib/auth/guards";
import {
  ARCHITECT_DEGRADED_WARNING,
  createEmptyPlatformAdminConsolePayload,
  normalizePlatformAdminConsolePayload
} from "@/lib/platform-admin/payload";
import { getPlatformAdminConsolePayload } from "@/lib/platform-admin/service";

export async function loadArchitectConsoleInitialData() {
  const user = await getPlatformAdminUser();
  let initialData = createEmptyPlatformAdminConsolePayload(user.name);

  try {
    const payload = await getPlatformAdminConsolePayload(user);
    if (!payload || typeof payload !== "object") {
      console.error("[Architect] console page loader received an invalid payload", payload);
    } else {
      initialData = normalizePlatformAdminConsolePayload(payload, {
        actorName: user.name
      });
    }
  } catch (error) {
    console.error("[Architect] console page loader failed", error);
    initialData = createEmptyPlatformAdminConsolePayload(user.name, [ARCHITECT_DEGRADED_WARNING]);
  }

  return initialData;
}
