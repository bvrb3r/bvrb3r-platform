import "server-only";

import { CalendarSyncError } from "@/lib/calendar-sync/domain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export async function replaceCalendarBusyBlocks(input: {
  admin: AdminClient;
  barberId: string;
  provider: "apple" | "google";
  calendarIdHash: string;
  blocks: Array<{
    externalEventIdHash: string;
    startsAt: string;
    endsAt: string;
  }>;
  cacheStampedAt: string;
  staleAfter: string;
}) {
  const result = await input.admin.rpc("product_pr33_replace_calendar_busy_blocks", {
    p_barber_id: input.barberId,
    p_provider: input.provider,
    p_calendar_id_hash: input.calendarIdHash,
    p_blocks: input.blocks.map((block) => ({
      external_event_id_hash: block.externalEventIdHash,
      starts_at: block.startsAt,
      ends_at: block.endsAt
    })),
    p_cache_stamped_at: input.cacheStampedAt,
    p_stale_after: input.staleAfter
  });

  if (result.error) {
    throw new CalendarSyncError(
      "Unable to replace calendar busy windows safely.",
      500,
      `${input.provider}_busy_refresh_failed`
    );
  }

  return typeof result.data === "number" ? result.data : input.blocks.length;
}
