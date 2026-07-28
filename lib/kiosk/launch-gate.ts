import { KioskServiceError } from "@/lib/kiosk/service";
import { KioskSettingsError, getKioskSettingsStatus, type KioskSettingsScope } from "@/lib/kiosk/settings-service";

/**
 * Server-side kiosk availability gate.
 *
 * A kiosk surface may only be served once its owner has configured it: the
 * kiosk_settings row must exist, be enabled, and carry a PIN. Client-side
 * launch buttons already check this, but the API routes are the security
 * boundary, so every kiosk payload and mutation route must pass this gate
 * before doing any work.
 */
export async function assertKioskLaunchReady(scope: KioskSettingsScope, targetReference: string) {
  let status;
  try {
    status = await getKioskSettingsStatus({ scope, targetReference });
  } catch (error) {
    if (error instanceof KioskSettingsError) {
      throw new KioskServiceError("Kiosk settings are unavailable right now. Try again shortly.", 503);
    }
    throw error;
  }

  if (!status.enabled || !status.pinSet) {
    throw new KioskServiceError(
      "This kiosk is not enabled yet. Set a kiosk PIN in More before launching Kiosk Mode.",
      403
    );
  }
}
